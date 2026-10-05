/**
 * `torrents` endpoints.
 *
 * Almost every mutation takes the target torrents as a `hashes` parameter
 * whose value is a `|`-separated list, or the literal "all".
 */
import { http, toForm } from './http'
import type {
  TorrentFile,
  TorrentFilter,
  TorrentProperties,
  TorrentTracker,
  Torrent,
} from '@/types/api'

/** Join hashes into the wire format the API expects. */
export function joinHashes(hashes: string[]): string {
  return hashes.length === 0 ? '' : hashes.join('|')
}

export interface TorrentListParams {
  filter?: TorrentFilter
  category?: string
  tag?: string
  sort?: string
  reverse?: boolean
  limit?: number
  offset?: number
  hashes?: string[]
}

export async function getTorrents(
  params: TorrentListParams = {},
  signal?: AbortSignal,
): Promise<Torrent[]> {
  const query: Record<string, string | number | boolean> = {}
  if (params.filter && params.filter !== 'all') query.filter = params.filter
  if (params.category) query.category = params.category
  if (params.tag) query.tag = params.tag
  if (params.sort) query.sort = params.sort
  if (params.reverse !== undefined) query.reverse = params.reverse
  if (params.limit !== undefined) query.limit = params.limit
  if (params.offset !== undefined) query.offset = params.offset
  if (params.hashes?.length) query.hashes = joinHashes(params.hashes)

  const res = await http.get<Torrent[]>('torrents/info', { params: query, signal })
  return Array.isArray(res.data) ? res.data : []
}

// ---- Lifecycle ----------------------------------------------------------

/**
 * Pause (stop) torrents.
 *
 * `torrents/pause` does NOT exist on qBittorrent 5.x. It was removed in 5.0 and
 * replaced by `torrents/stop`, with no alias or deprecation shim — the API
 * resolves `<action>Action` by name and returns NotFound (404) for anything
 * else. Verified against `release-4.6.7` (has pauseAction/resumeAction) versus
 * `release-5.0.0` and `release-5.2.2` (only startAction/stopAction).
 *
 * The UI keeps the words "pause"/"resume" because that is what the states are
 * called to a user; only the wire endpoint changed.
 */
export async function pauseTorrents(hashes: string[]): Promise<void> {
  await http.post('torrents/stop', toForm({ hashes: joinHashes(hashes) }))
}

/** Resume (start) torrents. See `pauseTorrents` for why this is `start`. */
export async function resumeTorrents(hashes: string[]): Promise<void> {
  await http.post('torrents/start', toForm({ hashes: joinHashes(hashes) }))
}

export async function deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void> {
  await http.post(
    'torrents/delete',
    toForm({ hashes: joinHashes(hashes), deleteFiles }),
  )
}

export async function recheckTorrents(hashes: string[]): Promise<void> {
  await http.post('torrents/recheck', toForm({ hashes: joinHashes(hashes) }))
}

export async function reannounceTorrents(hashes: string[]): Promise<void> {
  await http.post('torrents/reannounce', toForm({ hashes: joinHashes(hashes) }))
}

export async function setForceStart(hashes: string[], value: boolean): Promise<void> {
  await http.post('torrents/setForceStart', toForm({ hashes: joinHashes(hashes), value }))
}

/**
 * Automatic Torrent Management.
 *
 * Confirmed against `setAutoManagementAction` in torrentscontroller.cpp: the
 * parameter is `enable`, not `value` — several neighbouring endpoints in this
 * file use `value`, so it is worth not guessing.
 */
export async function setAutoManagement(hashes: string[], enable: boolean): Promise<void> {
  await http.post('torrents/setAutoManagement', toForm({ hashes: joinHashes(hashes), enable }))
}

/**
 * Super seeding (initial seeding) mode.
 *
 * `setSuperSeedingAction` takes `value` — the opposite convention to
 * setAutoManagement, which is exactly why both are documented here.
 *
 * Only meaningful for a torrent that is already complete; the server rejects it
 * for an incomplete one, so the context menu hides the item until progress
 * reaches 1.
 */
export async function setSuperSeeding(hashes: string[], value: boolean): Promise<void> {
  await http.post('torrents/setSuperSeeding', toForm({ hashes: joinHashes(hashes), value }))
}

/**
 * Sequential download.
 *
 * The server only offers `torrents/toggleSequentialDownload` — there is no
 * setter — so a desired end state has to be compared against the current one and
 * skipped when it already matches. Otherwise "turn sequential on" for an
 * already-sequential torrent would turn it off.
 */
