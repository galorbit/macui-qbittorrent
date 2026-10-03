<script setup lang="ts">
/**
 * MacModal — a centred, rounded, frosted dialog.
 *
 * Handles the things dialogs habitually get wrong:
 *   - focus trap while open, and focus restored to the trigger on close
 *   - Escape to dismiss
 *   - body scroll lock (so the page behind does not scroll on mobile)
 *   - on mobile it becomes a bottom sheet, which is far easier to reach
 *     one-handed than a centred box.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useBreakpoint } from '@/composables/useBreakpoint'

const props = withDefaults(
  defineProps<{
    title?: string
    /** Prevents dismissal via Escape / backdrop click. */
    persistent?: boolean
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { title: undefined, persistent: false, size: 'md' },
)

const open = defineModel<boolean>('open', { default: false })

const { isMobile } = useBreakpoint()

const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null
let originalOverflow = ''

function focusables(): HTMLElement[] {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !props.persistent) {
    event.stopPropagation()
    open.value = false
    return
  }
  if (event.key !== 'Tab') return

  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey && (active === first || !dialogRef.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function lockScroll(): void {
  originalOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockScroll(): void {
  document.body.style.overflow = originalOverflow
}

watch(open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement as HTMLElement | null
    lockScroll()
    document.addEventListener('keydown', onKeydown, true)
    await nextTick()
    const items = focusables()
    ;(items[0] ?? dialogRef.value)?.focus()
  } else {
    document.removeEventListener('keydown', onKeydown, true)
    unlockScroll()
    // Return focus where the user left it.
    previouslyFocused?.focus?.()
    previouslyFocused = null
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  if (open.value) unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="mac-modal">
      <div
        v-if="open"
        class="mac-modal"
        :class="{ 'mac-modal--sheet': isMobile }"
        role="presentation"
        @click.self="!persistent && (open = false)"
      >
        <div
          ref="dialogRef"
          class="mac-modal__dialog glass-panel"
          :class="[`mac-modal__dialog--${size}`, { 'mac-modal__dialog--sheet': isMobile }]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <div v-if="isMobile" class="mac-modal__grabber" aria-hidden="true" />

          <header v-if="title || $slots.header" class="mac-modal__header">
            <slot name="header">
              <h2 class="mac-modal__title">{{ title }}</h2>
            </slot>
            <button
              type="button"
              class="mac-modal__close"
              aria-label="Close"
              @click="open = false"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </header>

          <div class="mac-modal__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="mac-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mac-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(0, 0, 0, 0.32);
  /* Overlay itself gets a light blur for depth. */
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mac-modal {
    background: rgba(0, 0, 0, 0.5);
  }
}

.mac-modal__dialog {
  width: 100%;
  max-height: calc(100vh - 2 * var(--space-6));
  display: flex;
  flex-direction: column;
  background: var(--glass-solid);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.mac-modal__dialog--sm {
  max-width: 380px;
}
.mac-modal__dialog--md {
  max-width: 520px;
}
.mac-modal__dialog--lg {
  max-width: 760px;
}

/* ---- Mobile: present as a bottom sheet -------------------------------- */
.mac-modal--sheet {
  align-items: flex-end;
  padding: 0;
}

.mac-modal__dialog--sheet {
  max-width: 100%;
  max-height: 88vh;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.mac-modal__grabber {
  width: 36px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  margin: var(--space-2) auto 0;
  flex: none;
}

.mac-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--separator);
  flex: none;
}

.mac-modal__title {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mac-modal__close {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--bg-active);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease);
}

.mac-modal__close:hover {
  background: var(--border-strong);
  color: var(--text-primary);
}

.mac-modal__body {
  padding: var(--space-5);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
  min-height: 0;
}

.mac-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--separator);
  background: var(--bg-hover);
  flex: none;
}

/* Stack footer buttons full-width on mobile for comfortable tapping. */
@media (max-width: 599px) {
  .mac-modal__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}

/* ---- Transition ------------------------------------------------------- */
.mac-modal-enter-active,
.mac-modal-leave-active {
  transition: opacity var(--duration) var(--ease);
}

.mac-modal-enter-active .mac-modal__dialog,
.mac-modal-leave-active .mac-modal__dialog {
  transition:
    transform var(--duration-slow) var(--ease-out),
    opacity var(--duration) var(--ease);
}

.mac-modal-enter-from,
.mac-modal-leave-to {
  opacity: 0;
}

.mac-modal-enter-from .mac-modal__dialog,
.mac-modal-leave-to .mac-modal__dialog {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

.mac-modal--sheet.mac-modal-enter-from .mac-modal__dialog,
.mac-modal--sheet.mac-modal-leave-to .mac-modal__dialog {
  transform: translateY(100%);
}
</style>