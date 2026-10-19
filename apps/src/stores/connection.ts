import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Whether the desktop app's own API has stopped answering; the shell shows a notice while it does. */
export const useConnectionStore = defineStore('connection', () => {
  const lost = ref(false)

  const markLost = () => {
    lost.value = true
  }
  const markRestored = () => {
    lost.value = false
  }

  return { lost, markLost, markRestored }
})
