<script setup lang="ts">
/**
 * DashboardView — the main transfers screen.
 *
 * Responsive contract (the core requirement of this project):
 *   >=600px  → TorrentTable (sortable grid rows)
 *   <600px   → TorrentCard list (touch-friendly, stacked)
 *
 * Both render from the same sorted/filtered collection, so switching viewport
 * size never loses the user's place in the list.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSessionStore } from '@/stores/session'
import { useTorrentFilter } from '@/composables/useTorrentFilter'
import { useToast, describeError } from '@/composables/useToast'
import { buildTorrentMenu } from '@/composables/useTorrentContextMenu'
import { formatBytes, formatSpeed } from '@/utils/format'
import * as api from '@/api/torrents'

import MacCard from '@/components/base/MacCard.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacSelect from '@/components/base/MacSelect.vue'
import MacSegmented from '@/components/base/MacSegmented.vue'
import MacEmptyState from '@/components/base/MacEmptyState.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import MacContextMenu from '@/components/base/MacContextMenu.vue'
import MacPromptDialog from '@/components/base/MacPromptDialog.vue'
import TorrentTable, { type SortKey } from '@/components/torrent/TorrentTable.vue'
import TorrentCard from '@/components/torrent/TorrentCard.vue'
import TorrentToolbar from '@/components/torrent/TorrentToolbar.vue'
import AddTorrentModal from '@/components/torrent/AddTorrentModal.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import type { Torrent } from '@/types/api'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const session = useSessionStore()
const { isMobile, isTablet } = useBreakpoint()

const {
  filter,
  search,
  category,
  tag,
  sortKey,
  sortReverse,
  selected,
  selectionMode,
  sorted,
  counts,
  onSort,
  toggleSelect,
  selectAll,
  clearSelection,
  selectedHashes,
} = useTorrentFilter({ torrents: computed(() => session.torrentList) })

/**
 * Long-press on a card enters selection mode and selects that card.
 *
 * The dashboard's Select control is the discoverable route; this is the
 * conventional touch shortcut. Before either existed, `selectionMode` could
 * only be set from controls that were themselves hidden until something was
 * selected, so bulk actions were unreachable on a phone.
 */
function enterSelectionFromCard(hash: string): void {
  selectionMode.value = true
  if (!selected.value.has(hash)) toggleSelect(hash)
}

// ---- Filter options ----------------------------------------------------
/**
 * Status filters.
 *
 * Each carries an `icon` name resolved to an inline SVG in the template, so the
 * chips are scannable by shape and colour rather than requiring the label to be
 * read. `tone` tints the chip's icon and active state to match the torrent
 * state colours used everywhere else.
 */
const filterOptions = computed(() => [
  { value: 'all', label: t('filter.all'), count: counts.value.all, icon: 'all', tone: 'neutral' },
  {
    value: 'downloading',
    label: t('filter.downloading'),
    count: counts.value.downloading,
    icon: 'downloading',
    tone: 'download',
  },
  {
    value: 'seeding',
    label: t('filter.seeding'),
    count: counts.value.seeding,
    icon: 'seeding',
    tone: 'upload',
  },
  {
    value: 'completed',
    label: t('filter.completed'),
    count: counts.value.completed,
    icon: 'completed',
    tone: 'success',
  },
  {
    value: 'paused',
    label: t('filter.paused'),
    count: counts.value.paused,
    icon: 'paused',
    tone: 'muted',
  },
  {
    value: 'errored',
    label: t('filter.errored'),
    count: counts.value.errored,
    icon: 'errored',
    tone: 'danger',
  },
])

const categoryOptions = computed(() => [
  { value: '', label: t('filter.category') },
  { value: '__uncategorized__', label: t('add.uncategorized') },
  ...session.categoryNames.map((name) => ({ value: name, label: name })),
])

const tagOptions = computed(() => [
  { value: '', label: t('filter.tag') },
  ...session.tags.map((name) => ({ value: name, label: name })),
])

const hasActiveFilters = computed(
  () => !!search.value || !!category.value || !!tag.value || filter.value !== 'all',
)

function clearFilters(): void {
  search.value = ''
  category.value = ''
  tag.value = ''
  filter.value = 'all'
}

// ---- Modals ------------------------------------------------------------
const addModalOpen = ref(false)
const confirmState = ref<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  action: (() => Promise<void>) | null
}>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  danger: false,
  action: null,
})

