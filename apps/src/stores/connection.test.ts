import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'
import { defineComponent, h } from 'vue'
import { i18n } from '@/i18n'

const shell = vi.hoisted(() => ({ desktop: true }))
vi.mock('@/api/desktop', () => ({
  get IS_DESKTOP() {
    return shell.desktop
  },
  checkDesktopUpdate: async () => null,
}))

const readyHandlers: ((baseUrl: string) => void)[] = []
vi.mock('@/api/backend', () => ({
  initBackend: async () => ({ ok: true }),
  checkHealth: async () => ({ ok: true }),
  onBackendFailed: () => () => {},
  onBackendReady: (cb: (baseUrl: string) => void) => {
    readyHandlers.push(cb)
    return () => {}
  },
}))

const session = {
  done: false,
  startClock: vi.fn(),
  stopClock: vi.fn(),
  loadBook: vi.fn(),
  loadText: vi.fn(),
  handleKey: vi.fn(),
}
const library = { load: vi.fn(), reload: vi.fn(async () => {}) }
const dictionary = { load: vi.fn(), reload: vi.fn(async () => {}) }
vi.mock('@/stores/session', () => ({ useSessionStore: () => session }))
vi.mock('@/stores/library', () => ({ useLibraryStore: () => library }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => dictionary }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({}) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'practice' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import App from '../App.vue'
import { http } from '@/api/http'
import { useConnectionStore } from './connection'

const stub = (name: string) => defineComponent({ name, render: () => h('div', { class: name }) })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  readyHandlers.length = 0
  shell.desktop = true
})

describe('connection store', () => {
  it('starts connected and flips with markLost and markRestored', () => {
    const connection = useConnectionStore()
    expect(connection.lost).toBe(false)
    connection.markLost()
    expect(connection.lost).toBe(true)
    connection.markRestored()
    expect(connection.lost).toBe(false)
  })

  it('a request without a response marks the connection lost on desktop', async () => {
    const connection = useConnectionStore()
    http.defaults.adapter = async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK')
    }
    await expect(http.get('/categories')).rejects.toThrow('Network Error')
    expect(connection.lost).toBe(true)
  })

  it('an answer with an error status is not a lost connection', async () => {
    const connection = useConnectionStore()
    http.defaults.adapter = async (config) => {
      throw new AxiosError('bad', 'ERR_BAD_REQUEST', config, null, {
        status: 400,
        statusText: 'Bad Request',
        data: {},
        headers: {},
        config,
      })
    }
    await expect(http.get('/words')).rejects.toThrow('bad')
    expect(connection.lost).toBe(false)
  })

  it('a request without a response means nothing in a browser', async () => {
    shell.desktop = false
    const connection = useConnectionStore()
    http.defaults.adapter = async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK')
    }
    await expect(http.get('/categories')).rejects.toThrow()
    expect(connection.lost).toBe(false)
  })

  it('a successful answer clears the notice', async () => {
    const connection = useConnectionStore()
    connection.markLost()
    http.defaults.adapter = async (config) => ({
      status: 200,
      statusText: 'OK',
      data: [],
      headers: {},
      config,
    })
    await http.get('/categories')
    expect(connection.lost).toBe(false)
  })

  it('backend ready clears the notice and reloads the library and dictionary', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [i18n],
        stubs: {
          'a-config-provider': { template: '<div><slot /></div>' },
          'a-alert': { props: { message: String }, template: '<div class="alert">{{ message }}</div>' },
          'router-view': stub('routed-view'),
          AppSider: stub('sider'),
          TopBar: stub('topbar'),
          StatusBar: stub('statusbar'),
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.alert').exists()).toBe(false)

    const connection = useConnectionStore()
    connection.markLost()
    await flushPromises()
    expect(wrapper.get('.alert').text()).toBe('Connection lost — reconnecting…')

    readyHandlers[0]('http://127.0.0.1:6000/api')
    await flushPromises()

    expect(connection.lost).toBe(false)
    expect(wrapper.find('.alert').exists()).toBe(false)
    expect(library.reload).toHaveBeenCalledOnce()
    expect(dictionary.reload).toHaveBeenCalledOnce()
  })
})
