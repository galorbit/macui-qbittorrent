/**
 * Session store — owns the `sync/maindata` polling loop and the merged
 * torrent/category/tag state.
 *
 * Incremental sync contract (src/webui/api/synccontroller.cpp):
 *   - request `rid=0`            → full snapshot
 *   - request the last `rid`     → deltas only
 *   - response may contain `full_update: true` → discard everything local,
 *     because the server has dropped its own snapshot (e.g. after a restart,
 *     or when the client's rid is too far behind)
 *
 * Getting this wrong is the classic source of "stale torrents linger forever"
 * and "progress bars freeze" bugs, so the merge is deliberate about removal
 * lists and never assumes a field is present.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMainData } from '@/api/sync'
import { getTransferInfo } from '@/api/transfer'
import { ApiError } from '@/api/http'
import type { Category, MainData, ServerState, Torrent, TransferInfo } from '@/types/api'

/** Poll interval fallbacks, in ms. */
const MIN_INTERVAL = 1000
const DEFAULT_INTERVAL = 1500
const MAX_BACKOFF = 30000

export const useSessionStore = defineStore('session', () => {
  // ---- State ------------------------------------------------------------
  const torrents = ref<Map<string, Torrent>>(new Map())
  const categories = ref<Map<string, Category>>(new Map())
  const tags = ref<string[]>([])
  const serverState = ref<ServerState>({})
  const transfer = ref<TransferInfo | null>(null)

  const rid = ref(0)
  const connected = ref(false)
  const loading = ref(false)
  /** Set when the last poll failed; drives the offline banner. */
  const lastError = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: AbortController | null = null
  let running = false
  /** Current retry delay after a failure; 0 means "use the normal interval". */
  let backoff = 0
  /**
   * Incremented by `start()` and `stop()`.
   *
   * A poll that is already awaiting a response captures the generation it began
   * in; when it settles it may only reschedule if the generation is unchanged.
   * Without this, a poll in flight across a stop/start boundary re-arms a timer
   * belonging to a run that has already ended, producing two independent poll
   * chains that `stop()` can no longer cancel.
   */
  let generation = 0

  // ---- Derived ----------------------------------------------------------

  const torrentList = computed(() => Array.from(torrents.value.values()))

  const categoryNames = computed(() => {
    const names = Array.from(categories.value.keys())
    // qBittorrent treats "" as "no category".
    return names.sort((a, b) => a.localeCompare(b))
  })

  /**
   * Poll interval in MILLISECONDS.
   *
   * `server_state.refresh_interval` is already milliseconds, not seconds.
   * Confirmed against the server: `SyncController::makeMaindataSnapshot()` sets
   * it from `session->refreshInterval()`, and the official WebUI feeds the value
   * straight into `setTimeout` with a 1500 ms default
   * (`serverSyncMainDataInterval = Math.max(serverState.refresh_interval, 500)`).
   *
   * Multiplying by 1000 — as this did — turns the stock 1500 ms into a 25 MINUTE
   * poll interval. The first snapshot paints and then nothing ever updates:
   * frozen progress, stale speeds, deleted torrents still listed. Because the
   * bug is a wrong unit rather than a wrong branch, it looks like the server
   * stopped sending data.
   */
  const refreshInterval = computed(() => {
    const fromServer = Number(serverState.value.refresh_interval ?? 0)
    if (fromServer > 0) return Math.max(fromServer, MIN_INTERVAL)
    return DEFAULT_INTERVAL
  })

  const downloadSpeed = computed(() => Number(serverState.value.dl_info_speed ?? 0))
  const uploadSpeed = computed(() => Number(serverState.value.up_info_speed ?? 0))
  const freeSpace = computed(() => Number(serverState.value.free_space_on_disk ?? 0))

  /**
   * Read a global counter from whichever payload currently carries it.
   *
   * qBittorrent splits these across two endpoints, and WHICH one carries what
   * differs by version. Measured against a live 5.2.2 server:
   *
   *   transfer/info      dl_info_speed, dht_nodes, connection_status, rate limits
   *   server_state       alltime_dl, alltime_ul, global_ratio,
   *   (sync/maindata)    total_peer_connections, free_space_on_disk, …
   *
   * Reading the cumulative totals from `transfer/info` alone is exactly what
   * made every all-time figure render as 0 — the keys simply are not there.
   * Consulting both, first match wins, survives either layout.
   */
  function stat(key: string): unknown {
    const fromServer = serverState.value[key]
    if (fromServer !== undefined && fromServer !== null) return fromServer
    return transfer.value?.[key]
  }

  /**
   * Reachability. Both payloads carry it; `server_state` is preferred because
   * it arrives on the main sync loop and is therefore never stale.
   */
  const connectionStatus = computed(() => String(stat('connection_status') ?? 'unknown'))

  /** True when the server is listening but nobody can reach us. */
  const isFirewalled = computed(() => connectionStatus.value === 'firewalled')

  /** Nodes in the DHT routing table; 0 or undefined when DHT is disabled. */
  const dhtNodes = computed(() => Number(stat('dht_nodes') ?? 0))

  /** Cumulative bytes transferred since statistics began. */
  const allTimeDownloaded = computed(() => Number(stat('alltime_dl') ?? 0))
  const allTimeUploaded = computed(() => Number(stat('alltime_ul') ?? 0))

  /** Bytes moved during the current session. */
  const sessionDownloaded = computed(() => Number(stat('dl_info_data') ?? 0))
  const sessionUploaded = computed(() => Number(stat('up_info_data') ?? 0))

  /** All-time share ratio. The API sends "-" until both counters are non-zero. */
  const globalRatio = computed(() => {
    const raw = stat('global_ratio')
    if (typeof raw === 'string' && raw !== '-' && raw !== '') return raw
    const dl = allTimeDownloaded.value
    const ul = allTimeUploaded.value
    if (dl > 0) return (ul / dl).toFixed(2)
    return '—'
  })

  /** Connected peers across all torrents. */
  const peerConnections = computed(() => Number(stat('total_peer_connections') ?? 0))

  /** External address as seen by trackers; useful for diagnosing NAT problems. */
  const externalAddress = computed(
    () => String(stat('last_external_address_v4') ?? stat('last_external_address_v6') ?? '') || '',
  )

  /** Aggregate counters used by the dashboard's summary cards. */
  const counts = computed(() => {
    let downloading = 0
    let seeding = 0
    let paused = 0
    let errored = 0
    let completed = 0
    for (const t of torrents.value.values()) {
      const s = t.state
      if (s === 'downloading' || s === 'metaDL' || s === 'forcedDL' || s === 'stalledDL') {
        downloading += 1
      } else if (s === 'uploading' || s === 'forcedUP' || s === 'stalledUP') {
        seeding += 1
      } else if (s === 'pausedDL' || s === 'pausedUP') {
        paused += 1
      } else if (s === 'error' || s === 'missingFiles') {
        errored += 1
      }
      if (t.progress >= 1) completed += 1
    }
    return { downloading, seeding, paused, errored, completed, total: torrents.value.size }
  })

  // ---- Merge logic ------------------------------------------------------

  /**
   * Apply a maindata payload to local state.
   *
   * Exported indirectly through the store so it can be unit-tested; the merge
   * is the part most worth testing because its failure modes are subtle.
   */
  function applyMainData(data: MainData): void {
    const isFull = data.full_update === true || rid.value === 0

    if (isFull) {
      torrents.value = new Map()
      categories.value = new Map()
      tags.value = []
    }

    // --- torrents -------------------------------------------------------
    if (data.torrents) {
      const next = isFull ? new Map<string, Torrent>() : new Map(torrents.value)
      for (const [hash, payload] of Object.entries(data.torrents)) {
        const existing = next.get(hash)
        // Deltas carry only changed fields, so merge rather than replace.
        next.set(hash, existing ? { ...existing, ...payload, hash } : { ...payload, hash })
      }
      torrents.value = next
    }

    if (data.torrents_removed?.length) {
      const next = new Map(torrents.value)
      for (const hash of data.torrents_removed) next.delete(hash)
      torrents.value = next
    }

    // --- categories -----------------------------------------------------
    if (data.categories) {
      const next = isFull ? new Map<string, Category>() : new Map(categories.value)
      for (const [name, info] of Object.entries(data.categories)) {
        next.set(name, { ...(info as Category), name })
      }
      categories.value = next
    }

    if (data.categories_removed?.length) {
      const next = new Map(categories.value)
      for (const name of data.categories_removed) next.delete(name)
      categories.value = next
    }

    // --- tags -----------------------------------------------------------
    //
    // `tags` is ADDITIVE on a partial update, not a replacement. The server only
    // appends to this array when a tag is added (`SyncController::onTagAdded`
    // fills `m_addedTags`, which is flushed into the delta buffer), and removals
    // arrive separately in `tags_removed`. The official WebUI unions for exactly
    // this reason (`if (!tagMap.has(tag)) tagMap.set(tag, ...)`).
    //
    // Treating it as a replacement wipes the tag filter: with tags ["linux",
    // "iso"] loaded, creating any new tag makes the next delta carry only
    // ["newtag"], so every pre-existing tag vanishes from the UI until a full
    // update happens.
    //
    // A full update clears `tags.value` above, so a union is also correct there.
    if (data.tags?.length) {
      tags.value = [...new Set([...tags.value, ...data.tags])]
    }

    if (data.tags_removed?.length) {
      const removed = new Set(data.tags_removed)
      tags.value = tags.value.filter((t) => !removed.has(t))
    }

    // --- server state ---------------------------------------------------
    if (data.server_state) {
      serverState.value = isFull
        ? { ...data.server_state }
        : { ...serverState.value, ...data.server_state }
    }

    if (typeof data.rid === 'number' && Number.isFinite(data.rid)) {
      rid.value = data.rid
    }
  }

  // ---- Polling ----------------------------------------------------------

  async function pollOnce(): Promise<void> {
    // Do not start a poll once the loop has been stopped. Without this a
    // timer that fires concurrently with `stop()` still issues a request
    // against a session that is being torn down — visible as traffic
    // continuing after signing out.
    if (!running) return

    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      const data = await getMainData(rid.value, controller.signal)
      if (controller.signal.aborted) return

      applyMainData(data)

      // `transfer/info` supplies fields that `maindata` does not always carry
      // (the external address in particular). Note that the CUMULATIVE totals
      // are NOT exclusive to it — `server_state` is built from the same
      // `getTransferInfo()` map — so `stat()` reads either one.
      void getTransferInfo(controller.signal)
        .then((info) => {
          transfer.value = info
        })
        .catch(() => undefined)

      backoff = 0
      connected.value = true
      lastError.value = null
      // Clear the spinner on success...
      loading.value = false
    } catch (err) {
      // An abort is expected during teardown / navigation; not an error.
      if (controller.signal.aborted) return

      // 403 means the session is gone; stop polling loudly rather than
      // hammering the server with doomed requests.
      if (err instanceof ApiError && err.isAuthError) {
        connected.value = false
        lastError.value = err.message
        // ...and on failure too. Leaving `loading` set when the FIRST poll
        // fails strands the dashboard on its spinner forever, even though the
        // offline banner and its Retry button are showing.
        loading.value = false
        stop()
        return
      }

      connected.value = false
      loading.value = false
      lastError.value = err instanceof Error ? err.message : 'Connection lost'
      // Exponential backoff, capped.
      backoff = Math.min(backoff === 0 ? MIN_INTERVAL : backoff * 2, MAX_BACKOFF)
    } finally {
      if (inFlight === controller) inFlight = null
    }
  }

  /**
   * Arm the next poll.
   *
   * There is exactly ONE place that sets `timer`, and it always clears any
   * existing one first. Previously `start()`, the timer callback and
   * `refresh()` each called `schedule()` independently, so a `refresh()` that
   * overlapped a timer-driven poll left two live timers: the second overwrote
   * `timer`, orphaning the first. `stop()` could then only cancel one of them,
   * and the orphan kept polling a session that had already been torn down —
   * visible as requests continuing after logout, with the poll rate doubling
   * on every occurrence.
   *
   * `generation` guards the other direction: a poll that was already in flight
   * when `stop()` (or a restart) happened must not re-arm a chain when it
   * finally settles'.
   */
  function schedule(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!running) return

    const gen = generation
    const delay = backoff > 0 ? backoff : refreshInterval.value
    timer = setTimeout(() => {
      timer = null
      if (gen !== generation) return
      void pollOnce().finally(() => {
        // Only the current generation may reschedule.
        if (gen === generation) schedule()
      })
    }, delay)
  }

  /** Begin (or resume) polling. Safe to call repeatedly. */
  function start(): void {
    if (running) return
    running = true
    // Invalidate any poll still in flight from a previous run so its
    // completion cannot arm a second chain.
    generation += 1
    loading.value = torrents.value.size === 0
    // Always restart from rid 0 so the first response is a FULL update.
    //
    // This used to be conditional on `!connected`, which was almost never true
    // here: `connected` is only cleared on failure or by `reset()`, NOT by
    // `stop()`. So after a stop/start cycle — logout then login, or a route
    // change — the store reused the previous rid. The server answers a valid
    // rid with a DELTA, and a delta never mentions torrents that were removed
    // while we were away, so stale entries persisted in the list.
    rid.value = 0
    // Poll once immediately, then hand over to the single scheduler. `.finally`
    // rather than `.then`: a failing poll must still re-arm the next attempt,
    // otherwise one network blip stops polling permanently.
    void pollOnce().finally(() => schedule())
  }

  function stop(): void {
    running = false
    // Bump so an in-flight poll's completion cannot reschedule.
    generation += 1
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    inFlight?.abort()
    inFlight = null
  }

  /** Force an immediate refresh, e.g. after a mutation. */
  async function refresh(): Promise<void> {
    // Not running means there is nothing to refresh: `stop()` was called, so
    // re-arming here would restart polling after logout.
    if (!running) return

    // Cancel the pending poll, then take over scheduling entirely.
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    await pollOnce()
    schedule()
  }

  function reset(): void {
    stop()
    torrents.value = new Map()
    categories.value = new Map()
    tags.value = []
    serverState.value = {}
    transfer.value = null
    rid.value = 0
    connected.value = false
    lastError.value = null
  }

  return {
    // state
    torrents,
    torrentList,
    categories,
    categoryNames,
    tags,
    serverState,
    transfer,
    rid,
    connected,
    loading,
    lastError,
    // derived
    refreshInterval,
    downloadSpeed,
    uploadSpeed,
    freeSpace,
    connectionStatus,
    isFirewalled,
    dhtNodes,
    allTimeDownloaded,
    allTimeUploaded,
    sessionDownloaded,
    sessionUploaded,
    globalRatio,
    peerConnections,
    externalAddress,
    counts,
    // actions
    start,
    stop,
    refresh,
    reset,
    applyMainData,
  }
})