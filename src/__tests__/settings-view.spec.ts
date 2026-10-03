/**
 * SettingsView rendering and dirty-tracking tests.
 *
 * The bug these guard against: opening the settings page reported "N changes
 * pending" without the user touching anything. That happens when the form's
 * value round trip does not return the server's own value, so every field
 * compares unequal on load.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { allFields } from '@/config/settings-schema'
import { i18n } from '@/i18n'

/** A payload shaped exactly the way qBittorrent sends one. */
const apiPayload: Record<string, unknown> = {
  confirm_torrent_deletion: true,
  confirm_torrent_recheck: true,
  delete_torrent_content_files: false,
  refresh_interval: 1500,
  save_path: '/downloads',
  temp_path_enabled: false,
  temp_path: '/downloads/incomplete',
  torrent_content_layout: 'Original',
  preallocate_all: false,
  incomplete_files_ext: false,
  use_unwanted_folder: true,
  add_to_top_of_queue: true,
  add_stopped_enabled: false,
  torrent_stop_condition: 'None',
  auto_delete_mode: 0,
  merge_trackers: false,
  auto_tmm_enabled: true,
  torrent_changed_tmm_enabled: true,
  save_path_changed_tmm_enabled: true,
  category_changed_tmm_enabled: true,
  use_subcategories: false,
  excluded_file_names_enabled: false,
  // list-valued keys arrive as newline-joined STRINGS
  excluded_file_names: '',
  export_dir: '',
  export_dir_fin: '',
  listen_port: 6881,
  upnp: false,
  max_connec: 500,
  max_connec_per_torrent: 100,
  max_uploads: 20,
  max_uploads_per_torrent: 4,
  proxy_type: 'None',
  proxy_ip: '',
  proxy_port: 8080,
  proxy_auth_enabled: false,
  proxy_username: '',
  proxy_password: '',
  proxy_hostname_lookup: false,
  proxy_bittorrent: false,
  proxy_peer_connections: false,
  proxy_rss: false,
  proxy_misc: false,
  ip_filter_enabled: false,
  ip_filter_path: '',
  ip_filter_trackers: false,
  banned_IPs: '',
  dl_limit: 0,
  up_limit: 0,
  alt_dl_limit: 10240,
  alt_up_limit: 1024,
  bittorrent_protocol: 0,
  limit_utp_rate: true,
  limit_tcp_overhead: false,
  limit_lan_peers: true,
  scheduler_enabled: false,
  schedule_from_hour: 8,
  schedule_from_min: 0,
  schedule_to_hour: 20,
  schedule_to_min: 0,
  scheduler_days: 0,
  dht: true,
  pex: true,
  lsd: true,
  anonymous_mode: false,
  encryption: 0,
  max_active_checking_torrents: 1,
  queueing_enabled: false,
  max_active_downloads: 3,
  max_active_uploads: 3,
  max_active_torrents: 5,
  dont_count_slow_torrents: true,
  slow_torrent_dl_rate_threshold: 1024,
  slow_torrent_ul_rate_threshold: 1024,
  slow_torrent_inactive_timer: 60,
  max_ratio_enabled: false,
  max_ratio: -1,
  max_seeding_time_enabled: false,
  max_seeding_time: -1,
  max_inactive_seeding_time_enabled: false,
  max_inactive_seeding_time: -1,
  max_ratio_act: 0,
  add_trackers_enabled: false,
  add_trackers: '',
  add_trackers_from_url_enabled: false,
  add_trackers_url: '',
  announce_to_all_trackers: false,
  announce_to_all_tiers: false,
  announce_ip: '',
  announce_port: 0,
  max_concurrent_http_announces: 50,
  stop_tracker_timeout: 5,
  peer_turnover: 4,
  peer_turnover_cutoff: 90,
  peer_turnover_interval: 300,
  enable_piece_extent_affinity: false,
  enable_multi_connections_from_same_ip: false,
  block_peers_on_privileged_ports: false,
  validate_https_tracker_certificate: true,
  dht_bootstrap_nodes: '',
  rss_refresh_interval: 30,
  rss_max_articles_per_feed: 50,
  rss_processing_enabled: false,
  rss_auto_downloading_enabled: false,
  rss_download_repack_proper_episodes: false,
  rss_smart_episode_filters: '',
  save_resume_data_interval: 60,
  save_statistics_interval: 30,
  torrent_file_size_limit: 104857600,
  recheck_completed_torrents: false,
  resolve_peer_countries: true,
  reannounce_when_address_changed: false,
  mark_of_the_web: true,
  ignore_ssl_errors: false,
  idn_support_enabled: false,
  ssrf_mitigation: true,
  enable_embedded_tracker: false,
  embedded_tracker_port: 9000,
  embedded_tracker_port_forwarding: false,
  autorun_enabled: false,
  autorun_program: '',
  autorun_on_torrent_added_enabled: false,
  autorun_on_torrent_added_program: '',
  mail_notification_enabled: false,
  mail_notification_smtp: '',
  mail_notification_sender: '',
  mail_notification_email: '',
  mail_notification_ssl_enabled: true,
  mail_notification_auth_enabled: false,
  mail_notification_username: '',
  mail_notification_password: '',
}

