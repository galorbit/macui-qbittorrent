<script setup lang="ts">
/**
 * SearchView — plugin-based torrent search.
 *
 * THREE STATES THAT MUST BE DISTINGUISHED
 * ---------------------------------------
 * The stock WebUI conflates these and it makes the feature look broken:
 *
 *  1. No plugins installed. `search/plugins` returns `[]`, and a search with no
 *     plugins returns nothing. This is the state a FRESH INSTALL is in, so it
 *     gets its own explanation and an install affordance — not "0 results".
 *  2. Python missing. `search/start` returns 409; the server needs Python to
 *     run plugins at all. Reported as an environment problem, not a failure.
 *  3. Genuinely no results for the query.
 *
 * Polling stops as soon as the server reports `Stopped`, so a finished search
 * does not keep hitting the API.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteSearch,
  downloadSearchResult,
  enableSearchPlugins,
  getSearchPlugins,
  getSearchResults,
  installSearchPlugins,
  isPythonMissing,
  startSearch,
  stopSearch,
  updateSearchPlugins,
} from '@/api/search'
import type { SearchPlugin, SearchResult, SearchStatus } from '@/types/api'
import { useToast, describeError } from '@/composables/useToast'
import { ApiError } from '@/api/http'
import { formatBytes } from '@/utils/format'
import MacButton from '@/components/base/MacButton.vue'
import MacCard from '@/components/base/MacCard.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacSelect from '@/components/base/MacSelect.vue'
import MacModal from '@/components/base/MacModal.vue'
import MacBadge from '@/components/base/MacBadge.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import MacToggle from '@/components/base/MacToggle.vue'
import MacEmptyState from '@/components/base/MacEmptyState.vue'

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

// --- Plugins -------------------------------------------------------------
const plugins = ref<SearchPlugin[]>([])
const pluginsLoading = ref(true)
const showPlugins = ref(false)

const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))

/** Union of every enabled plugin's categories, for the category dropdown. */
const categories = computed(() => {
  const seen = new Map<string, string>()
  seen.set('all', t('search.categoryAll'))
  for (const plugin of enabledPlugins.value) {
    for (const cat of plugin.supportedCategories ?? []) {
      if (cat.id === 'all') continue
      if (!seen.has(cat.id)) seen.set(cat.id, cat.name)
    }
  }
  return [...seen].map(([value, label]) => ({ value, label }))
})

async function loadPlugins(): Promise<void> {
  pluginsLoading.value = true
  try {
    plugins.value = await getSearchPlugins()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    pluginsLoading.value = false
  }
}

onMounted(() => void loadPlugins())

// --- Query ---------------------------------------------------------------
const pattern = ref('')
const category = ref('all')
const pluginChoice = ref('enabled')

const pluginOptions = computed(() => [
  { value: 'enabled', label: t('search.pluginsEnabled') },
  { value: 'all', label: t('search.pluginsAll') },
  ...enabledPlugins.value.map((p) => ({ value: p.name, label: p.fullName || p.name })),
])

// --- Search state --------------------------------------------------------
const searchId = ref<number | null>(null)
const status = ref<SearchStatus | null>(null)
const results = ref<SearchResult[]>([])
const resultsLoading = ref(false)
const pythonMissing = ref(false)
const started = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const isRunning = computed(() => status.value?.status === 'Running')
const total = computed(() => status.value?.total ?? results.value.length)

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/** Poll while the search runs; stop as soon as the server says Stopped. */
function schedulePoll(): void {
  stopPolling()
  pollTimer = setTimeout(() => void poll(), 1200)
}

