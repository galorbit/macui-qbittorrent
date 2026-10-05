<script setup lang="ts">
/**
 * TorrentCard — the mobile representation of a torrent.
 *
 * A wide data table is unusable on a phone, so below the mobile breakpoint the
 * dashboard renders these cards instead. The card surfaces the same
 * information hierarchy a user scans for: name, progress, speed, ETA/ratio.
 *
 * The whole card is the tap target (opening details); selection is a separate
 * affordance so a tap never accidentally mutates state.
 *
 * SELECTION ON TOUCH
 * ------------------
 * The checkbox is hidden until selection mode is on, and selection mode used to
 * be reachable only from controls that were themselves hidden until something
 * was selected — so on a phone it could never be entered and every multi-select
 * action was dead. Entering it now works two ways:
 *
 *   - long-press a card (the conventional touch gesture), and
 *   - the dashboard's Select control, which is always visible on mobile.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Torrent } from '@/types/api'
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  stateTone,
} from '@/utils/format'
import MacProgress from '@/components/base/MacProgress.vue'
import TorrentStateBadge from '@/components/torrent/TorrentStateBadge.vue'

const props = defineProps<{
  torrent: Torrent
  selected?: boolean
  selectionMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', hash: string): void
  (e: 'toggle-select', hash: string): void
  (e: 'enter-selection', hash: string): void
  /** Long-press with selection mode already on, for the actions menu. */
  (e: 'context-menu', point: { x: number; y: number }): void
}>()

const { t } = useI18n()

const tone = computed(() => stateTone(props.torrent.state))
const isActivelyTransferring = computed(
  () => props.torrent.dlspeed > 0 || props.torrent.upspeed > 0,
)

const metaLine = computed(() => {
  const tr = props.torrent
  return `${formatBytes(tr.size)} · ${formatRatio(tr.ratio)} ${t('torrent.ratio')}`
})

// ---- Long-press to select -------------------------------------------------
//
// 500 ms is long enough not to fire during a normal tap-scroll, short enough
// not to feel broken. A moved finger or an early release cancels it, so a
// scroll gesture never turns into a selection.
const LONG_PRESS_MS = 500
let pressTimer: ReturnType<typeof setTimeout> | null = null
const pressing = ref(false)
/** Where the finger went down, so the menu can open near it. */
let pressOrigin = { x: 0, y: 0 }

function clearPress(): void {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
  pressing.value = false
}

function onPointerDown(event: PointerEvent): void {
  // Mouse users get a real right-click; this is the touch equivalent.
  if (event.pointerType === 'mouse') return
  clearPress()
  pressing.value = true
  pressOrigin = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => {
    pressTimer = null
    pressing.value = false
    /*
     * Second long-press opens the actions menu; the first one enters selection
     * mode. Both are needed: entering selection mode is the only way to reach
     * bulk actions on a phone, and the menu is the only way to reach the
     * single-torrent actions that the desktop table offers on right-click.
     */
    if (props.selectionMode) emit('context-menu', pressOrigin)
    else emit('enter-selection', props.torrent.hash)
  }, LONG_PRESS_MS)
}

/** Cancel if the finger moved enough to be a scroll. */
function onPointerMove(event: PointerEvent): void {
  if (!pressing.value) return
  if (event.movementX * event.movementX + event.movementY * event.movementY > 64) clearPress()
}

onBeforeUnmount(clearPress)
</script>

<template>
  <article
    class="torrent-card"
    :class="{ 'is-selected': selected, 'is-active': isActivelyTransferring }"
    role="button"
    tabindex="0"
    :aria-label="torrent.name"
    @click="emit('open', torrent.hash)"
    @keydown.enter.prevent="emit('open', torrent.hash)"
    @keydown.space.prevent="emit('open', torrent.hash)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="clearPress"
    @pointercancel="clearPress"
    @pointerleave="clearPress"
    @contextmenu.prevent
  >
    <div class="torrent-card__head">
      <button
        v-if="selectionMode"
        type="button"
        class="torrent-card__check"
        :class="{ 'is-checked': selected }"
        :aria-label="t('torrent.select', { name: torrent.name })"
        :aria-pressed="selected"
        @click.stop="emit('toggle-select', torrent.hash)"
      >
        <svg v-if="selected" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <h3 class="torrent-card__name break-anywhere">{{ torrent.name }}</h3>
      <TorrentStateBadge :state="torrent.state" />
    </div>

    <MacProgress :value="torrent.progress" :tone="tone" :height="6" />

    <div class="torrent-card__stats">
      <div class="torrent-card__stat">
        <span class="torrent-card__stat-label">{{ t('torrent.progress') }}</span>
        <span class="torrent-card__stat-value">{{ formatPercent(torrent.progress, 0) }}</span>
      </div>

      <div class="torrent-card__stat">
        <span class="torrent-card__stat-label">{{ t('stats.download') }}</span>
        <span class="torrent-card__stat-value is-down">
          {{ formatSpeed(torrent.dlspeed) }}
        </span>
      </div>

      <div class="torrent-card__stat">
        <span class="torrent-card__stat-label">{{ t('stats.upload') }}</span>
        <span class="torrent-card__stat-value is-up">
          {{ formatSpeed(torrent.upspeed) }}
        </span>
      </div>

      <div class="torrent-card__stat">
        <span class="torrent-card__stat-label">{{ t('torrent.eta') }}</span>
        <span class="torrent-card__stat-value">{{ formatEta(torrent.eta) }}</span>
      </div>
    </div>

    <p class="torrent-card__meta truncate">
      {{ metaLine }}
      <template v-if="torrent.category">
        · {{ torrent.category }}
      </template>
    </p>
  </article>
</template>

<style scoped>
.torrent-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
}

.torrent-card:active {
  background: var(--bg-hover);
}

.torrent-card.is-selected {
  border-color: var(--accent);
  background: var(--bg-selected);
}

.torrent-card__head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.torrent-card__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-tight);
  /* Two lines then ellipsis: enough to identify, bounded height. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.torrent-card__check {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-strong);
  background: transparent;
  color: #fff;
  cursor: pointer;
}

.torrent-card__check.is-checked {
  background: var(--accent);
  border-color: var(--accent);
}

.torrent-card__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.torrent-card__stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.torrent-card__stat-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.torrent-card__stat-value {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.torrent-card__stat-value.is-down {
  color: var(--state-download);
}

.torrent-card__stat-value.is-up {
  color: var(--state-upload);
}

.torrent-card__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
</style>