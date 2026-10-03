/**
 * Settings schema.
 *
 * Describes every preference this WebUI exposes, grouped the way the stock
 * qBittorrent WebUI groups them, and closely following VueTorrent's scope.
 *
 * Design goals, in priority order
 * -------------------------------
 * 1. **Every control must actually do something observable.** A setting that
 *    saves but changes nothing the user can see is worse than no setting, so
 *    keys that only affect the desktop Qt GUI are deliberately excluded:
 *    `performance_warning`, `status_bar_external_ip`, and the `file_log_*`
 *    family control desktop-only chrome.
 * 2. **Keys that can disconnect the session making the change are excluded.**
 *    `web_ui_port`, `use_https`, `web_ui_address`, `current_network_interface`
 *    and friends would lock a user out of the very page they are editing, with
 *    recovery requiring shell access to the container. Those stay in the
 *    desktop client.
 * 3. **Enums are modelled as real option lists**, not free-text boxes, so the
 *    only possible values are the ones the server accepts.
 * 4. **Adding a preference is a one-line change.**
 *
 * What remains is the set of preferences that genuinely affect how the daemon
 * downloads, connects, queues and seeds — the things a WebUI user can act on.
 *
 * See `scripts/audit-settings-writability.mjs` for the mechanical check against
 * appcontroller.cpp.
 */

export type FieldKind =
  | 'boolean'
  | 'integer'
  | 'float'
  | 'string'
  | 'path'
  | 'select'
  | 'multiline'

/** How the raw API value relates to the value shown in the UI. */
export type Unit = 'none' | 'bytesPerSec' | 'bytes' | 'minutes' | 'seconds'

export interface SelectOption {
  value: number | string
  /** i18n key; resolved by the settings renderer. */
  labelKey: string
}

export interface SettingField {
  /** The exact key used by `app/setPreferences`. */
  key: string
  kind: FieldKind
  unit?: Unit
  options?: SelectOption[]
  min?: number
  max?: number
  step?: number
  /** Requires another boolean field to be true to be editable. */
  enabledBy?: string
  /** Shown as a hint under the control. */
  hintKey?: string
}

export interface SettingGroup {
  id: string
  /** i18n key for the group heading. */
  labelKey: string
  /**
   * Optional sub-sections.
   *
   * A group like BitTorrent holds 39 settings. Rendered as one flat list they
   * are impossible to scan — the user cannot tell which label belongs to which
   * control. Sections restore that structure: "Privacy", "Queueing", "Share
   * limits" and so on, each with its own heading and separation.
   *
   * `fields` stays the flat, authoritative list used for loading and diffing,
   * so nothing outside the settings view needs to know sections exist.
   */
  sections?: SettingSection[]
  fields: SettingField[]
}

/** A titled cluster of related settings within a group. */
export interface SettingSection {
  id: string
  /** i18n key for the section heading. */
  labelKey: string
  /** Optional one-line explanation shown under the heading. */
  hintKey?: string
  fields: SettingField[]
}

/**
 * Byte-unit fields store RAW bytes and are scaled only for DISPLAY.
 *
 * Converting here was a real data-loss bug: the server stores bytes per second,
 * so the slow-torrent threshold default of 10 became Math.round(10 / 1024) = 0.
 * The field then read as changed on load and saving wrote 0 back, destroying the
 * setting. 19981 of the first 20001 values were not reversible.
 */