async function poll(): Promise<void> {
  const id = searchId.value
  if (id === null) return

  try {
    const page = await getSearchResults(id, -1, 0)

    // Discard a response belonging to a search that is no longer current.
    // Without this, a late reply from the PREVIOUS search overwrites the new
    // one's results, and if it says 'Stopped' it also calls stopPolling() —
    // killing the new search's loop and leaving it spinning forever with no
    // way to recover except pressing Stop.
    if (searchId.value !== id) return

    results.value = page.results
    status.value = { id, status: page.status, total: page.total }

    if (page.status === 'Running') schedulePoll()
    else stopPolling()
  } catch (err) {
    if (searchId.value !== id) return

    // Distinguish "the search is gone" (404 after delete/restart — stopping
    // quietly is right) from a transient failure, where silently giving up
    // leaves an endless spinner and no explanation.
    const gone = err instanceof ApiError && err.status === 404
    stopPolling()
    if (!gone) {
      // Mark it stopped so the UI stops claiming to be running, and say why.
      status.value = status.value ? { ...status.value, status: 'Stopped' } : null
      toast.error(describeError(err))
    }
  }
}

/**
 * Stop the timer and release the server-side job.
 *
 * The timer alone is not enough: `searchId` is component-local and there is no
 * search-list UI, so a job left running when the user navigates away keeps
 * accumulating results on the server for the rest of the qBittorrent session,
 * with nothing able to reach it.
 */
function dispose(): void {
  stopPolling()
  const id = searchId.value
  searchId.value = null
  if (id !== null) void deleteSearch(id).catch(() => undefined)
}

onBeforeUnmount(dispose)

/** Guards against the `?q=` watcher re-entering while a search is starting. */
let starting = false

async function start(): Promise<void> {
  const q = pattern.value.trim()
  if (!q) return

  // A second entry here means the watcher fired on the query we just wrote.
  // `start()` awaits a network round trip before setting `started`, so without
  // this flag the route update lands mid-flight and the guard below evaluates
  // against stale state — starting TWO server-side jobs for one query, only
  // one of which is ever polled or stopped.
  if (starting) return
  starting = true

  // Reflect the query in the URL so a search is linkable and survives a
  // reload. Replacing rather than pushing keeps the back button useful.
  if (route.query.q !== q) {
    void router.replace({ query: { ...route.query, q } })
  }

  try {
    // Clear any previous search so its results do not bleed into this one.
    if (searchId.value !== null) await clearSearch()

    pythonMissing.value = false
    resultsLoading.value = true
    started.value = true

    const id = await startSearch(q, category.value, pluginChoice.value)
    searchId.value = id
    status.value = { id, status: 'Running', total: 0 }
    results.value = []
    schedulePoll()
  } catch (err) {
    started.value = false
    if (isPythonMissing(err)) {
      pythonMissing.value = true
    } else {
      toast.error(describeError(err))
    }
  } finally {
    resultsLoading.value = false
    starting = false
  }
}

async function stop(): Promise<void> {
  const id = searchId.value
  if (id === null) return
  try {
    await stopSearch(id)
    await poll()
  } catch (err) {
    toast.error(describeError(err))
  }
}

/** Stop and forget the current search, freeing it on the server. */
async function clearSearch(): Promise<void> {
  stopPolling()
  const id = searchId.value
  searchId.value = null
  status.value = null
  results.value = []
  started.value = false
  if (id !== null) await deleteSearch(id).catch(() => undefined)
}

/**
 * Adopt `?q=` from the URL.
 *
 * Makes a search linkable and lets a reload repeat it. Registered HERE, after
 * `start` and the state it reads are initialised: with `immediate: true` a
 * watcher placed earlier would run during setup, before those `const`s exist,
 * and throw a temporal-dead-zone error that leaves the view blank.
 */
watch(
  () => route.query.q,
  (q) => {
    if (typeof q !== 'string' || !q.trim()) return
    // `pattern` is authoritative for "this query is already running". The
    // earlier guard also required `started`, which is set only AFTER `start()`
    // awaits a round trip — so the route echo arrived while `started` was
    // still false and re-entered, launching a duplicate search.
    if (q === pattern.value) return
    pattern.value = q
    void start()
  },
  { immediate: true },
)

// --- Result actions ------------------------------------------------------
/** Identity of the row currently being added; see `keyOf`. */
const downloading = ref<string | null>(null)

/**
 * Unique identity for a result row.
 *
 * `fileUrl` alone is not unique: two engines can return the same magnet link,
 * which produced duplicate `v-for` keys AND made the download spinner light up
 * on every row sharing that URL.
 */
