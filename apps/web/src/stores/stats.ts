import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  api,
  type HistoryItemDto,
  type KeyErrorRateDto,
  type StatsSummaryDto,
  type TrendPointDto,
} from '@/api'

export const useStatsStore = defineStore('stats', () => {
  const lang = ref<'en' | 'zh'>('en')
  const summary = ref<StatsSummaryDto | null>(null)
  const trend = ref<TrendPointDto[]>([])
  const history = ref<HistoryItemDto[]>([])
  const keyErrors = ref<KeyErrorRateDto[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const [s, t, h, k] = await Promise.all([
        api.stats.summary(),
        api.stats.trend(lang.value),
        api.stats.history(),
        api.stats.keyErrors(),
      ])
      summary.value = s
      trend.value = t
      history.value = h
      keyErrors.value = k
    } finally {
      loading.value = false
    }
  }

  // Only the trend series is language-specific; the rest stays put.
  watch(lang, async (l) => {
    trend.value = await api.stats.trend(l)
  })

  return { lang, summary, trend, history, keyErrors, loading, load }
})
