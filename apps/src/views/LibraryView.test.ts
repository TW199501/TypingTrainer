import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * The category tree and the text list of the library page: inline rename, and
 * which rows offer a rename field or a delete. The API and the router are mocked;
 * the library store is real.
 */

const api = vi.hoisted(() => ({
  categories: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
  texts: { list: vi.fn(), get: vi.fn(), create: vi.fn(), import: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/api', async (orig) => ({ ...(await orig<typeof import('@/api')>()), api }))
const message = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }))
vi.mock('ant-design-vue', () => ({ message }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { ApiError } from '@/api'
import { i18n } from '@/i18n'
import type { Category, TextItem } from '@/data/types'
import { useLibraryStore } from '@/stores/library'
import LibraryView from './LibraryView.vue'

const categories = (): Category[] => [
  {
    id: 'basic',
    name: 'Basics',
    color: '#8a9a5b',
    layout: 'en',
    kind: 'basic',
    isBuiltIn: true,
    children: [{ id: '9', name: 'Home row', count: 3, isBuiltIn: true }],
  },
  {
    id: '42',
    name: 'Mine',
    color: '#d97757',
    layout: 'en',
    kind: 'custom',
    isBuiltIn: false,
    children: [{ id: '43', name: 'Poems', count: 1, isBuiltIn: false }],
  },
]

const text = (id: number, isBuiltIn: boolean): TextItem => ({
  id,
  isBuiltIn,
  categoryId: isBuiltIn ? 'basic' : '42',
  subId: isBuiltIn ? '9' : '43',
  title: isBuiltIn ? 'Shipped' : 'Mine',
  category: isBuiltIn ? 'Basics' : 'Mine',
  sub: isBuiltIn ? 'Home row' : 'Poems',
  level: 'L3',
  chars: 10,
  best: '—',
  last: '—',
})

let wrapper: VueWrapper | undefined
let library: ReturnType<typeof useLibraryStore>

function render() {
  wrapper = mount(LibraryView, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        'a-badge': true,
        'a-pagination': true,
        'a-tag': { template: '<span><slot /></span>' },
        'a-button': { template: '<button><slot /></button>' },
      },
    },
  })
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  library = useLibraryStore()
  library.categories = categories()
  library.texts = [text(1, true), text(2, false)]
  library.expanded = { basic: true, '42': true }
  api.categories.list.mockImplementation(async () => categories())
  api.texts.list.mockResolvedValue([])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

/** The rename field of the user's top-level category. */
const groupInput = (w: VueWrapper) => w.get<HTMLInputElement>('.cat-row input.cat-name')

describe('LibraryView rename', () => {
  it('commits on change, not on every keystroke', async () => {
    const w = render()
    const input = groupInput(w)

    input.element.value = 'Mine 2'
    await input.trigger('input')
    expect(api.categories.rename).not.toHaveBeenCalled()

    await input.trigger('change')
    await flushPromises()
    expect(api.categories.rename).toHaveBeenCalledOnce()
    expect(api.categories.rename).toHaveBeenCalledWith('42', 'Mine 2')
  })

  it('renames a topic by its own id', async () => {
    const w = render()
    const input = w.get<HTMLInputElement>('.child-row input.child-name')

    input.element.value = 'Verse'
    await input.trigger('change')
    await flushPromises()

    expect(api.categories.rename).toHaveBeenCalledWith('43', 'Verse')
  })

  it('leaves the field on Enter', async () => {
    const w = render()
    const input = groupInput(w)
    input.element.focus()
    expect(document.activeElement).toBe(input.element)

    await input.trigger('keydown', { key: 'Enter' })

    expect(document.activeElement).not.toBe(input.element)
  })

  it('puts the stored name back after a blank rename', async () => {
    const w = render()
    const input = groupInput(w)

    input.element.value = '   '
    await input.trigger('change')
    await flushPromises()

    expect(api.categories.rename).not.toHaveBeenCalled()
    expect(input.element.value).toBe('Mine')
  })

  it('puts the stored name back after a failed rename', async () => {
    api.categories.rename.mockRejectedValue(new ApiError('down', 500))
    const w = render()
    const input = groupInput(w)

    input.element.value = 'Mine 2'
    await input.trigger('change')
    await flushPromises()

    expect(message.error).toHaveBeenCalledOnce()
    expect(input.element.value).toBe('Mine')
  })
})

describe('LibraryView built-in rows', () => {
  it('offers rename and delete on user categories only', () => {
    const w = render()

    const [builtIn, mine] = w.findAll('.cat-row')
    expect(builtIn.text()).toContain('Basics')
    expect(builtIn.find('input').exists()).toBe(false)
    expect(builtIn.find('.remove').exists()).toBe(false)
    expect(mine.get<HTMLInputElement>('input').element.value).toBe('Mine')
    expect(mine.get('.remove').text()).toBe('×')

    const [shippedSub, userSub] = w.findAll('.child-row')
    expect(shippedSub.find('input').exists()).toBe(false)
    expect(shippedSub.find('.remove').exists()).toBe(false)
    expect(userSub.find('input').exists()).toBe(true)
    expect(userSub.get('.remove').text()).toBe('×')
  })

  it('shows the text delete only for user texts', async () => {
    const w = render()

    const [shipped, mine] = w.findAll('.text-row')
    expect(shipped.text()).toContain('Shipped')
    expect(shipped.get('.remove').text()).toBe('')
    expect(mine.get('.remove').text()).toBe('×')

    await mine.get('.remove').trigger('click')
    await flushPromises()
    expect(api.texts.remove).toHaveBeenCalledWith(2)
  })
})
