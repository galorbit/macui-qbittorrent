<script setup lang="ts">
/**
 * MacCard — a rounded, optionally frosted surface.
 *
 * `glass` applies the backdrop-blur treatment. It is intentionally opt-in per
 * card: blurring every card in a long torrent list is a measurable GPU cost on
 * mobile, so only chrome (sidebar, toolbar, modals) and a handful of summary
 * cards use it.
 */
withDefaults(
  defineProps<{
    glass?: boolean
    /** Removes inner padding for flush content such as tables. */
    flush?: boolean
    /** Adds hover elevation — use for clickable cards only. */
    interactive?: boolean
    padding?: 'none' | 'sm' | 'md' | 'lg'
  }>(),
  {
    glass: false,
    flush: false,
    interactive: false,
    padding: 'md',
  },
)
</script>

<template>
  <div
    class="mac-card"
    :class="[
      glass ? 'glass-panel' : 'mac-card--solid',
      `mac-card--pad-${padding}`,
      { 'mac-card--flush': flush, 'mac-card--interactive': interactive },
    ]"
  >
    <header v-if="$slots.header" class="mac-card__header">
      <slot name="header" />
    </header>
    <div class="mac-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="mac-card__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.mac-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.mac-card--solid {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
}

.mac-card--pad-none {
  padding: 0;
}
.mac-card--pad-sm {
  padding: var(--space-3);
}
.mac-card--pad-md {
  padding: var(--space-4);
}
.mac-card--pad-lg {
  padding: var(--space-6);
}

.mac-card--flush {
  padding: 0;
}

.mac-card--interactive {
  cursor: pointer;
  transition:
    transform var(--duration) var(--ease),
    box-shadow var(--duration) var(--ease),
    border-color var(--duration) var(--ease);
}

.mac-card--interactive:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.mac-card--interactive:active {
  transform: scale(0.995);
}

.mac-card__header {
  padding: var(--space-4);
  padding-bottom: var(--space-3);
  font-weight: 600;
  font-size: var(--text-md);
  border-bottom: 1px solid var(--separator);
}

.mac-card--flush .mac-card__header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--separator);
}

.mac-card__body {
  min-width: 0;
}

.mac-card--flush .mac-card__body {
  padding: 0;
}

.mac-card__footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--separator);
  background: var(--bg-hover);
}
</style>