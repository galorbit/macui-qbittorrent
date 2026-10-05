<script setup lang="ts">
/**
 * TorrentDetailView — per-torrent information.
 *
 * The live torrent object (progress, speeds) comes from the session store's
 * incrementally synced map, so it keeps updating without extra polling.
 * Slower-moving data (properties, trackers, files) is fetched once per tab and
 * on demand.
 *
 * On mobile the tab strip scrolls horizontally and the layout is single-column.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { useToast, describeError } from '@/composables/useToast'
import * as api from '@/api/torrents'
import { getTorrentPeers } from '@/api/sync'
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  formatTimestamp,
  isStopped,
  stateTone,
} from '@/utils/format'
import type { TorrentFile, TorrentProperties, TorrentTracker } from '@/types/api'
import MacCard from '@/components/base/MacCard.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacProgress from '@/components/base/MacProgress.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import MacEmptyState from '@/components/base/MacEmptyState.vue'
import TorrentStateBadge from '@/components/torrent/TorrentStateBadge.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const session = useSessionStore()

const hash = computed(() => String(route.params.hash ?? ''))
const torrent = computed(() => session.torrents.get(hash.value))

type TabKey = 'overview' | 'files' | 'peers' | 'trackers'
const tab = ref<TabKey>('overview')

const properties = ref<TorrentProperties | null>(null)
const trackers = ref<TorrentTracker[]>([])
const files = ref<TorrentFile[]>([])
const peers = ref<Record<string, Record<string, unknown>>>({})
const loadingTab = ref(false)

/**
 * Which torrent+tab a response belongs to.
 *
 * Navigating between torrents reuses this component (the nested RouterView has
 * no key), so a request for the previous torrent can still be in flight when
 * the watcher below clears the refs and starts the new one. Without this guard
 * the late response lands afterwards and the new torrent's Files tab displays
 * the OLD torrent's file list — wrong data presented as if it were correct.
 */
let loadToken = 0

// Detail payloads are not part of maindata, so fetch them per tab.
async function loadTab(key: TabKey): Promise<void> {
  const h = hash.value
  if (!h) return

  const token = ++loadToken
  loadingTab.value = true
  try {
    if (key === 'overview' && !properties.value) {
      const result = await api.getTorrentProperties(h)
      if (token !== loadToken) return
      properties.value = result
    } else if (key === 'trackers') {
      const result = await api.getTorrentTrackers(h)
      if (token !== loadToken) return
      trackers.value = result
    } else if (key === 'files') {
      const result = await api.getTorrentFiles(h)
      if (token !== loadToken) return
      files.value = result
    } else if (key === 'peers') {
      const data = await getTorrentPeers(h)
      if (token !== loadToken) return
      peers.value = data.peers ?? {}
    }
  } catch (err) {
    if (token !== loadToken) return
    toast.error(describeError(err))
  } finally {
    // Only the newest request may clear the spinner; an older one finishing
    // later must not hide it while the current fetch is still running.
    if (token === loadToken) loadingTab.value = false
  }
}

onMounted(() => void loadTab(tab.value))
watch(tab, (next) => void loadTab(next))
// A hash change (navigating between torrents) invalidates cached tab data.
watch(hash, () => {
  properties.value = null
  trackers.value = []
  files.value = []
  peers.value = {}
  void loadTab(tab.value)
})

const tone = computed(() => stateTone(torrent.value?.state))

const peerList = computed(() => {
  // The API keys peers by "ip:port" and values are loosely-typed maps.
  return Object.entries(peers.value).map(([key, value]) => {
    const sep = key.lastIndexOf(':')
    const ip = sep >= 0 ? key.slice(0, sep) : key
    const port = sep >= 0 ? key.slice(sep + 1) : ''
    const data = value as Record<string, unknown>
    return {
      key,
      ip,
      port,
      client: typeof data.client === 'string' ? data.client : '—',
      dlSpeed: Number(data.dl_speed ?? 0),
      upSpeed: Number(data.up_speed ?? 0),
    }
  })
})

