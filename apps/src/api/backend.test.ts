import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'

/**
 * Reaching the bundled API.
 *
 * `IS_DESKTOP` is fixed when `desktop.ts` loads, so each test re-imports the
 * modules after setting up the window it expects. The Tauri APIs are mocked
 * because they only exist inside the shell.
 */

const invoke = vi.fn()
const listeners = new Map<string, (event: { payload: unknown }) => void>()
const listen = vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
  listeners.set(name, cb)
  return () => listeners.delete(name)
})

vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))

async function load(inShell: boolean) {
  vi.resetModules()
  if (inShell) {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  }
  const backend = await import('./backend')
  const { http } = await import('./http')
  const requested: string[] = []
  let health: () => { status: number } = () => ({ status: 200 })
  http.defaults.adapter = async (config: AxiosRequestConfig) => {
    requested.push(`${config.baseURL}${config.url}`)
    const { status } = health()
    if (status >= 400) {
      throw new Error(`Request failed with status code ${status}`)
    }
    return { data: {}, status, statusText: 'OK', headers: {}, config } as never
  }
  return {
    ...backend,
    http,
    requested,
    setHealth: (fn: () => { status: number }) => (health = fn),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

describe('resolveBaseUrl', () => {
  it('uses VITE_API_BASE_URL in a browser and never calls invoke', async () => {
    const { resolveBaseUrl } = await load(false)

    expect(await resolveBaseUrl()).toBe(import.meta.env.VITE_API_BASE_URL || '/api')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('uses api_base_url on desktop and sets http.defaults.baseURL', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { resolveBaseUrl, initBackend, http } = await load(true)

    expect(await resolveBaseUrl()).toBe('http://127.0.0.1:5123/api')
    await initBackend()

    expect(invoke).toHaveBeenCalledWith('api_base_url')
    expect(http.defaults.baseURL).toBe('http://127.0.0.1:5123/api')
  })
})

describe('initBackend', () => {
  it('reports ok when /health answers 200', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { initBackend, requested } = await load(true)

    expect(await initBackend()).toEqual({ ok: true })
    expect(requested).toEqual(['http://127.0.0.1:5123/api/health'])
  })

  it('reports the reason when api_base_url rejects', async () => {
    invoke.mockRejectedValue('the API did not start within 15 seconds')
    const { initBackend } = await load(true)

    expect(await initBackend()).toEqual({
      ok: false,
      reason: 'the API did not start within 15 seconds',
    })
  })

  it('reports the reason when /health fails', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { initBackend, setHealth } = await load(true)
    setHealth(() => ({ status: 503 }))

    const status = await initBackend()

    expect(status.ok).toBe(false)
    expect(status.ok === false && status.reason).toContain('503')
  })

  it('skips the health check in a browser', async () => {
    const { initBackend, requested } = await load(false)

    expect(await initBackend()).toEqual({ ok: true })
    expect(requested).toEqual([])
    expect(listen).not.toHaveBeenCalled()
  })
})

describe('backend events', () => {
  it('updates baseURL when backend://ready announces a new port', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { initBackend, http } = await load(true)
    await initBackend()

    listeners.get('backend://ready')!({ payload: 'http://127.0.0.1:6000/api' })

    expect(http.defaults.baseURL).toBe('http://127.0.0.1:6000/api')
  })

  it('reports the reason when backend://failed arrives', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { initBackend, onBackendFailed } = await load(true)
    const seen: string[] = []
    onBackendFailed((reason) => seen.push(reason))
    await initBackend()

    listeners.get('backend://failed')!({ payload: 'the API exited twice' })

    expect(seen).toEqual(['the API exited twice'])
  })
})

describe('stopBackend', () => {
  it('invokes stop_backend on desktop', async () => {
    invoke.mockResolvedValue(undefined)
    const { stopBackend } = await load(true)

    await stopBackend()

    expect(invoke).toHaveBeenCalledWith('stop_backend')
  })

  it('does nothing in a browser', async () => {
    const { stopBackend } = await load(false)

    await stopBackend()

    expect(invoke).not.toHaveBeenCalled()
  })
})
