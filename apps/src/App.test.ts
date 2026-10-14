import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { i18n } from '@/i18n'

/**
 * Startup ordering: nothing renders or loads until the backend is known good.
 * Stores, router and backend are mocked; the children are stand-ins.
 */

const initBackend = vi.fn()
const failedHandlers: ((reason: string) => void)[] = []
vi.mock('@/api/backend', () => ({
  initBackend: () => initBackend(),
  onBackendFailed: (cb: (reason: string) => void) => {
    failedHandlers.push(cb)
    return () => {}
  },
}))

const session = {
  done: false,
  startClock: vi.fn(),
  stopClock: vi.fn(),
  loadBook: vi.fn(),
  handleKey: vi.fn(),
}
const library = { load: vi.fn() }
const dictionary = { load: vi.fn() }
vi.mock('@/stores/session', () => ({ useSessionStore: () => session }))
vi.mock('@/stores/library', () => ({ useLibraryStore: () => library }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => dictionary }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({}) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'practice' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import App from './App.vue'

const stub = (name: string) => defineComponent({ name, render: () => h('div', { class: name }) })

function render() {
  return mount(App, {
    global: {
      plugins: [i18n],
      stubs: {
        'a-config-provider': { template: '<div><slot /></div>' },
        'router-view': stub('routed-view'),
        AppSider: stub('sider'),
        TopBar: stub('topbar'),
        StatusBar: stub('statusbar'),
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  failedHandlers.length = 0
})

describe('App startup', () => {
  it('shows BackendError and loads nothing when the backend is unavailable', async () => {
    initBackend.mockResolvedValue({ ok: false, reason: 'port in use' })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('.backend-error').text()).toContain('port in use')
    expect(wrapper.find('.routed-view').exists()).toBe(false)
    expect(library.load).not.toHaveBeenCalled()
    expect(dictionary.load).not.toHaveBeenCalled()
    expect(session.loadBook).not.toHaveBeenCalled()
    expect(session.startClock).not.toHaveBeenCalled()
  })

  it('renders no router view while the backend check is pending', async () => {
    initBackend.mockReturnValue(new Promise(() => {}))
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('.routed-view').exists()).toBe(false)
    expect(wrapper.find('.shell').exists()).toBe(false)
    expect(wrapper.find('.backend-error').exists()).toBe(false)
    expect(library.load).not.toHaveBeenCalled()
  })

  it('stays on the error screen when backend://failed arrives during the check', async () => {
    let resolve!: (v: { ok: true }) => void
    initBackend.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = render()
    failedHandlers[0]('exited twice')
    resolve({ ok: true })
    await flushPromises()

    expect(wrapper.find('.backend-error').text()).toContain('exited twice')
    expect(wrapper.find('.routed-view').exists()).toBe(false)
    expect(library.load).not.toHaveBeenCalled()
    expect(session.startClock).not.toHaveBeenCalled()
  })

  it('renders the shell and loads data once the backend is ready', async () => {
    initBackend.mockResolvedValue({ ok: true })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('.routed-view').exists()).toBe(true)
    expect(wrapper.find('.backend-error').exists()).toBe(false)
    expect(library.load).toHaveBeenCalledOnce()
    expect(dictionary.load).toHaveBeenCalledOnce()
    expect(session.loadBook).toHaveBeenCalledOnce()
    expect(session.startClock).toHaveBeenCalledOnce()
  })
})