const overviewRows = computed(() => {
  const tr = torrent.value
  const p = properties.value
  if (!tr) return []
  return [
    { label: t('torrent.hash'), value: tr.hash, mono: true },
    { label: t('detail.addedOn'), value: formatTimestamp(tr.added_on) },
    { label: t('detail.completedOn'), value: formatTimestamp(tr.completion_on) },
    { label: t('torrent.savePath'), value: tr.save_path, mono: true },
    { label: t('torrent.downloaded'), value: formatBytes(tr.downloaded) },
    { label: t('torrent.uploaded'), value: formatBytes(tr.uploaded) },
    { label: t('torrent.remaining'), value: formatBytes(tr.amount_left) },
    ...(p
      ? [
          { label: t('detail.pieceSize'), value: formatBytes(p.piece_size, 0) },
          { label: t('detail.totalWasted'), value: formatBytes(p.total_wasted) },
          { label: t('detail.connections'), value: `${p.nb_connections} / ${p.nb_connections_limit}` },
          { label: t('detail.createdBy'), value: p.created_by || '—' },
          { label: t('detail.comment'), value: p.comment || '—' },
        ]
      : []),
  ]
})

// ---- Actions -----------------------------------------------------------
async function doAction(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
    toast.success(label)
    await session.refresh()
  } catch (err) {
    toast.error(describeError(err))
  }
}

/**
 * Whether the primary action should be "start" rather than "stop".
 *
 * Uses the shared helper so both naming generations are covered: 5.x reports
 * `stoppedDL`/`stoppedUP`, and matching only `paused*` made a stopped torrent
 * offer a "Stop" button that posted `torrents/stop` to something already stopped.
 */
const isPaused = computed(() => isStopped(torrent.value?.state))

async function copyMagnet(): Promise<void> {
  const tr = torrent.value
  if (!tr) return
  const magnet =
    tr.magnet_uri ??
    `magnet:?xt=urn:btih:${tr.hash}&dn=${encodeURIComponent(tr.name)}`
  try {
    await navigator.clipboard.writeText(magnet)
    toast.success(t('toast.magnetCopied'))
  } catch {
    toast.error(t('toast.clipboardDenied'))
  }
}

/**
 * The three priority buttons.
 *
 * `tone` drives colour so the active state reads at a glance: skipping is grey,
 * normal is neutral-blue, maximum is amber.
 */
const priorityOptions = computed(() => [
  { value: 0, label: t('detail.doNotDownload'), tone: 'skip' },
  { value: 1, label: t('detail.normal'), tone: 'normal' },
  { value: 7, label: t('detail.maximum'), tone: 'max' },
])

/**
 * Split a file path into its base name and directory.
 *
 * Long paths are the reason the old layout broke: a 120-character path forced
 * the name to wrap across many lines. Showing the base name prominently (and
 * the directory dimmed after it) keeps every row one line tall, while the full
 * path stays reachable via the title attribute.
 */
function splitPath(name: string): { base: string; dir: string } {
  const idx = name.lastIndexOf('/')
  if (idx < 0) return { base: name, dir: '' }
  return { base: name.slice(idx + 1), dir: name.slice(0, idx + 1) }
}

function baseName(name: string): string {
  return splitPath(name).base
}

function dirName(name: string): string {
  return splitPath(name).dir
}

/**
 * Change a file's priority, then refetch the list.
 *
 * The refetch is a SECOND write path into `files`, and it needs the same
 * identity check `loadTab` uses. Without it, changing a priority on torrent A
 * and navigating to torrent B painted A's file list over B's when A's response
 * came back — wrong data presented as if it were current, which is exactly the
 * hazard AGENT.md §14 describes.
 */
async function setFilePriority(file: TorrentFile, priority: number): Promise<void> {
  const h = hash.value
  await doAction(t('detail.priority'), () => api.setFilePriority(h, [file.index], priority))
  if (!h) return
  const token = ++loadToken
  const result = await api.getTorrentFiles(h).catch(() => null)
  // Discard a result that belongs to a torrent we have since navigated away from.
  if (token !== loadToken || hash.value !== h) return
  if (result) files.value = result
}
</script>

