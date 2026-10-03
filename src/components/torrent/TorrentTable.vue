<script setup lang="ts">
/**
 * TorrentTable — the desktop/tablet representation of the torrent list.
 *
 * Only rendered at >=600px (the dashboard uses TorrentCard below that). Column
 * widths use CSS grid rather than <table> so that hiding optional columns at
 * the tablet breakpoint does not require duplicating markup.
 *
 * Rows are kept free of backdrop-filter: with hundreds of rows, blurring each
 * one is a measurable cost on modest hardware.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Torrent } from '@/types/api'
import {
  formatBytes,
  formatEta,
  formatRatio,
  formatSpeed,
  stateTone,
} from '@/utils/format'
import MacProgress from '@/components/base/MacProgress.vue'
import TorrentStateBadge from '@/components/torrent/TorrentStateBadge.vue'

export type SortKey =
  | 'name'
  | 'size'
  | 'progress'
  | 'dlspeed'
  | 'upspeed'
  | 'eta'
  | 'ratio'
  | 'state'
  | 'added_on'

const props = defineProps<{
  torrents: Torrent[]
  selected: Set<string>
  selectionMode: boolean
  sortKey: SortKey
  sortReverse: boolean
  /** Tablet hides the less critical columns. */
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', hash: string): void
  (e: 'toggle-select', hash: string, event: MouseEvent): void
  (e: 'select-all'): void
  (e: 'sort', key: SortKey): void
}>()

const { t } = useI18n()

/**
 * Selection state of the VISIBLE rows.
 *
 * Computed over membership in `torrents` (the filtered/sorted list actually
 * rendered) rather than by comparing `selected.size` to `torrents.length`.
 * The size comparison was wrong whenever a filter hid selected rows: with all
 * 5 selected and a filter matching 1, it evaluated 5 === 1, so the header
 * rendered UNCHECKED and clicking it cleared the whole selection instead of
 * selecting the visible row.
 */
const allSelected = computed(
  () => props.torrents.length > 0 && props.torrents.every((t) => props.selected.has(t.hash)),
)

const indeterminate = computed(
  () =>
    props.torrents.some((t) => props.selected.has(t.hash)) &&
    !props.torrents.every((t) => props.selected.has(t.hash)),
)

/** Grid template must match the header and every row. */
const gridTemplate = computed(() =>
  props.compact
    ? '36px minmax(0, 2.2fr) minmax(0, 1fr) 88px 88px 72px 80px'
    : '36px minmax(0, 2.4fr) minmax(0, 1fr) 96px 96px 96px 76px 80px 96px',
)

function onSort(key: SortKey): void {
  emit('sort', key)
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (props.sortKey !== key) return 'none'
  return props.sortReverse ? 'descending' : 'ascending'
}
</script>

<template>
  <div class="ttable" role="table" :aria-rowcount="torrents.length">
    <!-- ===== Header ===== -->
    <div class="ttable__header" role="row" :style="{ gridTemplateColumns: gridTemplate }">
      <div class="ttable__cell ttable__cell--check" role="columnheader">
        <label class="ttable__checkbox">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate.prop="indeterminate"
            :aria-label="t('torrent.selectAll')"
            @change="emit('select-all')"
          />
        </label>
      </div>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('name')"
        @click="onSort('name')"
      >
        {{ t('torrent.name') }}
        <span v-if="sortKey === 'name'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('size')"
        @click="onSort('size')"
      >
        {{ t('torrent.size') }}
        <span v-if="sortKey === 'size'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('progress')"
        @click="onSort('progress')"
      >
        {{ t('torrent.progress') }}
        <span v-if="sortKey === 'progress'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('dlspeed')"
        @click="onSort('dlspeed')"
      >
        {{ t('stats.download') }}
        <span v-if="sortKey === 'dlspeed'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('upspeed')"
        @click="onSort('upspeed')"
      >
        {{ t('stats.upload') }}
        <span v-if="sortKey === 'upspeed'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('eta')"
        @click="onSort('eta')"
      >
        {{ t('torrent.eta') }}
        <span v-if="sortKey === 'eta'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        v-if="!compact"
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('ratio')"
        @click="onSort('ratio')"
      >
        {{ t('torrent.ratio') }}
        <span v-if="sortKey === 'ratio'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>

      <button
        v-if="!compact"
        type="button"
        class="ttable__cell ttable__th"
        role="columnheader"
        :aria-sort="ariaSort('state')"
        @click="onSort('state')"
      >
        {{ t('torrent.status') }}
        <span v-if="sortKey === 'state'" class="ttable__sort" aria-hidden="true">
          {{ sortReverse ? '▾' : '▴' }}
        </span>
      </button>
    </div>

    <!-- ===== Rows ===== -->
    <div class="ttable__body">
      <div
        v-for="torrent in torrents"
        :key="torrent.hash"
        class="ttable__row"
        :class="{ 'is-selected': selected.has(torrent.hash) }"
        role="row"
        tabindex="0"
        :style="{ gridTemplateColumns: gridTemplate }"
        @click="emit('open', torrent.hash)"
        @keydown.enter.prevent="emit('open', torrent.hash)"
      >