export const groups: SettingGroup[] = [
  // ==========================================================================
  // Behaviour
  // ==========================================================================
  {
    id: 'behaviour',
    labelKey: 'settings.group.behaviour',
    fields: [
      { key: 'confirm_torrent_deletion', kind: 'boolean' },
      { key: 'confirm_torrent_recheck', kind: 'boolean' },
      { key: 'delete_torrent_content_files', kind: 'boolean' },
      { key: 'refresh_interval', kind: 'integer', unit: 'seconds', min: 500, max: 60000, step: 500 },
    ],
  },

  // ==========================================================================
  // Downloads
  // ==========================================================================
  {
    id: 'downloads',
    labelKey: 'settings.group.downloads',
    fields: [
      { key: 'save_path', kind: 'path' },
      { key: 'temp_path_enabled', kind: 'boolean' },
      { key: 'temp_path', kind: 'path', enabledBy: 'temp_path_enabled' },
      {
        key: 'torrent_content_layout',
        kind: 'select',
        options: [
          { value: 'Original', labelKey: 'settings.opt.layoutOriginal' },
          { value: 'Subfolder', labelKey: 'settings.opt.layoutSubfolder' },
          { value: 'NoSubfolder', labelKey: 'settings.opt.layoutNoSubfolder' },
        ],
      },
      { key: 'preallocate_all', kind: 'boolean' },
      { key: 'incomplete_files_ext', kind: 'boolean' },
      { key: 'use_unwanted_folder', kind: 'boolean' },
      { key: 'add_to_top_of_queue', kind: 'boolean' },
      { key: 'add_stopped_enabled', kind: 'boolean' },
      {
        key: 'torrent_stop_condition',
        kind: 'select',
        options: [
          { value: 'None', labelKey: 'settings.opt.stopNone' },
          { value: 'MetadataReceived', labelKey: 'settings.opt.stopMetadata' },
          { value: 'FilesChecked', labelKey: 'settings.opt.stopFilesChecked' },
        ],
      },
      {
        key: 'auto_delete_mode',
        kind: 'select',
        options: [
          { value: 0, labelKey: 'settings.opt.autoDeleteNever' },
          { value: 1, labelKey: 'settings.opt.autoDeleteIfAdded' },
          { value: 2, labelKey: 'settings.opt.autoDeleteAlways' },
        ],
      },
      { key: 'merge_trackers', kind: 'boolean' },

      // --- Automatic torrent management ---
      { key: 'auto_tmm_enabled', kind: 'boolean' },
      { key: 'torrent_changed_tmm_enabled', kind: 'boolean', enabledBy: 'auto_tmm_enabled' },
      { key: 'save_path_changed_tmm_enabled', kind: 'boolean', enabledBy: 'auto_tmm_enabled' },
      { key: 'category_changed_tmm_enabled', kind: 'boolean', enabledBy: 'auto_tmm_enabled' },
      { key: 'use_subcategories', kind: 'boolean' },

      // --- Exclusions ---
      { key: 'excluded_file_names_enabled', kind: 'boolean' },
      {
        key: 'excluded_file_names',
        kind: 'multiline',
        enabledBy: 'excluded_file_names_enabled',
      },

      // --- Export ---
      { key: 'export_dir', kind: 'path' },
      { key: 'export_dir_fin', kind: 'path' },
    ],
  },

  // ==========================================================================
  // Connection
  // ==========================================================================
  {
    id: 'connection',
    labelKey: 'settings.group.connection',
    fields: [
      { key: 'listen_port', kind: 'integer', min: 1, max: 65535 },
      { key: 'upnp', kind: 'boolean' },
      { key: 'max_connec', kind: 'integer', min: 1, max: 10000 },
      { key: 'max_connec_per_torrent', kind: 'integer', min: 1, max: 10000 },
      { key: 'max_uploads', kind: 'integer', min: 1, max: 10000 },
      { key: 'max_uploads_per_torrent', kind: 'integer', min: 1, max: 10000 },

      // --- Proxy ---
      {
        key: 'proxy_type',
        kind: 'select',
        options: [
          { value: 'None', labelKey: 'settings.opt.proxyNone' },
          { value: 'HTTP', labelKey: 'settings.opt.proxyHttp' },
          { value: 'SOCKS4', labelKey: 'settings.opt.proxySocks4' },
          { value: 'SOCKS5', labelKey: 'settings.opt.proxySocks5' },
        ],
      },
      { key: 'proxy_ip', kind: 'string' },
      { key: 'proxy_port', kind: 'integer', min: 0, max: 65535 },
      { key: 'proxy_auth_enabled', kind: 'boolean' },
      { key: 'proxy_username', kind: 'string', enabledBy: 'proxy_auth_enabled' },
      { key: 'proxy_password', kind: 'string', enabledBy: 'proxy_auth_enabled' },
      { key: 'proxy_hostname_lookup', kind: 'boolean' },
      { key: 'proxy_bittorrent', kind: 'boolean' },
      { key: 'proxy_peer_connections', kind: 'boolean' },
      { key: 'proxy_rss', kind: 'boolean' },
      { key: 'proxy_misc', kind: 'boolean' },

      // --- IP filtering ---
      { key: 'ip_filter_enabled', kind: 'boolean' },
      { key: 'ip_filter_path', kind: 'path', enabledBy: 'ip_filter_enabled' },
      { key: 'ip_filter_trackers', kind: 'boolean', enabledBy: 'ip_filter_enabled' },
      { key: 'banned_IPs', kind: 'multiline' },
    ],
  },

  // ==========================================================================
  // Speed
  // ==========================================================================
  {
    id: 'speed',
    labelKey: 'settings.group.speed',
    fields: [
      { key: 'dl_limit', kind: 'integer', unit: 'bytesPerSec', min: 0 },
      { key: 'up_limit', kind: 'integer', unit: 'bytesPerSec', min: 0 },
      { key: 'alt_dl_limit', kind: 'integer', unit: 'bytesPerSec', min: 0 },
      { key: 'alt_up_limit', kind: 'integer', unit: 'bytesPerSec', min: 0 },
      {
        key: 'bittorrent_protocol',
        kind: 'select',
        options: [
          { value: 0, labelKey: 'settings.opt.protoTcpUtp' },
          { value: 1, labelKey: 'settings.opt.protoTcp' },
          { value: 2, labelKey: 'settings.opt.protoUtp' },
        ],
      },
      { key: 'limit_utp_rate', kind: 'boolean' },
      { key: 'limit_tcp_overhead', kind: 'boolean' },
      { key: 'limit_lan_peers', kind: 'boolean' },

      // --- Bandwidth scheduler ---
      { key: 'scheduler_enabled', kind: 'boolean' },
      {
        key: 'schedule_from_hour',
        kind: 'integer',
        min: 0,
        max: 23,
        enabledBy: 'scheduler_enabled',
      },
      {
        key: 'schedule_from_min',
        kind: 'integer',
        min: 0,
        max: 59,
        enabledBy: 'scheduler_enabled',
      },
      { key: 'schedule_to_hour', kind: 'integer', min: 0, max: 23, enabledBy: 'scheduler_enabled' },
      { key: 'schedule_to_min', kind: 'integer', min: 0, max: 59, enabledBy: 'scheduler_enabled' },
      {
        key: 'scheduler_days',
        kind: 'select',
        enabledBy: 'scheduler_enabled',
        options: [
          { value: 0, labelKey: 'settings.opt.everyDay' },
          { value: 1, labelKey: 'settings.opt.weekdays' },
          { value: 2, labelKey: 'settings.opt.weekends' },
          { value: 3, labelKey: 'settings.opt.mon' },
          { value: 4, labelKey: 'settings.opt.tue' },
          { value: 5, labelKey: 'settings.opt.wed' },
          { value: 6, labelKey: 'settings.opt.thu' },
          { value: 7, labelKey: 'settings.opt.fri' },
          { value: 8, labelKey: 'settings.opt.sat' },
          { value: 9, labelKey: 'settings.opt.sun' },
        ],
      },
    ],
  },

  // ==========================================================================
  // BitTorrent
  // ==========================================================================
  {
    id: 'bittorrent',
    labelKey: 'settings.group.bittorrent',
    fields: [
      { key: 'dht', kind: 'boolean' },
      { key: 'pex', kind: 'boolean' },
      { key: 'lsd', kind: 'boolean' },
      { key: 'anonymous_mode', kind: 'boolean' },
      {
        key: 'encryption',
        kind: 'select',
        options: [
          { value: 0, labelKey: 'settings.opt.encryptionPrefer' },
          { value: 1, labelKey: 'settings.opt.encryptionRequire' },
          { value: 2, labelKey: 'settings.opt.encryptionDisable' },
        ],
      },
      { key: 'max_active_checking_torrents', kind: 'integer', min: 1 },

      // --- Queueing ---
      { key: 'queueing_enabled', kind: 'boolean' },
      { key: 'max_active_downloads', kind: 'integer', min: 0, enabledBy: 'queueing_enabled' },
      { key: 'max_active_uploads', kind: 'integer', min: 0, enabledBy: 'queueing_enabled' },
      { key: 'max_active_torrents', kind: 'integer', min: 0, enabledBy: 'queueing_enabled' },
      { key: 'dont_count_slow_torrents', kind: 'boolean', enabledBy: 'queueing_enabled' },
      {
        key: 'slow_torrent_dl_rate_threshold',
        kind: 'integer',
        unit: 'bytesPerSec',
        min: 0,
        enabledBy: 'dont_count_slow_torrents',
      },
      {
        key: 'slow_torrent_ul_rate_threshold',
        kind: 'integer',
        unit: 'bytesPerSec',
        min: 0,
        enabledBy: 'dont_count_slow_torrents',
      },
      {
        key: 'slow_torrent_inactive_timer',
        kind: 'integer',
        unit: 'seconds',
        min: 0,
        enabledBy: 'dont_count_slow_torrents',
      },

      // --- Share limits ---
      { key: 'max_ratio_enabled', kind: 'boolean' },
      { key: 'max_ratio', kind: 'float', step: 0.05, enabledBy: 'max_ratio_enabled' },
      { key: 'max_seeding_time_enabled', kind: 'boolean' },
      {
        key: 'max_seeding_time',
        kind: 'integer',
        unit: 'minutes',
        enabledBy: 'max_seeding_time_enabled',
      },
      { key: 'max_inactive_seeding_time_enabled', kind: 'boolean' },
      {
        key: 'max_inactive_seeding_time',
        kind: 'integer',
        unit: 'minutes',
        enabledBy: 'max_inactive_seeding_time_enabled',
      },
      {
        key: 'max_ratio_act',
        kind: 'select',
        options: [
          { value: 0, labelKey: 'settings.opt.ratioActionStop' },
          { value: 1, labelKey: 'settings.opt.ratioActionRemove' },
          { value: 2, labelKey: 'settings.opt.ratioActionSuperSeed' },
          { value: 3, labelKey: 'settings.opt.ratioActionRemoveWithContent' },
        ],
      },

      // --- Trackers ---
      { key: 'add_trackers_enabled', kind: 'boolean' },
      { key: 'add_trackers', kind: 'multiline', enabledBy: 'add_trackers_enabled' },
      { key: 'add_trackers_from_url_enabled', kind: 'boolean' },
      { key: 'add_trackers_url', kind: 'string', enabledBy: 'add_trackers_from_url_enabled' },

      // --- Announce behaviour ---
      { key: 'announce_to_all_trackers', kind: 'boolean' },
      { key: 'announce_to_all_tiers', kind: 'boolean' },
      { key: 'announce_ip', kind: 'string' },
      { key: 'announce_port', kind: 'integer', min: 0, max: 65535 },
      { key: 'max_concurrent_http_announces', kind: 'integer', min: 1 },
      { key: 'stop_tracker_timeout', kind: 'integer', unit: 'seconds', min: 1 },

      // --- Peer behaviour ---
      { key: 'peer_turnover', kind: 'integer', min: 0, max: 100 },
      { key: 'peer_turnover_cutoff', kind: 'integer', min: 0, max: 100 },
      { key: 'peer_turnover_interval', kind: 'integer', unit: 'seconds', min: 0 },
      { key: 'enable_piece_extent_affinity', kind: 'boolean' },
      { key: 'enable_multi_connections_from_same_ip', kind: 'boolean' },
      { key: 'block_peers_on_privileged_ports', kind: 'boolean' },
      { key: 'validate_https_tracker_certificate', kind: 'boolean' },
      { key: 'dht_bootstrap_nodes', kind: 'multiline' },
    ],
  },

  // ==========================================================================
  // WebUI
  // ==========================================================================
  {
    id: 'webui',
    labelKey: 'settings.group.webui',
    // Credentials are handled by CredentialsPanel rather than schema fields:
    // `web_ui_password` is write-only (the API returns only a PBKDF2 hash), so
    // it can never round-trip and would appear permanently dirty. The panel
    // also adds confirm-the-password and a lockout warning, which a plain field
    // cannot express.
    fields: [
      { key: 'web_ui_upnp', kind: 'boolean' },
      { key: 'bypass_local_auth', kind: 'boolean' },
      { key: 'bypass_auth_subnet_whitelist_enabled', kind: 'boolean' },
      {
        key: 'bypass_auth_subnet_whitelist',
        kind: 'multiline',
        enabledBy: 'bypass_auth_subnet_whitelist_enabled',
      },
      { key: 'web_ui_max_auth_fail_count', kind: 'integer', min: 0 },
      { key: 'web_ui_ban_duration', kind: 'integer', unit: 'seconds', min: 0 },
      { key: 'web_ui_session_timeout', kind: 'integer', unit: 'seconds', min: 0 },
      { key: 'web_ui_clickjacking_protection_enabled', kind: 'boolean' },
      { key: 'web_ui_csrf_protection_enabled', kind: 'boolean' },
      { key: 'web_ui_secure_cookie_enabled', kind: 'boolean' },
      { key: 'web_ui_domain_list', kind: 'string' },
      { key: 'web_ui_use_custom_http_headers_enabled', kind: 'boolean' },
      {
        key: 'web_ui_custom_http_headers',
        kind: 'multiline',
        enabledBy: 'web_ui_use_custom_http_headers_enabled',
      },

      // --- Alternative WebUI ---
      // The switch that turns THIS theme off. Without it a user who installs
      // macui has no way back to the stock WebUI except editing
      // qBittorrent.conf inside the container, which is exactly the trap this
      // setting exists to close.
      {
        key: 'alternative_webui_enabled',
        kind: 'boolean',
        hintKey: 'settings.hint.alternative_webui_enabled',
      },
      {
        key: 'alternative_webui_path',
        kind: 'path',
        enabledBy: 'alternative_webui_enabled',
        hintKey: 'settings.hint.alternative_webui_path',
      },

      // --- Dynamic DNS ---
      { key: 'dyndns_enabled', kind: 'boolean' },
      { key: 'dyndns_service', kind: 'integer', min: 0, enabledBy: 'dyndns_enabled' },
      { key: 'dyndns_username', kind: 'string', enabledBy: 'dyndns_enabled' },
      { key: 'dyndns_password', kind: 'string', enabledBy: 'dyndns_enabled' },
      { key: 'dyndns_domain', kind: 'string', enabledBy: 'dyndns_enabled' },
    ],
  },

  // ==========================================================================
  // RSS
  // ==========================================================================
  {
    id: 'rss',
    labelKey: 'settings.group.rss',
    fields: [
      { key: 'rss_refresh_interval', kind: 'integer', unit: 'minutes', min: 1 },
      { key: 'rss_max_articles_per_feed', kind: 'integer', min: 1 },
      { key: 'rss_processing_enabled', kind: 'boolean' },
      { key: 'rss_auto_downloading_enabled', kind: 'boolean' },
      {
        key: 'rss_download_repack_proper_episodes',
        kind: 'boolean',
        enabledBy: 'rss_auto_downloading_enabled',
      },
      {
        key: 'rss_smart_episode_filters',
        kind: 'multiline',
        enabledBy: 'rss_auto_downloading_enabled',
      },
    ],
  },

  // ==========================================================================
  // Advanced
  // ==========================================================================
  {
    id: 'advanced',
    labelKey: 'settings.group.advanced',
    fields: [
      { key: 'save_resume_data_interval', kind: 'integer', unit: 'minutes', min: 1 },
      { key: 'save_statistics_interval', kind: 'integer', unit: 'minutes', min: 1 },
      { key: 'torrent_file_size_limit', kind: 'integer', unit: 'bytes', min: 0 },
      { key: 'recheck_completed_torrents', kind: 'boolean' },
      { key: 'resolve_peer_countries', kind: 'boolean' },
      { key: 'reannounce_when_address_changed', kind: 'boolean' },
      { key: 'mark_of_the_web', kind: 'boolean' },
      { key: 'ignore_ssl_errors', kind: 'boolean' },
      { key: 'idn_support_enabled', kind: 'boolean' },
      { key: 'ssrf_mitigation', kind: 'boolean' },

      // --- Embedded tracker ---
      { key: 'enable_embedded_tracker', kind: 'boolean' },
      {
        key: 'embedded_tracker_port',
        kind: 'integer',
        min: 1,
        max: 65535,
        enabledBy: 'enable_embedded_tracker',
      },
      {
        key: 'embedded_tracker_port_forwarding',
        kind: 'boolean',
        enabledBy: 'enable_embedded_tracker',
      },

      // --- Automatic program execution ---
      { key: 'autorun_enabled', kind: 'boolean' },
      { key: 'autorun_program', kind: 'path', enabledBy: 'autorun_enabled' },
      { key: 'autorun_on_torrent_added_enabled', kind: 'boolean' },
      {
        key: 'autorun_on_torrent_added_program',
        kind: 'path',
        enabledBy: 'autorun_on_torrent_added_enabled',
      },

      // --- Email notification ---
      { key: 'mail_notification_enabled', kind: 'boolean' },
      {
        key: 'mail_notification_smtp',
        kind: 'string',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_sender',
        kind: 'string',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_email',
        kind: 'string',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_ssl_enabled',
        kind: 'boolean',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_auth_enabled',
        kind: 'boolean',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_username',
        kind: 'string',
        enabledBy: 'mail_notification_enabled',
      },
      {
        key: 'mail_notification_password',
        kind: 'string',
        enabledBy: 'mail_notification_enabled',
      },
    ],
  },
]

