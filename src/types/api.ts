/**
 * qBittorrent WebAPI v2 types.
 *
 * Field names and shapes were taken from the qBittorrent 5.x sources:
 *   - src/webui/api/synccontroller.cpp  (maindata payload + torrent fields)
 *   - src/webui/api/appcontroller.cpp   (preferences, buildInfo)
 *   - src/webui/api/authcontroller.cpp  (login / logout semantics)
 *
 * Only fields this UI actually consumes are modelled strictly; everything else
 * is reachable through the index signature so a server-side addition never
 * breaks the build.
 */

/** Torrent states reported by the API. The set is stable across 5.x. */
export type TorrentState =
  | 'error'
  | 'missingFiles'
  | 'uploading'
  | 'pausedUP'
  | 'queuedUP'
  | 'stalledUP'
  | 'checkingUP'
  | 'forcedUP'
  | 'allocating'
  | 'downloading'
  | 'metaDL'
  | 'pausedDL'
  | 'queuedDL'
  | 'stalledDL'
  | 'checkingDL'
  | 'forcedDL'
  | 'checkingResumeData'
  | 'moving'
  | 'unknown'

export interface Torrent {
  hash: string
  name: string
  size: number
  /** 0..1 */
  progress: number
  dlspeed: number
  upspeed: number
  /** Queue position, -1 when queueing is disabled. */
  priority: number
  num_seeds: number
  num_complete: number
  num_leechs: number
  num_incomplete: number
  ratio: number
  /** Seconds; 8640000 means "infinity". */
  eta: number
  state: TorrentState
  seq_dl: boolean
  f_l_piece_prio: boolean
  completion_on: number
  tracker: string
  dl_limit: number
  up_limit: number
  downloaded: number
  uploaded: number
  downloaded_session: number
  uploaded_session: number
  amount_left: number
  save_path: string
  download_path?: string
  completed: number
  max_ratio: number
  max_seeding_time: number
  ratio_limit: number
  seeding_time_limit: number
  seen_complete: number
  last_activity: number
  total_size: number
  /** Present in recent versions. */
  category?: string
  tags?: string
  added_on?: number
  availability?: number
  content_path?: string
  dl_speed_avg?: number
  up_speed_avg?: number
  time_active?: number
  seeding_time?: number
  auto_tmm?: boolean
  magnet_uri?: string
  infohash_v1?: string
  infohash_v2?: string
  [key: string]: unknown
}

export interface Category {
  name: string
  savePath: string
}

export interface ServerState {
  /** 'connected' | 'firewalled' | 'disconnected' */
  connection_status?: string
  dht_nodes?: number
  dl_info_data?: number
  dl_info_speed?: number
  dl_rate_limit?: number
  up_info_data?: number
  up_info_speed?: number
  up_rate_limit?: number
  queueing?: boolean
  refresh_interval?: number
  free_space_on_disk?: number
  use_subcategories?: boolean
  alltime_dl?: number
  alltime_ul?: number
  average_time_queue?: number
  global_ratio?: string
  last_external_address_v4?: string
  last_external_address_v6?: string
  read_cache_hits?: string
  read_cache_overload?: string
  total_buffers_size?: number
  total_peer_connections?: number
  total_queued_size?: number
  total_wasted_session?: number
  write_cache_overload?: string
  [key: string]: unknown
}

/**
 * `sync/maindata` response. With `rid=0` the server sends everything;
 * afterwards it sends deltas, so every collection below is optional and
 * requires merging rather than replacing.
 */
export interface MainData {
  rid: number
  full_update?: boolean
  torrents?: Record<string, Torrent>
  torrents_removed?: string[]
  categories?: Record<string, Category>
  categories_removed?: string[]
  tags?: string[]
  tags_removed?: string[]
  server_state?: ServerState
  trackers?: Record<string, string[]>
  trackers_removed?: string[]
}

export interface TransferInfo {
  dl_info_speed: number
  dl_info_data: number
  up_info_speed: number
  up_info_data: number
  dl_rate_limit: number
  up_rate_limit: number
  /** Nodes in the DHT routing table. */
  dht_nodes: number
  /**
   * Reachability, as computed server-side:
   *   "connected"    listening AND peers have connected to us
   *   "firewalled"   listening but NO incoming connections — nothing reaches us
   *   "disconnected" not listening at all
   * i.e. isListening() ? (hasIncomingConnections ? "connected" : "firewalled")
   *                    : "disconnected"
   */
  connection_status: 'connected' | 'firewalled' | 'disconnected' | string
  queueing?: boolean
  free_space_on_disk?: number
  /** Cumulative bytes since statistics began — not just this session. */
  alltime_dl?: number
  alltime_ul?: number
  /** All-time uploaded/downloaded ratio. "-" when not yet computable. */
  global_ratio?: string
  total_peer_connections?: number
  total_wasted_session?: number
  total_queued_size?: number
  average_time_queue?: number
  last_external_address_v4?: string
  last_external_address_v6?: string
  read_cache_hits?: string
  read_cache_overload?: string
  write_cache_overload?: string
  queued_io_jobs?: number
  total_buffers_size?: number
  [key: string]: unknown
}

export interface BuildInfo {
  qt: string
  libtorrent: string
  boost: string
  openssl: string
  zlib: string
  bitness: number
  platform: string
}

export interface Peer {
  ip: string
  port: number
  client: string
  progress: number
  dl_speed: number
  up_speed: number
  downloaded: number
  uploaded: number
  connection: string
  flags: string
  country?: string
  [key: string]: unknown
}

