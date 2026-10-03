<script setup lang="ts">
/**
 * TorrentToolbar — the action bar shown while torrents are selected.
 *
 * On mobile this becomes a fixed bottom action bar sitting above the tab bar,
 * because a toolbar at the top of a long scroll is unreachable.
 *
 * Destructive actions are physically separated from the safe ones so a
 * mis-tap is much less likely.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSessionStore } from '@/stores/session'
import MacButton from '@/components/base/MacButton.vue'
import MacSelect from '@/components/base/MacSelect.vue'

defineProps<{ count: number }>()

const emit = defineEmits<{
  (e: 'resume'): void
  (e: 'pause'): void
  (e: 'recheck'): void
  (e: 'reannounce'): void
  (e: 'remove'): void
  (e: 'remove-with-files'): void
  (e: 'set-category', category: string): void
  (e: 'clear'): void
}>()

const { t } = useI18n()
const session = useSessionStore()
const { isMobile } = useBreakpoint()

const categoryValue = ref('')

function onCategoryChange(value: string): void {
  if (!value) return
  emit('set-category', value)
  categoryValue.value = ''
}
</script>

<template>
  <div class="toolbar glass-panel" :class="{ 'toolbar--mobile': isMobile }" role="toolbar">
    <div class="toolbar__info">
      <strong>{{ count }}</strong>
      <span>{{ t('torrent.selected') }}</span>
      <button type="button" class="toolbar__clear" @click="emit('clear')">
        {{ t('torrent.clearSelection') }}
      </button>
    </div>

    <div class="toolbar__actions">
      <MacButton size="sm" variant="secondary" @click="emit('resume')">
        {{ t('action.resume') }}
      </MacButton>
      <MacButton size="sm" variant="secondary" @click="emit('pause')">
        {{ t('action.pause') }}
      </MacButton>
      <MacButton size="sm" variant="secondary" @click="emit('recheck')">
        {{ t('action.recheck') }}
      </MacButton>
      <MacButton size="sm" variant="ghost" @click="emit('reannounce')">
        {{ t('action.reannounce') }}
      </MacButton>

      <MacSelect
        :model-value="categoryValue"
        :options="[
          { value: '', label: t('action.setCategory') },
          ...session.categoryNames.map((c) => ({ value: c, label: c })),
        ]"
        :aria-label="t('action.setCategory')"
        @update:model-value="onCategoryChange"
      />

      <span class="toolbar__spacer" />

      <MacButton size="sm" variant="secondary" @click="emit('remove')">
        {{ t('action.remove') }}
      </MacButton>
      <MacButton size="sm" variant="danger" @click="emit('remove-with-files')">
        {{ t('action.delete') }}
      </MacButton>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  min-width: 0;
}

.toolbar__info {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  flex: none;
}

.toolbar__info strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.toolbar__clear {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-sm);
  cursor: pointer;
  padding: 0;
}

.toolbar__clear:hover {
  text-decoration: underline;
}

.toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.toolbar__spacer {
  flex: 1 1 auto;
}

/* ---- Mobile: fixed above the tab bar --------------------------------- */
.toolbar--mobile {
  position: fixed;
  left: var(--space-2);
  right: var(--space-2);
  bottom: calc(56px + var(--space-2) + env(safe-area-inset-bottom, 0px));
  z-index: 800;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  padding: var(--space-3);
  box-shadow: var(--shadow-lg);
}

.toolbar--mobile .toolbar__actions {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

/*
 * Buttons must not shrink.
 *
 * With `nowrap` plus the default `flex-shrink: 1`, each button was compressed
 * below the width of its own label, so the text spilled out of one button and
 * over its neighbour ("移除" was drawn underneath the delete button). The row is
 * meant to scroll horizontally, which only works if the items keep their
 * natural width.
 */
.toolbar--mobile .toolbar__actions > * {
  flex: 0 0 auto;
}

.toolbar--mobile .toolbar__actions::-webkit-scrollbar {
  display: none;
}

.toolbar--mobile .toolbar__spacer {
  display: none;
}
</style>