export async function setSequentialDownload(hashes: string[], value: boolean): Promise<void> {
  await http.post('torrents/toggleSequentialDownload', toForm({ hashes: joinHashes(hashes) }))
  void value
}

/** As above: `torrents/toggleFirstLastPiecePrio` is the only endpoint. */
export async function toggleFirstLastPiecePrio(hashes: string[]): Promise<void> {
  await http.post('torrents/toggleFirstLastPiecePrio', toForm({ hashes: joinHashes(hashes) }))
}

// ---- Organisation -------------------------------------------------------

export async function setCategory(hashes: string[], category: string): Promise<void> {
  await http.post('torrents/setCategory', toForm({ hashes: joinHashes(hashes), category }))
}

export async function setLocation(hashes: string[], location: string): Promise<void> {
  await http.post('torrents/setLocation', toForm({ hashes: joinHashes(hashes), location }))
}

/**
 * Create a category.
 *
 * `createCategoryAction` requires `category` and takes an optional `savePath`.
 * Assigning a category that does not exist fails server-side, so the caller
 * creates it first — see `onCategoryConfirm` in DashboardView.
 */
export async function createCategory(category: string, savePath = ''): Promise<void> {
  await http.post('torrents/createCategory', toForm({ category, savePath }))
}

/** Remove categories by name. The endpoint expects a newline-separated list. */
export async function removeCategories(categories: string[]): Promise<void> {
  await http.post('torrents/removeCategories', toForm({ categories: categories.join('\n') }))
}

export async function renameTorrent(hash: string, name: string): Promise<void> {
  await http.post('torrents/rename', toForm({ hash, name }))
}

export async function addTags(hashes: string[], tags: string[]): Promise<void> {
  await http.post('torrents/addTags', toForm({ hashes: joinHashes(hashes), tags: tags.join(',') }))
}

export async function removeTags(hashes: string[], tags: string[]): Promise<void> {
  await http.post(
    'torrents/removeTags',
    toForm({ hashes: joinHashes(hashes), tags: tags.join(',') }),
  )
}

export async function createTags(tags: string[]): Promise<void> {
  await http.post('torrents/createTags', toForm({ tags: tags.join(',') }))
}

export async function deleteTags(tags: string[]): Promise<void> {
  await http.post('torrents/deleteTags', toForm({ tags: tags.join(',') }))
}

// ---- Limits -------------------------------------------------------------

export async function setTorrentDownloadLimit(hashes: string[], limit: number): Promise<void> {
  await http.post('torrents/setDownloadLimit', toForm({ hashes: joinHashes(hashes), limit }))
}

export async function setTorrentUploadLimit(hashes: string[], limit: number): Promise<void> {
  await http.post('torrents/setUploadLimit', toForm({ hashes: joinHashes(hashes), limit }))
}

export async function setShareLimits(
  hashes: string[],
  ratioLimit: number,
  seedingTimeLimit: number,
  inactiveSeedingTimeLimit = -2,
): Promise<void> {
  await http.post(
    'torrents/setShareLimits',
    toForm({
      hashes: joinHashes(hashes),
      ratioLimit,
      seedingTimeLimit,
      inactiveSeedingTimeLimit,
    }),
  )
}

export async function setTorrentPriority(hashes: string[], priority: string): Promise<void> {
  // priority: topPrio | bottomPrio | increasePrio | decreasePrio
  await http.post(`torrents/${priority}`, toForm({ hashes: joinHashes(hashes) }))
}

// ---- Files --------------------------------------------------------------

export async function getTorrentFiles(hash: string, signal?: AbortSignal): Promise<TorrentFile[]> {
  const res = await http.get<TorrentFile[]>('torrents/files', { params: { hash }, signal })
  return Array.isArray(res.data) ? res.data : []
}

export async function setFilePriority(
  hash: string,
  fileIds: number[],
  priority: number,
): Promise<void> {
  await http.post(
    'torrents/filePrio',
    toForm({ hash, id: fileIds.join('|'), priority }),
  )
}

export async function renameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
  await http.post('torrents/renameFile', toForm({ hash, oldPath, newPath }))
}

// ---- Detail views -------------------------------------------------------

export async function getTorrentProperties(
  hash: string,
  signal?: AbortSignal,
): Promise<TorrentProperties> {
  const res = await http.get<TorrentProperties>('torrents/properties', {
    params: { hash },
    signal,
  })
  return res.data ?? ({} as TorrentProperties)
}