/** Every field, flattened — used for loading and diffing. */
export const allFields: SettingField[] = groups.flatMap((g) => g.fields)

/** Convert a raw API value into the value shown in the UI. */
export function fromApi(field: SettingField, raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    if (field.kind === 'boolean') return false
    if (field.kind === 'multiline') return ''
    if (field.kind === 'select') return field.options?.[0]?.value ?? ''
    // Numeric fields must be numbers, never '' — otherwise the control renders
    // blank and the value fails its own round trip.
    if (field.kind === 'integer' || field.kind === 'float') return 0
    return ''
  }

  switch (field.unit) {
    case 'bytesPerSec': {
      // Keep the RAW byte value; the unit only affects how it is displayed.
      //
      // Converting to KiB here was a real data-loss bug. The server stores bytes
      // per second, so a value like 10 (the default for the slow-torrent
      // thresholds) became Math.round(10 / 1024) = 0 — the field then read as
      // changed on load, and saving it wrote 0 back, silently destroying the
      // setting. Measured: 19981 of the first 20001 values were not reversible.
      const value = Number(raw)
      return Number.isFinite(value) ? value : 0
    }
    case 'bytes': {
      // Same reasoning as bytesPerSec: store bytes, scale only for display.
      // MiB granularity previously collapsed the 10240-byte default to 0.
      const value = Number(raw)
      return Number.isFinite(value) ? value : 0
    }
    default:
      break
  }

  if (field.kind === 'boolean') return Boolean(raw)
  if (field.kind === 'integer' || field.kind === 'float') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : 0
  }
  if (field.kind === 'select') {
    // Keep the option's REAL type. The <select> element works in strings, so
    // the control coerces for display, but the stored value must stay numeric
    // where the API expects a number — otherwise every load reports a pending
    // change that never goes away.
    const match = field.options?.find((o) => String(o.value) === String(raw))
    return match ? match.value : raw
  }
  if (field.kind === 'multiline') {
    // Tolerate either shape: the server sends these as newline-joined strings
    // (`.join('\n')` throughout appcontroller.cpp), but a future version could
    // send an array. Normalising here means neither shape produces a spurious
    // "pending change".
    if (Array.isArray(raw)) return raw.join('\n')
    return String(raw ?? '')
  }
  return String(raw ?? '')
}

