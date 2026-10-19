import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import { api } from '@/api'
import { CATEGORIES, TEXTS } from '@/api/mock/fixtures'
import type { Category } from '@/data/types'
import { useLibraryStore } from '@/stores/library'
import { useSessionStore } from '@/stores/session'

/**
 * The text card of the practice screen: soft line breaks, and what shows when
 * there is no text to type. Stores are real; the router and the keyboard are not.
 */

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

let wrapper: VueWrapper | undefined

async function render() {
  const { default: PracticeView } = await import('./PracticeView.vue')
  wrapper = mount(PracticeView, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        VirtualKeyboard: true,
        'a-tag': { template: '<span><slot /></span>' },
        'a-button': { template: '<button><slot /></button>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

let session: ReturnType<typeof useSessionStore>

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  setActivePinia(createPinia())
  useLibraryStore().categories = CATEGORIES.map((c) => ({ ...c, children: c.children.slice() })) as Category[]
  session = useSessionStore()
  push.mockClear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The rendered sequence inside the text box: a character, or `|` for a line break. */
const sequence = (w: VueWrapper) =>
  w
    .findAll('.chars > *')
    .map((n) => (n.element.tagName === 'BR' ? '|' : n.text()))
    .join('')

describe('PracticeView text card', () => {
  it('shows a Chinese line break before the character it preceded, without a cell for it', async () => {
    session.reset({ mode: 'chinese', idx: 0 })
    session.setText({ id: 1, content: '第一段。\n第二段。' })
    const w = await render()

    expect(sequence(w)).toBe('第一段。|第二段。')
    expect(w.findAll('.chars .char')).toHaveLength(8)
  })

  it('renders no soft break for a latin text', async () => {
    session.reset({ mode: 'english', idx: 0 })
    session.setText({ id: 2, content: 'ab\ncd' })
    const w = await render()

    expect(w.findAll('.chars br')).toHaveLength(0)
    expect(w.findAll('.chars .char')).toHaveLength(5)
  })

  it('says the text is loading while it loads', async () => {
    session.reset({ mode: 'english', idx: 0 })
    session.textLoading = true
    const w = await render()

    expect(w.find('.text-state').text()).toBe('Loading text…')
  })

  it('points to the library when the category has no text, and keeps the IME field', async () => {
    session.reset({ mode: 'chinese', idx: 0 })
    session.setText(null)
    const w = await render()

    const state = w.get('.text-state')
    expect(state.text()).toContain('No texts in this category yet — add one in the Library')
    await state.get('.btn-slot').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'library' })

    const ime = w.get('input.ime')
    ;(document.activeElement as HTMLElement | null)?.blur()
    session.setText({ id: 3, content: '你好' })
    await flushPromises()

    expect(w.find('.text-state').exists()).toBe(false)
    expect(document.activeElement).toBe(ime.element)
  })

  it('says the load failed, not that the category is empty, and retries on request', async () => {
    const list = vi.spyOn(api.texts, 'list').mockRejectedValue(new Error('offline'))
    vi.spyOn(api.texts, 'get').mockResolvedValue({ ...TEXTS[0], id: 9, content: 'back again' })
    session.reset({ mode: 'english', idx: 0 })
    await session.loadText()
    const w = await render()

    const state = w.get('.text-state')
    expect(state.text()).toContain("Couldn't load the text. It loads again when the connection is back.")
    expect(state.text()).not.toContain('No texts in this category yet')

    list.mockResolvedValue([{ ...TEXTS[0], id: 9 }])
    await state.get('.btn-slot').trigger('click')
    await flushPromises()
    expect(w.find('.text-state').exists()).toBe(false)
    expect(session.text?.content).toBe('back again')
  })

  it('shows no empty state for a word drill', async () => {
    session.reset({ mode: 'bilingual', idx: 0 })
    const w = await render()

    expect(w.find('.text-state').exists()).toBe(false)
  })
})