function keyOf(row: SearchResult): string {
  return `${row.engineName}:${row.fileUrl}`
}

async function download(row: SearchResult): Promise<void> {
  downloading.value = keyOf(row)
  try {
    await downloadSearchResult(row.fileUrl, row.engineName)
    toast.success(t('search.added'))
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    downloading.value = null
  }
}

/** Seconds since epoch -> a compact age, e.g. "3d". */
function formatAge(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '—'
  const diff = Math.floor(Date.now() / 1000) - seconds
  if (diff < 0) return '—'
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}${t('search.minutesShort')}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('search.hoursShort')}`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}${t('search.daysShort')}`
  return new Date(seconds * 1000).toLocaleDateString(locale.value)
}

function formatCount(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : '—'
}

// --- Plugin management ---------------------------------------------------
const installSource = ref('')
const pluginBusy = ref<string | null>(null)

async function install(): Promise<void> {
  const src = installSource.value.trim()
  if (!src) return
  pluginBusy.value = 'install'
  try {
    // The endpoint takes a "|"-separated list, so a multiline paste works.
    const sources = src
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    await installSearchPlugins(sources)
    toast.success(t('search.pluginsInstalledDone'))
    installSource.value = ''
    await loadPlugins()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    pluginBusy.value = null
  }
}

async function togglePlugin(plugin: SearchPlugin, enabled: boolean): Promise<void> {
  pluginBusy.value = plugin.name
  try {
    await enableSearchPlugins([plugin.name], enabled)
    plugin.enabled = enabled
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    pluginBusy.value = null
  }
}

async function updateAll(): Promise<void> {
  pluginBusy.value = 'update'
  try {
    await updateSearchPlugins()
    toast.success(t('search.pluginsUpdating'))
    // The server checks and updates asynchronously; a short delay then re-read
    // is enough to reflect the result without polling indefinitely.
    setTimeout(() => void loadPlugins(), 3000)
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    pluginBusy.value = null
  }
}

/** True when the user has typed something and no plugin can serve it. */
const noUsablePlugins = computed(() => !pluginsLoading.value && enabledPlugins.value.length === 0)
</script>

