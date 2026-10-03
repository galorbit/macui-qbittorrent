/**
 * Describes how each group's flat field list is divided into titled sections.
 *
 * WHY THIS IS A SEPARATE TABLE
 * ----------------------------
 * `groups[].fields` stays the single source of truth for loading, diffing and
 * saving — the whole app depends on that flat list, and duplicating it into
 * sections would risk the two drifting apart.
 *
 * Instead this maps group -> sections -> field KEYS. A resolver splits the
 * group's own `fields` array using these boundaries, so:
 *
 *   - a field cannot be silently dropped: anything not named in a section is
 *     collected into a trailing "Other" section, and a test asserts that every
 *     field lands in exactly one section
 *   - reordering `fields` without updating this table is caught by the same test
 *
 * The alternative — nesting the real field objects inside sections — would mean
 * two places to edit for every new setting, and a field added to `fields` but
 * not to a section would simply vanish from the UI.
 */

import type { SettingGroup, SettingSection } from './settings-schema'

/**
 * Split a group's flat `fields` into its sections.
 *
 * The group's own field array is the source of truth: sections only describe
 * how to group what is already there. Two consequences worth stating:
 *
 *   - a field the layout forgets is NOT lost. It is collected into a trailing
 *     "Other" section, so the worst case is ugly grouping rather than a setting
 *     that silently disappears from the UI.
 *   - a key in the layout that no longer exists is ignored, so removing a
 *     setting from the schema cannot break rendering.
 *
 * Order comes from `fields`, not from the layout, so the array order remains
 * authoritative and reordering it is enough to reorder the UI.
 */