function askConfirm(opts: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  action: () => Promise<void>
}): void {
  confirmState.value = {
    open: true,
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel,
    danger: opts.danger ?? false,
    action: opts.action,
  }
}

async function runConfirmed(): Promise<void> {
  const action = confirmState.value.action
  confirmState.value.open = false
  if (!action) return
  try {
    await action()
    await session.refresh()
  } catch (err) {
    toast.error(describeError(err))
  }
}

// ---- Torrent actions ---------------------------------------------------
function targetHashes(hash?: string): string[] {
  if (hash) return [hash]
  return selectedHashes()
}

async function withAction(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
    toast.success(label)
    await session.refresh()
  } catch (err) {
    toast.error(describeError(err))
  }
}

async function resume(hash?: string): Promise<void> {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  await withAction(t('action.resume'), () => api.resumeTorrents(hashes))
}

async function pause(hash?: string): Promise<void> {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  await withAction(t('action.pause'), () => api.pauseTorrents(hashes))
}

/**
 * Force start the selection.
 *
 * Unlike resume, force start makes the torrent ignore the queue and the
 * share-ratio / seeding-time limits, which is why the official WebUI lists it
 * separately rather than folding it into Start.
 */
async function forceStart(hash?: string): Promise<void> {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  await withAction(t('action.forceStart'), () => api.setForceStart(hashes, true))
}

async function recheck(hash?: string): Promise<void> {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  await withAction(t('action.recheck'), () => api.recheckTorrents(hashes))
}

async function reannounce(hash?: string): Promise<void> {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  await withAction(t('action.reannounce'), () => api.reannounceTorrents(hashes))
}

function requestRemove(hash?: string): void {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  const count = hashes.length
  askConfirm({
    title: t('action.remove'),
    message: count === 1 ? t('confirm.removeOne') : t('confirm.removeMany', { count }),
    confirmLabel: t('action.remove'),
    danger: true,
    action: async () => {
      await api.deleteTorrents(hashes, false)
      clearSelection()
      toast.success(t('toast.torrentRemoved'))
    },
  })
}

function requestRemoveWithFiles(hash?: string): void {
  const hashes = targetHashes(hash)
  if (!hashes.length) return
  const count = hashes.length
  askConfirm({
    title: t('action.removeWithFiles'),
    message:
      count === 1 ? t('confirm.removeWithFilesOne') : t('confirm.removeWithFilesMany', { count }),
    confirmLabel: t('action.delete'),
    danger: true,
    action: async () => {
      await api.deleteTorrents(hashes, true)
      clearSelection()
      toast.success(t('toast.torrentAndFilesDeleted'))
    },
  })
}

async function setCategoryForSelection(value: string): Promise<void> {
  const hashes = selectedHashes()
  if (!hashes.length) return
  await withAction(t('action.setCategory'), () => api.setCategory(hashes, value))
}

// ---- Context menu ------------------------------------------------------

/**
 * Open menu state.
 *
 * Right-clicking a torrent that is NOT already selected selects it first, which
 * is what every file manager does and what the official WebUI does. Without it,
 * right-clicking a different row would silently act on the previous selection —
 * a genuinely dangerous behaviour for the Remove items.
 */
const menuOpen = ref(false)
const menuX = ref(0)
const menuY = ref(0)
/** The torrent the menu was opened on, used for single-torrent actions. */
const menuHash = ref<string | null>(null)

// Prompt dialogs driven from the menu. Each is a one-field modal; see
// MacPromptDialog for why they share a component.
const renamePromptOpen = ref(false)
const renameInitial = ref('')
const locationPromptOpen = ref(false)
const dlLimitPromptOpen = ref(false)
const upLimitPromptOpen = ref(false)
const ratioPromptOpen = ref(false)
const categoryPromptOpen = ref(false)
const tagPromptOpen = ref(false)

/**
 * Parse a rate-limit value the user typed.
 *
 * Accepts a bare number (bytes/s), or a number with a unit suffix — `500 KiB`,
 * `2 MiB`, `1.5 MB`. Returns null for an empty field, which means "no limit"
 * and must be sent as 0 rather than omitted.
 */
