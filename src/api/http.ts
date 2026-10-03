/**
 * Low-level HTTP client for the qBittorrent WebAPI.
 *
 * Design notes
 * ------------
 * - `baseURL` is relative ('./api/v2/') because an alternative WebUI can be
 *   mounted at any path. Deriving it from `window.location` keeps it correct
 *   under a reverse proxy prefix too.
 * - `withCredentials` is required: auth uses the QBT_SID_* session cookie.
 * - qBittorrent answers a bad login with HTTP 200 + body "Fails." (see
 *   authcontroller.cpp), so "ok" alone is not proof of success. Callers that
 *   care inspect the body.
 * - A 403 means either "no session" or "IP banned"; both are surfaced through
 *   the same typed error so the UI can distinguish them by message.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiErrorBody } from '@/types/api'

export class ApiError extends Error {
  readonly status: number
  readonly url: string
  /** True when the session is missing/expired and the user must log in. */
  readonly isAuthError: boolean
  /** True when qBittorrent banned this IP after too many failed attempts. */
  readonly isBanned: boolean

  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.isAuthError = status === 401 || status === 403
    this.isBanned = status === 403 && /banned/i.test(message)
  }
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

/** Register a callback invoked whenever the server rejects our session. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

function resolveBaseUrl(): string {
  // The API always lives at the server root (webapplication.cpp matches the
  // literal path "/api/v2/"), whereas the WebUI folder is configurable and can
  // be nested. So we must NOT derive the API path from the document path —
  // we anchor it to the origin instead.
  if (typeof window === 'undefined') return '/api/v2/'
  return `${window.location.origin}/api/v2/`
}

export const http: AxiosInstance = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  // Let us inspect non-2xx bodies ourselves.
  validateStatus: () => true,
})

http.interceptors.response.use(
  (response) => {
    const { status, data, config } = response
    if (status >= 200 && status < 300) return response

    const url = config?.url ?? ''
    // Try to read the server's plain-text/JSON error message.
    let message = ''
    if (typeof data === 'string' && data.trim()) message = data.trim()
    else if (data && typeof data === 'object') message = (data as ApiErrorBody).message ?? ''
    if (!message) message = `HTTP ${status}`

    const err = new ApiError(message, status, url)
    // Only a 403 that is *not* a ban means "log in again".
    if (err.isAuthError && !err.isBanned) onUnauthorized?.()
    throw err
  },
  (error: AxiosError) => {
    const status = error.response?.status ?? 0
    const url = error.config?.url ?? ''
    if (status === 0) {
      // Network-level failure: offline, DNS, CORS, server restarting.
      throw new ApiError(
        error.code === 'ECONNABORTED' ? 'Request timed out' : 'Network unreachable',
        0,
        url,
      )
    }
    throw new ApiError(error.message || `HTTP ${status}`, status, url)
  },
)

/** Build URLSearchParams from a plain object, skipping undefined values. */
export function toForm(
  data: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  return params
}