<template>
  <div class="search">
    <header class="search__head">
      <div>
        <h1 class="search__title">{{ t('search.title') }}</h1>
        <p class="search__sub">
          {{ t('search.pluginsInstalled', { count: plugins.length }) }}
          <template v-if="enabledPlugins.length > 0">
            · {{ t('search.pluginsActive', { count: enabledPlugins.length }) }}
          </template>
        </p>
      </div>
      <MacButton variant="secondary" size="sm" @click="showPlugins = true">
        {{ t('search.managePlugins') }}
      </MacButton>
    </header>

    <!-- ===== Query bar ===== -->
    <MacCard padding="md" class="search__bar">
      <div class="search__fields">
        <label class="search__field search__field--grow">
          <span class="search__label">{{ t('search.pattern') }}</span>
          <MacInput
            v-model="pattern"
            :placeholder="t('search.patternPlaceholder')"
            inputmode="search"
            @keyup.enter="start"
          />
        </label>

        <label class="search__field">
          <span class="search__label">{{ t('search.category') }}</span>
          <MacSelect v-model="category" :options="categories" />
        </label>

        <label class="search__field">
          <span class="search__label">{{ t('search.plugins') }}</span>
          <MacSelect v-model="pluginChoice" :options="pluginOptions" />
        </label>
      </div>

      <div class="search__bar-actions">
        <MacButton
          v-if="isRunning"
          variant="secondary"
          :loading="resultsLoading"
          @click="stop"
        >
          {{ t('search.stop') }}
        </MacButton>
        <MacButton
          v-else
          variant="primary"
          :loading="resultsLoading"
          :disabled="!pattern.trim()"
          @click="start"
        >
          {{ t('search.start') }}
        </MacButton>

        <MacButton v-if="started" variant="ghost" @click="clearSearch">
          {{ t('action.clear') }}
        </MacButton>

        <span v-if="started" class="search__count">
          {{ t('search.resultsCount', { count: total }) }}
        </span>
      </div>
    </MacCard>

    <!-- ===== Python missing ===== -->
    <MacCard v-if="pythonMissing" padding="md" class="search__notice search__notice--warn">
      <h2 class="search__notice-title">{{ t('search.pythonTitle') }}</h2>
      <p class="search__notice-body">{{ t('search.pythonBody') }}</p>
    </MacCard>

    <!-- ===== No plugins ===== -->
    <MacEmptyState
      v-else-if="noUsablePlugins && !started"
      :title="t('search.noPluginsTitle')"
      :description="t('search.noPluginsBody')"
    >
      <template #action>
        <MacButton variant="primary" @click="showPlugins = true">
          {{ t('search.installPlugins') }}
        </MacButton>
      </template>
    </MacEmptyState>

    <!-- ===== Results ===== -->
    <MacCard v-else-if="started" padding="sm" class="search__results">
      <div v-if="isRunning && results.length === 0" class="search__loading">
        <MacSpinner :size="22" :label="t('search.searching')" />
      </div>

      <MacEmptyState
        v-else-if="results.length === 0"
        compact
        :title="t('search.noResults')"
      />

      <div v-else class="search__table" role="table">
        <div class="search__row search__row--head" role="row">
          <span role="columnheader">{{ t('search.name') }}</span>
          <span role="columnheader" class="search__num">{{ t('search.size') }}</span>
          <span role="columnheader" class="search__num">{{ t('search.seeders') }}</span>
          <span role="columnheader" class="search__num">{{ t('search.leechers') }}</span>
          <span role="columnheader" class="search__num">{{ t('search.age') }}</span>
          <span role="columnheader">{{ t('search.engine') }}</span>
          <span role="columnheader" />
        </div>

        <div v-for="row in results" :key="keyOf(row)" class="search__row" role="row">
          <a
            v-if="row.descrLink"
            class="search__name"
            :href="row.descrLink"
            target="_blank"
            rel="noopener noreferrer"
            :title="row.fileName"
          >
            {{ row.fileName }}
          </a>
          <span v-else class="search__name" :title="row.fileName">{{ row.fileName }}</span>

          <span class="search__num">{{ formatBytes(row.fileSize) }}</span>
          <span class="search__num is-seed">{{ formatCount(row.nbSeeders) }}</span>
          <span class="search__num is-leech">{{ formatCount(row.nbLeechers) }}</span>
          <span class="search__num">{{ formatAge(row.pubDate) }}</span>
          <span class="search__engine">
            <MacBadge size="sm">{{ row.engineName }}</MacBadge>
          </span>

          <span class="search__row-actions">
            <MacButton
              variant="primary"
              size="sm"
              :loading="downloading === keyOf(row)"
              @click="download(row)"
            >
              {{ t('action.download') }}
            </MacButton>
          </span>
        </div>
      </div>
    </MacCard>

    <!-- ===== Plugins modal ===== -->
    <MacModal v-model:open="showPlugins" :title="t('search.managePlugins')" size="lg">
      <div class="search__plugins">
        <div class="search__install">
          <label class="search__field search__field--grow">
            <span class="search__label">{{ t('search.installFrom') }}</span>
            <MacInput
              v-model="installSource"
              :placeholder="t('search.installPlaceholder')"
            />
          </label>
          <MacButton
            variant="primary"
            :loading="pluginBusy === 'install'"
            :disabled="!installSource.trim()"
            @click="install"
          >
            {{ t('action.add') }}
          </MacButton>
        </div>
        <p class="search__hint">{{ t('search.installHint') }}</p>

        <div class="search__plugins-head">
          <span class="search__label">{{ t('search.installedPlugins') }}</span>
          <MacButton
            variant="ghost"
            size="sm"
            :loading="pluginBusy === 'update'"
            :disabled="plugins.length === 0"
            @click="updateAll"
          >
            {{ t('search.checkUpdates') }}
          </MacButton>
        </div>

        <div v-if="pluginsLoading" class="search__loading">
          <MacSpinner :size="20" :label="t('status.loading')" />
        </div>

        <MacEmptyState
          v-else-if="plugins.length === 0"
          compact
          :title="t('search.noPluginsTitle')"
        />

        <ul v-else class="search__plugin-list">
          <li v-for="plugin in plugins" :key="plugin.name" class="search__plugin">
            <div class="search__plugin-main">
              <span class="search__plugin-name">{{ plugin.fullName || plugin.name }}</span>
              <p class="search__plugin-meta">
                {{ plugin.name }}
                <template v-if="plugin.version"> · v{{ plugin.version }}</template>
                <template v-if="plugin.url">
                  ·
                  <a :href="plugin.url" target="_blank" rel="noopener noreferrer">
                    {{ t('search.pluginSite') }}
                  </a>
                </template>
              </p>
            </div>
            <MacToggle
              :model-value="plugin.enabled"
              :disabled="pluginBusy === plugin.name"
              @update:model-value="(v: boolean) => togglePlugin(plugin, v)"
            />
          </li>
        </ul>
      </div>
    </MacModal>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.search__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.search__title {
  font-size: var(--text-xl);
  font-weight: 700;
}

