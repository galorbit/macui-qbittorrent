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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSessionStore } from '@/stores/session'
import { useTorrentFilter } from '@/composables/useTorrentFilter'
import { useToast, describeError } from '@/composables/useToast'
import { formatBytes, formatSpeed } from '@/utils/format'
import * as api from '@/api/torrents'

import MacCard from '@/components/base/MacCard.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacSelect from '@/components/base/MacSelect.vue'
import MacSegmented from '@/components/base/MacSegmented.vue'
import MacEmptyState from '@/components/base/MacEmptyState.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import TorrentTable, { type SortKey } from '@/components/torrent/TorrentTable.vue'
import TorrentCard from '@/components/torrent/TorrentCard.vue'
import TorrentToolbar from '@/components/torrent/TorrentToolbar.vue'
import AddTorrentModal from '@/components/torrent/AddTorrentModal.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'

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

// ---- Navigation --------------------------------------------------------
function openDetail(hash: string): void {
  void router.push({ name: 'torrent-detail', params: { hash } })
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
        />
      </div>
    </section>

    <!-- ===== Modals ===== -->
    <AddTorrentModal v-model:open="addModalOpen" @added="session.refresh()" />

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