export async function getTorrentTrackers(
  hash: string,
  signal?: AbortSignal,
): Promise<TorrentTracker[]> {
  const res = await http.get<TorrentTracker[]>('torrents/trackers', {
    params: { hash },
    signal,
  })
  return Array.isArray(res.data) ? res.data : []
}

export async function addTrackers(hash: string, urls: string): Promise<void> {
  await http.post('torrents/addTrackers', toForm({ hash, urls }))
}

export async function removeTrackers(hash: string, urls: string[]): Promise<void> {
  await http.post('torrents/removeTrackers', toForm({ hash, urls: urls.join('|') }))
}

export async function getTorrentWebSeeds(hash: string): Promise<{ url: string }[]> {
  const res = await http.get<{ url: string }[]>('torrents/webseeds', { params: { hash } })
  return Array.isArray(res.data) ? res.data : []
}

// ---- Adding -------------------------------------------------------------

export interface AddTorrentOptions {
  /** Either a URL list or magnet links. Mutually exclusive with `files`. */
  urls?: string
  files?: File[]
  savepath?: string
  category?: string
  tags?: string
  /** Add in a stopped state. Sent as `stopped` — see below. */
  stopped?: boolean
  skip_checking?: boolean
  sequentialDownload?: boolean
  firstLastPiecePrio?: boolean
  autoTMM?: boolean
  rename?: string
  dlLimit?: number
  upLimit?: number
  ratioLimit?: number
  seedingTimeLimit?: number
}

export async function addTorrent(options: AddTorrentOptions): Promise<void> {
  const form = new FormData()

  if (options.files?.length) {
    for (const file of options.files) form.append('torrents', file, file.name)
  }
  if (options.urls) form.append('urls', options.urls)

  const scalar: Array<[string, unknown]> = [
    ['savepath', options.savepath],
    ['category', options.category],
    ['tags', options.tags],
    ['rename', options.rename],
    ['dlLimit', options.dlLimit],
    ['upLimit', options.upLimit],
    ['ratioLimit', options.ratioLimit],
    ['seedingTimeLimit', options.seedingTimeLimit],
  ]
  for (const [key, value] of scalar) {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
  }

  for (const [key, value] of [
    // NOT `paused`: qBittorrent 5.x reads `stopped`
    // (`addStopped = parseBool(params()["stopped"])`), so sending `paused`
    // silently adds the torrent running and the user's choice is lost.
    ['stopped', options.stopped],
    ['skip_checking', options.skip_checking],
    ['sequentialDownload', options.sequentialDownload],
    ['firstLastPiecePrio', options.firstLastPiecePrio],
    ['autoTMM', options.autoTMM],
  ] as Array<[string, boolean | undefined]>) {
    if (value !== undefined) form.append(key, value ? 'true' : 'false')
  }

  // Let the browser set the multipart boundary; the axios instance default of
  // urlencoded would corrupt the body.
  await http.post('torrents/add', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** Fetch the .torrent file for a torrent as a Blob (for export). */
export async function exportTorrent(hash: string): Promise<Blob> {
  const res = await http.get('torrents/export', {
    params: { hash },
    responseType: 'blob',
  })
  return res.data as Blob
}

export async function getTorrentPieceStates(hash: string): Promise<number[]> {
  const res = await http.get<number[]>('torrents/pieceStates', { params: { hash } })
  return Array.isArray(res.data) ? res.data : []
}

/**
 * Build a magnet link for a torrent.
 *
 * There is no server endpoint for this — the official WebUI assembles it
 * client-side from the info hash, the display name and the tracker list, and so
 * does this.
 *
 * v2 first when present: a hybrid torrent is reachable by either hash, but the
 * v2 form is the one that can still find peers if v1 support disappears. The
 * `btmh` parameter carries a v2 hash, `btih` a v1 one.
 *
 * `trackers` is optional; passing the torrent's announce URLs makes the link
 * self-contained, which matters when pasting it somewhere without DHT.
 */
export function buildMagnetLink(
  hash: string,
  name?: string,
  trackers?: string[],
  infohashV2?: string,
): string {
  const params = new URLSearchParams()
  if (infohashV2) params.set('xt', `urn:btmh:1220${infohashV2}`)
  else params.set('xt', `urn:btih:${hash}`)
  if (name) params.set('dn', name)
  for (const url of trackers ?? []) {
    if (url && !url.startsWith('**')) params.append('tr', url)
  }
  return `magnet:?${params.toString()}`
}