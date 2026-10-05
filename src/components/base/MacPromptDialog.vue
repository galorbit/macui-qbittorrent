<script setup lang="ts">
/**
 * MacPromptDialog — a single-field modal for the small inputs the context menu
 * needs (rename, set location, rate limits, share ratio).
 *
 * WHY ONE COMPONENT
 * -----------------
 * The menu needs five of these. Five near-identical modals would be five places
 * to fix any layout or focus bug, and the menu already has enough surface. This
 * takes a label, a placeholder and an optional unit and reports the value back.
 *
 * The value is a STRING and converted by the caller. Rate limits accept a unit
 * suffix ("500 KiB", "2 MiB") because typing exact byte counts is unreasonable,
 * and an empty value means "no limit" rather than zero — zero would be a limit
 * of zero bytes per second, which is not what an empty field means.
 */
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MacInput from '@/components/base/MacInput.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacModal from '@/components/base/MacModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    label: string
    placeholder?: string
    /** Shown after the field, e.g. "B/s" or a hint. */
    unit?: string
    hint?: string
    /** Pre-filled value. */
    initial?: string
    confirmLabel?: string
  }>(),
  { placeholder: '', unit: '', hint: '', initial: '', confirmLabel: '' },
)

const emit = defineEmits<{
  (e: 'confirm', value: string): void
  (e: 'update:open', value: boolean): void
}>()

const { t } = useI18n()
const value = ref('')
const inputRef = ref<InstanceType<typeof MacInput> | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    value.value = props.initial
    // Focus after the modal has rendered, otherwise the field does not exist yet.
    await nextTick()
    const el = (inputRef.value?.$el ?? null) as HTMLElement | null
    el?.querySelector('input')?.focus()
  },
  { immediate: true },
)

function confirm(): void {
  emit('confirm', value.value)
  emit('update:open', false)
}
</script>

<template>
  <MacModal
    :open="open"
    :title="title"
    size="sm"
    @update:open="emit('update:open', $event)"
  >
    <div class="prompt">
      <label class="prompt__field">
        <span class="prompt__label">{{ label }}</span>
        <div class="prompt__row">
          <MacInput
            ref="inputRef"
            v-model="value"
            :placeholder="placeholder"
            @keyup.enter="confirm"
          />
          <span v-if="unit" class="prompt__unit">{{ unit }}</span>
        </div>
      </label>
      <p v-if="hint" class="prompt__hint">{{ hint }}</p>
    </div>

    <template #footer>
      <MacButton variant="secondary" @click="emit('update:open', false)">
        {{ t('action.cancel') }}
      </MacButton>
      <MacButton variant="primary" @click="confirm">
        {{ confirmLabel || t('action.confirm') }}
      </MacButton>
    </template>
  </MacModal>
</template>

<style scoped>
.prompt {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.prompt__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.prompt__label {
  font-size: var(--text-sm);
  font-weight: 500;
}

.prompt__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.prompt__row > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.prompt__unit {
  flex: none;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.prompt__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}
</style>