/** Convert a UI value back into what the API expects. */
export function toApi(field: SettingField, value: unknown): unknown {
  // Unit fields store RAW values (see fromApi), so there is nothing to scale
  // here. Scaling on both sides is what made the conversion lossy and produced
  // the phantom "N changes pending".
  if (field.unit === 'bytesPerSec' || field.unit === 'bytes') {
    const n = Math.trunc(Number(value))
    return Number.isFinite(n) ? n : 0
  }

  if (field.kind === 'boolean') return Boolean(value)
  if (field.kind === 'select') {
    // Preserve the option's declared type, so a numeric option is submitted as
    // a number. The server compares types when deciding whether anything
    // changed, and would otherwise see "0" !== 0 forever.
    const match = field.options?.find((o) => String(o.value) === String(value))
    return match ? match.value : value
  }
  if (field.kind === 'integer') {
    const n = Math.trunc(Number(value))
    return Number.isFinite(n) ? n : 0
  }
  if (field.kind === 'float') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (field.kind === 'multiline') {
    const text = String(value ?? '').trim()
    // These keys arrive from the server as a NEWLINE-JOINED STRING (see
    // `join(u'\n')` in appcontroller.cpp), not as an array. Returning an array
    // here would make the field compare unequal on every load, so an untouched
    // form would always look dirty.
    return text
  }
  return String(value ?? '')
}

/** Total number of exposed preferences — surfaced in the UI footer. */
export const totalFields = allFields.length