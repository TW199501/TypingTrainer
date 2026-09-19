<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  AimOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReadOutlined,
  RobotOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons-vue'
import { useSettingsStore } from '@/stores/settings'

interface NavItem {
  id: string
  icon: Component
  badge: string
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'practice',
    items: [
      { id: 'practice', icon: AimOutlined, badge: '' },
      { id: 'coach', icon: ThunderboltOutlined, badge: 'B+' },
    ],
  },
  {
    title: 'content',
    items: [
      { id: 'library', icon: DatabaseOutlined, badge: '128' },
      { id: 'dict', icon: ReadOutlined, badge: '14' },
    ],
  },
  {
    title: 'data',
    items: [
      { id: 'stats', icon: LineChartOutlined, badge: '' },
      { id: 'leaderboard', icon: TrophyOutlined, badge: '+6' },
    ],
  },
  {
    title: 'system',
    items: [
      { id: 'ai', icon: RobotOutlined, badge: 'on' },
      { id: 'models', icon: DatabaseOutlined, badge: '' },
      { id: 'settings', icon: SettingOutlined, badge: '' },
    ],
  },
]

const collapsed = computed(() => settings.sideCollapsed)

/** The result page still belongs to Practice in the nav. */
const isActive = (id: string) => route.name === id || (id === 'practice' && route.name === 'result')

const go = (id: string) => router.push({ name: id })
</script>

<template>
  <div class="sider" :class="{ 'is-collapsed': collapsed }">
    <div class="logo">
      <span class="logo-mark"><ThunderboltOutlined :style="{ fontSize: '16px' }" /></span>
      <span v-show="!collapsed">TypeLab</span>
    </div>

    <div class="nav">
      <template v-for="(g, gi) in groups" :key="g.title">
        <div v-if="collapsed && gi > 0" class="nav-divider" />
        <div v-show="!collapsed" class="nav-group">{{ t(`nav.groups.${g.title}`) }}</div>
        <div
          v-for="n in g.items"
          :key="n.id"
          class="nav-item"
          :class="{ 'is-on': isActive(n.id) }"
          :title="t(`nav.${n.id}`)"
          @click="go(n.id)"
        >
          <span class="nav-icon"><component :is="n.icon" :style="{ fontSize: '16px' }" /></span>
          <span v-show="!collapsed" class="nav-label">{{ t(`nav.${n.id}`) }}</span>
          <span v-show="!collapsed && n.badge" class="nav-badge">{{ n.badge }}</span>
        </div>
      </template>
    </div>

    <div class="foot">
      <div v-show="!collapsed" class="foot-info">
        {{ t('shell.streak', { days: 12 }) }}<br />{{ t('shell.personalBest', { speed: 78 }) }}
      </div>
      <div class="foot-actions">
        <div
          class="foot-btn"
          :class="{ 'is-pinned': settings.pinned }"
          :title="t('shell.pinSidebar')"
          @click="settings.togglePin()"
        >
          <PushpinFilled v-if="settings.pinned" :style="{ fontSize: '16px' }" />
          <PushpinOutlined v-else :style="{ fontSize: '16px' }" />
        </div>
        <div
          class="foot-btn foot-btn--split"
          :class="{ 'is-locked': settings.pinned }"
          :title="t('shell.toggleSidebar')"
          @click="settings.toggleSider()"
        >
          <MenuUnfoldOutlined v-if="collapsed" :style="{ fontSize: '16px' }" />
          <MenuFoldOutlined v-else :style="{ fontSize: '16px' }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sider {
  flex-shrink: 0;
  width: 216px;
  background: var(--sider);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease-in-out;
}
.sider.is-collapsed {
  width: 72px;
}

.logo {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
  flex-shrink: 0;
}
.is-collapsed .logo {
  padding: 0;
  justify-content: center;
}
.logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav {
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  gap: 2px;
  overflow-y: auto;
  min-height: 0;
}
.is-collapsed .nav {
  padding: 4px 10px;
}

.nav-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.22);
  margin: 7px -6px;
}
.nav-group {
  padding: 10px 16px 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.65);
  background: transparent;
}
.is-collapsed .nav-item {
  padding: 0;
  justify-content: center;
}
.nav-item:hover {
  color: #fff;
}
.nav-item.is-on {
  background: var(--primary);
  color: #fff;
}
.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.nav-badge {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 2px;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.45);
}
.nav-item.is-on .nav-badge {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.foot-info {
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.foot-actions {
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.foot-btn {
  flex: 1;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.45);
}
.foot-btn--split {
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.65);
}
.foot-btn.is-pinned {
  color: var(--primary);
}
.foot-btn.is-locked {
  color: rgba(255, 255, 255, 0.25);
  cursor: not-allowed;
}
</style>