export function sectionsForGroup(
  group: SettingGroup,
  layout: Record<string, Array<{ id: string; labelKey: string; hintKey?: string; keys: string[] }>>,
): SettingSection[] {
  const spec = layout[group.id]
  const byKey = new Map(group.fields.map((f) => [f.key, f]))
  const claimed = new Set<string>()
  const out: SettingSection[] = []

  if (spec) {
    for (const section of spec) {
      const fields = section.keys
        .map((k) => byKey.get(k))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)

      if (fields.length === 0) continue
      for (const f of fields) claimed.add(f.key)

      out.push({
        id: section.id,
        labelKey: section.labelKey,
        hintKey: section.hintKey,
        fields,
      })
    }
  }

  const leftovers = group.fields.filter((f) => !claimed.has(f.key))
  if (leftovers.length > 0) {
    out.push({ id: 'other', labelKey: 'settings.section.other', fields: leftovers })
  }

  return out
}
export const sectionLayout: Record<string, Array<{ id: string; labelKey: string; hintKey?: string; keys: string[] }>> = {
  behaviour: [
    {
      id: 'confirmations',
      labelKey: 'settings.section.confirmations',
      keys: ['confirm_torrent_deletion', 'confirm_torrent_recheck', 'delete_torrent_content_files'],
    },
    {
      id: 'interface',
      labelKey: 'settings.section.interface',
      keys: ['refresh_interval'],
    },
  ],

  downloads: [
    {
      id: 'paths',
      labelKey: 'settings.section.paths',
      keys: [
        'save_path',
        'temp_path_enabled',
        'temp_path',
        'export_dir',
        'export_dir_fin',
        'torrent_content_layout',
        'torrent_stop_condition',
        'auto_delete_mode',
      ],
    },
    {
      id: 'storage',
      labelKey: 'settings.section.storage',
      hintKey: 'settings.section.storageHint',
      keys: ['preallocate_all', 'incomplete_files_ext', 'use_unwanted_folder'],
    },
    {
      id: 'adding',
      labelKey: 'settings.section.adding',
      keys: ['add_to_top_of_queue', 'add_stopped_enabled', 'merge_trackers'],
    },
    {
      id: 'torrentManagement',
      labelKey: 'settings.section.torrentManagement',
      hintKey: 'settings.section.torrentManagementHint',
      keys: [
        'auto_tmm_enabled',
        'torrent_changed_tmm_enabled',
        'save_path_changed_tmm_enabled',
        'category_changed_tmm_enabled',
        'use_subcategories',
      ],
    },
    {
      id: 'exclusions',
      labelKey: 'settings.section.exclusions',
      keys: ['excluded_file_names_enabled', 'excluded_file_names'],
    },
  ],

  connection: [
    {
      id: 'listening',
      labelKey: 'settings.section.listening',
      hintKey: 'settings.section.listeningHint',
      keys: ['listen_port', 'upnp'],
    },
    {
      id: 'limits',
      labelKey: 'settings.section.connectionLimits',
      keys: [
        'max_connec',
        'max_connec_per_torrent',
        'max_uploads',
        'max_uploads_per_torrent',
      ],
    },
    {
      id: 'proxy',
      labelKey: 'settings.section.proxy',
      keys: [
        'proxy_type',
        'proxy_ip',
        'proxy_port',
        'proxy_auth_enabled',
        'proxy_username',
        'proxy_password',
      ],
    },
    {
      id: 'proxyUsage',
      labelKey: 'settings.section.proxyUsage',
      keys: [
        'proxy_hostname_lookup',
        'proxy_bittorrent',
        'proxy_peer_connections',
        'proxy_rss',
        'proxy_misc',
      ],
    },
    {
      id: 'ipFilter',
      labelKey: 'settings.section.ipFilter',
      keys: [
        'ip_filter_enabled',
        'ip_filter_path',
        'ip_filter_trackers',
        'banned_IPs',
      ],
    },
  ],

  speed: [
    {
      id: 'globalLimits',
      labelKey: 'settings.section.globalLimits',
      keys: ['dl_limit', 'up_limit'],
    },
    {
      id: 'altLimits',
      labelKey: 'settings.section.altLimits',
      hintKey: 'settings.section.altLimitsHint',
      keys: ['alt_dl_limit', 'alt_up_limit'],
    },
    {
      id: 'limitOptions',
      labelKey: 'settings.section.limitOptions',
      // bittorrent_protocol lives in this group in the schema, and it does
      // affect speed (uTP vs TCP), so it belongs here rather than in Advanced.
      keys: ['bittorrent_protocol', 'limit_utp_rate', 'limit_tcp_overhead', 'limit_lan_peers'],
    },
    {
      id: 'scheduler',
      labelKey: 'settings.section.scheduler',
      hintKey: 'settings.section.schedulerHint',
      keys: [
        'scheduler_enabled',
        'schedule_from_hour',
        'schedule_from_min',
        'schedule_to_hour',
        'schedule_to_min',
        'scheduler_days',
      ],
    },
  ],

  bittorrent: [
    {
      id: 'privacy',
      labelKey: 'settings.section.privacy',
      keys: ['dht', 'pex', 'lsd', 'anonymous_mode', 'encryption'],
    },
    {
      id: 'queueing',
      labelKey: 'settings.section.queueing',
      hintKey: 'settings.section.queueingHint',
      keys: [
        'queueing_enabled',
        'max_active_downloads',
        'max_active_uploads',
        'max_active_torrents',
        'max_active_checking_torrents',
      ],
    },
    {
      id: 'slowTorrents',
      labelKey: 'settings.section.slowTorrents',
      hintKey: 'settings.section.slowTorrentsHint',
      keys: [
        'dont_count_slow_torrents',
        'slow_torrent_dl_rate_threshold',
        'slow_torrent_ul_rate_threshold',
        'slow_torrent_inactive_timer',
      ],
    },
    {
      id: 'shareLimits',
      labelKey: 'settings.section.shareLimits',
      keys: [
        'max_ratio_enabled',
        'max_ratio',
        'max_seeding_time_enabled',
        'max_seeding_time',
        'max_inactive_seeding_time_enabled',
        'max_inactive_seeding_time',
        'max_ratio_act',
      ],
    },
    {
      id: 'trackers',
      labelKey: 'settings.section.trackers',
      keys: [
        'add_trackers_enabled',
        'add_trackers',
        'add_trackers_from_url_enabled',
        'add_trackers_url',
      ],
    },
    {
      id: 'announcing',
      labelKey: 'settings.section.announcing',
      hintKey: 'settings.section.announcingHint',
      keys: [
        'announce_to_all_trackers',
        'announce_to_all_tiers',
        'announce_ip',
        'announce_port',
        'max_concurrent_http_announces',
        'stop_tracker_timeout',
      ],
    },
    {
      id: 'peers',
      labelKey: 'settings.section.peers',
      keys: ['peer_turnover', 'peer_turnover_cutoff', 'peer_turnover_interval'],
    },
    {
      id: 'advancedBt',
      labelKey: 'settings.section.advancedBt',
      keys: [
        'enable_piece_extent_affinity',
        'enable_multi_connections_from_same_ip',
        'block_peers_on_privileged_ports',
        'validate_https_tracker_certificate',
        'dht_bootstrap_nodes',
      ],
    },
  ],

  webui: [
    {
      id: 'alternativeUi',
      labelKey: 'settings.section.alternativeUi',
      hintKey: 'settings.section.alternativeUiHint',
      keys: ['alternative_webui_enabled', 'alternative_webui_path'],
    },
    {
      id: 'access',
      labelKey: 'settings.section.access',
      hintKey: 'settings.section.accessHint',
      keys: [
        'web_ui_upnp',
        'bypass_local_auth',
        'bypass_auth_subnet_whitelist_enabled',
        'bypass_auth_subnet_whitelist',
      ],
    },
    {
      id: 'bruteForce',
      labelKey: 'settings.section.bruteForce',
      keys: ['web_ui_max_auth_fail_count', 'web_ui_ban_duration', 'web_ui_session_timeout'],
    },
    {
      id: 'hardening',
      labelKey: 'settings.section.hardening',
      keys: [
        'web_ui_clickjacking_protection_enabled',
        'web_ui_csrf_protection_enabled',
        'web_ui_secure_cookie_enabled',
        'web_ui_domain_list',
        'web_ui_use_custom_http_headers_enabled',
        'web_ui_custom_http_headers',
      ],
    },
    {
      id: 'dyndns',
      labelKey: 'settings.section.dyndns',
      keys: [
        'dyndns_enabled',
        'dyndns_service',
        'dyndns_username',
        'dyndns_password',
        'dyndns_domain',
      ],
    },
  ],

  rss: [
    {
      id: 'rssReader',
      labelKey: 'settings.section.rssReader',
      keys: ['rss_refresh_interval', 'rss_max_articles_per_feed'],
    },
    {
      id: 'rssAuto',
      labelKey: 'settings.section.rssAuto',
      keys: [
        'rss_processing_enabled',
        'rss_auto_downloading_enabled',
        'rss_download_repack_proper_episodes',
        'rss_smart_episode_filters',
      ],
    },
  ],

  advanced: [
    {
      id: 'diskAndCache',
      labelKey: 'settings.section.diskAndCache',
      keys: ['save_resume_data_interval', 'save_statistics_interval', 'torrent_file_size_limit'],
    },
    {
      id: 'behaviourAdvanced',
      labelKey: 'settings.section.behaviourAdvanced',
      keys: [
        'recheck_completed_torrents',
        'resolve_peer_countries',
        'reannounce_when_address_changed',
        'mark_of_the_web',
        'ignore_ssl_errors',
        'idn_support_enabled',
        'ssrf_mitigation',
        'enable_embedded_tracker',
        'embedded_tracker_port',
        'embedded_tracker_port_forwarding',
      ],
    },
    {
      id: 'autorun',
      labelKey: 'settings.section.autorun',
      keys: ['autorun_enabled', 'autorun_program', 'autorun_on_torrent_added_enabled', 'autorun_on_torrent_added_program'],
    },
    {
      id: 'mailNotification',
      labelKey: 'settings.section.mailNotification',
      keys: [
        'mail_notification_enabled',
        'mail_notification_smtp',
        'mail_notification_sender',
        'mail_notification_email',
        'mail_notification_ssl_enabled',
        'mail_notification_auth_enabled',
        'mail_notification_username',
        'mail_notification_password',
      ],
    },
  ],
}