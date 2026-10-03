<script setup lang="ts">
/**
 * TorrentStateBadge — localised, colour-coded torrent state pill.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { stateTone, type StateTone } from '@/utils/format'
import MacBadge from '@/components/base/MacBadge.vue'

const props = defineProps<{ state: string }>()

const { t } = useI18n()

const tone = computed<StateTone>(() => stateTone(props.state))

/** Map our visual tone onto a MacBadge tone. */
const badgeTone = computed<'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'>(() => {
  switch (tone.value) {
    case 'download':
      return 'success'
    case 'upload':
      return 'accent'
    case 'error':
      return 'danger'
    case 'stalled':
      return 'warning'
    case 'checking':
      return 'info'
    case 'queued':
      return 'info'
    default:
      return 'neutral'
  }
})

const label = computed(() => {
  const key = `state.${props.state}`
  const translated = t(key)
  // vue-i18n echoes the key when a translation is missing.
  return translated === key ? props.state : translated
})
</script>

<template>
  <MacBadge :tone="badgeTone" size="sm" dot>{{ label }}</MacBadge>
</template>