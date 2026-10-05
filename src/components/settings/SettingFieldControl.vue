<script setup lang="ts">
/**
 * SettingFieldControl — renders one preference from the schema.
 *
 * Keeping the rendering in a single component means the schema stays purely
 * declarative, and every field automatically inherits the same behaviour:
 * disabled-when-dependency-off, min/max clamping, unit suffixes and hints.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettingField } from '@/config/settings-schema'
import MacInput from '@/components/base/MacInput.vue'
import MacNumberInput from '@/components/base/MacNumberInput.vue'
import MacToggle from '@/components/base/MacToggle.vue'
import MacSelect from '@/components/base/MacSelect.vue'

const props = defineProps<{
  field: SettingField
  /** Current value, already converted for display. */
  modelValue: unknown
  /** True when this field's `enabledBy` dependency is currently off. */
  dependencyOff?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void
}>()

const { t } = useI18n()

/** i18n key for the field label. */
const labelKey = computed(() => `settings.field.${props.field.key}`)

const label = computed(() => {
  const key = labelKey.value
  const translated = t(key)
  // vue-i18n echoes the key when a translation is missing; fall back to the
  // raw API key rather than showing "settings.field.some_key" to the user.
  return translated === key ? prettify(props.field.key) : translated
})

/** Turn `max_active_downloads` into "Max active downloads". */
function prettify(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const hint = computed(() => {
  if (!props.field.hintKey) return ''
  const translated = t(props.field.hintKey)
  return translated === props.field.hintKey ? '' : translated
})

/**
 * The value is stored in BYTES (see fromApi/toApi) and only scaled for display,
 * so the conversion here is lossless: the underlying number is never rewritten.
 *
 * Rounding for display is fine — nothing is saved from the displayed text. Doing
 * this in fromApi/toApi was the bug: it destroyed any value below 512 B/s.
 */
const KIB = 1024

/**
 * The unit this field is displayed in, chosen from the RAW value.
 *
 * This is deliberately separate from the rounded display number. The setter
 * below must multiply by a factor that is a function of the stored value, not of
 * the rounded text — deriving it from the display is what made the round trip
 * lossy: 1500 B/s displays as "1.46 KiB/s", and reading that text back in KiB
 * gave `trunc(1.46 * 1024)` = 1495. Every byte setting silently drifted a few
 * bytes (or more: 1500000 → 1499463) whenever the field was edited.
 */
const byteUnit = computed(() => {
  const raw = Number(props.modelValue ?? 0)
  const unit = props.field.unit
  if (unit !== 'bytesPerSec' && unit !== 'bytes') return { factor: 1, suffix: '' }
  const suffix = unit === 'bytesPerSec' ? '/s' : ''
  if (raw >= KIB * KIB) return { factor: KIB * KIB, suffix: `MiB${suffix}` }
  if (raw >= KIB) return { factor: KIB, suffix: `KiB${suffix}` }
  return { factor: 1, suffix: `B${suffix}` }
})

/** Bytes -> the number shown in the input, in that unit. */
const byteDisplay = computed(() => {
  const raw = Number(props.modelValue ?? 0)
  const { factor, suffix } = byteUnit.value
  if (factor === 1) return { value: Number.isFinite(raw) ? raw : 0, suffix }
  // Two decimals: enough to be readable, and the exact value is preserved on
  // write-back by `toBytes` below rather than by this rounding.
  return { value: Math.round((raw / factor) * 100) / 100, suffix }
})

/**
 * A displayed number -> bytes, without losing the stored value.
 *
 * If the user did not actually change the text (the common case: they edit some
 * other field, or click in and out of this one), return the stored value
 * untouched, so `toApi(fromUserEdit(display(x))) === x` for every x. Only a
 * genuinely different number is scaled through the unit.
 */
function toBytes(shown: number, suffix: string): number {
  const raw = Number(props.modelValue ?? 0)
  const current = byteDisplay.value
  if (Number.isFinite(raw) && shown === current.value && suffix === current.suffix) return raw

  const factor = suffix.startsWith('MiB') ? KIB * KIB : suffix.startsWith('KiB') ? KIB : 1
  const n = Math.trunc(Number(shown) * factor)
  return Number.isFinite(n) ? n : 0
}

/** Byte-unit fields are shown scaled, so they need their own binding. */
const byteField = computed(() => props.field.unit === 'bytesPerSec' || props.field.unit === 'bytes')

/**
 * The binding for a numeric control.
 *
 * A byte-unit field scales for display and unscales on input, so what is stored
 * always stays in bytes. Everything else uses the value directly.
 */
const numberModel = computed({
  // Inside <script setup>, computed refs are auto-unwrapped, so these are read
  // and written as plain values.
  get: () => (byteField.value ? asByteValue.value : asNumber.value),
  set: (v: number) => {
    if (byteField.value) asByteValue.value = v
    else asNumber.value = v
  },
})

const unitSuffix = computed(() => {
  switch (props.field.unit) {
    case 'bytesPerSec':
    case 'bytes':
      return byteDisplay.value.suffix
    case 'minutes':
      return t('settings.unit.min')
    case 'seconds':
      return t('settings.unit.sec')
    default:
      return ''
  }
})

/** What the control binds to for a byte-unit field. */
const asByteValue = computed({
  get: () => byteDisplay.value.value,
  set: (v: number) => {
    emit('update:modelValue', toBytes(Number(v), byteDisplay.value.suffix))
  },
})

const isDisabled = computed(() => props.disabled || props.dependencyOff === true)

const asBoolean = computed({
  get: () => Boolean(props.modelValue),
  set: (v: boolean) => emit('update:modelValue', v),
})

const asNumber = computed({
  get: () => Number(props.modelValue ?? 0),
  set: (v: number) => emit('update:modelValue', v),
})

const asString = computed({
  get: () => String(props.modelValue ?? ''),
  set: (v: string) => emit('update:modelValue', v),
})

/** Select options, translated. */
const selectOptions = computed(() =>
  (props.field.options ?? []).map((opt) => {
    const translated = t(opt.labelKey)
    return {
      value: String(opt.value),
      label: translated === opt.labelKey ? String(opt.value) : translated,
    }
  }),
)

const asSelect = computed({
  get: () => String(props.modelValue ?? ''),
  set: (v: string) => {
    // Preserve the original type: numeric option values must stay numeric or
    // the API rejects them.
    const original = props.field.options?.find((o) => String(o.value) === v)
    emit('update:modelValue', original ? original.value : v)
  },
})

const inputId = computed(() => `setting-${props.field.key}`)

/**
 * Controls that need the full row width rather than sharing it with the label.
 *
 * Multi-line lists and long filesystem paths are unreadable in a half-width
 * column, so those rows stack instead. Everything else stays side-by-side.
 */
const isWideControl = computed(
  () => props.field.kind === 'multiline' || props.field.kind === 'path',
)
</script>

<template>
  <!--
    Every field is one row: label (and hint) on the left, control on the right.

    The earlier layout stacked the label above the control inside a 3-column
    grid. With labels of very different lengths that made it impossible to tell
    which label belonged to which control — the two were visually equidistant.
    A single row per setting with a fixed label column removes the ambiguity
    entirely, at every width.
  -->
  <div class="sf" :class="{ 'sf--wide': isWideControl }">
    <div class="sf__text">
      <label class="sf__label" :for="inputId">{{ label }}</label>
      <p v-if="hint" class="sf__hint">{{ hint }}</p>
    </div>

    <div class="sf__control" :class="{ 'sf__control--fill': field.kind === 'boolean' }">
      <!-- Boolean: a switch. The label is rendered by this component instead, so the
           toggle omits its own — passing none is all that is needed. -->
      <MacToggle
        v-if="field.kind === 'boolean'"
        :id="inputId"
        v-model="asBoolean"
        :disabled="isDisabled"
      />

      <!-- Enum: a real dropdown, so only valid values are reachable -->
      <MacSelect
        v-else-if="field.kind === 'select'"
        :id="inputId"
        v-model="asSelect"
        :options="selectOptions"
        :disabled="isDisabled"
      />

      <!-- Numeric -->
      <MacNumberInput
        v-else-if="field.kind === 'integer' || field.kind === 'float'"
        :id="inputId"
        v-model="numberModel"
        :min="byteField ? undefined : field.min"
        :max="byteField ? undefined : field.max"
        :step="byteField ? undefined : field.step"
        :disabled="isDisabled"
        :suffix="unitSuffix || undefined"
      />

      <!-- Multi-line lists -->
      <textarea
        v-else-if="field.kind === 'multiline'"
        :id="inputId"
        v-model="asString"
        class="sf__textarea"
        rows="4"
        spellcheck="false"
        :disabled="isDisabled"
      />

      <!-- Paths and free text -->
      <MacInput
        v-else
        :id="inputId"
        v-model="asString"
        :disabled="isDisabled"
        :mono="field.kind === 'path'"
      />
    </div>
  </div>
</template>

<style scoped>
/* ---- Row layout ----
   Label column is fixed so every control starts at the same x position; the
   control column takes the rest. That alignment is what makes the association
   between a label and its control obvious at a glance. */
.sf {
  display: grid;
  grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-2);
  border-radius: var(--radius-md);
  min-width: 0;
  transition: background-color var(--duration-fast) var(--ease);
}