export interface TorrentTracker {
  url: string
  status: number
  tier: number
  num_peers: number
  num_seeds: number
  num_leeches: number
  num_downloaded: number
  msg: string
}

export interface TorrentFile {
  index: number
  name: string
  size: number
  progress: number
  priority: number
  is_seed: boolean
  piece_range: [number, number]
  availability: number
}

export interface TorrentProperties {
  save_path: string
  creation_date: number
  piece_size: number
  comment: string
  total_wasted: number
  total_uploaded: number
  total_uploaded_session: number
  total_downloaded: number
  total_downloaded_session: number
  up_limit: number
  dl_limit: number
  time_elapsed: number
  seeding_time: number
  nb_connections: number
  nb_connections_limit: number
  share_ratio: number
  addition_date: number
  completion_date: number
  created_by: string
  dl_speed_avg: number
  dl_speed: number
  eta: number
  last_seen: number
  peers: number
  peers_total: number
  pieces_have: number
  pieces_num: number
  reannounce: number
  seeds: number
  seeds_total: number
  total_size: number
  up_speed_avg: number
  up_speed: number
  [key: string]: unknown
}

/** A subset of app/preferences we expose for editing. */
export interface AppPreferences {
  save_path?: string
  temp_path?: string
  temp_path_enabled?: boolean
  dl_limit?: number
  up_limit?: number
  alt_dl_limit?: number
  alt_up_limit?: number
  listen_port?: number
  random_port?: boolean
  upnp?: boolean
  dht?: boolean
  pex?: boolean
  lsd?: boolean
  encryption?: number
  anonymous_mode?: boolean
  max_connec?: number
  max_connec_per_torrent?: number
  max_uploads?: number
  max_uploads_per_torrent?: number
  queueing_enabled?: boolean
  max_active_downloads?: number
  max_active_torrents?: number
  max_active_uploads?: number
  max_ratio_enabled?: boolean
  max_ratio?: number
  max_seeding_time_enabled?: boolean
  max_seeding_time?: number
  max_ratio_act?: number
  start_paused_enabled?: boolean
  auto_tmm_enabled?: boolean
  web_ui_port?: number
  web_ui_username?: string
  web_ui_session_timeout?: number
  web_ui_max_auth_fail_count?: number
  web_ui_ban_duration?: number
  locale?: string
  refresh_interval?: number
  [key: string]: unknown
}

/** Error payload thrown by APIError on the server. */
export interface ApiErrorBody {
  message?: string
}

export type TorrentFilter =
  | 'all'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'resumed'
  | 'paused'
  | 'active'
  | 'inactive'
  | 'stalled'
  | 'errored'

export const INFINITE_ETA = 8640000

// ===========================================================================
// RSS
// ===========================================================================

/**
 * One RSS article.
 *
 * Key names come from `rss_article.cpp` (`Article::Key*`). `date` is NOT the
 * server's internal QDateTime — `Feed::toJsonValue` rewrites it to an RFC 2822
 * string, so it must go through `Date.parse`.
 */
export interface RssArticle {
  id: string
  title: string
  /** RFC 2822, e.g. "Mon, 06 Oct 2025 12:00:00 +0000". */
  date?: string
  author?: string
  description?: string
  torrentURL?: string
  link?: string
  isRead?: boolean
}

/**
 * A feed, as returned by `/api/v2/rss/items`.
 *
 * `uid`, `url` and `refreshInterval` are always present; the rest only when the
 * request used `withData=true`.
 */
export interface RssFeed {
  kind: 'feed'
  /** Slash-separated path from the root, e.g. "News/Tech". */
  path: string
  name: string
  uid: string
  url: string
  refreshInterval?: number
  title?: string
  lastBuildDate?: string
  isLoading?: boolean
  hasError?: boolean
  articles?: RssArticle[]
}

/** A folder. The server nests these arbitrarily deep. */
export interface RssFolder {
  kind: 'folder'
  path: string
  name: string
  children: RssNode[]
}

export type RssNode = RssFeed | RssFolder

/**
 * An auto-download rule definition.
 *
 * Only the fields the UI edits are typed; the server round-trips the rest, so
 * unknown keys are preserved rather than dropped.
 */
export interface RssRule {
  enabled?: boolean
  mustContain?: string
  mustNotContain?: string
  useRegex?: boolean
  episodeFilter?: string
  smartFilter?: boolean
  previouslyMatchedEpisodes?: string[]
  affectedFeeds?: string[]
  ignoreDays?: number
  lastMatch?: string
  addPaused?: boolean
  assignedCategory?: string
  savePath?: string
  torrentContentLayout?: string
  [key: string]: unknown
}

// ===========================================================================
// Search
// ===========================================================================

export interface SearchCategory {
  id: string
  name: string
}

export interface SearchPlugin {
  name: string
  version: string
  fullName: string
  url: string
  supportedCategories: SearchCategory[]
  enabled: boolean
}

/**
 * One search result.
 *
 * `fileUrl` is what gets handed to `search/downloadTorrent`; for magnet links
 * the server adds it directly without a round trip.
 */
export interface SearchResult {
  fileName: string
  fileUrl: string
  fileSize: number
  nbSeeders: number
  nbLeechers: number
  engineName: string
  siteUrl: string
  descrLink: string
  /** Seconds since epoch, not milliseconds. */
  pubDate: number
}

export interface SearchStatus {
  id: number
  status: 'Running' | 'Stopped' | string
  total: number
}

export interface SearchResultsPage {
  status: 'Running' | 'Stopped' | string
  results: SearchResult[]
  total: number
}