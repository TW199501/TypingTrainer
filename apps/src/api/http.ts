import axios, { type AxiosInstance } from 'axios'
import { useConnectionStore } from '@/stores/connection'
import { IS_DESKTOP } from './desktop'

export const TOKEN_KEY = 'typelab.token'

/** Sample data instead of a backend. Default on, so the app runs with no API. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = readToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Tells the shell whether the bundled API is answering; only the desktop app has one to lose. */
function trackConnection(lost: boolean) {
  if (!IS_DESKTOP) return
  try {
    const connection = useConnectionStore()
    if (lost) connection.markLost()
    else connection.markRestored()
  } catch {
    // No store yet (before the app mounts): there is no notice to update.
  }
}

http.interceptors.response.use(
  (res) => {
    trackConnection(false)
    return res
  },
  (error) => {
    if (error?.response?.status === 401) clearToken()
    if (axios.isAxiosError(error) && !error.response && !axios.isCancel(error)) trackConnection(true)
    return Promise.reject(normalizeError(error))
  },
)

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Files, 1-based positions or data-row numbers the server rejected in an import. */
    readonly failed?: string[],
    /** How many were rejected in all, when `failed` lists only the first of them. */
    readonly failedCount?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      { message?: string; title?: string; failed?: string[]; failedCount?: number } | undefined
    return new ApiError(
      data?.message || data?.title || error.message,
      error.response?.status,
      Array.isArray(data?.failed) ? data.failed : undefined,
      typeof data?.failedCount === 'number' ? data.failedCount : undefined,
    )
  }
  return new ApiError(error instanceof Error ? error.message : String(error))
}

/** localStorage is unavailable in private windows and during SSR-ish contexts. */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Keeps mock calls asynchronous so loading states behave like the real thing; `0` answers at once. */
export function delay<T>(value: T, ms = 120): Promise<T> {
  if (ms <= 0) return Promise.resolve(value)
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
