<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ reason: string }>()

const { t } = useI18n()

async function restart() {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
</script>

<template>
  <div class="backend-error" role="alert">
    <h1>{{ t('backend.unavailable') }}</h1>
    <p class="reason">{{ reason }}</p>
    <button type="button" class="restart" @click="restart">{{ t('backend.restart') }}</button>
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
.restart {
  padding: 6px 16px;
  border: 0;
  border-radius: 6px;
  background: #d97757;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.restart:hover {
  background: #e08a6c;
}
</style>
