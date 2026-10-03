<script setup lang="ts">
/**
 * MacBadge — small rounded pill for statuses, categories and tags.
 */
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
    size?: 'sm' | 'md'
    /** Adds a leading dot, used by the connection status indicator. */
    dot?: boolean
    title?: string
  }>(),
  { tone: 'neutral', size: 'sm', dot: false, title: undefined },
)
</script>

<template>
  <span class="mac-badge" :class="[`mac-badge--${tone}`, `mac-badge--${size}`]" :title="title">
    <span v-if="dot" class="mac-badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.mac-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border-radius: var(--radius-pill);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mac-badge--sm {
  height: 18px;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
}

.mac-badge--md {
  height: 22px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.mac-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

.mac-badge--neutral {
  background: var(--bg-active);
  color: var(--text-secondary);
}

.mac-badge--accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.mac-badge--success {
  background: var(--success-soft);
  color: var(--success);
}

.mac-badge--warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.mac-badge--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.mac-badge--info {
  background: color-mix(in srgb, var(--info) 16%, transparent);
  color: var(--info);
}
</style>