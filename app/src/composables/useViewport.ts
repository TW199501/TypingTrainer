import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Window size as reactive refs; several pages size themselves off it. */
export function useViewport() {
  const vw = ref(typeof window === 'undefined' ? 1400 : window.innerWidth)
  const vh = ref(typeof window === 'undefined' ? 900 : window.innerHeight)

  const onResize = () => {
    vw.value = window.innerWidth
    vh.value = window.innerHeight
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return { vw, vh }
}
