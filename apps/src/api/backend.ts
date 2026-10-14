/**
 * Connection to the API the desktop shell bundles.
 *
 * In a browser the API lives wherever the page was served from, so nothing here
 * runs. In the desktop shell the API is a sidecar on a port the shell picks, so
 * the address has to be asked for at runtime. The Tauri APIs are imported
 * dynamically, as in `desktop.ts`, so the browser build never loads them.
 */
import { IS_DESKTOP } from './desktop'
import { http } from './http'

export type BackendStatus = { ok: true } | { ok: false; reason: string }

/** Base URL for API calls: the sidecar's address on desktop, the configured one otherwise. */
export async function resolveBaseUrl(): Promise<string> {
  if (!IS_DESKTOP) return import.meta.env.VITE_API_BASE_URL || '/api'
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('api_base_url')
}

const failedHandlers = new Set<(reason: string) => void>()
let listening: Promise<void> | null = null

/** Calls `handler` with the reason when the shell gives up restarting the API. */
export function onBackendFailed(handler: (reason: string) => void): () => void {
  failedHandlers.add(handler)
  return () => failedHandlers.delete(handler)
}

/** Subscribes once to the shell's announcements; a restarted API may come back on a new port. */
function listenForBackendEvents(): Promise<void> {
  listening ??= (async () => {
    const { listen } = await import('@tauri-apps/api/event')
    await listen<string>('backend://ready', (event) => {
      http.defaults.baseURL = event.payload
    })
    await listen<string>('backend://failed', (event) => {
      for (const handler of failedHandlers) handler(event.payload)
    })
  })()
  return listening
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Points the HTTP client at the API and checks it answers.
 *
 * Never throws: the caller shows the reason instead of a half-working app.
 */
export async function initBackend(): Promise<BackendStatus> {
  if (!IS_DESKTOP) return { ok: true }
  try {
    await listenForBackendEvents()
    http.defaults.baseURL = await resolveBaseUrl()
    await http.get('/health')
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: describeFailure(error) }
  }
}

/** Stops the bundled API; a no-op in a browser and when none is running. */
export async function stopBackend(): Promise<void> {
  if (!IS_DESKTOP) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('stop_backend')
}