function parseRateLimit(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null

  const m = /^([0-9]*\.?[0-9]+)\s*(b|kib|kb|mib|mb|gib|gb)?$/i.exec(text)
  if (!m) return Number.NaN

  const n = Number(m[1])
  const unit = (m[2] ?? 'b').toLowerCase()
  const factor: Record<string, number> = {
    b: 1,
    kb: 1000,
    kib: 1024,
    mb: 1000 * 1000,
    mib: 1024 * 1024,
    gb: 1000 * 1000 * 1000,
    gib: 1024 * 1024 * 1024,
  }
  return Math.round(n * (factor[unit] ?? 1))
}

/**
 * The torrents the menu acts on.
 *
 * The selection is the source of truth, NOT `menuHash`.
 *
 * Reading `menuHash` first looked equivalent — `openContextMenu` adopts the
 * right-clicked row into the selection before setting it — but it silently
 * reduced every menu action to that single torrent, so the branch below that
 * returns the whole selection was unreachable. Right-clicking one of five
 * ticked torrents and choosing Remove deleted one torrent instead of five.
 * `menuHash` is kept only as a fallback for the case where the selection has
 * been emptied while the menu is open (e.g. a torrent disappeared).
 */
const menuTargets = computed<Torrent[]>(() => {
  const picked = sorted.value.filter((x) => selected.value.has(x.hash))
  if (picked.length > 0) return picked
  if (menuHash.value) {
    const hit = session.torrentList.find((x) => x.hash === menuHash.value)
    return hit ? [hit] : []
  }
  return []
})

const menuItems = computed(() =>
  menuOpen.value
    ? buildTorrentMenu({
        t: (key, named) => t(key, named ?? {}),
        torrents: menuTargets.value,
        categories: session.categoryNames,
        tags: session.tags,
      })
    : [],
)

/**
 * Select exactly one torrent WITHOUT entering selection mode.
 *
 * `toggleSelect` sets `selectionMode = true` as a side effect, which is right
 * when the user ticks a checkbox but wrong here: right-clicking a row on the
 * desktop should act on that row, not convert the list into a multi-select UI.
 * Using toggleSelect made a plain right-click reveal every checkbox.
 *
 * `selectOnly` is not used either, because it also mutates selectionMode.
 */
function selectOnlyForMenu(hash: string): void {
  selected.value = new Set([hash])
}

function openContextMenu(payload: { hash: string; x: number; y: number }): void {
  /*
   * Adopt the right-clicked row when it is not already part of the selection.
   *
   * This is the safety-critical part: without it, right-clicking row B while
   * row A is selected would open a menu whose "Remove" deletes row A. The menu
   * must always act on the row the user actually pointed at.
   *
   * Rows that ARE part of a multi-selection are left alone, so the menu still
   * applies to the whole selection when that is what the user built.
   */
  if (!selected.value.has(payload.hash)) {
    selectOnlyForMenu(payload.hash)
  }
  menuHash.value = payload.hash
  menuX.value = payload.x
  menuY.value = payload.y
  menuOpen.value = true
}

/**
 * Card variant of the above.
 *
 * The template cannot carry a typed inline arrow — Vue compiles template
 * expressions as plain JavaScript, so a `: { x: number }` annotation there is a
 * syntax error.
 */
function openContextMenuFor(hash: string, point: { x: number; y: number }): void {
  openContextMenu({ hash, x: point.x, y: point.y })
}

function closeContextMenu(): void {
  menuOpen.value = false
  menuHash.value = null
}

/** Read the clipboard, tolerating browsers that refuse the API. */
async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('toast.copied', { label }))
  } catch {
    toast.error(t('toast.clipboardDenied'))
  }
}

/** Act on the hashes the menu targets (which may be the whole selection). */
async function menuAction(label: string, fn: (hashes: string[]) => Promise<unknown>): Promise<void> {
  const hashes = menuTargets.value.map((x) => x.hash)
  closeContextMenu()
  if (!hashes.length) return
  await withAction(label, () => fn(hashes))
}

/**
 * Dispatch a menu selection.
 *
 * Every id here maps to a real API call or a real client-side effect. There is
 * deliberately no placeholder branch: an item that looks clickable but does
 * nothing is worse than an item that is absent.
 */