<template>
  <div class="detail">
    <!-- Missing torrent (e.g. deleted while open) -->
    <MacEmptyState
      v-if="!torrent"
      :title="t('state.unknown')"
      :description="t('detail.unavailable')"
    >
      <template #action>
        <MacButton variant="primary" @click="router.push({ name: 'dashboard' })">
          {{ t('action.back') }}
        </MacButton>
      </template>
    </MacEmptyState>

    <template v-else>
      <!-- ===== Header ===== -->
      <header class="detail__header">
        <MacButton variant="ghost" size="sm" @click="router.push({ name: 'dashboard' })">
          <template #icon>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </template>
          {{ t('action.back') }}
        </MacButton>

        <h1 class="detail__title break-anywhere">{{ torrent.name }}</h1>

        <div class="detail__header-meta">
          <TorrentStateBadge :state="torrent.state" />
          <span v-if="torrent.category" class="detail__chip">{{ torrent.category }}</span>
        </div>
      </header>

      <!-- ===== Progress card ===== -->
      <MacCard glass padding="md">
        <div class="detail__progress-head">
          <span class="detail__progress-value">{{ formatPercent(torrent.progress) }}</span>
          <span class="detail__progress-size">
            {{ formatBytes(torrent.completed) }} / {{ formatBytes(torrent.size) }}
          </span>
        </div>
        <MacProgress :value="torrent.progress" :tone="tone" :height="8" />

        <div class="detail__metrics">
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('stats.download') }}</span>
            <span class="detail__metric-value is-down">{{ formatSpeed(torrent.dlspeed) }}</span>
          </div>
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('stats.upload') }}</span>
            <span class="detail__metric-value is-up">{{ formatSpeed(torrent.upspeed) }}</span>
          </div>
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('torrent.eta') }}</span>
            <span class="detail__metric-value">{{ formatEta(torrent.eta) }}</span>
          </div>
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('torrent.ratio') }}</span>
            <span class="detail__metric-value">{{ formatRatio(torrent.ratio) }}</span>
          </div>
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('torrent.seeds') }}</span>
            <span class="detail__metric-value">{{ torrent.num_seeds }} / {{ torrent.num_complete }}</span>
          </div>
          <div class="detail__metric">
            <span class="detail__metric-label">{{ t('torrent.peers') }}</span>
            <span class="detail__metric-value">
              {{ torrent.num_leechs }} / {{ torrent.num_incomplete }}
            </span>
          </div>
        </div>
      </MacCard>

      <!-- ===== Actions ===== -->
      <div class="detail__actions">
        <MacButton
          v-if="isPaused"
          variant="primary"
          size="sm"
          @click="doAction(t('action.resume'), () => api.resumeTorrents([hash]))"
        >
          {{ t('action.resume') }}
        </MacButton>
        <MacButton
          v-else
          variant="secondary"
          size="sm"
          @click="doAction(t('action.pause'), () => api.pauseTorrents([hash]))"
        >
          {{ t('action.pause') }}
        </MacButton>

        <MacButton
          variant="secondary"
          size="sm"
          @click="doAction(t('action.recheck'), () => api.recheckTorrents([hash]))"
        >
          {{ t('action.recheck') }}
        </MacButton>
        <MacButton
          variant="secondary"
          size="sm"
          @click="doAction(t('action.reannounce'), () => api.reannounceTorrents([hash]))"
        >
          {{ t('action.reannounce') }}
        </MacButton>
        <MacButton variant="ghost" size="sm" @click="copyMagnet">
          {{ t('action.copyMagnet') }}
        </MacButton>
      </div>

      <!-- ===== Tabs ===== -->
      <div class="detail__tabs" role="tablist">
        <button
          v-for="key in (['overview', 'files', 'peers', 'trackers'] as TabKey[])"
          :key="key"
          type="button"
          role="tab"
          class="detail__tab"
          :class="{ 'is-active': tab === key }"
          :aria-selected="tab === key"
          @click="tab = key"
        >
          {{ t(`detail.${key}`) }}
        </button>
      </div>

      <MacCard flush class="detail__panel">
        <div v-if="loadingTab && tab !== 'overview'" class="detail__loading">
          <MacSpinner :size="20" :label="t('status.loading')" />
        </div>

        <!-- Overview -->
        <dl v-else-if="tab === 'overview'" class="detail__rows">
          <div v-for="row in overviewRows" :key="row.label" class="detail__row">
            <dt class="detail__row-label">{{ row.label }}</dt>
            <dd class="detail__row-value break-anywhere" :class="{ 'is-mono': row.mono }">
              {{ row.value }}
            </dd>
          </div>
        </dl>

        <!-- Files -->
        <div v-else-if="tab === 'files'" class="detail__files">
          <MacEmptyState v-if="files.length === 0" compact :title="t('status.empty')" />
          <div v-for="file in files" :key="file.index" class="detail__file">
            <!--
              File row layout.
              
              Previously a 2-column grid where the actions spanned both rows.
              That collided as soon as a filename wrapped: the name grew the
              first row indefinitely while the progress bar stayed pinned to
              grid-column 1, so long names, the bar and the buttons all fought
              for the same space.
              
              Now: a flex column per row.
                row 1: name (flexible, truncating) | actions (fixed width)
                row 2: meta (left)                 | progress (right, fixed)
              
              The name TRUNCATES rather than wrapping, so row height is
              predictable no matter how deep the path is. The full path stays
              available via title= and the meta line shows the tail of it.
            -->
            <div class="detail__file">
              <div class="detail__file-row">
                <span class="detail__file-name" :title="file.name">
                  <span class="detail__file-base">{{ baseName(file.name) }}</span>
                  <span v-if="dirName(file.name)" class="detail__file-dir">
                    {{ dirName(file.name) }}
                  </span>
                </span>

                <div class="detail__file-actions" role="group" :aria-label="t('detail.priority')">
                  <button
                    v-for="opt in priorityOptions"
                    :key="opt.value"
                    type="button"
                    class="detail__file-btn"
                    :class="[`is-${opt.tone}`, { 'is-active': file.priority === opt.value }]"
                    :aria-pressed="file.priority === opt.value"
                    :title="opt.label"
                    @click="setFilePriority(file, opt.value)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="detail__file-row detail__file-row--meta">
                <span class="detail__file-meta">
                  {{ formatBytes(file.size) }} · {{ formatPercent(file.progress, 0) }}
                  <template v-if="file.priority === 0">
                    · <span class="detail__file-skip">{{ t('detail.doNotDownload') }}</span>
                  </template>
                </span>
                <MacProgress
                  class="detail__file-progress"
                  :value="file.progress"
                  :tone="file.priority === 0 ? 'paused' : tone"
                  :height="4"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Peers -->
        <div v-else-if="tab === 'peers'" class="detail__peers">
          <MacEmptyState v-if="peerList.length === 0" compact :title="t('detail.noPeers')" />
          <div v-for="peer in peerList" :key="peer.key" class="detail__peer">
            <span class="detail__peer-ip">{{ peer.ip }}:{{ peer.port }}</span>
            <span class="detail__peer-client truncate">{{ peer.client }}</span>
            <span class="detail__peer-speed is-down">
              ↓ {{ formatSpeed(peer.dlSpeed) }}
            </span>
            <span class="detail__peer-speed is-up">
              ↑ {{ formatSpeed(peer.upSpeed) }}
            </span>
          </div>
        </div>

        <!-- Trackers -->
        <div v-else class="detail__trackers">
          <MacEmptyState v-if="trackers.length === 0" compact :title="t('detail.noTrackers')" />
          <!-- URL alone collides: the same tracker legitimately appears in
               several tiers, which produced duplicate keys. -->
          <div
            v-for="tracker in trackers"
            :key="`${tracker.url}:${tracker.tier}`"
            class="detail__tracker"
          >
            <span class="detail__tracker-url break-anywhere">{{ tracker.url }}</span>
            <span class="detail__tracker-meta">
              {{ tracker.msg || '—' }} · {{ tracker.num_peers }} peers
            </span>
          </div>
        </div>
      </MacCard>
    </template>
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  max-width: var(--content-max-width);
  margin: 0 auto;
  width: 100%;
}

