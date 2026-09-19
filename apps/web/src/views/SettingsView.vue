<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, type FontSize } from '@/stores/settings'
import { LOCALES, LOCALE_LABEL, type Locale } from '@/i18n'
import { useGridLayout } from '@/composables/useGridLayout'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const { aiCols, aiRows } = useGridLayout()

type PrefKey = 'uiLang' | 'layoutPref' | 'fontSize'

const pickers = computed<{ key: PrefKey; label: string; opts: { value: string; label: string }[] }[]>(() => [
  {
    key: 'uiLang',
    label: t('settings.interfaceLanguage'),
    opts: LOCALES.map((l) => ({ value: l, label: LOCALE_LABEL[l] })),
  },
  {
    key: 'layoutPref',
    label: t('settings.keyboardLayout'),
    // Layout names are product nouns, the same in every locale.
    opts: ['QWERTY', 'Dvorak', 'Bopomofo', 'Cangjie'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'fontSize',
    label: t('settings.textSize'),
    opts: (['S', 'M', 'L'] as const).map((v) => ({ value: v, label: t(`settings.size${v}`) })),
  },
])

const toggles = ['kb', 'strict', 'sound', 'countPunct', 'ignoreWidth'] as const

const shortcuts = computed(() => [
  { label: t('settings.shortcutStart'), keys: 'Ctrl + Enter' },
  { label: t('settings.shortcutNext'), keys: 'Ctrl + N' },
  { label: t('settings.shortcutSidebar'), keys: 'Ctrl + B' },
  { label: t('settings.shortcutReview'), keys: 'Ctrl + R' },
])

const badges = computed(() => [
  { mark: '7', key: 'streak7', desc: t('settings.unlocked'), color: '#d97757', opacity: 1 },
  { mark: '60', key: 'wpm60', desc: t('settings.unlocked'), color: '#8a9a5b', opacity: 1 },
  { mark: '99', key: 'acc99', desc: t('settings.unlocked'), color: '#7d8c5c', opacity: 1 },
  { mark: 'C', key: 'codeMaster', desc: t('settings.unlocked'), color: '#a8763e', opacity: 1 },
  {
    mark: '30',
    key: 'streak30',
    desc: t('settings.progressOf', { done: 12, total: 30 }),
    color: '#b8b3a8',
    opacity: 0.5,
  },
  { mark: '80', key: 'wpm80', desc: t('settings.bestOf', { value: 78 }), color: '#b8b3a8', opacity: 0.5 },
  {
    mark: '50',
    key: 'words50',
    desc: t('settings.progressOf', { done: 14, total: 50 }),
    color: '#b8b3a8',
    opacity: 0.5,
  },
  { mark: '#1', key: 'daily1', desc: t('settings.locked'), color: '#b8b3a8', opacity: 0.5 },
])

function pick(key: PrefKey, value: string) {
  if (key === 'fontSize') settings.fontSize = value as FontSize
  else if (key === 'uiLang') settings.uiLang = value as Locale
  else settings[key] = value
}
</script>

<template>
  <div class="page">
    <div class="card prefs">
      <div class="card-title" style="margin-bottom: 8px; flex-shrink: 0">{{ t('settings.preferences') }}</div>
      <div class="pickers">
        <div v-for="p in pickers" :key="p.key" class="picker">
          <span class="card-sub">{{ p.label }}</span>
          <div class="seg seg--wrap">
            <div
              v-for="o in p.opts"
              :key="o.value"
              class="seg-item seg-item--sm"
              :class="{ 'is-on': settings[p.key] === o.value }"
              @click="pick(p.key, o.value)"
            >
              {{ o.label }}
            </div>
          </div>
        </div>
      </div>
      <div class="toggles">
        <div v-for="k in toggles" :key="k" class="toggle-row">
          <div>
            <div style="font-size: 14px">{{ t(`settings.toggles.${k}.label`) }}</div>
            <div class="card-sub">{{ t(`settings.toggles.${k}.hint`) }}</div>
          </div>
          <div class="toggle-right" @click="settings[k] = !settings[k]">
            <span class="dim-2" style="font-size: 14px">
              {{ settings[k] ? t('common.on') : t('common.off') }}
            </span>
            <ToggleSwitch :model-value="settings[k]" />
          </div>
        </div>
      </div>
    </div>

    <div class="bottom" :style="{ gridTemplateColumns: aiCols, gridTemplateRows: aiRows }">
      <div class="card local">
        <div class="block">
          <span class="card-title">{{ t('settings.localData') }}</span>
          <span class="card-sub" style="line-height: 18px">
            {{ t('settings.localDataHint', { path: settings.dbPath }) }}
          </span>
        </div>
        <div class="block">
          <span class="card-title">{{ t('settings.shortcuts') }}</span>
          <div class="shortcuts">
            <div v-for="k in shortcuts" :key="k.label" class="shortcut">
              <span class="ell">{{ k.label }}</span>
              <span class="keys mono">{{ k.keys }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card badges-card">
        <div class="card-title" style="margin-bottom: 10px; flex-shrink: 0">
          {{ t('settings.achievements') }}
        </div>
        <div class="badges">
          <div v-for="b in badges" :key="b.key" class="badge" :style="{ opacity: b.opacity }">
            <div class="badge-mark" :style="{ background: b.color }">{{ b.mark }}</div>
            <div style="font-size: 14px; font-weight: 500">{{ t(`settings.badges.${b.key}`) }}</div>
            <div class="card-sub">{{ b.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prefs {
  flex: 1.1 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pickers {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 2px;
  flex-shrink: 0;
}
.picker {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.seg--wrap {
  flex-wrap: wrap;
}
.seg-item--sm {
  padding: 4px 12px;
  font-size: 13px;
}

.toggles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}
.toggle-right {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bottom {
  display: grid;
  gap: 12px;
  flex: 1 1 0;
  min-height: 150px;
}
.local {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.keys {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--key-bg);
  box-shadow: inset 0 0 0 1px var(--line-2);
  white-space: nowrap;
}

.badges-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.badges {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}
.badge {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 10px;
  text-align: center;
}
.badge-mark {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
</style>
