<script setup lang="ts">
/**
 * MacProgress — slim rounded progress bar.
 *
 * Colour follows the torrent's state tone so the list reads at a glance:
 * green while downloading, blue while seeding, amber when stalled, etc.
 * Uses a transform-based indicator (not width) so it animates on the
 * compositor and stays smooth with hundreds of rows updating at once.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 0..1 */
    value: number
    tone?: 'download' | 'upload' | 'paused' | 'error' | 'stalled' | 'queued' | 'checking'
    height?: number
    /** Shows the percentage inside the track. */
    showLabel?: boolean
  }>(),
  { tone: 'download', height: 6, showLabel: false },
)

const clamped = computed(() => Math.min(1, Math.max(0, props.value || 0)))
const percent = computed(() => `${(clamped.value * 100).toFixed(1)}%`)

const color = computed(() => {
  const map: Record<string, string> = {
    download: 'var(--state-download)',
    upload: 'var(--state-upload)',
    paused: 'var(--state-paused)',
    error: 'var(--state-error)',
    stalled: 'var(--state-stalled)',
    queued: 'var(--state-queued)',
    checking: 'var(--state-checking)',
  }
  return map[props.tone] ?? map.download
})
</script>

<template>
  <div class="mac-progress" :style="{ height: `${height}px` }">
    <div
      class="mac-progress__track"
      role="progressbar"
      :aria-valuenow="Math.round(clamped * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="percent"
    >
      <div
        class="mac-progress__fill"
        :style="{ transform: `scaleX(${clamped})`, backgroundColor: color }"
      />
    </div>
    <span v-if="showLabel" class="mac-progress__label">{{ percent }}</span>
  </div>
</template>

<style scoped>
.mac-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.mac-progress__track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--bg-active);
  overflow: hidden;
}

.mac-progress__fill {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-pill);
  transform-origin: left center;
  /* Short transition smooths the per-poll jumps without lagging behind. */
  transition: transform var(--duration) var(--ease);
  will-change: transform;
}

.mac-progress__label {
  flex: none;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  min-width: 44px;
  text-align: right;
}
</style>