.detail__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.detail__title {
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-tight);
  min-width: 0;
}

.detail__header-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.detail__chip {
  font-size: var(--text-xs);
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--bg-active);
  color: var(--text-secondary);
}

.detail__progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.detail__progress-value {
  font-size: var(--text-2xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.detail__progress-size {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.detail__metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.detail__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.detail__metric-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.detail__metric-value {
  font-size: var(--text-base);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail__metric-value.is-down {
  color: var(--state-download);
}

.detail__metric-value.is-up {
  color: var(--state-upload);
}

.detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.detail__tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-active);
  overflow-x: auto;
  scrollbar-width: none;
  align-self: flex-start;
  max-width: 100%;
}

.detail__tabs::-webkit-scrollbar {
  display: none;
}

.detail__tab {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.detail__tab.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
}

.detail__panel {
  min-width: 0;
}

.detail__loading {
  display: grid;
  place-items: center;
  padding: var(--space-8);
}

/* ---- Overview rows ---- */
.detail__rows {
  display: flex;
  flex-direction: column;
}

.detail__row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--separator);
  min-width: 0;
}

.detail__row:last-child {
  border-bottom: none;
}

.detail__row-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.detail__row-value {
  font-size: var(--text-base);
  min-width: 0;
}

.detail__row-value.is-mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

