import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * Measured height of an element. The practice column budgets the keyboard from
 * the real column and toolbar heights, so a wrapping toolbar cannot squash the
 * text card.
 */
export function useElementSize(el: Ref<HTMLElement | null>, mode: 'client' | 'offset' = 'client') {
  const height = ref(0)
  let ro: ResizeObserver | undefined

  const read = () => {
    const node = el.value
    if (!node) return
    const h = mode === 'offset' ? node.offsetHeight : node.clientHeight
    if (h !== height.value) height.value = h
  }

  const observe = () => {
    ro?.disconnect()
    if (!el.value) return
    ro = new ResizeObserver(read)
    ro.observe(el.value)
    read()
  }

  onMounted(observe)
  watch(el, observe)
  onBeforeUnmount(() => ro?.disconnect())

  return { height, read }
}
