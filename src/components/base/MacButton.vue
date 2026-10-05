<script setup lang="ts">
/**
 * MacButton — macOS-style push button.
 *
 * Variants mirror the AppKit look: `primary` (filled accent), `secondary`
 * (subtle grey fill), `ghost` (borderless), `danger` (destructive).
 * `pill` gives the fully rounded capsule used in toolbars.
 *
 * Touch target: min-height 32px on desktop, 44px on touch layouts, which is
 * the documented minimum comfortable hit area.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    pill?: boolean
    block?: boolean
    disabled?: boolean
    loading?: boolean
    /** Renders as an <a> when set. */
    href?: string
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    pill: false,
    block: false,
    disabled: false,
    loading: false,
    href: undefined,
    type: 'button',
  },
)

const tag = computed(() => (props.href ? 'a' : 'button'))
const isInert = computed(() => props.disabled || props.loading)

const classes = computed(() => [
  'mac-btn',
  `mac-btn--${props.variant}`,
  `mac-btn--${props.size}`,
  {
    'mac-btn--pill': props.pill,
    'mac-btn--block': props.block,
    'is-loading': props.loading,
  },
])
</script>

<template>
  <component
    :is="tag"
    :class="classes"
    :href="href"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? isInert : undefined"
    :aria-disabled="isInert || undefined"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="mac-btn__spinner" aria-hidden="true" />
    <slot name="icon" />
    <span v-if="$slots.default" class="mac-btn__label"><slot /></span>
  </component>
</template>

<style scoped>
.mac-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-weight: 500;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  text-decoration: none;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease),
    opacity var(--duration-fast) var(--ease);
}

.mac-btn:hover {
  text-decoration: none;
}

/* Subtle press feedback, like AppKit buttons. */
.mac-btn:active:not([aria-disabled='true']) {
  transform: scale(0.975);
}

.mac-btn[aria-disabled='true'] {
  opacity: 0.5;
  cursor: default;
  pointer-events: none;
}

/* ---- Sizes ------------------------------------------------------------ */
.mac-btn--sm {
  height: 26px;
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
}

.mac-btn--md {
  height: 32px;
  padding: 0 var(--space-3);
}

.mac-btn--lg {
  height: 40px;
  padding: 0 var(--space-5);
  font-size: var(--text-md);
}

/* ---- Variants --------------------------------------------------------- */
/*
 * Primary uses `--accent-fill`, not `--accent`.
 *
 * The label is white, and white on the light theme's #007aff measures only
 * 4.02:1 — the button failed AA on its own text. `--accent-fill` is the same
 * accent darkened just enough to clear it, and is identical to `--accent` in
 * dark mode where no adjustment is needed.
 */
.mac-btn--primary {
  background: var(--accent-fill);
  color: var(--on-accent);
  border-color: transparent;
  box-shadow: var(--shadow-xs);
}

.mac-btn--primary:hover {
  background: var(--accent-hover);
}

.mac-btn--primary:active {
  background: var(--accent-pressed);
}

.mac-btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border);
  box-shadow: var(--shadow-xs);
}

.mac-btn--secondary:hover {
  background: var(--bg-hover);
}

.mac-btn--secondary:active {
  background: var(--bg-active);
}

.mac-btn--ghost {
  background: transparent;
  color: var(--text-primary);
}

.mac-btn--ghost:hover {
  background: var(--bg-hover);
}

.mac-btn--ghost:active {
  background: var(--bg-active);
}

/* Destructive buttons carry white text, so they use the darkened fill that lets
   that text clear AA; `--danger` keeps its vivid value for dots and borders. */
.mac-btn--danger {
  background: var(--danger-fill);
  color: #fff;
}

.mac-btn--danger:hover {
  filter: brightness(1.08);
}

.mac-btn--danger:active {
  filter: brightness(0.94);
}

/* ---- Modifiers -------------------------------------------------------- */
.mac-btn--pill {
  border-radius: var(--radius-pill);
}

.mac-btn--block {
  width: 100%;
}

/* ---- Loading spinner -------------------------------------------------- */
.mac-btn__spinner {
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: mac-btn-spin 0.7s linear infinite;
  flex: none;
}

@keyframes mac-btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.mac-btn__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* On touch-sized layouts, guarantee an accessible hit area. */
@media (max-width: 599px) {
  .mac-btn--sm,
  .mac-btn--md {
    min-height: 36px;
  }

  .mac-btn--lg {
    min-height: 44px;
  }
}
</style>