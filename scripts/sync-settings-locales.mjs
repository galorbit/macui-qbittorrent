/**
 * Keeps `src/i18n/locales/settings.ts` in sync with the settings schema.
 *
 *   - adds `field.*` labels the schema declares but the locale lacks, so no
 *     control ever shows a raw API key like `max_active_downloads`
 *   - removes labels for fields the schema no longer declares
 *
 * Run after editing the schema:  node scripts/sync-settings-locales.mjs
 *
 * It only inserts and deletes whole lines, so hand-written wording survives.
 * Newly added zh-CN labels are English placeholders and must be translated —
 * the script says so, and a test fails until they are.
 */
import fs from 'node:fs'
import { readSchemaKeys } from './read-schema-keys.mjs'

const FILE = 'src/i18n/locales/settings.ts'

const fieldKeys = readSchemaKeys()

/**
 * Chinese labels for fields the sync script may need to insert.
 *
 * Keeping them here means a newly added schema field gets a real translation
 * rather than an English placeholder that leaks into the Chinese UI. Anything
 * absent falls back to a prettified English label, and a test will flag it.
 */
const ZH_LABELS = {
  torrent_content_layout: '种子内容结构',
  torrent_stop_condition: '在以下情况停止种子',
  auto_delete_mode: '自动删除 .torrent 文件',
  excluded_file_names: '排除的文件名（每行一个，支持通配符）',
  proxy_type: '代理类型',
  bittorrent_protocol: 'BitTorrent 协议',
  schedule_from_hour: '开始时（小时）',
  schedule_from_min: '开始时（分钟）',
  scheduler_days: '生效日期',
  encryption: '加密模式',
  slow_torrent_dl_rate_threshold: '下载速率阈值',
  slow_torrent_ul_rate_threshold: '上传速率阈值',
  slow_torrent_inactive_timer: '种子无活动计时',
  max_ratio_act: '达到分享率限制时',
  max_seeding_time: '最大做种时间',
  max_inactive_seeding_time: '最大非活动做种时间',
  rss_download_repack_proper_episodes: '下载 REPACK / PROPER 剧集',
  rss_smart_episode_filters: '智能剧集过滤器（每行一个）',
  embedded_tracker_port: '内置 Tracker 端口',
  embedded_tracker_port_forwarding: '为内置 Tracker 启用端口转发',
  autorun_on_torrent_added_program: '添加种子时执行的程序',
  mail_notification_smtp: '邮件通知 SMTP 服务器',
  mail_notification_sender: '邮件发件人',
  mail_notification_email: '邮件收件人',
  mail_notification_ssl_enabled: '使用 SSL 连接',
  mail_notification_auth_enabled: 'SMTP 需要身份验证',
  mail_notification_username: 'SMTP 用户名',
  mail_notification_password: 'SMTP 密码',
  confirm_torrent_deletion: '删除种子时确认',
  confirm_torrent_recheck: '重新校验种子时确认',
  delete_torrent_content_files: '移除种子时默认删除内容文件',
  refresh_interval: '种子列表刷新间隔',
  save_path: '默认保存路径',
  temp_path_enabled: '使用临时路径',
  temp_path: '未完成种子保存路径',
  preallocate_all: '为所有文件预分配磁盘空间',
  incomplete_files_ext: '为未完成文件添加 .!qB 扩展名',
  use_unwanted_folder: '将不需要的文件放入 .unwanted 文件夹',
  add_to_top_of_queue: '新种子添加到队列顶部',
  add_stopped_enabled: '不自动开始下载',
  merge_trackers: '添加种子时合并 Tracker',
  auto_tmm_enabled: '种子管理模式：自动',
  torrent_changed_tmm_enabled: '分类变化时移动种子',
  save_path_changed_tmm_enabled: '保存路径变化时移动种子',
  category_changed_tmm_enabled: '分类保存路径变化时移动种子',
  use_subcategories: '使用子分类',
  excluded_file_names_enabled: '按文件名排除文件',
  export_dir: '复制 .torrent 文件到',
  export_dir_fin: '复制已完成下载的 .torrent 文件到',
  listen_port: '监听端口',
  upnp: '使用 UPnP / NAT-PMP 端口转发',
  max_connec: '全局最大连接数',
  max_connec_per_torrent: '每个种子的最大连接数',
  max_uploads: '全局最大上传槽位数',
  max_uploads_per_torrent: '每个种子的最大上传槽位数',
  proxy_ip: '代理主机',
  proxy_port: '代理端口',
  proxy_auth_enabled: '代理需要身份验证',
  proxy_username: '代理用户名',
  proxy_password: '代理密码',
  proxy_hostname_lookup: '通过代理进行主机名解析',
  proxy_bittorrent: '对用户连接使用代理',
  proxy_peer_connections: '对用户连接使用代理（高级）',
  proxy_rss: '对 RSS 使用代理',
  proxy_misc: '对常规用途使用代理',
  ip_filter_enabled: '启用 IP 过滤',
  ip_filter_path: '过滤器文件路径（.dat、.p2p、.txt）',
  ip_filter_trackers: '对 Tracker 应用过滤',
  banned_IPs: '已封禁的 IP 地址（每行一个）',
  dl_limit: '全局下载限速',
  up_limit: '全局上传限速',
  alt_dl_limit: '备用下载限速',
  alt_up_limit: '备用上传限速',
  limit_utp_rate: '对 uTP 连接限速',
  limit_tcp_overhead: '对传输开销限速',
  limit_lan_peers: '对局域网用户限速',
  scheduler_enabled: '按计划限速',
  schedule_to_hour: '结束时（小时）',
  schedule_to_min: '结束时（分钟）',
  dht: '启用 DHT',
  pex: '启用 PeX',
  lsd: '启用本地用户发现',
  anonymous_mode: '匿名模式',
  max_active_checking_torrents: '最大同时校验种子数',
  queueing_enabled: '启用队列',
  max_active_downloads: '最大同时下载数',
  max_active_uploads: '最大同时上传数',
  max_active_torrents: '最大同时活动种子数',
  dont_count_slow_torrents: '慢速种子不占用上述名额',
  max_ratio_enabled: '限制分享率',
  max_ratio: '最大分享率',
  max_seeding_time_enabled: '限制做种时间',
  max_inactive_seeding_time_enabled: '限制非活动时的做种时间',
  add_trackers_enabled: '为所有种子添加以下 Tracker',
  add_trackers: '附加 Tracker（每行一个）',
  add_trackers_from_url_enabled: '从 URL 获取附加 Tracker',
  add_trackers_url: 'Tracker 列表 URL',
  announce_to_all_trackers: '向同一层级的所有 Tracker 汇报',
  announce_to_all_tiers: '向所有层级汇报',
  announce_ip: '向 Tracker 报告的 IP 地址',
  announce_port: '向 Tracker 报告的端口',
  max_concurrent_http_announces: '最大并发 HTTP 汇报数',
  stop_tracker_timeout: 'Tracker 停止超时',
  peer_turnover: '用户更替百分比',
  peer_turnover_cutoff: '用户更替截止值',
  peer_turnover_interval: '用户更替间隔',
  enable_piece_extent_affinity: '分块范围亲和性',
  enable_multi_connections_from_same_ip: '允许来自同一 IP 的多个连接',
  block_peers_on_privileged_ports: '禁止连接到特权端口上的用户',
  validate_https_tracker_certificate: '验证 HTTPS Tracker 证书',
  dht_bootstrap_nodes: 'DHT 引导节点（每行一个）',
  rss_refresh_interval: 'RSS 刷新间隔',
  rss_max_articles_per_feed: '每个订阅源的最大文章数',
  rss_processing_enabled: '启用 RSS 处理',
  rss_auto_downloading_enabled: '启用 RSS 自动下载',
  save_resume_data_interval: '保存断点续传数据间隔',
  save_statistics_interval: '保存统计信息间隔',
  torrent_file_size_limit: '.torrent 文件大小上限',
  recheck_completed_torrents: '重新校验已完成的种子',
  resolve_peer_countries: '解析用户所在国家/地区',
  reannounce_when_address_changed: 'IP 或端口变化时向所有 Tracker 汇报',
  mark_of_the_web: '为下载的文件添加 Mark-of-the-Web 标记',
  ignore_ssl_errors: '忽略 SSL 错误',
  idn_support_enabled: '支持国际化域名',
  ssrf_mitigation: '启用 SSRF 防护',
  enable_embedded_tracker: '启用内置 Tracker',
  autorun_enabled: '下载完成时运行外部程序',
  autorun_program: '下载完成后执行的程序',
  autorun_on_torrent_added_enabled: '添加种子时运行外部程序',
  mail_notification_enabled: '启用邮件通知',

  // --- WebUI security / DynDNS ---
  alternative_webui_enabled: '使用替代 WebUI（关闭即恢复官方界面）',
  alternative_webui_path: '替代 WebUI 根目录（包含 public/ 与 private/）',
  web_ui_upnp: '为 WebUI 端口使用 UPnP / NAT-PMP',
  bypass_local_auth: '对本地主机上的客户端跳过身份验证',
  bypass_auth_subnet_whitelist_enabled: '对 IP 子网白名单中的客户端跳过身份验证',
  bypass_auth_subnet_whitelist: '白名单子网（每行一个）',
  web_ui_max_auth_fail_count: '连续失败后禁止客户端',
  web_ui_ban_duration: '封禁时长',
  web_ui_session_timeout: '会话超时',
  web_ui_clickjacking_protection_enabled: '启用点击劫持保护',
  web_ui_csrf_protection_enabled: '启用跨站请求伪造（CSRF）保护',
  web_ui_secure_cookie_enabled: '启用 cookie 安全标志（需 HTTPS 或本地连接）',
  web_ui_domain_list: '服务器域名（分号分隔，支持 *）',
  web_ui_use_custom_http_headers_enabled: '添加自定义 HTTP headers',
  web_ui_custom_http_headers: '自定义 headers（每行一个，"Header: value"）',
  dyndns_enabled: '更新我的动态域名',
  dyndns_service: '动态域名服务',
  dyndns_username: '动态域名用户名',
  dyndns_password: '动态域名密码',
  dyndns_domain: '动态域名',
}

