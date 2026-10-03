<script setup lang="ts">
/**
 * MacToggle — the iOS/macOS switch.
 *
 * Implemented as a real checkbox so it is keyboard-operable and announced
 * correctly by screen readers, with the track/knob drawn via pseudo-elements.
 */
const model = defineModel<boolean>({ default: false })

withDefaults(
  defineProps<{
    disabled?: boolean
    label?: string
    id?: string
  }>(),
  { disabled: false, label: undefined, id: undefined },
)
</script>

<template>
  <label class="mac-toggle" :class="{ 'is-disabled': disabled }">
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      class="mac-toggle__input"
      :disabled="disabled"
      role="switch"
      :aria-checked="model"
    />
    <span class="mac-toggle__track" aria-hidden="true">
      <span class="mac-toggle__knob" />
    </span>
    <span v-if="label" class="mac-toggle__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.mac-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}

.mac-toggle.is-disabled {
  opacity: 0.5;
  cursor: default;
}

.mac-toggle__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.mac-toggle__track {
  position: relative;
  flex: none;
  width: 40px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  transition: background-color var(--duration) var(--ease);
}

.mac-toggle__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform var(--duration) var(--ease-out);
}

.mac-toggle__input:checked + .mac-toggle__track {
  background: var(--success);
}

.mac-toggle__input:checked + .mac-toggle__track .mac-toggle__knob {
  transform: translateX(16px);
}

.mac-toggle__input:focus-visible + .mac-toggle__track {
  outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.mac-toggle__label {
  font-size: var(--text-base);
  color: var(--text-primary);
}
</style>