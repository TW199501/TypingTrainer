import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, type CompareRowDto, type LeaderboardRowDto, type PersonalBestDto } from '@/api'

export const useProgressStore = defineStore('progress', () => {
  const scope = ref<'self' | 'social'>('self')
  const period = ref<'weekly' | 'monthly'>('weekly')
  const lang = ref<'en' | 'zh'>('en')

  const compare = ref<CompareRowDto[]>([])
  const bests = ref<PersonalBestDto[]>([])
  const board = ref<LeaderboardRowDto[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const [c, b, l] = await Promise.all([
        api.leaderboard.compare(period.value),
        api.leaderboard.personalBests(),
        api.leaderboard.board(lang.value, period.value),
      ])
      compare.value = c
      bests.value = b
      board.value = l
    } finally {
      loading.value = false
    }
  }

  watch([period, lang], () => void load())

  return { scope, period, lang, compare, bests, board, loading, load }
})
