import { computed } from 'vue'
import { useViewport } from './useViewport'
import { useSettingsStore } from '@/stores/settings'

/**
 * Two-column pages (Library, Dictionary, AI, Settings) fall back to a stacked
 * layout once the content area drops below 620px.
 */
export function useGridLayout() {
  const { vw, vh } = useViewport()
  const settings = useSettingsStore()

  const stacked = computed(() => vw.value - (settings.sideCollapsed ? 120 : 264) < 620)

  const libCols = computed(() => (stacked.value ? 'minmax(0,1fr)' : 'minmax(0,232px) minmax(0,1fr)'))
  const libRows = computed(() => (stacked.value ? 'minmax(220px,1.1fr) minmax(0,1fr)' : 'minmax(0,1fr)'))
  const aiCols = computed(() => (stacked.value ? 'minmax(0,1fr)' : 'minmax(0,300px) minmax(0,1fr)'))
  const aiRows = computed(() => (stacked.value ? 'minmax(240px,1fr) minmax(0,1fr)' : 'minmax(0,1fr)'))

  return { vw, vh, stacked, libCols, libRows, aiCols, aiRows }
}
