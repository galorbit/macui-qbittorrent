<script setup lang="ts">
/**
 * MacInput — text/search/number input with the macOS inset look.
 *
 * Type note: the model is always a *string* internally, even for numeric
 * fields. HTML inputs only ever produce strings, so coercing in the component
 * keeps `v-model` symmetric (a number model would otherwise drift out of sync
 * the moment the user clears the field). Numeric callers bind with a computed
 * or use `.number` on a string model.
 */
const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    type?: 'text' | 'password' | 'search' | 'number' | 'url'
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    autofocus?: boolean
    id?: string
    /** Renders a monospace font — for hashes and paths. */
    mono?: boolean
    /** Field-level error message. */
    error?: string
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'search' | 'url' | 'email'
    min?: number
    max?: number
    step?: number
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    disabled: false,
    readonly: false,
    autofocus: false,
    id: undefined,
    mono: false,
    error: undefined,
    autocomplete: undefined,
    inputmode: undefined,
    min: undefined,
    max: undefined,
    step: undefined,
  },
)
</script>

<template>
  <div class="mac-input-wrap">
    <span v-if="$slots.prefix" class="mac-input__affix mac-input__affix--prefix">
      <slot name="prefix" />
    </span>
    <input
      :id="id"
      v-model="model"
      class="mac-input"
      :class="{ 'mac-input--mono': mono, 'mac-input--error': !!error }"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autofocus="autofocus"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :min="min"
      :max="max"
      :step="step"
      :aria-invalid="error ? 'true' : undefined"
      :aria-errormessage="error && id ? `${id}-error` : undefined"
    />
    <span v-if="$slots.suffix" class="mac-input__affix mac-input__affix--suffix">
      <slot name="suffix" />
    </span>
  </div>
  <p v-if="error" :id="id ? `${id}-error` : undefined" class="mac-input__error" role="alert">
    {{ error }}
  </p>
</template>

<style scoped>
.mac-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.mac-input {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--text-base);
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.mac-input::placeholder {
  color: var(--text-tertiary);
}

.mac-input:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.mac-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mac-input:disabled {
  opacity: 0.55;
  cursor: default;
  background: var(--bg-hover);
}

.mac-input--mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.mac-input--error {
  border-color: var(--danger);
}

.mac-input--error:focus {
  box-shadow: 0 0 0 3px var(--danger-soft);
}

/* Affixes sit inside the field. */
.mac-input__affix {
  position: absolute;
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
  pointer-events: none;
  font-size: var(--text-base);
}

.mac-input__affix--prefix {
  left: var(--space-3);
}

.mac-input__affix--suffix {
  right: var(--space-3);
}

.mac-input-wrap:has(.mac-input__affix--prefix) .mac-input {
  padding-left: calc(var(--space-3) * 2 + 14px);
}

.mac-input-wrap:has(.mac-input__affix--suffix) .mac-input {
  padding-right: calc(var(--space-3) * 2 + 14px);
}

.mac-input__error {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--danger);
}

/* iOS zooms the page when focusing an input smaller than 16px. */
@media (max-width: 599px) {
  .mac-input {
    font-size: 16px;
    height: 38px;
  }
}
</style>