async function onMenuSelect(id: string): Promise<void> {
  const targets = menuTargets.value
  const hashes = targets.map((x) => x.hash)
  const one = targets[0]

  // ---- Submenu-driven actions ------------------------------------------
  if (id.startsWith('category:')) {
    const value = id.slice('category:'.length)
    if (value === 'new') {
      closeContextMenu()
      categoryPromptOpen.value = true
      return
    }
    await menuAction(value ? t('action.setCategory') : t('action.setCategory'), () =>
      api.setCategory(hashes, value),
    )
    return
  }

  if (id.startsWith('tag:')) {
    const tag = id.slice('tag:'.length)
    await menuAction(t('menu.addTags'), () => api.addTags(hashes, [tag]))
    return
  }

  if (id === 'tags:add') {
    closeContextMenu()
    tagPromptOpen.value = true
    return
  }

  if (id === 'tags:none') {
    const allTags = [...new Set(targets.flatMap((x) => (x.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean)))]
    if (!allTags.length) {
      closeContextMenu()
      return
    }
    await menuAction(t('menu.removeAllTags'), () => api.removeTags(hashes, allTags))
    return
  }

  if (id.startsWith('queue:')) {
    const map: Record<string, string> = {
      'queue:top': 'topPrio',
      'queue:up': 'increasePrio',
      'queue:down': 'decreasePrio',
      'queue:bottom': 'bottomPrio',
    }
    const priority = map[id]
    if (!priority) return
    await menuAction(t('action.queueTop'), () => api.setTorrentPriority(hashes, priority))
    return
  }

  if (id.startsWith('copy:')) {
    const kind = id.slice('copy:'.length)
    closeContextMenu()
    if (!one) return

    switch (kind) {
      case 'name':
        await copyText(one.name, t('torrent.name'))
        break
      case 'hash':
        // v2 torrents carry both; copy whichever exists, preferring v1 as the
        // more widely useful identifier.
        await copyText(one.infohash_v1 || one.infohash_v2 || one.hash, t('menu.infoHash'))
        break
      case 'magnet': {
        // Include the tracker list so the link works without DHT.
        let trackers: string[] = []
        try {
          const list = await api.getTorrentTrackers(one.hash)
          trackers = list.map((tr) => tr.url)
        } catch {
          // Trackers are a nicety; a magnet without them is still valid.
        }
        const magnet = api.buildMagnetLink(one.hash, one.name, trackers, one.infohash_v2)
        await copyText(magnet, t('action.copyMagnet'))
        break
      }
      case 'path':
        await copyText(one.save_path ?? '', t('menu.contentPath'))
        break
      default:
        break
    }
    return
  }

  // ---- Direct actions ----------------------------------------------------
  switch (id) {
    case 'start':
      await menuAction(t('action.resume'), () => api.resumeTorrents(hashes))
      break
    case 'stop':
      await menuAction(t('action.pause'), () => api.pauseTorrents(hashes))
      break
    case 'forceStart': {
      // Toggle: if everything is already force-started, turn it off.
      const allForced = targets.every((x) => x.force_start === true)
      await menuAction(t('action.forceStart'), () => api.setForceStart(hashes, !allForced))
      break
    }
    case 'remove':
      closeContextMenu()
      // No hash argument: act on the whole selection, like every other item.
      // Passing `menuHash` here capped removal at the right-clicked torrent
      // even when several were ticked.
      requestRemove()
      break
    case 'removeWithFiles':
      closeContextMenu()
      requestRemoveWithFiles()
      break
    case 'setLocation':
      closeContextMenu()
      locationPromptOpen.value = true
      break
    case 'rename':
      closeContextMenu()
      renamePromptOpen.value = true
      break
    case 'renameFiles':
      closeContextMenu()
      if (one) void router.push({ name: 'torrent-detail', params: { hash: one.hash }, query: { tab: 'files' } })
      break
    case 'autoTMM': {
      const allOn = targets.every((x) => x.auto_tmm === true)
      await menuAction(t('menu.autoTmm'), () => api.setAutoManagement(hashes, !allOn))
      break
    }
    case 'sequential': {
      // The server only exposes a toggle, so only send it when the state
      // actually differs — otherwise "enable" would disable.
      const allOn = targets.every((x) => x.seq_dl === true)
      const wantOn = !allOn
      const needs = targets.some((x) => (x.seq_dl === true) !== wantOn)
      if (!needs) {
        closeContextMenu()
        break
      }
      await menuAction(t('menu.sequential'), () => api.setSequentialDownload(hashes, wantOn))
      break
    }
    case 'firstLast': {
      const allOn = targets.every((x) => x.f_l_piece_prio === true)
      const wantOn = !allOn
      const needs = targets.some((x) => (x.f_l_piece_prio === true) !== wantOn)
      if (!needs) {
        closeContextMenu()
        break
      }
      await menuAction(t('menu.firstLast'), () => api.toggleFirstLastPiecePrio(hashes))
      break
    }
    case 'superSeeding': {
      const allOn = targets.every((x) => x.super_seeding === true)
      await menuAction(t('menu.superSeeding'), () => api.setSuperSeeding(hashes, !allOn))
      break
    }
    case 'downloadLimit':
      closeContextMenu()
      dlLimitPromptOpen.value = true
      break
    case 'uploadLimit':
      closeContextMenu()
      upLimitPromptOpen.value = true
      break
    case 'shareRatio':
      closeContextMenu()
      ratioPromptOpen.value = true
      break
    case 'recheck':
      await menuAction(t('action.recheck'), () => api.recheckTorrents(hashes))
      break
    case 'reannounce':
      await menuAction(t('action.reannounce'), () => api.reannounceTorrents(hashes))
      break
    case 'export':
      closeContextMenu()
      if (one) await exportTorrentFile(one)
      break
    default:
      closeContextMenu()
      break
  }
}

