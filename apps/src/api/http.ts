import axios, { type AxiosInstance } from 'axios'

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

http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) clearToken()
    return Promise.reject(normalizeError(error))
  },
)

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; title?: string } | undefined
    return new ApiError(data?.message || data?.title || error.message, error.response?.status)
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

/** Keeps mock calls asynchronous so loading states behave like the real thing. */
export function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
