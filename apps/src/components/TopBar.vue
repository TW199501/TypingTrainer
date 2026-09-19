<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useProgressStore } from '@/stores/progress'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()
const settings = useSettingsStore()
const progress = useProgressStore()

const titles = computed<Record<string, [string, string]>>(() => ({
  practice: [t('page.practice'), session.cat.name],
  result: [t('page.result'), session.cat.name],
  coach: [t('nav.coach'), t('page.coachSub')],
  library: [t('nav.library'), t('page.librarySub')],
  dict: [t('nav.dict'), t('page.dictSub')],
  ai: [t('nav.ai'), t('page.aiSub')],
  models: [t('nav.models'), t('page.modelsSub')],
  stats: [t('nav.stats'), t('page.statsSub')],
  leaderboard: [
    t('nav.leaderboard'),
    progress.period === 'weekly' ? t('page.progressWeek') : t('page.progressMonth'),
  ],
  settings: [t('nav.settings'), t('page.settingsSub')],
}))

const current = computed(() => titles.value[String(route.name || 'practice')] || titles.value.practice)
</script>

<template>
  <div class="topbar">
    <div class="titles">
      <span class="title">{{ current[0] }}</span>
      <span class="sub">{{ current[1] }}</span>
    </div>
    <div class="meta">
      <span class="net" @click="settings.toggleOnline()">
        <a-badge
          :status="settings.offline ? 'warning' : 'success'"
          :text="settings.offline ? t('shell.offline', { count: 3 }) : t('shell.synced', { minutes: 2 })"
        />
      </span>
      <span class="hint">{{ t('shell.shortcutHint') }}</span>
      <span class="user">chen.wei</span>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  height: 48px;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
  flex-shrink: 0;
}
.titles {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.title {
  font-size: 14px;
  font-weight: 600;
}
.sub {
  font-size: 14px;
  color: var(--text-3);
}
.meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.net {
  cursor: pointer;
  white-space: nowrap;
}
.hint {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.user {
  font-size: 14px;
  color: var(--text-2);
}
</style>