/** Download the .torrent for a torrent, via a temporary object URL. */
async function exportTorrentFile(torrent: Torrent): Promise<void> {
  try {
    const blob = await api.exportTorrent(torrent.hash)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${torrent.name.replace(/[/\\?%*:|"<>]/g, '_')}.torrent`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    toast.error(describeError(err))
  }
}

// ---- Navigation --------------------------------------------------------
function openDetail(hash: string): void {
  void router.push({ name: 'torrent-detail', params: { hash } })
}

// ---- Prompt confirmations ----------------------------------------------

/** Open the rename dialog pre-filled with the current name. */
watch(renamePromptOpen, (open) => {
  if (open && menuTargets.value[0]) renameInitial.value = menuTargets.value[0].name
})

async function onRenameConfirm(value: string): Promise<void> {
  const name = value.trim()
  const one = menuTargets.value[0]
  if (!name || !one || name === one.name) return
  await withAction(t('action.rename'), () => api.renameTorrent(one.hash, name))
}

async function onLocationConfirm(value: string): Promise<void> {
  const path = value.trim()
  const hashes = menuTargets.value.map((x) => x.hash)
  if (!path || !hashes.length) return
  await withAction(t('action.setLocation'), () => api.setLocation(hashes, path))
}

async function onDownloadLimitConfirm(value: string): Promise<void> {
  const limit = parseRateLimit(value)
  const hashes = menuTargets.value.map((x) => x.hash)
  if (limit === null || Number.isNaN(limit) || !hashes.length) return
  await withAction(t('menu.downloadLimit'), () => api.setTorrentDownloadLimit(hashes, limit))
}

async function onUploadLimitConfirm(value: string): Promise<void> {
  const limit = parseRateLimit(value)
  const hashes = menuTargets.value.map((x) => x.hash)
  if (limit === null || Number.isNaN(limit) || !hashes.length) return
  await withAction(t('menu.uploadLimit'), () => api.setTorrentUploadLimit(hashes, limit))
}

async function onRatioConfirm(value: string): Promise<void> {
  const ratio = Number(value.trim())
  const hashes = menuTargets.value.map((x) => x.hash)
  if (!Number.isFinite(ratio) || ratio < 0 || !hashes.length) return
  // A ratio limit without a seeding-time limit; -2 means "use the global
  // default", which is the right pairing for a per-torrent override.
  await withAction(t('menu.shareRatio'), () => api.setShareLimits(hashes, ratio, -2))
}

async function onCategoryConfirm(value: string): Promise<void> {
  const name = value.trim()
  if (!name) return
  const hashes = menuTargets.value.map((x) => x.hash)
  if (!hashes.length) return
  await withAction(t('action.setCategory'), async () => {
    // The category must exist before it can be assigned.
    await api.createCategory(name).catch(() => undefined)
    await api.setCategory(hashes, name)
  })
}

async function onTagConfirm(value: string): Promise<void> {
  const tag = value.trim()
  if (!tag) return
  const hashes = menuTargets.value.map((x) => x.hash)
  if (!hashes.length) return
  await withAction(t('menu.addTags'), async () => {
    await api.createTags([tag]).catch(() => undefined)
    await api.addTags(hashes, [tag])
  })
}

const summary = computed(() => ({
  total: session.counts.total,
  downloading: session.counts.downloading,
  seeding: session.counts.seeding,
  downloadSpeed: session.downloadSpeed,
  uploadSpeed: session.uploadSpeed,
  freeSpace: session.freeSpace,
}))
</script>

<template>
  <div class="dashboard">
    <!-- ===== Summary strip =====
         Each card carries an icon, the headline number and a secondary line,
         which reads far better than a bare label/value pair and gives the page
         some visual rhythm. -->
    <section class="dashboard__summary" aria-label="Session summary">
      <MacCard glass padding="sm" class="stat" :class="{ 'stat--active': summary.downloadSpeed > 0 }">
        <span class="stat__icon stat__icon--down" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <path
              d="M10 3.5v9m0 0l-3.4-3.4M10 12.5l3.4-3.4M4 16.5h12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div class="stat__body">
          <span class="stat__label">{{ t('stats.download') }}</span>
          <span class="stat__value is-down">{{ formatSpeed(summary.downloadSpeed) }}</span>
          <span class="stat__sub">{{ formatBytes(session.sessionDownloaded) }}</span>
        </div>
      </MacCard>

      <MacCard glass padding="sm" class="stat" :class="{ 'stat--active': summary.uploadSpeed > 0 }">
        <span class="stat__icon stat__icon--up" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <path
              d="M10 16.5v-9m0 0L6.6 10.9M10 7.5l3.4 3.4M4 16.5h12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div class="stat__body">
          <span class="stat__label">{{ t('stats.upload') }}</span>
          <span class="stat__value is-up">{{ formatSpeed(summary.uploadSpeed) }}</span>
          <span class="stat__sub">{{ formatBytes(session.sessionUploaded) }}</span>
        </div>
      </MacCard>

      <MacCard glass padding="sm" class="stat">
        <span class="stat__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <rect x="3" y="3.5" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M6.5 8h7M6.5 11h7M6.5 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
        <div class="stat__body">
          <span class="stat__label">{{ t('filter.all') }}</span>
          <span class="stat__value">{{ summary.total }}</span>
          <span class="stat__sub">
            ↓{{ summary.downloading }} ↑{{ summary.seeding }}
          </span>
        </div>
      </MacCard>

      <MacCard glass padding="sm" class="stat">
        <span class="stat__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <ellipse cx="10" cy="5.5" rx="6" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
        </span>
        <div class="stat__body">
          <span class="stat__label">{{ t('stats.freeSpace') }}</span>
          <span class="stat__value">{{ formatBytes(summary.freeSpace, 0) }}</span>
          <span class="stat__sub">{{ t('stats.allTime') }}</span>
        </div>
      </MacCard>
    </section>

    <!-- ===== Controls ===== -->
    <section class="dashboard__controls">
      <div class="dashboard__search">
        <MacInput
          id="torrent-filter-input"
          v-model="search"
          type="search"
          :placeholder="t('filter.search')"
          inputmode="search"
        >
          <template #prefix>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </template>
        </MacInput>
      </div>

      <!-- Filters collapse behind a row of selects on mobile. -->
      <div class="dashboard__selects">
        <MacSelect
          v-model="category"
          :options="categoryOptions"
          :aria-label="t('filter.category')"
        />
        <MacSelect v-if="session.tags.length" v-model="tag" :options="tagOptions" :aria-label="t('filter.tag')" />
      </div>

      <MacButton variant="primary" @click="addModalOpen = true">
        <template #icon>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </template>
        <span class="dashboard__add-label">{{ t('action.add') }}</span>
      </MacButton>
    </section>

    <section class="dashboard__filters">
      <MacSegmented v-model="filter" :options="filterOptions" :aria-label="t('torrent.status')">
        <template #icon="{ icon }">
          <!-- Arrow down into a tray: downloading -->
          <svg v-if="icon === 'downloading'" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 2.5v7m0 0L5.2 6.7M8 9.5l2.8-2.8M3 13h10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Arrow up out of a tray: seeding -->
          <svg v-else-if="icon === 'seeding'" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 13.5v-7m0 0L5.2 9.3M8 6.5l2.8 2.8M3 13h10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Check in a circle: completed -->
          <svg v-else-if="icon === 'completed'" viewBox="0 0 16 16" width="14" height="14">
            <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M5.6 8.2l1.7 1.7 3.1-3.4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Two bars: paused -->
          <svg v-else-if="icon === 'paused'" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M6 3.5v9M10 3.5v9"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>

          <!-- Triangle with a bang: errored -->
          <svg v-else-if="icon === 'errored'" viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 2.6l5.4 9.4H2.6L8 2.6z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path d="M8 6.6v3M8 11.2v.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>

          <!-- Stacked lines: all -->
          <svg v-else viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M3 5h10M3 8h10M3 11h6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </template>
      </MacSegmented>
      <MacButton v-if="hasActiveFilters" variant="ghost" size="sm" @click="clearFilters">
        {{ t('action.cancel') }}
      </MacButton>

      <!-- Discoverable way into selection mode on touch layouts, where the
           table header checkbox does not exist. Without this the only route
           was a long-press gesture. -->
      <MacButton
        v-if="isMobile && sorted.length > 0"
        variant="ghost"
        size="sm"
        @click="selectionMode = !selectionMode"
      >
        {{ selectionMode ? t('action.cancel') : t('action.select') }}
      </MacButton>
    </section>

    <!-- ===== Selection toolbar ===== -->
    <!-- Shown whenever selection mode is active on mobile (so the "select all"
         affordance is reachable before anything is picked), and once something
         is selected on desktop. -->
    <TorrentToolbar
      v-if="selectionMode && (selected.size > 0 || isMobile)"
      :count="selected.size"
      @resume="resume()"
      @pause="pause()"
      @force-start="forceStart()"
      @recheck="recheck()"
      @reannounce="reannounce()"
      @remove="requestRemove()"
      @remove-with-files="requestRemoveWithFiles()"
      @set-category="setCategoryForSelection"
      @clear="clearSelection"
    />

    <!-- ===== List ===== -->
    <section class="dashboard__list">
      <div v-if="session.loading && sorted.length === 0" class="dashboard__loading">
        <MacSpinner :size="24" :label="t('status.loading')" />
      </div>

      <MacEmptyState
        v-else-if="sorted.length === 0"
        :title="session.counts.total === 0 ? t('status.empty') : t('status.noResults')"
        :description="session.counts.total === 0 ? t('status.emptyHint') : undefined"
      >
        <template #icon>
          <svg viewBox="0 0 48 48" width="48" height="48">
            <path
              d="M24 8v20m0 0l-7-7m7 7l7-7M8 38h32"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </template>
        <template v-if="session.counts.total === 0" #action>
          <MacButton variant="primary" @click="addModalOpen = true">
            {{ t('action.add') }}
          </MacButton>
        </template>
      </MacEmptyState>

      <!-- Desktop / tablet table -->
      <MacCard v-else-if="!isMobile" flush>
        <TorrentTable
          :torrents="sorted"
          :selected="selected"
          :selection-mode="selectionMode"
          :sort-key="sortKey"
          :sort-reverse="sortReverse"
          :compact="isTablet"
          @open="openDetail"
          @toggle-select="toggleSelect"
          @select-all="selectAll"
          @sort="(k: SortKey) => onSort(k)"
          @context-menu="openContextMenu"
        />
      </MacCard>

      <!-- Mobile card list -->
      <div v-else class="dashboard__cards">
        <TorrentCard
          v-for="torrent in sorted"
          :key="torrent.hash"
          :torrent="torrent"
          :selected="selected.has(torrent.hash)"
          :selection-mode="selectionMode"
          @open="openDetail"
          @toggle-select="toggleSelect"
          @enter-selection="enterSelectionFromCard"
          @context-menu="(pt) => openContextMenuFor(torrent.hash, pt)"
        />
      </div>
    </section>

    <!-- ===== Context menu ===== -->
    <MacContextMenu
      :open="menuOpen"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @select="onMenuSelect"
      @close="closeContextMenu"
    />

    <!-- ===== Modals ===== -->
    <AddTorrentModal v-model:open="addModalOpen" @added="session.refresh()" />

    <MacPromptDialog
      v-model:open="renamePromptOpen"
      :title="t('action.rename')"
      :label="t('torrent.name')"
      :initial="renameInitial"
      @confirm="onRenameConfirm"
    />

    <MacPromptDialog
      v-model:open="locationPromptOpen"
      :title="t('action.setLocation')"
      :label="t('menu.savePath')"
      :placeholder="t('menu.pathPlaceholder')"
      :initial="menuTargets[0]?.save_path ?? ''"
      @confirm="onLocationConfirm"
    />

    <MacPromptDialog
      v-model:open="dlLimitPromptOpen"
      :title="t('menu.downloadLimit')"
      :label="t('torrent.downloaded')"
      placeholder="0 = 无限制，或 500 KiB / 2 MiB"
      unit="B/s"
      :hint="t('menu.limitHint')"
      @confirm="onDownloadLimitConfirm"
    />

    <MacPromptDialog
      v-model:open="upLimitPromptOpen"
      :title="t('menu.uploadLimit')"
      :label="t('torrent.uploaded')"
      placeholder="0 = 无限制，或 500 KiB / 2 MiB"
      unit="B/s"
      :hint="t('menu.limitHint')"
      @confirm="onUploadLimitConfirm"
    />

    <MacPromptDialog
      v-model:open="ratioPromptOpen"
      :title="t('menu.shareRatio')"
      :label="t('torrent.ratio')"
      placeholder="1.0"
      :hint="t('menu.ratioHint')"
      @confirm="onRatioConfirm"
    />

    <MacPromptDialog
      v-model:open="categoryPromptOpen"
      :title="t('menu.newCategory')"
      :label="t('torrent.category')"
      :placeholder="t('menu.categoryPlaceholder')"
      @confirm="onCategoryConfirm"
    />

    <MacPromptDialog
      v-model:open="tagPromptOpen"
      :title="t('menu.addTags')"
      :label="t('torrent.tags')"
      :placeholder="t('menu.tagPlaceholder')"
      @confirm="onTagConfirm"
    />

    <ConfirmDialog
      v-model:open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-label="confirmState.confirmLabel"
      :danger="confirmState.danger"
      @confirm="runConfirmed"
    />
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  max-width: var(--content-max-width);
  margin: 0 auto;
  width: 100%;
}

/* ===== Summary ===== */
.dashboard__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

/* ---- Stat card ----
   Icon tile + label + headline value + secondary line. The icon gives the row
   some colour and makes the four cards scannable at a glance. */
.stat {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  transition:
    border-color var(--duration) var(--ease),
    box-shadow var(--duration) var(--ease);
}

/* A soft glow when that direction is actually transferring. */
.stat--active {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
}

.stat__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--bg-active);
  color: var(--text-secondary);
}

