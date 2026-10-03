<script setup lang="ts">
/**
 * ToastHost — renders the active toast stack.
 *
 * Positioned bottom-centre on mobile (above the tab bar) and bottom-right on
 * desktop, so it never covers primary controls.
 */
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast glass-panel"
          :class="`toast--${toast.tone}`"
          role="status"
        >
          <span class="toast__message break-anywhere">{{ toast.message }}</span>
          <button
            type="button"
            class="toast__close"
            :aria-label="t('action.dismiss')"
            @click="dismiss(toast.id)"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
  /* Desktop: bottom-right. */
  right: var(--space-5);
  bottom: var(--space-5);
  max-width: min(380px, calc(100vw - 2 * var(--space-5)));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  pointer-events: auto;
  border-left: 3px solid var(--border-strong);
}

.toast__message {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-base);
}

.toast__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.toast__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toast--info {
  border-left-color: var(--accent);
}
.toast--success {
  border-left-color: var(--success);
}
.toast--warning {
  border-left-color: var(--warning);
}
.toast--danger {
  border-left-color: var(--danger);
}

/* Mobile: sit above the tab bar, centred. */
@media (max-width: 599px) {
  .toast-host {
    right: var(--space-3);
    left: var(--space-3);
    bottom: calc(var(--space-3) + 56px + env(safe-area-inset-bottom, 0px));
    max-width: none;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--duration) var(--ease),
    transform var(--duration-slow) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
</style>
