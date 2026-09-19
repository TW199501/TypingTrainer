import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type FontSize = 'S' | 'M' | 'L'

export const useSettingsStore = defineStore('settings', () => {
  // Practice toggles
  const kb = ref(true)
  const strict = ref(false)
  const sound = ref(true)
  const countPunct = ref(true)
  const ignoreWidth = ref(true)

  // Preferences
  const uiLang = ref('English')
  const layoutPref = ref('QWERTY')
  const fontSize = ref<FontSize>('M')

  // Shell
  const collapsed = ref(false)
  const pinned = ref(false)
  const offline = ref(false)

  /** A pinned sider never collapses, even if the collapse flag is set. */
  const sideCollapsed = computed(() => collapsed.value && !pinned.value)

  const togglePin = () => {
    pinned.value = !pinned.value
    collapsed.value = false
  }
  const toggleSider = () => {
    if (!pinned.value) collapsed.value = !collapsed.value
  }
  const toggleOnline = () => { offline.value = !offline.value }

  const dbPath = '~/Library/TypeLab/typelab.db'

  return {
    kb, strict, sound, countPunct, ignoreWidth,
    uiLang, layoutPref, fontSize,
    collapsed, pinned, offline,
    sideCollapsed, togglePin, toggleSider, toggleOnline, dbPath,
  }
})
