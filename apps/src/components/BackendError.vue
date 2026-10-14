<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IS_DESKTOP,
  InstallFailedRestartingError,
  checkDesktopUpdate,
  type DesktopUpdate,
} from '@/api/desktop'

defineProps<{ reason: string }>()
/** True while an update installs, false if it fails; the app keeps this screen meanwhile. */
const emit = defineEmits<{ installing: [active: boolean] }>()

const { t } = useI18n()

/**
 * The updater talks to the release endpoint, not to the local API, so an
 * update that fixes the API can still be installed from here.
 */
type UpdateState =
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'found'; update: DesktopUpdate }
  | { kind: 'installing'; update: DesktopUpdate; percent: number }
  | { kind: 'checkFailed'; reason: string }
  | { kind: 'installFailed'; reason: string }
  | { kind: 'restarting' }

/** Null in a browser, where the web deployment updates by pulling new images. */
const update = ref<UpdateState | null>(IS_DESKTOP ? { kind: 'checking' } : null)

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))

onMounted(async () => {
  if (!IS_DESKTOP) return
  try {
    const found = await checkDesktopUpdate()
    update.value = found ? { kind: 'found', update: found } : { kind: 'none' }
  } catch (e) {
    update.value = { kind: 'checkFailed', reason: describe(e) }
  }
})

async function install() {
  const state = update.value
  if (state?.kind !== 'found') return
  update.value = { kind: 'installing', update: state.update, percent: 0 }
  emit('installing', true)
  try {
    await state.update.install((percent) => {
      update.value = { kind: 'installing', update: state.update, percent }
    })
  } catch (e) {
    if (e instanceof InstallFailedRestartingError) {
      // The app relaunches by itself; the screen stays locked until it does.
      update.value = { kind: 'restarting' }
      return
    }
    update.value = { kind: 'installFailed', reason: describe(e) }
    emit('installing', false)
  }
}

async function restart() {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
</script>

<template>
  <div class="backend-error" role="alert">
    <h1>{{ t('backend.unavailable') }}</h1>
    <p class="reason">{{ reason }}</p>
    <div v-if="update" class="update" aria-live="polite">
      <p v-if="update.kind === 'checking' || update.kind === 'none'" class="quiet">
        {{ t(update.kind === 'checking' ? 'backend.update.checking' : 'backend.update.none') }}
      </p>
      <template v-else-if="update.kind === 'found' || update.kind === 'installing'">
        <p v-if="update.update.previouslyFailed">
          {{ t('update.lastFailed', { version: update.update.version }) }}
        </p>
        <p v-else>{{ t('backend.update.found', { version: update.update.version }) }}</p>
        <button type="button" class="install" :disabled="update.kind === 'installing'" @click="install">
          {{
            update.kind === 'installing'
              ? t('backend.update.installing', { percent: update.percent })
              : t(update.update.previouslyFailed ? 'update.retry' : 'backend.update.install')
          }}
        </button>
      </template>
      <p v-else-if="update.kind === 'restarting'" class="quiet">{{ t('update.installFailedRestarting') }}</p>
      <p v-else-if="update.kind === 'checkFailed'" class="quiet">
        {{ t('backend.update.checkFailed', { reason: update.reason }) }}
      </p>
      <p v-else class="quiet">{{ t('backend.update.installFailed', { reason: update.reason }) }}</p>
    </div>
    <button
      type="button"
      class="restart"
      :disabled="update?.kind === 'installing' || update?.kind === 'restarting'"
      @click="restart"
    >
      {{ t('backend.restart') }}
    </button>
  </div>
</template>

<style scoped>
.backend-error {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
}
h1 {
  margin: 0;
  font-size: 20px;
}
.reason {
  max-width: 560px;
  margin: 0;
  word-break: break-word;
  color: var(--text-2, var(--text));
}
.update {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.update p {
  margin: 0;
}
.quiet {
  max-width: 560px;
  word-break: break-word;
  color: var(--text-2, var(--text));
}
.restart,
.install {
  padding: 6px 16px;
  border: 0;
  border-radius: 6px;
  background: #d97757;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.restart:hover,
.install:hover:not(:disabled) {
  background: #e08a6c;
}
.install:disabled {
  opacity: 0.7;
  cursor: default;
}
</style>
