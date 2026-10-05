/**
 * Auth endpoints.
 *
 * `POST /auth/login` does NOT signal success with the body alone. Observed
 * shapes, all documented in AGENT.md §2:
 *
 *   200 + body "Ok."     documented behaviour
 *   204 + empty body     seen in the wild; the session cookie IS set
 *   200 + body "Fails."  a REJECTED login — still a 2xx, so the body matters
 *   403                  banned, or refused
 *
 * So: a 2xx means success UNLESS the body explicitly says "Fails.". Reading the
 * body as the contract (`body === 'Ok.'`) reported valid 204 logins as "wrong
 * password" while the cookie had in fact been issued — and, worse, showed the
 * literal string "Ok" as an error message for a `200 + "Ok"` reply. The static
 * entry page (`static-public/index.html`) already implemented the correct rule;
 * this module did not, and had no test of its own because `login-view.spec.ts`
 * mocks it out entirely.
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

    // The body is the only signal for a REJECTION; everything else is success.
    if (/^fails\.?$/i.test(body)) {
      return { ok: false, message: 'Invalid username or password' }
    }
    /*
     * A ban normally arrives as a 403 and is handled in the catch below. Some
     * builds have been seen to explain the ban in a 2xx body instead, so keep
     * guarding for it rather than treating "your IP is banned" as a success.
     */
    if (/banned/i.test(body)) {
      return { ok: false, message: body, banned: true }
    }

    return { ok: true }
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