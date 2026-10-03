/**
 * Filter / sort / selection tests.
 *
 * The filter predicates are what the user actually navigates by, and the
 * selection bookkeeping has a subtle failure mode: a deleted torrent must not
 * linger in the selection set, or bulk actions would silently no-op.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useTorrentFilter } from '@/composables/useTorrentFilter'
import type { Torrent } from '@/types/api'

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
    ratio: 1,
    eta: 100,
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
    added_on: 1000,
    ...overrides,
  }
}

const sample = () => [
  makeTorrent('a', { name: 'Ubuntu ISO', state: 'downloading', added_on: 100, size: 500 }),
  makeTorrent('b', { name: 'Debian ISO', state: 'uploading', added_on: 200, size: 900 }),
  makeTorrent('c', { name: 'Movie.mkv', state: 'pausedUP', added_on: 300, size: 100, category: 'movies' }),
  makeTorrent('d', { name: 'Broken', state: 'error', added_on: 400, size: 700 }),
  makeTorrent('e', { name: 'Stalled thing', state: 'stalledDL', added_on: 500, size: 300 }),
]

describe('useTorrentFilter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns every torrent with the "all" filter', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })
    expect(f.sorted.value).toHaveLength(5)
  })

  it('filters by state group', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.filter.value = 'downloading'
    // Default ordering is added_on descending, so 'e' (500) precedes 'a' (100).
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['e', 'a'])

    f.filter.value = 'seeding'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['b'])

    f.filter.value = 'paused'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['c'])

    f.filter.value = 'errored'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['d'])

    f.filter.value = 'stalled'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['e'])
  })

  it('searches by name case-insensitively', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.search.value = 'iso'
    expect(f.sorted.value.map((t) => t.hash).sort()).toEqual(['a', 'b'])

    f.search.value = 'NOTHING'
    expect(f.sorted.value).toHaveLength(0)
  })

  it('filters by category, including an "uncategorized" pseudo-category', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.category.value = 'movies'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['c'])

    f.category.value = '__uncategorized__'
    expect(f.sorted.value.map((t) => t.hash)).not.toContain('c')
    expect(f.sorted.value).toHaveLength(4)
  })

  it('sorts numerically and toggles direction', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.onSort('size')
    // First click on a numeric column sorts descending.
    expect(f.sortReverse.value).toBe(true)
    expect(f.sorted.value.map((t) => t.size)).toEqual([900, 700, 500, 300, 100])

    f.onSort('size')
    expect(f.sortReverse.value).toBe(false)
    expect(f.sorted.value.map((t) => t.size)).toEqual([100, 300, 500, 700, 900])
  })

  it('sorts names ascending on first click', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.onSort('name')
    expect(f.sortReverse.value).toBe(false)
    expect(f.sorted.value[0].name).toBe('Broken')
  })

  it('sorts "infinite" ETA last regardless of direction', () => {
    const torrents = ref([
      makeTorrent('x', { eta: 8640000 }),
      makeTorrent('y', { eta: 50 }),
      makeTorrent('z', { eta: 10 }),
    ])
    const f = useTorrentFilter({ torrents })

    // First click sorts descending: 50, 10, then the infinity sentinel last.
    f.onSort('eta')
    expect(f.sortReverse.value).toBe(true)
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['y', 'z', 'x'])

    // Ascending: 10, 50, then still the sentinel last.
    f.onSort('eta')
    expect(f.sortReverse.value).toBe(false)
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['z', 'y', 'x'])
  })

  it('computes per-filter counts', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    expect(f.counts.value.all).toBe(5)
    expect(f.counts.value.downloading).toBe(2)
    expect(f.counts.value.seeding).toBe(1)
    expect(f.counts.value.paused).toBe(1)
    expect(f.counts.value.errored).toBe(1)
  })

  it('toggles single selection', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.toggleSelect('a')
    expect(f.selected.value.has('a')).toBe(true)
    expect(f.selectionMode.value).toBe(true)

    f.toggleSelect('a')
    expect(f.selected.value.has('a')).toBe(false)
    expect(f.selectionMode.value).toBe(false)
  })

  it('selects all visible and clears', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.selectAll()
    expect(f.selected.value.size).toBe(5)
    expect(f.allVisibleSelected.value).toBe(true)

    f.selectAll()
    expect(f.selected.value.size).toBe(0)
  })

  it('selects only what is visible when a filter is active', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.filter.value = 'paused'
    f.selectAll()
    expect(f.selectedHashes()).toEqual(['c'])
  })

  it('drops selections for torrents that disappear', async () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.toggleSelect('a')
    f.toggleSelect('b')
    expect(f.selected.value.size).toBe(2)

    // Simulate 'a' being deleted server-side.
    torrents.value = torrents.value.filter((t) => t.hash !== 'a')
    await nextTick()

    expect(f.selected.value.has('a')).toBe(false)
    expect(f.selected.value.has('b')).toBe(true)
    expect(f.selectedHashes()).toEqual(['b'])
  })

  it('exits selection mode when everything selected is gone', async () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.toggleSelect('a')
    torrents.value = torrents.value.filter((t) => t.hash !== 'a')
    await nextTick()

    expect(f.selectionMode.value).toBe(false)
    expect(f.selected.value.size).toBe(0)
  })

  it('combines filter, search and category', () => {
    const torrents = ref(sample())
    const f = useTorrentFilter({ torrents })

    f.filter.value = 'all'
    f.category.value = 'movies'
    f.search.value = 'movie'
    expect(f.sorted.value.map((t) => t.hash)).toEqual(['c'])

    f.search.value = 'ubuntu'
    expect(f.sorted.value).toHaveLength(0)
  })
})