/* ---- Files ----
 *
 * Layout contract: every file row is EXACTLY two lines tall, regardless of how
 * long the path is. The name truncates (it never wraps), the meta line and
 * progress bar share the second line, and the priority buttons occupy a fixed
 * column on the right.
 *
 * The previous version used a 2-column grid with the actions spanning both
 * rows. A wrapping filename then grew row 1 without bound while the progress
 * bar stayed pinned to grid-column 1, so long names, the bar and the buttons
 * all overlapped. Flexbox with explicit truncation removes that failure mode.
 */
.detail__files {
  display: flex;
  flex-direction: column;
}

.detail__file {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--separator);
  min-width: 0;
}

.detail__file:last-child {
  border-bottom: none;
}

.detail__file:hover {
  background: var(--bg-hover);
}

/* Row 1: name on the left, priority buttons on the right. */
.detail__file-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.detail__file-name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-base);
  /* One line only — this is what keeps row height predictable. */
  white-space: nowrap;
  overflow: hidden;
}

.detail__file-base {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

/* Directory hint, truncating from the LEFT so the deepest folder stays
   readable — the tail is the useful part of a path. */
.detail__file-dir {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

.detail__file-actions {
  flex: none;
  display: flex;
  gap: 2px;
  /* Never shrink below the buttons' intrinsic width; the name gives way. */
  flex-shrink: 0;
}

/* Row 2: size/progress text on the left, progress bar on the right. */
.detail__file-row--meta {
  gap: var(--space-4);
}

.detail__file-meta {
  flex: none;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.detail__file-skip {
  color: var(--state-paused);
}

.detail__file-progress {
  flex: 1 1 auto;
  min-width: 40px;
}

.detail__file-btn {
  flex: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  padding: 3px var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.detail__file-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

/* Active states are colour-coded by meaning, not just inverted. */
.detail__file-btn.is-active.is-skip {
  background: var(--state-paused);
  border-color: var(--state-paused);
  color: #fff;
}

.detail__file-btn.is-active.is-normal {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.detail__file-btn.is-active.is-max {
  background: var(--warning);
  border-color: var(--warning);
  color: #1d1d1f;
}

/* ---- Peers ---- */
.detail__peers,
.detail__trackers {
  display: flex;
  flex-direction: column;
}

.detail__peer {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 90px 90px;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--separator);
  font-size: var(--text-sm);
  min-width: 0;
}

.detail__peer-ip {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail__peer-client {
  color: var(--text-secondary);
  min-width: 0;
}

.detail__peer-speed {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.detail__peer-speed.is-down {
  color: var(--state-download);
}

.detail__peer-speed.is-up {
  color: var(--state-upload);
}

/* ---- Trackers ---- */
.detail__tracker {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--separator);
  min-width: 0;
}

.detail__tracker-url {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  min-width: 0;
}

.detail__tracker-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* ===== Responsive ===== */
@media (max-width: 1023px) {
  .detail__metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 599px) {
  .detail {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .detail__title {
    font-size: var(--text-lg);
  }

  .detail__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Actions become a horizontal scroller so they never wrap into a wall. */
  .detail__actions {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
  }

  .detail__actions::-webkit-scrollbar {
    display: none;
  }

  .detail__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
  }

  /* On a phone the row stacks: name first, then buttons, then meta+progress.
     Everything stays full width, so nothing competes for horizontal space. */
  .detail__file-row {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .detail__file-name {
    flex: 1 1 100%;
  }

  .detail__file-actions {
    flex: 1 1 auto;
  }

  .detail__file-btn {
    /* Comfortable tap targets. */
    flex: 1 1 0;
    padding: 6px var(--space-2);
    text-align: center;
  }

  .detail__file-row--meta {
    flex-wrap: wrap;
  }

  .detail__file-progress {
    flex: 1 1 100%;
  }

  .detail__peer {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-1) var(--space-2);
  }

  .detail__peer-speed {
    text-align: left;
  }
}
</style>
