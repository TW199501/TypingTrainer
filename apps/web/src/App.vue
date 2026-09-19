<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDictionaryStore } from '@/stores/dictionary'
import { useLibraryStore } from '@/stores/library'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import AppSider from '@/components/AppSider.vue'
import TopBar from '@/components/TopBar.vue'
import StatusBar from '@/components/StatusBar.vue'

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

function goPractice() {
  if (route.name !== 'practice') router.push({ name: 'practice' })
}

function onKeydown(e: KeyboardEvent) {
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

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  session.startClock()
  // Categories, dictionary and the error book are needed by more than one page.
  void library.load()
  void dictionary.load()
  void session.loadBook()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  session.stopClock()
})
</script>

<template>
  <a-config-provider :theme="theme">
    <div class="shell">
      <AppSider />
      <div class="main">
        <TopBar />
        <div class="content">
          <router-view />
        </div>
        <StatusBar />
      </div>
    </div>
  </a-config-provider>
</template>

<style scoped>
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
