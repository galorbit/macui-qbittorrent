/**
 * Auth endpoints.
 *
 * `POST /auth/login` returns HTTP 200 with the literal body "Ok." or "Fails."
 * (see authcontroller.cpp). It does *not* use status codes for bad
 * credentials, so we must parse the body.
 */
import { http, toForm, ApiError } from './http'

export interface LoginResult {
  ok: boolean
  /** Server-provided message when the login failed. */
  message?: string
  /** True when the IP is temporarily banned after too many failures. */
  banned?: boolean
}

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await http.post<string>('auth/login', toForm({ username, password }))
    const body = typeof res.data === 'string' ? res.data.trim() : ''
    if (body === 'Ok.') return { ok: true }
    return {
      ok: false,
      message: body && body !== 'Fails.' ? body : 'Invalid username or password',
      banned: /banned/i.test(body),
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.message, banned: err.isBanned }
    }
    return { ok: false, message: 'Unable to reach qBittorrent' }
  }
}

export async function logout(): Promise<void> {
  // A failure here is harmless (session already gone); never block logout.
  await http.post('auth/logout').catch(() => undefined)
}