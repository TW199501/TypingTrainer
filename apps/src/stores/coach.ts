import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type CoachDto } from '@/api'

export const useCoachStore = defineStore('coach', () => {
  const data = ref<CoachDto | null>(null)
  const loading = ref(false)

  async function load() {
    if (data.value || loading.value) return
    loading.value = true
    try {
      data.value = await api.coach.get()
    } finally {
      loading.value = false
    }
  }

  return { data, loading, load }
})