<div class="ttable__cell ttable__cell--check" role="cell" @click.stop>
          <label class="ttable__checkbox">
            <input
              type="checkbox"
              :checked="selected.has(torrent.hash)"
              :aria-label="torrent.name"
              @click="emit('toggle-select', torrent.hash, $event as MouseEvent)"
            />
          </label>
        </div>

        <div class="ttable__cell ttable__cell--name" role="cell">
          <span class="ttable__name truncate" :title="torrent.name">{{ torrent.name }}</span>
          <span v-if="torrent.category" class="ttable__category truncate">
            {{ torrent.category }}
          </span>
        </div>

        <div class="ttable__cell ttable__num" role="cell">{{ formatBytes(torrent.size) }}</div>

        <div class="ttable__cell" role="cell">
          <MacProgress
            :value="torrent.progress"
            :tone="stateTone(torrent.state)"
            :height="5"
            show-label
          />
        </div>

        <div class="ttable__cell ttable__num is-down" role="cell">
          {{ formatSpeed(torrent.dlspeed) }}
        </div>

        <div class="ttable__cell ttable__num is-up" role="cell">
          {{ formatSpeed(torrent.upspeed) }}
        </div>

        <div class="ttable__cell ttable__num" role="cell">{{ formatEta(torrent.eta) }}</div>

        <div v-if="!compact" class="ttable__cell ttable__num" role="cell">
          {{ formatRatio(torrent.ratio) }}
        </div>

        <div v-if="!compact" class="ttable__cell" role="cell">
          <TorrentStateBadge :state="torrent.state" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ttable {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}

.ttable__header,
.ttable__row {
  display: grid;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  min-width: 0;
}

.ttable__header {
  height: 34px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-hover);
  position: sticky;
  top: 0;
  z-index: 5;
}

.ttable__th {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border: none;
  background: transparent;
  padding: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ttable__th:hover {
  color: var(--text-primary);
}

.ttable__sort {
  color: var(--accent);
  font-size: 9px;
}

.ttable__body {
  display: flex;
  flex-direction: column;
}

.ttable__row {
  /* min-height rather than height: a row with tags is two lines and needs more
     room than one without, and a fixed height squeezed the two-line case.
     40px left only 5px of breathing space around name + tag. */
  min-height: 52px;
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--separator);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease);
}

.ttable__row:hover {
  background: var(--bg-hover);
}

.ttable__row.is-selected {
  background: var(--bg-selected);
}

.ttable__cell {
  min-width: 0;
  font-size: var(--text-base);
}

.ttable__cell--check {
  display: grid;
  place-items: center;
}

.ttable__checkbox {
  display: grid;
  place-items: center;
}

.ttable__checkbox input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}

.ttable__cell--name {
  display: flex;
  flex-direction: column;
  /* Was 1px, which let a long title visually collide with the tag beneath it.
     The name column is the one thing a user actually reads, so it gets the
     room. */
  gap: var(--space-1);
  justify-content: center;
}

.ttable__name {
  font-weight: 500;
  line-height: 1.35;
}

.ttable__category {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.ttable__num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}

.ttable__num.is-down {
  color: var(--state-download);
}

.ttable__num.is-up {
  color: var(--state-upload);
}
</style>