.search__sub {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* ---- Query bar ---- */
.search__bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search__fields {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-3);
  min-width: 0;
}

.search__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.search__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search__bar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.search__count {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---- Notices ---- */
.search__notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.search__notice--warn {
  border-color: var(--warning);
  background: var(--warning-soft);
  color: var(--warning-text);
}

.search__notice-title {
  font-size: var(--text-md);
  font-weight: 600;
}

.search__notice-body {
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

/* ---- Results ---- */
.search__results {
  min-width: 0;
}

.search__loading {
  display: grid;
  place-items: center;
  padding: var(--space-8);
}

.search__table {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.search__row {
  display: grid;
  grid-template-columns:
    minmax(0, 3fr) minmax(0, 0.7fr) minmax(0, 0.6fr)
    minmax(0, 0.6fr) minmax(0, 0.7fr) minmax(0, 0.9fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  min-height: 46px;
  border-bottom: 1px solid var(--separator);
  min-width: 0;
  font-size: var(--text-sm);
}

.search__row:last-child {
  border-bottom: none;
}

.search__row--head {
  min-height: 34px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  background: var(--bg-hover);
  position: sticky;
  top: 0;
  z-index: 2;
}

.search__row:hover:not(.search__row--head) {
  background: var(--bg-hover);
}

.search__name {
  min-width: 0;
  color: var(--text-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.search__name:hover {
  color: var(--accent-text);
  text-decoration: underline;
}

.search__num {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  text-align: right;
}

.search__num.is-seed {
  color: var(--state-download);
}

.search__num.is-leech {
  color: var(--state-upload);
}

.search__engine {
  min-width: 0;
  overflow: hidden;
}

.search__row-actions {
  display: flex;
  justify-content: flex-end;
}

/* ---- Plugins ---- */
.search__plugins {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search__install {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.search__field--grow {
  flex: 1 1 auto;
}

.search__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.search__plugins-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--separator);
}

.search__plugin-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.search__plugin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  min-width: 0;
}

.search__plugin-main {
  min-width: 0;
}

.search__plugin-name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.search__plugin-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.search__plugin-meta a {
  color: var(--accent-text);
}

@media (max-width: 899px) {
  .search__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  /* The seven-column row cannot survive a phone. Stack each result instead of
     letting the name column shrink to nothing. */
  .search__row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-1) var(--space-2);
    min-height: 0;
    padding: var(--space-3);
  }

  .search__row--head {
    display: none;
  }

  .search__name {
    grid-column: 1 / -1;
    white-space: normal;
  }

  .search__engine {
    grid-column: 1 / -1;
  }

  .search__num {
    text-align: left;
    font-size: var(--text-xs);
  }

  .search__row-actions {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .search__row-actions > * {
    width: 100%;
  }
}
</style>
