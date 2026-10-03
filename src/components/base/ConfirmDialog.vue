<script setup lang="ts">
/**
 * ConfirmDialog — a reusable destructive-action confirmation.
 *
 * Deliberately does NOT auto-focus the confirm button: for a destructive
 * action, an accidental Enter should not delete anything.
 */
import { useI18n } from 'vue-i18n'
import MacModal from '@/components/base/MacModal.vue'
import MacButton from '@/components/base/MacButton.vue'

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }>(),
  { confirmLabel: undefined, cancelLabel: undefined, danger: false },
)

const emit = defineEmits<{ (e: 'confirm'): void }>()

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
</script>

<template>
  <MacModal v-model:open="open" :title="title" size="sm">
    <p class="confirm__message break-anywhere">{{ message }}</p>

    <template #footer>
      <MacButton variant="secondary" @click="open = false">
        {{ cancelLabel ?? t('action.cancel') }}
      </MacButton>
      <MacButton :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">
        {{ confirmLabel ?? t('action.confirm') }}
      </MacButton>
    </template>
  </MacModal>
</template>

<style scoped>
.confirm__message {
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-primary);
}
</style>