<script setup lang="ts">
/**
 * MacSelect — native <select> styled to match macOS.
 *
 * Deliberately a native control: it gets the platform's own picker on mobile
 * (which is far better than any custom dropdown), is keyboard accessible for
 * free, and cannot be clipped by an overflow container.
 */
const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    options: Array<{ value: string; label: string }>
    placeholder?: string
    disabled?: boolean
    id?: string
    ariaLabel?: string
  }>(),
  { placeholder: undefined, disabled: false, id: undefined, ariaLabel: undefined },
)
</script>

<template>
  <div class="mac-select">
    <select
      :id="id"
      v-model="model"
      class="mac-select__control"
      :disabled="disabled"
      :aria-label="ariaLabel"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <svg class="mac-select__chevron" viewBox="0 0 10 6" aria-hidden="true">
      <path
        d="M1 1l4 4 4-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
.mac-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.mac-select__control {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 calc(var(--space-5) + 6px) 0 var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--text-base);
  cursor: pointer;
  text-overflow: ellipsis;
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.mac-select__control:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.mac-select__control:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mac-select__control:disabled {
  opacity: 0.55;
  cursor: default;
}

.mac-select__chevron {
  position: absolute;
  right: var(--space-3);
  width: 10px;
  height: 6px;
  color: var(--text-tertiary);
  pointer-events: none;
}

@media (max-width: 599px) {
  .mac-select__control {
    height: 38px;
    font-size: 16px;
  }
}
</style>