/**
 * Client-side torrent filtering, sorting and selection.
 *
 * Filtering happens locally rather than through `torrents/info` parameters
 * because the dashboard already holds a live, incrementally-synced copy of
 * every torrent. Doing it in memory means the list responds instantly to
 * typing, and it keeps the `rid` cursor valid (a filtered API fetch would
 * still return the global rid).
 */
import { computed, ref, watch, type Ref } from 'vue'
import type { Torrent, TorrentFilter } from '@/types/api'
import { isActive, isCompleted, isPaused, isStalled } from '@/utils/format'
import type { SortKey } from '@/components/torrent/TorrentTable.vue'

export interface UseTorrentFilterOptions {
  torrents: Ref<Torrent[]>
}

export function useTorrentFilter({ torrents }: UseTorrentFilterOptions) {
  const filter = ref<TorrentFilter>('all')
  const search = ref('')
  const category = ref('')
  const tag = ref('')
  const sortKey = ref<SortKey>('added_on')
  const sortReverse = ref(true)
  const selected = ref<Set<string>>(new Set())
  /** Selection mode turns on checkboxes on touch layouts. */
  const selectionMode = ref(false)

  /**
   * Does a torrent match the given filter?
   *
   * Takes the filter as a PARAMETER rather than reading `filter.value`.
   * It used to read the ref, and `counts` worked around that by temporarily
   * assigning `filter.value` inside its own getter — writing reactive state
   * from a computed. That is not merely untidy: a computed that writes a ref it
   * also reads can recurse (Vue: notify -> trigger -> runIfDirty ->
   * refreshComputed -> set value) and blow the stack with
   * "Maximum call stack size exceeded" as soon as anything reads it outside a
   * render. It also lets a queued render observe the filter mid-count.
   */
  function matchesFilter(torrent: Torrent, candidate: TorrentFilter = filter.value): boolean {
    switch (candidate) {
      case 'all':
        return true
      case 'downloading':
        // `forcedMetaDL` is 5.x-only and belongs with `metaDL`: both mean
        // "fetching metadata", so both are a download in progress.
        return (
          torrent.state === 'downloading' ||
          torrent.state === 'forcedDL' ||
          torrent.state === 'metaDL' ||
          torrent.state === 'forcedMetaDL' ||
          torrent.state === 'stalledDL' ||
          torrent.state === 'queuedDL' ||
          torrent.state === 'checkingDL'
        )
      case 'seeding':
        return (
          torrent.state === 'uploading' ||
          torrent.state === 'forcedUP' ||
          torrent.state === 'stalledUP' ||
          torrent.state === 'queuedUP' ||
          torrent.state === 'checkingUP'
        )
      case 'completed':
        return isCompleted(torrent)
      case 'resumed':
        return !isPaused(torrent.state)
      case 'paused':
        return isPaused(torrent.state)
      case 'active':
        return isActive(torrent)
      case 'inactive':
        return !isActive(torrent)
      case 'stalled':
        return isStalled(torrent.state)
      case 'errored':
        return torrent.state === 'error' || torrent.state === 'missingFiles'
      default:
        return true
    }
  }

  function matchesSearch(torrent: Torrent): boolean {
    const query = search.value.trim().toLowerCase()
    if (!query) return true
    // Match the name and the raw tag string, which is how users think about
    // finding a torrent.
    return (
      torrent.name.toLowerCase().includes(query) ||
      (torrent.tags ?? '').toLowerCase().includes(query) ||
      (torrent.save_path ?? '').toLowerCase().includes(query)
    )
  }

  function matchesTaxonomy(torrent: Torrent): boolean {
    if (category.value) {
      const torrentCategory = torrent.category ?? ''
      if (category.value === '__uncategorized__') {
        if (torrentCategory) return false
      } else if (torrentCategory !== category.value) {
        return false
      }
    }
    if (tag.value) {
      const tags = (torrent.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (!tags.includes(tag.value)) return false
    }
    return true
  }

  const filtered = computed(() =>
    torrents.value.filter((t) => matchesFilter(t) && matchesSearch(t) && matchesTaxonomy(t)),
  )

  const sorted = computed(() => {
    const list = [...filtered.value]
    const key = sortKey.value
    const dir = sortReverse.value ? -1 : 1

    list.sort((a, b) => {
      let cmp = 0
      switch (key) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          break
        case 'state':
          cmp = String(a.state).localeCompare(String(b.state))
          break
        case 'size':
          cmp = (a.size ?? 0) - (b.size ?? 0)
          break
        case 'progress':
          cmp = (a.progress ?? 0) - (b.progress ?? 0)
          break
        case 'dlspeed':
          cmp = (a.dlspeed ?? 0) - (b.dlspeed ?? 0)
          break
        case 'upspeed':
          cmp = (a.upspeed ?? 0) - (b.upspeed ?? 0)
          break
        case 'ratio':
          cmp = (a.ratio ?? 0) - (b.ratio ?? 0)
          break
        case 'eta': {
          // An infinite ETA means "never finishes" — it carries no useful
          // ordering information, so it is pinned to the end in BOTH
          // directions rather than being treated as a very large number
          // (which would make it sort first when descending).
          const aInf = (a.eta ?? 0) >= 8640000 || (a.eta ?? 0) < 0
          const bInf = (b.eta ?? 0) >= 8640000 || (b.eta ?? 0) < 0
          if (aInf && bInf) cmp = a.hash.localeCompare(b.hash)
          else if (aInf) return 1
          else if (bInf) return -1
          else cmp = (a.eta ?? 0) - (b.eta ?? 0)
          break
        }
        case 'added_on':
        default:
          cmp = (a.added_on ?? 0) - (b.added_on ?? 0)
          break
      }
      // Stable tiebreak so rows do not jump around while speeds fluctuate.
      if (cmp === 0) cmp = a.hash.localeCompare(b.hash)
      return cmp * dir
    })

    return list
  })

  /** Counts shown inside the segmented filter control. */
  const counts = computed(() => {
    const base = torrents.value
    // Pure: each tally asks about a specific filter without touching the ref.
    const tally = (candidate: TorrentFilter) =>
      base.filter((t) => matchesFilter(t, candidate)).length
    return {
      all: base.length,
      downloading: tally('downloading'),
      seeding: tally('seeding'),
      completed: tally('completed'),
      paused: tally('paused'),
      active: tally('active'),
      inactive: tally('inactive'),
      stalled: tally('stalled'),
      errored: tally('errored'),
    }
  })

  const allVisibleSelected = computed(
    () => sorted.value.length > 0 && sorted.value.every((t) => selected.value.has(t.hash)),
  )

  function toggleSelect(hash: string, event?: MouseEvent): void {
    const next = new Set(selected.value)
    if (next.has(hash)) {
      next.delete(hash)
    } else {
      next.add(hash)
      // Shift-click selects a contiguous range, matching the stock WebUI.
      if (event?.shiftKey && sorted.value.length > 1) {
        const hashes = sorted.value.map((t) => t.hash)
        let lastSelected = ''
        for (let i = hashes.length - 1; i >= 0; i -= 1) {
          if (selected.value.has(hashes[i])) {
            lastSelected = hashes[i]
            break
          }
        }
        if (lastSelected) {
          const from = hashes.indexOf(lastSelected)
          const to = hashes.indexOf(hash)
          const [lo, hi] = from < to ? [from, to] : [to, from]
          for (let i = lo; i <= hi; i += 1) next.add(hashes[i])
        }
      }
    }
    selected.value = next
    selectionMode.value = next.size > 0
  }

  function selectAll(): void {
    if (allVisibleSelected.value) {
      selected.value = new Set()
      selectionMode.value = false
      return
    }
    selected.value = new Set(sorted.value.map((t) => t.hash))
    selectionMode.value = true
  }

  function clearSelection(): void {
    selected.value = new Set()
    selectionMode.value = false
  }

  function selectedHashes(): string[] {
    return Array.from(selected.value)
  }

  function onSort(key: SortKey): void {
    if (sortKey.value === key) {
      sortReverse.value = !sortReverse.value
    } else {
      sortKey.value = key
      // Sensible default direction per column.
      sortReverse.value = key !== 'name' && key !== 'state'
    }
  }

  // Drop selections for torrents that no longer exist, otherwise a delete
  // would leave hashes pointing at nothing and actions would silently no-op.
  watch(torrents, (list) => {
    if (selected.value.size === 0) return
    const live = new Set(list.map((t) => t.hash))
    let changed = false
    const next = new Set<string>()
    for (const hash of selected.value) {
      if (live.has(hash)) next.add(hash)
      else changed = true
    }
    if (changed) {
      selected.value = next
      if (next.size === 0) selectionMode.value = false
    }
  })

  return {
    // filter state
    filter,
    search,
    category,
    tag,
    sortKey,
    sortReverse,
    // selection state
    selected,
    selectionMode,
    allVisibleSelected,
    // derived
    filtered,
    sorted,
    counts,
    // actions
    onSort,
    toggleSelect,
    selectAll,
    clearSelection,
    selectedHashes,
  }
}