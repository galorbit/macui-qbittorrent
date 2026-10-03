<script setup lang="ts">
/**
 * MacSegmented — the macOS segmented control.
 *
 * Used for the status filter (All / Downloading / Seeding …). On narrow
 * screens it scrolls horizontally rather than wrapping, which keeps the
 * control on one line and avoids reflow jitter as counts change.
 *
 * Rendered as a radiogroup so arrow keys move between options.
 *
 * An option may carry `icon` (a name the CALLER renders via the #icon slot) and
 * `tone`. The component stays icon-agnostic on purpose: it does not import an
 * icon set, so callers keep full control of the artwork.
 */
const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    options: Array<{ value: string; label: string; count?: number; icon?: string; tone?: string }>
    ariaLabel?: string
  }>(),
  { ariaLabel: undefined },
)

function onKeydown(event: KeyboardEvent, index: number): void {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()

  let next = index
  if (event.key === 'ArrowLeft') next = (index - 1 + props.options.length) % props.options.length
  else if (event.key === 'ArrowRight') next = (index + 1) % props.options.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = props.options.length - 1

  model.value = props.options[next].value
  const el = document.getElementById(`seg-${props.options[next].value}`)
  el?.focus()
}
</script>

<template>
  <div class="mac-segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(option, index) in options"
      :id="`seg-${option.value}`"
      :key="option.value"
      type="button"
      role="radio"
      class="mac-segmented__item"
      :class="[{ 'is-active': model === option.value }, option.tone ? `is-${option.tone}` : '']"
      :aria-checked="model === option.value"
      :tabindex="model === option.value ? 0 : -1"
      @click="model = option.value"
      @keydown="onKeydown($event, index)"
    >
      <!-- Caller-supplied icon artwork, keyed by option.icon. -->
      <span v-if="option.icon" class="mac-segmented__icon" aria-hidden="true">
        <slot name="icon" :icon="option.icon" :tone="option.tone" />
      </span>
      <span class="mac-segmented__label">{{ option.label }}</span>
      <span v-if="option.count !== undefined" class="mac-segmented__count">{{ option.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.mac-segmented {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-active);
  border: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
  max-width: 100%;
}

.mac-segmented::-webkit-scrollbar {
  display: none;
}

.mac-segmented__item {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 26px;
  padding: 0 var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.mac-segmented__item:hover:not(.is-active) {
  color: var(--text-primary);
}

.mac-segmented__item.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
}

/* ---- Per-option icon ----
   The icon is tinted by tone even when the chip is inactive, so the row is
   scannable by colour, and brightens when active. */
.mac-segmented__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease);
}

.mac-segmented__item.is-download .mac-segmented__icon {
  color: var(--state-download);
}

.mac-segmented__item.is-upload .mac-segmented__icon {
  color: var(--state-upload);
}

.mac-segmented__item.is-success .mac-segmented__icon {
  color: var(--success);
}

.mac-segmented__item.is-danger .mac-segmented__icon {
  color: var(--danger);
}

.mac-segmented__item.is-paused .mac-segmented__icon,
.mac-segmented__item.is-muted .mac-segmented__icon {
  color: var(--state-paused);
}

.mac-segmented__item.is-active .mac-segmented__icon {
  color: currentColor;
}

.mac-segmented__count {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-pill);
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

.mac-segmented__item.is-active .mac-segmented__count {
  color: var(--text-secondary);
}

@media (max-width: 599px) {
  .mac-segmented__item {
    height: 32px;
  }
}
</style>