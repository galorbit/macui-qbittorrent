/**
 * Tests for the polling lifecycle: `start`, `stop`, `refresh` and the scheduler.
 *
 * This is where the store's real bugs live. The sync merge (covered in
 * session-sync.spec.ts) is pure; the polling loop is not, and its failure modes
 * are all silent:
 *
 *  - a leaked timer keeps polling after logout
 *  - a throwing poll stops the loop forever
 *  - `refresh()` racing a scheduled poll leaves two live timers
 *
 * `@/api/sync` is mocked so the loop can be driven with fake timers and the
 * request count observed directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const getMainData = vi.fn()
const getTransferInfo = vi.fn()

vi.mock('@/api/sync', () => ({
  getMainData: (...args: unknown[]) => getMainData(...args),
}))

vi.mock('@/api/transfer', () => ({
  getTransferInfo: (...args: unknown[]) => getTransferInfo(...args),
}))

// Imported after the mocks so the store picks them up.
const { useSessionStore } = await import('@/stores/session')
const { ApiError } = await import('@/api/http')

/** A minimal maindata response with a usable refresh interval. */
function mainData(rid = 1) {
  return {
    rid,
    full_update: true,
    torrents: {},
    torrents_removed: [],
    categories: {},
    categories_removed: [],
    tags: [],
    tags_removed: [],
    server_state: { refresh_interval: 1, dl_info_speed: 0, up_info_speed: 0 },
  }
}

describe('session polling lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    getMainData.mockReset().mockResolvedValue(mainData())
    getTransferInfo.mockReset().mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls once immediately on start, then on the server interval', async () => {
    const store = useSessionStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(getMainData).toHaveBeenCalledTimes(1)

    // refresh_interval is 1s, floored at 1s.
    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData).toHaveBeenCalledTimes(3)

    store.stop()
  })

  it('stops polling after stop() and issues no further requests', async () => {
    const store = useSessionStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMainData).toHaveBeenCalledTimes(1)

    store.stop()

    // Well past several intervals.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getMainData).toHaveBeenCalledTimes(1)
  })

  it('keeps polling after a failed request', async () => {
    // A rejected poll must still re-arm the next attempt, otherwise one network
    // blip silently kills live updates until a page reload.
    const store = useSessionStore()
    getMainData.mockRejectedValueOnce(new Error('network down'))

    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMainData).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData, 'polling stopped after a failure').toHaveBeenCalledTimes(2)

    store.stop()
  })

  it('does not arm a timer when the first poll stops the loop itself', async () => {
    // The regression this covers is subtle: `pollOnce` handles its own errors,
    // but on a 403 it calls `stop()` from INSIDE the poll. Any scheduling that
    // runs after the await must therefore observe `running === false` and stay
    // disarmed.
    //
    // This is the case that distinguishes `.finally(schedule)` from
    // `.then(schedule)`: when the poll itself throws before `stop()` is
    // reached, `.then` never runs and the loop dies silently. Here we assert
    // the disarmed outcome directly, which both orderings must satisfy.
    const store = useSessionStore()
    getMainData.mockRejectedValue(new ApiError('Forbidden', 403, 'sync/maindata'))

    store.start()
    await vi.advanceTimersByTimeAsync(0)

    const count = getMainData.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getMainData, 'a timer was armed despite the session being rejected').toHaveBeenCalledTimes(
      count,
    )
  })

  it('survives an unexpected throw from the sync API without killing the loop', async () => {
    // `getTransferInfo` is fire-and-forget, and the poll body must not be able
    // to escape as an unhandled rejection that stops future scheduling.
    const store = useSessionStore()
    getTransferInfo.mockRejectedValue(new Error('transfer endpoint exploded'))

    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMainData).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData, 'loop died after a transfer/info failure').toHaveBeenCalledTimes(2)

    store.stop()
  })

  it('does not leave two timers alive when refresh races a scheduled poll', async () => {
    // The failure scenario: the timer fires and starts a poll; before that poll
    // resolves, refresh() clears the (already consumed) timer, polls, and arms
    // a new one. When the first poll finally resolves it schedules AGAIN.
    //
    // With a `schedule()` that does not clear the existing timer first, the
    // second call overwrites `timer` and orphans the first — so both fire, the
    // poll rate doubles, and `stop()` can only cancel one of them.
    //
    // The overlap is created by holding the first poll open with a deferred
    // promise, which is the only way this race is observable.
    const store = useSessionStore()

    let releaseSlowPoll: (() => void) | undefined
    const slowPoll = new Promise<void>((resolve) => {
      releaseSlowPoll = () => resolve()
    })

    // First call resolves immediately (start), the next one hangs (the timer
    // fire), subsequent ones resolve normally.
    getMainData
      .mockResolvedValueOnce(mainData())
      .mockImplementationOnce(async () => {
        await slowPoll
        return mainData()
      })
      .mockResolvedValue(mainData())

    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMainData).toHaveBeenCalledTimes(1)

    // Let the timer fire so its poll starts and blocks.
    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData).toHaveBeenCalledTimes(2)

    // Now refresh while that poll is in flight.
    const refreshing = store.refresh()
    await vi.advanceTimersByTimeAsync(0)

    // The in-flight poll resolves; both it and refresh() will try to schedule.
    releaseSlowPoll?.()
    await vi.advanceTimersByTimeAsync(0)
    await refreshing

    const before = getMainData.mock.calls.length

    // Exactly one poll per interval — not two.
    await vi.advanceTimersByTimeAsync(1000)
    expect(
      getMainData.mock.calls.length - before,
      'more than one poll per interval — a timer leaked',
    ).toBe(1)

    store.stop()
    const atStop = getMainData.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getMainData.mock.calls.length, 'a leaked timer kept polling').toBe(atStop)
  })

  it('does not restart polling when refresh() is called after stop()', async () => {
    const store = useSessionStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    store.stop()

    await store.refresh()

    const atStop = getMainData.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getMainData.mock.calls.length, 'refresh() revived a stopped loop').toBe(atStop)
  })

  it('stops polling on a 403 rather than retrying a dead session', async () => {
    const store = useSessionStore()
    getMainData.mockRejectedValue(new ApiError('Forbidden', 403, 'sync/maindata'))

    store.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(store.connected).toBe(false)

    const count = getMainData.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getMainData, 'kept polling after the session was rejected').toHaveBeenCalledTimes(count)
  })

  it('is safe to call start() repeatedly without doubling the poll rate', async () => {
    const store = useSessionStore()
    store.start()
    store.start()
    store.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(getMainData).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getMainData).toHaveBeenCalledTimes(2)

    store.stop()
  })

  it('resyncs from rid 0 after a stop, so a stale cursor is not reused', async () => {
    const store = useSessionStore()
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMainData.mock.calls[0][0]).toBe(0)

    store.stop()
    store.start()
    await vi.advanceTimersByTimeAsync(0)

    // Second call after restart must also start from 0.
    expect(getMainData.mock.calls.at(-1)?.[0]).toBe(0)

    store.stop()
  })
})
