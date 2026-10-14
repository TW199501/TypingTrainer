import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { createServer, type Server } from 'node:http'
import { createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net'

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

  it('tells ready handlers the new base URL after setting it', async () => {
    invoke.mockResolvedValue('http://127.0.0.1:5123/api')
    const { initBackend, onBackendReady, http } = await load(true)
    const seen: string[] = []
    onBackendReady((url) => seen.push(`${url} ${http.defaults.baseURL}`))
    await initBackend()

    listeners.get('backend://ready')!({ payload: 'http://127.0.0.1:6000/api' })

    expect(seen).toEqual(['http://127.0.0.1:6000/api http://127.0.0.1:6000/api'])
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

/**
 * Real requests over loopback, the way the webview reaches the sidecar. The
 * fake adapter is swapped back for axios' own so connection errors and the
 * timeout come from the network stack, not from the test.
 */
describe('requests across a sidecar restart', () => {
  const servers: { close: (cb: () => void) => void }[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
  })

  /** An API stand-in that answers every request with the port it listens on. */
  async function apiOn(): Promise<number> {
    const server: Server = createServer((req, res) => {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify({ port: (server.address() as AddressInfo).port, url: req.url }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    servers.push(server)
    return (server.address() as AddressInfo).port
  }

  /** A port nothing listens on, as while the old process is gone. */
  async function closedPort(): Promise<number> {
    const probe = createTcpServer()
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r))
    const { port } = probe.address() as AddressInfo
    await new Promise<void>((r) => probe.close(() => r()))
    return port
  }

  /** Accepts connections and never answers, as a process stuck shutting down. */
  async function silentPort(): Promise<number> {
    const sockets: Socket[] = []
    const server = createTcpServer((socket) => sockets.push(socket))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    // close() waits for open connections, and this one never ends by itself.
    servers.push({
      close: (cb) => {
        sockets.forEach((socket) => socket.destroy())
        server.close(cb)
      },
    })
    return (server.address() as AddressInfo).port
  }

  async function loadReal(firstPort: number) {
    invoke.mockResolvedValue(`http://127.0.0.1:${firstPort}/api`)
    const loaded = await load(true)
    loaded.http.defaults.adapter = ['xhr', 'http', 'fetch']
    return loaded
  }

  it('sends the next request to the port backend://ready announced', async () => {
    const before = await apiOn()
    const after = await apiOn()
    const { initBackend, http } = await loadReal(before)
    expect(await initBackend()).toEqual({ ok: true })

    listeners.get('backend://ready')!({ payload: `http://127.0.0.1:${after}/api` })
    const { data } = await http.get('/categories')

    expect(data).toEqual({ port: after, url: '/api/categories' })
  })

  it('rejects with an ApiError at once while nothing listens on the port', async () => {
    const live = await apiOn()
    const { initBackend, http } = await loadReal(live)
    await initBackend()
    http.defaults.baseURL = `http://127.0.0.1:${await closedPort()}/api`
    const { ApiError } = await import('./http')

    // jsdom also prints the refused connection to stderr; that is expected.
    const started = Date.now()
    const error = await http.get('/categories').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(Date.now() - started).toBeLessThan(http.defaults.timeout!)
  })

  it('rejects with an ApiError at the timeout when the port never answers', async () => {
    const live = await apiOn()
    const { initBackend, http } = await loadReal(live)
    await initBackend()
    http.defaults.baseURL = `http://127.0.0.1:${await silentPort()}/api`
    const { ApiError } = await import('./http')

    const error = await http.get('/categories', { timeout: 300 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as Error).message).toContain('timeout')
  })
})
