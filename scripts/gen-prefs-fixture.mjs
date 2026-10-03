/**
 * Builds a complete `app/preferences` payload from the project's own settings
 * schema, for the screenshot harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * The harness used to serve FOUR preference fields. The settings view loaded,
 * found almost nothing to render, and painted an empty page — which shipped to
 * the README as a blank settings.png. Deriving the payload from the schema means
 * the fixture cannot drift out of date as settings are added.
 *
 * It also returns values that look like a REAL configuration rather than a wall
 * of defaults. Returning `false` for every boolean produced a screenshot showing
 * every switch off and "52 changes pending", which misrepresents the page.
 *
 * PARSING NOTE
 * ------------
 * The schema writes most fields on ONE line (`{ key: 'x', kind: 'y', ... }`) and
 * a minority across several. An earlier version of this script only matched the
 * multi-line shape, so it silently produced 32 of 150 fields — the same class of
 * incomplete-fixture bug it was written to prevent. Both shapes are handled.
 */
import { readFileSync } from 'node:fs'

const source = readFileSync('src/config/settings-schema.ts', 'utf8')

/**
 * Extract every field entry, single-line or multi-line.
 *
 * Start at `{` followed by `key:`, then read forward to the closing brace of
 * that object.
 *
 * The key pattern allows MIXED CASE. `banned_IPs` is a real qBittorrent
 * preference and the earlier `[a-z0-9_]+` pattern skipped it, silently
 * producing 149 of 150 fields — exactly the incomplete-fixture failure this
 * whole script exists to prevent.
 */
const entries = []
const startRe = /\{\s*key:\s*'([A-Za-z0-9_]+)'/g
let m
while ((m = startRe.exec(source)) !== null) {
  const key = m[1]
  // Read up to the end of this field object: `}` at depth 0 after the key.
  let depth = 1
  let i = m.index + 1
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') depth -= 1
    i += 1
  }
  const body = source.slice(m.index, i)

  const kind = /kind:\s*'([a-z]+)'/.exec(body)?.[1] ?? 'string'
  const options = [...body.matchAll(/value:\s*'([^']*)'/g)].map((o) => o[1])
  entries.push({ key, kind, options })
}

if (entries.length === 0) {
  console.error('parsed 0 fields — the schema shape has changed')
  process.exit(1)
}

/*
 * Named overrides. These are the fields a reader can actually SEE in the
 * screenshot, so they must look like a considered configuration.
 */
const OVERRIDES = {
  // Booleans that should read as "on" in a sensible setup.
  dht: true, pex: true, lsd: true, upnp: true,
  queueing_enabled: true,
  max_ratio_enabled: true,
  max_seeding_time_enabled: true,
  add_to_top_of_queue: true,
  create_subfolder_enabled: true,
  use_subcategories: true,
  start_paused_enabled: true,
  preallocate_all: true,
  announce_to_all_trackers: true,
  announce_to_all_tiers: true,
  validate_https_tracker_certificate: true,
  ssrf_mitigation: true,
  block_peers_on_privileged_ports: true,
  alternative_webui_enabled: true,
  rss_processing_enabled: true,
  rss_auto_downloading_enabled: true,
  rss_download_repack_proper_episodes: true,
  web_ui_csrf_protection_enabled: true,
  web_ui_clickjacking_protection_enabled: true,
  web_ui_secure_cookie_enabled: true,
  web_ui_host_header_validation_enabled: true,
  confirm_torrent_deletion: true,
  confirm_torrent_recheck: true,
  incomplete_files_ext: true,
  dont_count_slow_torrents: true,
  enable_multi_connections_from_same_ip: false,
  add_trackers_enabled: false,
  temp_path_enabled: false,
  use_https: false,
  web_ui_use_https: false,
  web_ui_upnp: false,
  anonymous_mode: false,
  proxy_peer_connections: false,
  proxy_hostname_lookup: false,
  proxy_auth_enabled: false,
  autorun_enabled: false,
  mail_notification_enabled: false,
  custom_http_headers_enabled: false,
  excluded_file_names_enabled: false,

  // Numbers with recognisable defaults.
  refresh_interval: 1500,
  listen_port: 6881,
  web_ui_port: 8080,
  max_connec: 500,
  max_connec_per_torrent: 100,
  max_uploads: 8,
  max_uploads_per_torrent: 4,
  max_active_downloads: 5,
  max_active_uploads: 3,
  max_active_torrents: 10,
  max_ratio: 2,
  max_seeding_time: 1440,
  disk_cache: -1,
  disk_cache_ttl: 60,
  async_io_threads: 4,
  checking_memory_use: 32,
  memory_working_set_limit: 512,
  file_pool_size: 500,
  slow_torrent_dl_rate_threshold: 10240,
  slow_torrent_ul_rate_threshold: 10240,
  slow_torrent_inactive_timer: 300,
  rss_refresh_interval: 30,
  rss_max_articles_per_feed: 500,
  save_resume_data_interval: 60,
  web_ui_session_timeout: 3600,
  web_ui_max_auth_fail_count: 5,
  web_ui_ban_duration: 3600,
  upnp_lease_duration: 0,
  embedded_tracker_port: 9000,
  proxy_port: 8080,
  send_buffer_watermark: 500,
  send_buffer_low_watermark: 10,
  send_buffer_watermark_factor: 50,
  peer_tos: 4,
  upnp_lease_duration_seconds: 0,
  outgoing_ports_min: 0,
  outgoing_ports_max: 0,

  // Strings / enums.
  save_path: '/downloads',
  session_default_save_path: '/downloads',
  temp_path: '/downloads/temp',
  web_ui_username: 'admin',
  web_ui_address: '*',
  web_ui_domain_list: '*',
  alternative_webui_path: '/config/macui-qbittorrent',
  torrent_content_layout: 'Original',
  rss_smart_episode_filters: 's(\\d+)e(\\d+)',
  current_network_interface: 'eth0',
  current_interface_address: '192.0.2.10',
  proxy_type: -1,
  encryption: 0,
}

/** A plausible value for a field, from its declared kind. */
function valueFor({ key, kind, options }) {
  if (key in OVERRIDES) return OVERRIDES[key]

  switch (kind) {
    case 'boolean':
      return false
    case 'number':
    case 'integer':
      return 0
    case 'select':
    case 'enum':
      return options[0] ?? ''
    case 'multiline':
    case 'string':
    case 'text':
    case 'path':
    default:
      return ''
  }
}

const out = {}
for (const entry of entries) {
  if (entry.key in out) continue
  out[entry.key] = valueFor(entry)
}

if (process.argv.includes('--report')) {
  const kinds = {}
  for (const e of entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
  process.stderr.write(`parsed fields: ${entries.length} (unique ${Object.keys(out).length})\n`)
  process.stderr.write(`kinds: ${JSON.stringify(kinds)}\n`)
  const orphanOverrides = Object.keys(OVERRIDES).filter((k) => !(k in out))
  if (orphanOverrides.length) {
    process.stderr.write(`overrides with no matching field: ${orphanOverrides.join(', ')}\n`)
  }
}

process.stdout.write(JSON.stringify(out))