.stat__icon--down {
  background: var(--success-soft);
  color: var(--state-download);
}

.stat__icon--up {
  background: color-mix(in srgb, var(--state-upload) 16%, transparent);
  color: var(--state-upload);
}

.stat__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}

.stat__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat__value {
  font-size: var(--text-lg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.15;
}

.stat__value.is-down {
  color: var(--state-download);
}

.stat__value.is-up {
  color: var(--state-upload);
}

.stat__sub {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Controls ===== */
.dashboard__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.dashboard__search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 420px;
}

.dashboard__selects {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 1 auto;
  min-width: 0;
}

.dashboard__filters {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.dashboard__list {
  min-width: 0;
}

.dashboard__loading {
  display: grid;
  place-items: center;
  padding: var(--space-10);
}

.dashboard__cards {
  display: flex;
  flex-direction: column;
  /* Cards are separate tap targets, so they need clearer separation than list
     rows do — 8px made adjacent cards read as one block. */
  gap: var(--space-3);
}

/* ===== Responsive ===== */
/* Tablet: summary becomes 2×2, selects drop below the search field. */
@media (max-width: 1023px) {
  .dashboard__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard__controls {
    flex-wrap: wrap;
  }

  .dashboard__search {
    max-width: none;
    flex: 1 1 100%;
  }
}

/* Mobile: single column, tighter gutters, icon-only add button. */
@media (max-width: 599px) {
  .dashboard {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .dashboard__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .stat__value {
    font-size: var(--text-md);
  }

  .stat__icon {
    width: 28px;
    height: 28px;
  }

  .dashboard__selects {
    flex: 1 1 auto;
  }

  .dashboard__selects > * {
    flex: 1 1 0;
    min-width: 0;
  }

  .dashboard__add-label {
    display: none;
  }
}
</style>