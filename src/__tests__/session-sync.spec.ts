/**
 * Tests for the `sync/maindata` incremental merge.
 *
 * This is the highest-risk logic in the app: qBittorrent sends deltas after the
 * first response, and getting the merge wrong produces bugs that are hard to
 * notice — stale torrents that never disappear, or progress that freezes.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'
import type { MainData, Torrent } from '@/types/api'

function makeTorrent(hash: string, overrides: Partial<Torrent> = {}): Torrent {
  return {
    hash,
    name: `Torrent ${hash}`,
    size: 1000,
    progress: 0.5,
    dlspeed: 0,
    upspeed: 0,
    priority: 0,
    num_seeds: 0,
    num_complete: 0,
    num_leechs: 0,
    num_incomplete: 0,
    ratio: 0,
    eta: 0,
    state: 'downloading',
    seq_dl: false,
    f_l_piece_prio: false,
    completion_on: 0,
    tracker: '',
    dl_limit: 0,
    up_limit: 0,
    downloaded: 0,
    uploaded: 0,
    downloaded_session: 0,
    uploaded_session: 0,
    amount_left: 0,
    save_path: '/downloads',
    completed: 0,
    max_ratio: -1,
    max_seeding_time: -1,
    ratio_limit: -2,
    seeding_time_limit: -2,
    seen_complete: 0,
    last_activity: 0,
    total_size: 1000,
    ...overrides,
  }
}

describe('session store: maindata merge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('populates torrents, categories, tags and server state from a full snapshot', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { aaa: makeTorrent('aaa'), bbb: makeTorrent('bbb') },
      categories: { movies: { name: 'movies', savePath: '/movies' } },
      tags: ['linux', 'iso'],
      server_state: { dl_info_speed: 1234, connection_status: 'connected' },
    } satisfies MainData)

    expect(store.torrents.size).toBe(2)
    expect(store.categories.size).toBe(1)
    expect(store.tags).toEqual(['linux', 'iso'])
    expect(store.downloadSpeed).toBe(1234)
    expect(store.rid).toBe(1)
  })

  it('merges partial torrent updates instead of replacing the object', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { aaa: makeTorrent('aaa', { name: 'Original', progress: 0.1 }) },
    })

    // A delta carries only the changed fields.
    store.applyMainData({
      rid: 2,
      torrents: { aaa: { progress: 0.75 } as Torrent },
    })

    const torrent = store.torrents.get('aaa')!
    expect(torrent.progress).toBe(0.75)
    // Unchanged fields must survive the merge.
    expect(torrent.name).toBe('Original')
    expect(torrent.size).toBe(1000)
    expect(store.rid).toBe(2)
  })

  it('removes torrents listed in torrents_removed', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { aaa: makeTorrent('aaa'), bbb: makeTorrent('bbb') },
    })

    store.applyMainData({ rid: 2, torrents_removed: ['aaa'] })

    expect(store.torrents.has('aaa')).toBe(false)
    expect(store.torrents.has('bbb')).toBe(true)
    expect(store.torrents.size).toBe(1)
  })

  it('merges server_state deltas rather than dropping unmentioned keys', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      server_state: { dl_info_speed: 100, connection_status: 'connected', dht_nodes: 42 },
    })

    store.applyMainData({ rid: 2, server_state: { dl_info_speed: 500 } })

    expect(store.serverState.dl_info_speed).toBe(500)
    // 'connected' and dht_nodes were not in the delta and must persist.
    expect(store.serverState.connection_status).toBe('connected')
    expect(store.serverState.dht_nodes).toBe(42)
  })

  it('discards all local state when a full_update arrives mid-stream', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 5,
      full_update: true,
      torrents: { stale: makeTorrent('stale') },
      categories: { old: { name: 'old', savePath: '/old' } },
      tags: ['oldtag'],
    })

    // The server dropped its snapshot; anything not repeated here must vanish.
    store.applyMainData({
      rid: 6,
      full_update: true,
      torrents: { fresh: makeTorrent('fresh') },
      tags: ['newtag'],
    })

    expect(store.torrents.has('stale')).toBe(false)
    expect(store.torrents.has('fresh')).toBe(true)
    expect(store.categories.size).toBe(0)
    expect(store.tags).toEqual(['newtag'])
  })

  it('treats the first response (rid 0) as a full update even without the flag', () => {
    const store = useSessionStore()
    expect(store.rid).toBe(0)

    store.applyMainData({
      rid: 1,
      torrents: { aaa: makeTorrent('aaa') },
    })

    expect(store.rid).toBe(1)
  })

  it('removes categories and tags reported as removed', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      categories: {
        a: { name: 'a', savePath: '/a' },
        b: { name: 'b', savePath: '/b' },
      },
      tags: ['x', 'y', 'z'],
    })

    store.applyMainData({
      rid: 2,
      categories_removed: ['a'],
      tags_removed: ['y'],
    })

    expect(store.categories.has('a')).toBe(false)
    expect(store.categories.has('b')).toBe(true)
    expect(store.tags).toEqual(['x', 'z'])
  })

  it('computes aggregate counts across states', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        d1: makeTorrent('d1', { state: 'downloading' }),
        d2: makeTorrent('d2', { state: 'stalledDL' }),
        u1: makeTorrent('u1', { state: 'uploading' }),
        p1: makeTorrent('p1', { state: 'pausedUP' }),
        e1: makeTorrent('e1', { state: 'error' }),
        c1: makeTorrent('c1', { state: 'uploading', progress: 1 }),
      },
    })

    expect(store.counts.total).toBe(6)
    expect(store.counts.downloading).toBe(2)
    expect(store.counts.seeding).toBe(2)
    expect(store.counts.paused).toBe(1)
    expect(store.counts.errored).toBe(1)
    expect(store.counts.completed).toBe(1)
  })

  /**
   * The 5.x spelling of the stop state must be classified too.
   *
   * `torrentStateToString()` on 5.x emits `stoppedDL`/`stoppedUP` and never
   * `paused*`. Counting only the 4.x names left a stopped torrent in NO bucket
   * while still counting towards `total`, so the filter chips summed to less
   * than "all" and the "stopped" chip read 0 on every 5.x server.
   */
  it('counts the qBittorrent 5.x stopped states', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        s1: makeTorrent('s1', { state: 'stoppedDL' }),
        s2: makeTorrent('s2', { state: 'stoppedUP', progress: 1 }),
        d1: makeTorrent('d1', { state: 'downloading' }),
      },
    })

    expect(store.counts.paused, 'stopped torrents must be counted').toBe(2)
    expect(store.counts.total).toBe(3)
  })

  /**
   * `server_state.refresh_interval` is MILLISECONDS.
   *
   * The server sets it from `session->refreshInterval()` (default 1500), and
   * the official WebUI feeds it straight into `setTimeout`
   * (`serverSyncMainDataInterval = Math.max(serverState.refresh_interval, 500)`).
   *
   * The store used to multiply by 1000, turning the stock 1500 ms into a 25
   * minute poll interval: the first snapshot painted and then the UI never
   * updated again. This test uses 1500 — the real default — because the old
   * fixture values (1, 3) were small enough that the bug looked like a working
   * 1 s and 3 s interval and nothing failed.
   */
  it('treats the server refresh interval as milliseconds', () => {
    const store = useSessionStore()
    store.applyMainData({ rid: 1, full_update: true, server_state: { refresh_interval: 1500 } })
    expect(store.refreshInterval).toBe(1500)
  })

  it('does not scale a large server interval by 1000', () => {
    const store = useSessionStore()
    // 60_000 ms is one minute. Multiplying by 1000 would make it 16 hours.
    store.applyMainData({ rid: 1, full_update: true, server_state: { refresh_interval: 60_000 } })
    expect(store.refreshInterval).toBe(60_000)
  })

  it('falls back to a default refresh interval when the server omits one', () => {
    const store = useSessionStore()
    store.applyMainData({ rid: 1, full_update: true, server_state: {} })
    expect(store.refreshInterval).toBeGreaterThan(0)
  })

  it('clamps an absurdly small server refresh interval', () => {
    const store = useSessionStore()
    // A near-zero interval would hammer the server; we floor it.
    store.applyMainData({ rid: 1, full_update: true, server_state: { refresh_interval: 0 } })
    expect(store.refreshInterval).toBeGreaterThanOrEqual(1000)
  })

  /**
   * Tags are ADDITIVE in a partial update.
   *
   * `SyncController::onTagAdded` only appends to the delta's `tags` array and
   * removals arrive in `tags_removed`, so a delta saying `tags: ["newtag"]`
   * means "newtag was added" — not "newtag is now the only tag". Replacing the
   * array made every existing tag vanish from the filter the moment a new tag
   * was created anywhere.
   */
  it('unions tags from a partial update instead of replacing them', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      server_state: {},
      tags: ['linux', 'iso'],
    })
    expect(store.tags.sort()).toEqual(['iso', 'linux'])

    // A later delta announcing one newly created tag.
    store.applyMainData({ rid: 2, server_state: {}, tags: ['newtag'] })
    expect(store.tags.sort(), 'the delta wiped the existing tags').toEqual([
      'iso',
      'linux',
      'newtag',
    ])
  })

  it('still removes tags reported in tags_removed', () => {
    const store = useSessionStore()
    store.applyMainData({
      rid: 1,
      full_update: true,
      server_state: {},
      tags: ['linux', 'iso'],
    })
    store.applyMainData({ rid: 2, server_state: {}, tags_removed: ['linux'] })
    expect(store.tags).toEqual(['iso'])
  })

  it('does not accumulate duplicates when the same tag is announced twice', () => {
    const store = useSessionStore()
    store.applyMainData({ rid: 1, full_update: true, server_state: {}, tags: ['linux'] })
    store.applyMainData({ rid: 2, server_state: {}, tags: ['linux'] })
    expect(store.tags).toEqual(['linux'])
  })
})