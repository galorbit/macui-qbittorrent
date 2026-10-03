<script setup lang="ts">
/**
 * MacNumberInput — a numeric field with a *number* model.
 *
 * MacInput intentionally models strings (that is what the DOM gives us), but
 * settings forms want real numbers. This wrapper owns the string↔number
 * conversion so callers can write `v-model="draft.dl_limit"` and get a number.
 *
 * An empty field emits 0 rather than NaN, which is what qBittorrent expects for
 * "unlimited" limits.
 */
import { computed } from 'vue'
import MacInput from '@/components/base/MacInput.vue'

const model = defineModel<number>({ default: 0 })

const props = withDefaults(
  defineProps<{
    id?: string
    disabled?: boolean
    min?: number
    max?: number
    step?: number
    placeholder?: string
    suffix?: string
  }>(),
  {
    id: undefined,
    disabled: false,
    min: undefined,
    max: undefined,
    step: undefined,
    placeholder: undefined,
    suffix: undefined,
  },
)

const asString = computed({
  get: () => String(model.value ?? ''),
  set: (raw: string) => {
    if (raw === '' || raw === '-') {
      // Allow a transient "-" so the user can type "-1" (used for "no limit").
      model.value = raw === '-' ? -1 : 0
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    let value = parsed
    if (props.min !== undefined && value < props.min) value = props.min
    if (props.max !== undefined && value > props.max) value = props.max
    model.value = value
  },
})
</script>

<template>
  <MacInput
    :id="id"
    v-model="asString"
    type="number"
    inputmode="numeric"
    :disabled="disabled"
    :min="min"
    :max="max"
    :step="step"
    :placeholder="placeholder"
  >
    <template v-if="suffix" #suffix>{{ suffix }}</template>
  </MacInput>
</template>