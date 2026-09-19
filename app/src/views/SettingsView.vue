<script setup lang="ts">
import { useSettingsStore, type FontSize } from '@/stores/settings'
import { useGridLayout } from '@/composables/useGridLayout'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const settings = useSettingsStore()
const { aiCols, aiRows } = useGridLayout()

type PrefKey = 'uiLang' | 'layoutPref' | 'fontSize'
const pickers: { key: PrefKey; label: string; opts: string[] }[] = [
  { key: 'uiLang', label: 'Interface language', opts: ['English', '繁體中文', '简体中文'] },
  { key: 'layoutPref', label: 'Keyboard layout', opts: ['QWERTY', 'Dvorak', 'Bopomofo', 'Cangjie'] },
  { key: 'fontSize', label: 'Text size', opts: ['S', 'M', 'L'] },
]

type ToggleKey = 'kb' | 'strict' | 'sound' | 'countPunct' | 'ignoreWidth'
const toggles: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'kb', label: 'Show keyboard', hint: 'Highlights the next key and finger' },
  { key: 'strict', label: 'Strict mode', hint: 'Block on mistakes until corrected' },
  { key: 'sound', label: 'Key sound', hint: 'Soft click on each keystroke' },
  { key: 'countPunct', label: 'Count punctuation', hint: 'Off: punctuation misses are logged but not scored' },
  { key: 'ignoreWidth', label: 'Ignore width', hint: 'Full-width and half-width count as equal' },
]

const shortcuts = [
  { label: 'Start／Restart', keys: 'Ctrl + Enter' },
  { label: 'Next text', keys: 'Ctrl + N' },
  { label: 'Toggle sidebar', keys: 'Ctrl + B' },
  { label: 'Start review', keys: 'Ctrl + R' },
]

const badges = [
  { mark: '7', name: '7-day streak', desc: 'Unlocked', color: '#d97757', opacity: 1 },
  { mark: '60', name: '60 WPM', desc: 'Unlocked', color: '#8a9a5b', opacity: 1 },
  { mark: '99', name: 'Accuracy 99%', desc: 'Unlocked', color: '#7d8c5c', opacity: 1 },
  { mark: 'C', name: 'Code master', desc: 'Unlocked', color: '#a8763e', opacity: 1 },
  { mark: '30', name: '30-day streak', desc: 'Progress 12/30', color: '#b8b3a8', opacity: 0.5 },
  { mark: '80', name: '80 WPM', desc: 'Best 78', color: '#b8b3a8', opacity: 0.5 },
  { mark: '50', name: '50 words', desc: 'Progress 14/50', color: '#b8b3a8', opacity: 0.5 },
  { mark: '#1', name: 'Daily #1', desc: 'Locked', color: '#b8b3a8', opacity: 0.5 },
]

function pick(key: PrefKey, value: string) {
  if (key === 'fontSize') settings.fontSize = value as FontSize
  else settings[key] = value
}
</script>

<template>
  <div class="page">
    <div class="card prefs">
      <div class="card-title" style="margin-bottom: 8px; flex-shrink: 0">Preferences</div>
      <div class="pickers">
        <div v-for="p in pickers" :key="p.key" class="picker">
          <span class="card-sub">{{ p.label }}</span>
          <div class="seg seg--wrap">
            <div
              v-for="o in p.opts"
              :key="o"
              class="seg-item seg-item--sm"
              :class="{ 'is-on': settings[p.key] === o }"
              @click="pick(p.key, o)"
            >{{ o }}</div>
          </div>
        </div>
      </div>
      <div class="toggles">
        <div v-for="t in toggles" :key="t.key" class="toggle-row">
          <div>
            <div style="font-size: 14px">{{ t.label }}</div>
            <div class="card-sub">{{ t.hint }}</div>
          </div>
          <div class="toggle-right" @click="settings[t.key] = !settings[t.key]">
            <span class="dim-2" style="font-size: 14px">{{ settings[t.key] ? 'On' : 'Off' }}</span>
            <ToggleSwitch :model-value="settings[t.key]" />
          </div>
        </div>
      </div>
    </div>

    <div class="bottom" :style="{ gridTemplateColumns: aiCols, gridTemplateRows: aiRows }">
      <div class="card local">
        <div class="block">
          <span class="card-title">Local data</span>
          <span class="card-sub" style="line-height: 18px">
            Texts, sessions and the error book live in a local SQLite file ({{ settings.dbPath }});
            practice works offline and syncs when reconnected.
          </span>
        </div>
        <div class="block">
          <span class="card-title">Shortcuts</span>
          <div class="shortcuts">
            <div v-for="k in shortcuts" :key="k.label" class="shortcut">
              <span class="ell">{{ k.label }}</span>
              <span class="keys mono">{{ k.keys }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card badges-card">
        <div class="card-title" style="margin-bottom: 10px; flex-shrink: 0">Achievements</div>
        <div class="badges">
          <div v-for="b in badges" :key="b.name" class="badge" :style="{ opacity: b.opacity }">
            <div class="badge-mark" :style="{ background: b.color }">{{ b.mark }}</div>
            <div style="font-size: 14px; font-weight: 500">{{ b.name }}</div>
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
.picker { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.seg--wrap { flex-wrap: wrap; }
.seg-item--sm { padding: 4px 12px; font-size: 13px; }

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
.toggle-right { cursor: pointer; display: flex; align-items: center; gap: 8px; }

.bottom { display: grid; gap: 12px; flex: 1 1 0; min-height: 150px; }
.local { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
.block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.shortcuts { display: flex; flex-direction: column; gap: 3px; }
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

.badges-card { min-height: 0; display: flex; flex-direction: column; }
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
