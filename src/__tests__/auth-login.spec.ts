/**
 * Response-shape tests for the REAL `src/api/auth.ts`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `login-view.spec.ts` mocks `@/api/auth` wholesale, so the module's own body
 * parsing was never executed by any test. That is why a total regression went
 * unnoticed: the SPA login form required the literal body "Ok." while
 * qBittorrent answers a successful login with `204` and an EMPTY body on some
 * builds. Correct credentials were rejected as "wrong password" even though the
 * session cookie had been issued — a bug AGENT.md §2 already documents having
 * fixed once, in `static-public/index.html`, but not here.
 *
 * These tests drive the real module against every shape in that table, so the
 * two login implementations cannot silently disagree again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

/**
 * Mock only the transport. `ApiError` is reproduced faithfully (including the
 * ban detection) because `login` branches on it.
 */
vi.mock('@/api/http', () => {
  class ApiError extends Error {
    readonly status: number
    readonly url: string
    readonly isAuthError: boolean
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
  return {
    http: { post: (...args: unknown[]) => post(...args) },
    toForm: (o: Record<string, unknown>) => o,
    ApiError,
  }
})

import { login } from '@/api/auth'
import { ApiError } from '@/api/http'

beforeEach(() => {
  post.mockReset()
})

describe('login — response shapes that mean SUCCESS', () => {
  it('accepts 200 + "Ok." (the documented shape)', async () => {
    post.mockResolvedValue({ status: 200, data: 'Ok.' })
    await expect(login('admin', 'pw')).resolves.toMatchObject({ ok: true })
  })

  it('accepts 204 with an EMPTY body', async () => {
    // This is the shape the real server was observed to return.
    post.mockResolvedValue({ status: 204, data: '' })
    await expect(login('admin', 'pw')).resolves.toMatchObject({ ok: true })
  })

  it('accepts 204 with no body at all', async () => {
    post.mockResolvedValue({ status: 204, data: undefined })
    await expect(login('admin', 'pw')).resolves.toMatchObject({ ok: true })
  })

  it('accepts "Ok" without the trailing period', async () => {
    post.mockResolvedValue({ status: 200, data: 'Ok' })
    await expect(login('admin', 'pw')).resolves.toMatchObject({ ok: true })
  })

  it('accepts a 2xx with whitespace-only body', async () => {
    post.mockResolvedValue({ status: 200, data: '   ' })
    await expect(login('admin', 'pw')).resolves.toMatchObject({ ok: true })
  })
})

describe('login — response shapes that mean FAILURE', () => {
  it('rejects 200 + "Fails." (a real 2xx, so the body decides)', async () => {
    post.mockResolvedValue({ status: 200, data: 'Fails.' })
    const result = await login('admin', 'wrong')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Invalid username or password')
  })

  it('rejects "Fails" without the period, and any casing', async () => {
    for (const body of ['Fails', 'fails.', 'FAILS.']) {
      post.mockResolvedValue({ status: 200, data: body })
      await expect(login('admin', 'wrong')).resolves.toMatchObject({ ok: false })
    }
  })

  it('never echoes the raw body back as the error message', async () => {
    // The old code showed the literal string "Ok" to the user.
    post.mockResolvedValue({ status: 200, data: 'Ok' })
    const result = await login('admin', 'pw')
    expect(result.ok).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it('reports a 403 ban as banned, not as bad credentials', async () => {
    post.mockRejectedValue(new ApiError('Your IP is banned', 403, 'auth/login'))
    const result = await login('admin', 'pw')
    expect(result.ok).toBe(false)
    expect(result.banned).toBe(true)
  })

  it('reports a non-ban 403 as an auth failure', async () => {
    post.mockRejectedValue(new ApiError('Forbidden', 403, 'auth/login'))
    const result = await login('admin', 'pw')
    expect(result.ok).toBe(false)
    expect(result.banned).toBe(false)
  })

  it('reports a network failure without claiming bad credentials', async () => {
    post.mockRejectedValue(new ApiError('Network unreachable', 0, 'auth/login'))
    const result = await login('admin', 'pw')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Network unreachable')
  })

  it('reports an unexpected non-ApiError without throwing', async () => {
    post.mockRejectedValue(new Error('boom'))
    await expect(login('admin', 'pw')).resolves.toMatchObject({
      ok: false,
      message: 'Unable to reach qBittorrent',
    })
  })

  it('treats a ban message carried in a 2xx body as a ban', async () => {
    post.mockResolvedValue({ status: 200, data: 'Your IP is banned' })
    const result = await login('admin', 'pw')
    expect(result.ok).toBe(false)
    expect(result.banned).toBe(true)
  })
})