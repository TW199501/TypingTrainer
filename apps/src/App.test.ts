import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { i18n } from '@/i18n'

/**
 * Startup ordering: nothing renders or loads until the backend is known good.
 * Stores, router and backend are mocked; the children are stand-ins.
 */

const initBackend = vi.fn()
const checkHealth = vi.fn()
const failedHandlers: ((reason: string) => void)[] = []
const readyHandlers: ((baseUrl: string) => void)[] = []
vi.mock('@/api/backend', () => ({
  initBackend: () => initBackend(),
  checkHealth: () => checkHealth(),
  onBackendFailed: (cb: (reason: string) => void) => {
    failedHandlers.push(cb)
    return () => {}
  },
  onBackendReady: (cb: (baseUrl: string) => void) => {
    readyHandlers.push(cb)
    return () => {}
  },
}))

/** Whether the app runs in the desktop shell, and the update the shell offers. */
const shell = vi.hoisted(() => ({ desktop: false, update: null as unknown }))
vi.mock('@/api/desktop', () => ({
  get IS_DESKTOP() {
    return shell.desktop
  },
  checkDesktopUpdate: async () => shell.update,
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
  readyHandlers.length = 0
  shell.desktop = false
  shell.update = null
  checkHealth.mockResolvedValue({ ok: true })
})

function expectStartedOnce() {
  expect(library.load).toHaveBeenCalledOnce()
  expect(dictionary.load).toHaveBeenCalledOnce()
  expect(session.loadBook).toHaveBeenCalledOnce()
  expect(session.startClock).toHaveBeenCalledOnce()
}

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

  it('shows no starting message in a browser', async () => {
    initBackend.mockReturnValue(new Promise(() => {}))
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toBe('')
  })

  it('shows a starting message on desktop while the backend check is pending', async () => {
    shell.desktop = true
    initBackend.mockReturnValue(new Promise(() => {}))
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('.backend-starting').text()).toBe('Starting TypeLab…')
    expect(wrapper.find('.shell').exists()).toBe(false)
  })

  it('drops the starting message once the backend is ready', async () => {
    shell.desktop = true
    initBackend.mockResolvedValue({ ok: true })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('.backend-starting').exists()).toBe(false)
    expect(wrapper.find('.routed-view').exists()).toBe(true)
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

  it('recovers when backend://ready arrives after the check timed out and /health passes', async () => {
    shell.desktop = true
    initBackend.mockResolvedValue({ ok: false, reason: 'timed out after 60 s' })
    let healthy!: (v: { ok: true }) => void
    checkHealth.mockReturnValue(new Promise((r) => (healthy = r)))
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('.backend-error').exists()).toBe(true)

    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()
    // Nothing switches until the new API has answered /health.
    expect(checkHealth).toHaveBeenCalledOnce()
    expect(wrapper.find('.backend-error').exists()).toBe(true)
    expect(library.load).not.toHaveBeenCalled()
    healthy({ ok: true })
    await flushPromises()

    expect(wrapper.find('.backend-error').exists()).toBe(false)
    expect(wrapper.find('.routed-view').exists()).toBe(true)
    expectStartedOnce()
  })

  it('runs the startup only once however many ready announcements follow', async () => {
    initBackend.mockResolvedValue({ ok: false, reason: 'timed out after 60 s' })
    render()
    await flushPromises()

    readyHandlers[0]('http://127.0.0.1:6000/api')
    readyHandlers[0]('http://127.0.0.1:6001/api')
    await flushPromises()

    expectStartedOnce()
  })

  it('ignores ready announcements while the check is running or after it passed', async () => {
    let resolve!: (v: { ok: true }) => void
    initBackend.mockReturnValue(new Promise((r) => (resolve = r)))
    render()
    readyHandlers[0]('http://127.0.0.1:5123/api')
    resolve({ ok: true })
    await flushPromises()
    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()

    expectStartedOnce()
  })

  it('keeps a backend://failed error when backend://ready follows', async () => {
    initBackend.mockResolvedValue({ ok: false, reason: 'timed out after 60 s' })
    const wrapper = render()
    await flushPromises()
    failedHandlers[0]('exited twice')
    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()

    expect(wrapper.find('.backend-error').text()).toContain('exited twice')
    expect(wrapper.find('.routed-view').exists()).toBe(false)
    expect(library.load).not.toHaveBeenCalled()
  })

  it('stays on the error screen when backend://ready arrives but /health fails', async () => {
    initBackend.mockResolvedValue({ ok: false, reason: 'timed out after 60 s' })
    checkHealth.mockResolvedValue({ ok: false, reason: 'Request failed with status code 503' })
    const wrapper = render()
    await flushPromises()

    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()

    expect(wrapper.find('.backend-error').text()).toContain('Request failed with status code 503')
    expect(wrapper.find('.routed-view').exists()).toBe(false)
    expect(library.load).not.toHaveBeenCalled()
  })

  it('does not leave the error screen while an update is installing', async () => {
    shell.desktop = true
    shell.update = { version: '1.2.3', notes: '', install: () => new Promise(() => {}) }
    initBackend.mockResolvedValue({ ok: false, reason: 'timed out after 60 s' })
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()

    expect(wrapper.find('.backend-error').exists()).toBe(true)
    expect(wrapper.get('.update button').text()).toBe('Installing… 0%')
    expect(library.load).not.toHaveBeenCalled()
  })
})
