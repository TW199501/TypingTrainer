<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { checkHealth, initBackend, onBackendFailed, onBackendReady } from '@/api/backend'
import { IS_DESKTOP } from '@/api/desktop'
import { useDictionaryStore } from '@/stores/dictionary'
import { useLibraryStore } from '@/stores/library'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import BackendError from '@/components/BackendError.vue'
import AppSider from '@/components/AppSider.vue'
import TopBar from '@/components/TopBar.vue'
import StatusBar from '@/components/StatusBar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const settings = useSettingsStore()
const library = useLibraryStore()
const dictionary = useDictionaryStore()

const theme = {
  token: {
    colorPrimary: '#d97757',
    colorPrimaryHover: '#e08a6c',
    colorPrimaryActive: '#c0623f',
    colorSuccess: '#8a9a5b',
    colorError: '#bc4b3c',
    colorWarning: '#c4922f',
    colorText: '#1f1e1d',
    colorTextSecondary: '#5c5951',
    colorBorder: '#ddd6ca',
    borderRadius: 6,
    fontSize: 14,
    controlHeight: 32,
    fontFamily:
      "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Helvetica Neue', Arial, sans-serif",
  },
}

/** Set when the bundled API cannot be reached; replaces the whole shell. */
const backendError = ref<string | null>(null)
/** True once the backend is known good; nothing loads or renders before that. */
const ready = ref(false)
/** Set by backend://failed: the shell gave up, so the error stays. */
let backendFailed = false
/** An update is installing from the error screen; it keeps the screen until it ends. */
let updateInstalling = false

function onUpdateInstalling(active: boolean) {
  updateInstalling = active
}

function goPractice() {
  if (route.name !== 'practice') router.push({ name: 'practice' })
}

function onKeydown(e: KeyboardEvent) {
  if (backendError.value) return
  if (e.metaKey || e.ctrlKey) {
    const k = e.key.toLowerCase()
    if (k === 'enter') {
      e.preventDefault()
      goPractice()
      session.startRun()
    } else if (k === 'n') {
      e.preventDefault()
      goPractice()
      session.idx += 1
      session.startRun()
    } else if (k === 'b') {
      e.preventDefault()
      settings.toggleSider()
    } else if (k === 'r') {
      e.preventDefault()
      if (session.dueList.length) {
        goPractice()
        session.startDueReview()
      }
    }
    return
  }
  session.handleKey(e, route.name === 'practice')
}

// The engine only flips `done`; the result page is a route of its own.
watch(
  () => session.done,
  (v) => {
    if (v && route.name === 'practice') router.replace({ name: 'result' })
  },
)

/** Shows the shell and loads shared data; runs at most once. */
function start() {
  if (ready.value) return
  backendError.value = null
  ready.value = true
  document.addEventListener('keydown', onKeydown)
  session.startClock()
  // Categories, dictionary and the error book are needed by more than one page.
  void library.load()
  void dictionary.load()
  void session.loadBook()
}

let stopWatchingFailed: (() => void) | undefined
let stopWatchingReady: (() => void) | undefined

onMounted(async () => {
  stopWatchingFailed = onBackendFailed((reason) => {
    backendFailed = true
    backendError.value = reason
  })
  // A handshake announced after the check failed (e.g. a start slower than the
  // wait) may mean the API is up after all; /health decides.
  stopWatchingReady = onBackendReady(async () => {
    if (!backendError.value || backendFailed || updateInstalling) return
    const health = await checkHealth()
    if (ready.value || backendFailed || updateInstalling) return
    if (health.ok) start()
    else backendError.value = health.reason
  })
  const backend = await initBackend()
  // A failure announced while the check was still running wins over its result.
  if (backendError.value) return
  if (!backend.ok) {
    backendError.value = backend.reason
    return
  }
  start()
})
onBeforeUnmount(() => {
  stopWatchingFailed?.()
  stopWatchingReady?.()
  document.removeEventListener('keydown', onKeydown)
  session.stopClock()
})
</script>

<template>
  <a-config-provider :theme="theme">
    <BackendError v-if="backendError" :reason="backendError" @installing="onUpdateInstalling" />
    <div v-else-if="ready" class="shell">
      <AppSider />
      <div class="main">
        <TopBar />
        <div class="content">
          <router-view />
        </div>
        <StatusBar />
      </div>
    </div>
    <div v-else-if="IS_DESKTOP" class="backend-starting" role="status">
      {{ t('backend.starting') }}
    </div>
  </a-config-provider>
</template>

<style scoped>
.backend-starting {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  color: var(--text-2, var(--text));
  font-family: var(--font);
}
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 22px;
}
.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px;
}
</style>
