<script setup lang="ts">
/**
 * AddTorrentModal — add torrents from a file, a magnet link, or a URL.
 *
 * Covers the three input modes the API supports via `torrents/add`:
 *   - multipart upload of .torrent files ("torrents" field)
 *   - a newline-separated URL/magnet list ("urls" field)
 *
 * Debounces the default save path lookup so opening the dialog does not
 * necessarily hit the API if the user never expands Advanced.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { addTorrent } from '@/api/torrents'
import { getDefaultSavePath } from '@/api/app'
import { useSessionStore } from '@/stores/session'
import { useToast, describeError } from '@/composables/useToast'
import MacModal from '@/components/base/MacModal.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacSelect from '@/components/base/MacSelect.vue'
import MacToggle from '@/components/base/MacToggle.vue'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ (e: 'added'): void }>()

const { t } = useI18n()
const toast = useToast()
const session = useSessionStore()

const mode = ref<'file' | 'link'>('file')
const files = ref<File[]>([])
const urls = ref('')
const showAdvanced = ref(false)
const submitting = ref(false)
const dragActive = ref(false)

const savePath = ref('')
const category = ref('')
const tagsInput = ref('')
const startPaused = ref(false)
const skipChecking = ref(false)
const autoTmm = ref(true)

const fileInput = ref<HTMLInputElement | null>(null)

// Reset transient state each time the dialog opens, but keep the user's
// advanced preferences (they are likely to reuse them).
watch(open, async (isOpen) => {
  if (!isOpen) return
  files.value = []
  urls.value = ''
  dragActive.value = false
  if (!savePath.value) {
    try {
      savePath.value = await getDefaultSavePath()
    } catch {
      savePath.value = ''
    }
  }
})

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (mode.value === 'file') return files.value.length > 0
  return urls.value.trim().length > 0
})

function onFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    files.value = [...files.value, ...Array.from(input.files)]
  }
  // Allow re-selecting the same file later.
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragActive.value = false
  const dropped = event.dataTransfer?.files
  if (dropped?.length) {
    files.value = [...files.value, ...Array.from(dropped)]
    mode.value = 'file'
  }
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, i) => i !== index)
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true

  try {
    await addTorrent({
      files: mode.value === 'file' ? files.value : undefined,
      urls: mode.value === 'link' ? urls.value.trim() : undefined,
      savepath: savePath.value || undefined,
      category: category.value || undefined,
      tags: tagsInput.value.trim() || undefined,
      // qBittorrent 5.x spells this `stopped`; `paused` is silently ignored.
      stopped: startPaused.value,
      skip_checking: skipChecking.value,
      autoTMM: autoTmm.value,
    })

    toast.success(
      files.value.length > 1 && mode.value === 'file'
        ? t('toast.torrentsAdded', { count: files.value.length })
        : t('toast.torrentAdded'),
    )
    emit('added')
    open.value = false
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    submitting.value = false
  }
}

const categoryOptions = computed(() => [
  { value: '', label: t('add.noCategory') },
  ...session.categoryNames.map((name) => ({ value: name, label: name })),
])
</script>

<template>
  <MacModal v-model:open="open" :title="t('action.add')" size="md">
    <!-- Mode switch -->
    <div class="add__modes" role="tablist">
      <button
        type="button"
        role="tab"
        class="add__mode"
        :class="{ 'is-active': mode === 'file' }"
        :aria-selected="mode === 'file'"
        @click="mode = 'file'"
      >
        {{ t('add.torrentFile') }}
      </button>
      <button
        type="button"
        role="tab"
        class="add__mode"
        :class="{ 'is-active': mode === 'link' }"
        :aria-selected="mode === 'link'"
        @click="mode = 'link'"
      >
        {{ t('add.linkOrMagnet') }}
      </button>
    </div>

    <!-- File mode -->
    <div v-if="mode === 'file'" class="add__section">
      <div
        class="add__dropzone"
        :class="{ 'is-active': dragActive }"
        role="button"
        tabindex="0"
        @click="fileInput?.click()"
        @keydown.enter.prevent="fileInput?.click()"
        @keydown.space.prevent="fileInput?.click()"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path
            d="M16 22V8m0 0l-5 5m5-5l5 5M6 26h20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <p class="add__dropzone-text">{{ t('add.dropzone') }}</p>
        <input
          ref="fileInput"
          type="file"
          accept=".torrent,application/x-bittorrent"
          multiple
          class="visually-hidden"
          @change="onFilePick"
        />
      </div>

      <ul v-if="files.length" class="add__filelist">
        <li v-for="(file, index) in files" :key="`${file.name}-${index}`" class="add__file">
          <span class="add__file-name truncate" :title="file.name">{{ file.name }}</span>
          <button
            type="button"
            class="add__file-remove"
            :aria-label="t('add.removeFile', { name: file.name })"
            @click="removeFile(index)"
          >
            ×
          </button>
        </li>
      </ul>
    </div>

    <!-- Link mode -->
    <div v-else class="add__section">
      <label class="add__label" for="add-urls">{{ t('add.urlsLabel') }}</label>
      <textarea
        id="add-urls"
        v-model="urls"
        class="add__textarea"
        rows="5"
        placeholder="magnet:?xt=urn:btih:…&#10;https://example.com/file.torrent"
        spellcheck="false"
      />
    </div>

    <!-- Advanced -->
    <button
      type="button"
      class="add__advanced-toggle"
      :aria-expanded="showAdvanced"
      @click="showAdvanced = !showAdvanced"
    >
      {{ showAdvanced ? '▾' : '▸' }} {{ t('add.advanced') }}
    </button>

    <div v-if="showAdvanced" class="add__advanced">
      <div class="add__field">
        <label class="add__label" for="add-savepath">{{ t('torrent.savePath') }}</label>
        <MacInput id="add-savepath" v-model="savePath" mono />
      </div>

      <div class="add__field">
        <label class="add__label" for="add-category">{{ t('torrent.category') }}</label>
        <MacSelect id="add-category" v-model="category" :options="categoryOptions" />
      </div>

      <div class="add__field">
        <label class="add__label" for="add-tags">{{ t('torrent.tags') }}</label>
        <MacInput id="add-tags" v-model="tagsInput" placeholder="comma, separated" />
      </div>

      <div class="add__toggles">
        <MacToggle v-model="startPaused" :label="t('add.startPaused')" />
        <MacToggle v-model="autoTmm" :label="t('add.autoTmm')" />
        <MacToggle v-model="skipChecking" :label="t('add.skipChecking')" />
      </div>
    </div>

    <template #footer>
      <MacButton variant="secondary" @click="open = false">{{ t('action.cancel') }}</MacButton>
      <MacButton variant="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">
        {{ t('action.add') }}
      </MacButton>
    </template>
  </MacModal>
</template>

<style scoped>
.add__modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-active);
  margin-bottom: var(--space-4);
}

.add__mode {
  flex: 1 1 0;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
}

.add__mode.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
}

.add__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.add__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: center;
  transition:
    border-color var(--duration-fast) var(--ease),
    background-color var(--duration-fast) var(--ease);
}

.add__dropzone:hover,
.add__dropzone.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.add__dropzone-text {
  font-size: var(--text-base);
}

.add__filelist {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 140px;
  overflow-y: auto;
}

.add__file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: var(--text-sm);
  min-width: 0;
}

.add__file-name {
  flex: 1 1 auto;
  min-width: 0;
}

.add__file-remove {
  flex: none;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.add__file-remove:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.add__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.add__textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  resize: vertical;
  min-height: 88px;
}

.add__textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.add__advanced-toggle {
  margin-top: var(--space-4);
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-sm);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.add__advanced {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--separator);
}

.add__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.add__toggles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* iOS zooms on focus for inputs under 16px. */
@media (max-width: 599px) {
  .add__textarea {
    font-size: 16px;
  }
}
</style>