.sf:hover {
  background: var(--bg-hover);
}

/* Rows whose control needs room (long lists, paths) put the label on its own
   line instead of squeezing the control. */
.sf--wide {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
}

.sf__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 4px;
}

.sf--wide .sf__text {
  padding-top: 0;
}

.sf__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.sf__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* Text and number controls are capped rather than stretched. An input running
   the full width of a wide row reads as broken, and it makes the value harder
   to find. Selects hug their content on their own, so both end up a similar
   size and the column looks deliberate. */
.sf:not(.sf--wide) .sf__control:not(.sf__control--fill) {
  max-width: 24rem;
}

/* Switches take the full width so a column of them lines up on the right edge,
   which is what makes a long list of toggles scannable. */
.sf__control--fill {
  width: 100%;
}

.sf__control--fill > :deep(.mac-toggle) {
  margin-left: auto;
}

.sf__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin: 0;
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}

@media (max-width: 767px) {
  /* Stack label above control: a 15rem label column would leave no usable
     width for the control on a phone. */
  .sf {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .sf__text {
    padding-top: 0;
  }

  /* On one column the control has the row to itself, so the cap only wastes
     space. Let it fill. */
  .sf:not(.sf--wide) .sf__control:not(.sf__control--fill) {
    max-width: none;
  }

  .sf__control--fill > :deep(.mac-toggle) {
    margin-left: 0;
  }
}

.sf__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin: 0;
  overflow-wrap: anywhere;
}

.sf__textarea {
  width: 100%;
  min-height: 64px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  resize: vertical;
}

.sf__textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.sf__textarea:disabled {
  opacity: 0.55;
  cursor: default;
}

/* iOS zooms on focus below 16px. */
@media (max-width: 599px) {
  .sf__textarea {
    font-size: 16px;
  }
}
</style>