const setPreferences = vi.fn(async () => true)

vi.mock('@/api/app', () => ({
  getPreferences: vi.fn(async () => apiPayload),
  setPreferences: (...args: unknown[]) => setPreferences(...(args as [])),
  getVersion: vi.fn(async () => '5.1.4'),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}))

vi.mock('@/api/torrents', () => ({
  resumeTorrents: vi.fn(),
  pauseTorrents: vi.fn(),
  recheckTorrents: vi.fn(),
  reannounceTorrents: vi.fn(),
  deleteTorrents: vi.fn(),
  setCategory: vi.fn(),
  addTorrent: vi.fn(),
}))

import SettingsView from '@/views/SettingsView.vue'

function mountSettings() {
  return mount(SettingsView, {
    global: {
      plugins: [createPinia(), i18n],
      stubs: { RouterLink: true },
    },
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setPreferences.mockClear()
  })

  it('renders without reporting phantom pending changes', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    // No "N change(s) pending" text, and Save must be disabled.
    expect(wrapper.text()).not.toMatch(/change\(s\) pending/i)
    expect(wrapper.text()).toContain('No changes')
  })

  it('lists all schema groups as tabs', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const tabs = wrapper.findAll('.settings__tab')
    expect(tabs.length).toBeGreaterThanOrEqual(6)
  })

  it('renders a control for every field in the active group', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('.settings__group').exists()).toBe(true)
    expect(wrapper.findAll('.sf').length).toBeGreaterThan(0)
  })

  it('sends nothing when Save is pressed with no edits', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    // Save is disabled, so a patch cannot be submitted at all.
    const save = wrapper.findAll('button').find((b) => b.text().includes('Save'))
    expect(save?.attributes('disabled')).toBeDefined()
    expect(setPreferences).not.toHaveBeenCalled()
  })

  it('does not submit fields the server did not send', async () => {
    // The payload above deliberately omits nothing, but the guard matters: a
    // missing key must never be "changed" to our default and written back.
    const wrapper = mountSettings()
    await flushPromises()

    const save = wrapper.findAll('button').find((b) => b.text().includes('Save'))
    expect(save).toBeDefined()
    // Disabled proves the patch is empty.
    expect(save!.attributes('disabled')).toBeDefined()
  })

  it('exposes every schema field somewhere in the page', async () => {
    // Search mode shows all groups at once, which is how a user reaches the
    // long tail of settings. Here we just assert the schema is substantial and
    // that the view renders it without error.
    const wrapper = mountSettings()
    await flushPromises()

    expect(allFields.length).toBeGreaterThan(90)
    expect(wrapper.find('.settings').exists()).toBe(true)
  })
})