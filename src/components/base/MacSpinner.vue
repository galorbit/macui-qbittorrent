<script setup lang="ts">
/**
 * MacSpinner — indeterminate loading indicator.
 */
withDefaults(defineProps<{ size?: number; label?: string }>(), {
  size: 18,
  label: undefined,
})
</script>

<template>
  <span class="mac-spinner-wrap" role="status" :aria-label="label ?? 'Loading'">
    <span class="mac-spinner" :style="{ width: `${size}px`, height: `${size}px` }" />
    <span v-if="label" class="mac-spinner__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.mac-spinner-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.mac-spinner {
  display: block;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: mac-spin 0.7s linear infinite;
  flex: none;
}

@keyframes mac-spin {
  to {
    transform: rotate(360deg);
  }
}

.mac-spinner__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
</style>