/**
 * Rewrite one locale's `field: { ... }` object.
 *
 * Works on a (start, end) range supplied by the caller, and returns the new
 * whole-file text so the caller can recompute ranges for the next section.
 */
function syncSection(text, name, nextName) {
  // All sections after the first are Chinese.
  const isZh = name !== 'settingsEn'
  const startMarker = `export const ${name} = {`
  const start = text.indexOf(startMarker)
  if (start < 0) throw new Error(`Could not find ${startMarker}`)

  // The section runs to the next export, or EOF.
  const nextStart = nextName ? text.indexOf(`export const ${nextName} = {`) : -1
  const end = nextStart > 0 ? nextStart : text.length
  const section = text.slice(start, end)

  // Locate the `field: {` sub-object within this section.
  const fRel = section.indexOf('field: {')
  if (fRel < 0) throw new Error(`No "field: {" inside ${name}`)
  const fStart = start + fRel

  // Find its matching close by brace counting, NOT by searching for the first
  // "\n  }," — nested objects (like a `hint` block) also close at that indent,
  // and picking the wrong one truncates the block so every label looks absent.
  const braceStart = section.indexOf('{', fRel)
  let depth = 0
  let braceEnd = -1
  for (let i = braceStart; i < section.length; i += 1) {
    const ch = section[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        braceEnd = i
        break
      }
    }
  }
  if (braceEnd < 0) throw new Error(`Unbalanced braces for the field object in ${name}`)
  const fEnd = start + braceEnd + 1

  const block = text.slice(fStart, fEnd)
  const lines = block.split('\n')

  // Only lines at the field-object's own indent level (4 spaces) are field
  // labels. `opt`/`group`/`unit` entries sit at the same indent in their OWN
  // objects, so scoping to the block slice is what keeps them out — matching
  // on indentation alone would sweep them in if the slice were wrong.
  const present = []
  for (const line of lines) {
    const m = /^ {4}(\w+):/.exec(line)
    if (m) present.push(m[1])
  }
  const presentSet = new Set(present)

  const missing = fieldKeys.filter((k) => !presentSet.has(k))
  const stale = new Set(
    present.filter((k) => !fieldKeys.includes(k) && k !== 'field'),
  )

  if (missing.length === 0 && stale.size === 0) {
    return { text, added: 0, removed: 0 }
  }

  // Drop stale label lines.
  let kept = lines.filter((line) => {
    const m = /^ {4}(\w+):/.exec(line)
    return !(m && stale.has(m[1]))
  })

  // Append missing labels just before the object's closing brace.
  const prettify = (key) => {
    const human = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    return human.charAt(0).toUpperCase() + human.slice(1)
  }
  const labelFor = (key) => {
    if (isZh) return ZH_LABELS[key] ?? prettify(key)
    return prettify(key)
  }
  const inserted = missing.map((key) => `    ${key}: '${labelFor(key)}',`)

  // Track which zh entries had no translation, so the caller can report it.
  if (isZh) {
    for (const key of missing) {
      if (!ZH_LABELS[key]) untranslated.push(key)
    }
  }

  // Find the last non-empty line (the "  }" that closes the object).
  let closeAt = kept.length - 1
  while (closeAt > 0 && kept[closeAt].trim() === '') closeAt -= 1
  kept = [...kept.slice(0, closeAt), ...inserted, ...kept.slice(closeAt)]

  return {
    text: text.slice(0, fStart) + kept.join('\n') + text.slice(fEnd),
    added: missing.length,
    removed: stale.size,
  }
}

let text = fs.readFileSync(FILE, 'utf8')

/** zh field keys that had to fall back to an English label. */
const untranslated = []

// Process from the LAST section backwards, so editing a later section cannot
// invalidate the offsets of an earlier one.
const r1 = syncSection(text, 'settingsZhCN', null)
text = r1.text
const r2 = syncSection(text, 'settingsEn', 'settingsZhCN')
text = r2.text

fs.writeFileSync(FILE, text)

console.log(`  settingsEn  : +${r2.added} added, -${r2.removed} removed`)
console.log(`  settingsZhCN: +${r1.added} added, -${r1.removed} removed`)

if (untranslated.length > 0) {
  console.log('')
  console.log(`  ${untranslated.length} zh label(s) fell back to English: ${untranslated.join(', ')}`)
  console.log('  Add them to ZH_LABELS in this script, or translate them directly.')
}