/**
 * Toast notifications.
 *
 * A tiny module-level store rather than a provider, so any component (or a
 * non-component helper) can raise a message without prop drilling.
 */
import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 1

/** Errors stay a little longer because they usually need reading. */
const DURATIONS: Record<ToastTone, number> = {
  info: 3200,
  success: 3200,
  warning: 5000,
  danger: 6500,
}

function push(tone: ToastTone, message: string): number {
  const id = nextId++
  toasts.value = [...toasts.value, { id, tone, message }]
  const duration = DURATIONS[tone] ?? 3500
  setTimeout(() => dismiss(id), duration)
  return id
}

export function dismiss(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

export function useToast() {
  return {
    toasts,
    notify: (message: string, tone: ToastTone = 'info') => push(tone, message),
    success: (message: string) => push('success', message),
    warning: (message: string) => push('warning', message),
    error: (message: string) => push('danger', message),
    dismiss,
  }
}

/**
 * Convert an unknown thrown value into a user-facing message.
 *
 * qBittorrent reports API problems as plain-text bodies, and network failures
 * as status 0; both should read sensibly rather than dumping a stack trace.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (/Network unreachable/i.test(error.message)) {
      return 'Cannot reach qBittorrent. Check the connection and try again.'
    }
    if (/timed out/i.test(error.message)) {
      return 'The request timed out.'
    }
    if (/banned/i.test(error.message)) {
      return error.message
    }
    return error.message
  }
  if (typeof error === 'string' && error.trim()) return error
  return 'Something went wrong.'
}