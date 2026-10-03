<script setup lang="ts">
/**
 * MacEmptyState — placeholder for "nothing here" situations.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    compact?: boolean
  }>(),
  { description: undefined, compact: false },
)
</script>

<template>
  <div class="mac-empty" :class="{ 'mac-empty--compact': compact }">
    <div v-if="$slots.icon" class="mac-empty__icon" aria-hidden="true">
      <slot name="icon" />
    </div>
    <p class="mac-empty__title">{{ title }}</p>
    <p v-if="description" class="mac-empty__description">{{ description }}</p>
    <div v-if="$slots.action" class="mac-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.mac-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-6);
  text-align: center;
  color: var(--text-secondary);
}

.mac-empty--compact {
  padding: var(--space-6) var(--space-4);
}

.mac-empty__icon {
  color: var(--text-tertiary);
  opacity: 0.6;
  margin-bottom: var(--space-2);
}

.mac-empty__title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--text-primary);
}

.mac-empty__description {
  font-size: var(--text-base);
  max-width: 42ch;
  overflow-wrap: anywhere;
}

.mac-empty__action {
  margin-top: var(--space-3);
}
</style>