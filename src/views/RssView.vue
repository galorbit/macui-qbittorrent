<script setup lang="ts">
/**
 * RssView — the RSS reader and auto-download rules.
 *
 * Layout: a feed tree on the left, the selected feed's articles on the right.
 * The tree mirrors the server's folder structure, because feeds are addressed
 * by path (not uid) in every mutation endpoint.
 *
 * States that matter and are easy to get wrong:
 *
 *  - No feeds at all. The server returns `{}` — an empty object, not an empty
 *    array — so this is detected as "nothing subscribed yet" with an add
 *    affordance, rather than rendering an empty tree that looks broken.
 *  - A feed that failed to fetch. `hasError` is set by the server; showing the
 *    feed with no explanation would look like data loss.
 *  - An article with no `date`. Feeds legitimately omit it, so the sort and the
 *    display both tolerate it instead of rendering "Invalid Date".
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  addRssFeed,
  addRssFolder,
  flattenFeeds,
  getRssItems,
  getRssMatchingArticles,
  getRssRules,
  markRssAsRead,
  parseRssItems,
  refreshRssItem,
  removeRssItem,
  removeRssRule,
  setRssRule,
  unreadCount,
} from '@/api/rss'
import type { RssArticle, RssNode, RssRule } from '@/types/api'
import { useToast, describeError } from '@/composables/useToast'
import { useBreakpoint } from '@/composables/useBreakpoint'
import MacButton from '@/components/base/MacButton.vue'
import MacCard from '@/components/base/MacCard.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacModal from '@/components/base/MacModal.vue'
import MacToggle from '@/components/base/MacToggle.vue'
import MacBadge from '@/components/base/MacBadge.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import MacEmptyState from '@/components/base/MacEmptyState.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import RssTreeNode from '@/components/rss/RssTreeNode.vue'

const { t, locale } = useI18n()
const toast = useToast()
const { isMobile } = useBreakpoint()

const tree = ref<RssNode[]>([])
const rules = ref<Record<string, RssRule>>({})
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)

/** Selected node path; `''` means "all articles". */
const selectedPath = ref('')
const search = ref('')

/** Feed currently selected (a folder selection shows a merged list). */
const feeds = computed(() => flattenFeeds(tree.value))

const selectedNode = computed<RssNode | null>(() => {
  if (!selectedPath.value) return null
  const find = (nodes: RssNode[]): RssNode | null => {
    for (const n of nodes) {
      if (n.path === selectedPath.value) return n
      if (n.kind === 'folder') {
        const hit = find(n.children)
        if (hit) return hit
      }
    }
    return null
  }
  return find(tree.value)
})

/** Articles to show: the selected node's, or every feed's when none selected. */
const articles = computed<Array<RssArticle & { feedName: string; feedPath: string }>>(() => {
  const collect = (nodes: RssNode[]): Array<RssArticle & { feedName: string; feedPath: string }> => {
    const out: Array<RssArticle & { feedName: string; feedPath: string }> = []
    for (const node of nodes) {
      if (node.kind === 'feed') {
        for (const a of node.articles ?? []) {
          out.push({ ...a, feedName: node.title || node.name, feedPath: node.path })
        }
      } else {
        out.push(...collect(node.children))
      }
    }
    return out
  }

  const source = selectedNode.value
  const pool = source ? collect([source]) : collect(tree.value)

  const q = search.value.trim().toLowerCase()
  const filtered = q
    ? pool.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description ?? '').toLowerCase().includes(q),
      )
    : pool

  // Newest first. A missing date sorts last rather than becoming NaN.
  return filtered.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : 0
    const tb = b.date ? Date.parse(b.date) : 0
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
})

const unread = computed(() => unreadCount(tree.value))
const ruleNames = computed(() => Object.keys(rules.value))

function formatDate(raw?: string): string {
  if (!raw) return ''
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [items, r] = await Promise.all([getRssItems(true), getRssRules().catch(() => ({}))])
    tree.value = parseRssItems(items)
    rules.value = r
  } catch (err) {
    loadError.value = describeError(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

// --- Mutations -----------------------------------------------------------
async function doAction(message: string, fn: () => Promise<unknown>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
    toast.success(message)
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busy.value = false
  }
}

// --- Add feed / folder ---------------------------------------------------
const showAdd = ref(false)
const addMode = ref<'feed' | 'folder'>('feed')
const addUrl = ref('')
const addPath = ref('')
const addError = ref('')

function openAdd(mode: 'feed' | 'folder'): void {
  addMode.value = mode
  addUrl.value = ''
  // Pre-fill with the selected folder so the common case needs one field.
  addPath.value =
    selectedNode.value?.kind === 'folder' ? selectedNode.value.path : ''
  addError.value = ''
  showAdd.value = true
}

async function submitAdd(): Promise<void> {
  addError.value = ''
  const target = addPath.value.trim()

  if (addMode.value === 'feed') {
    const url = addUrl.value.trim()
    if (!url) {
      addError.value = t('rss.urlRequired')
      return
    }
    await doAction(t('rss.feedAdded'), () => addRssFeed(url, target))
  } else {
    if (!target) {
      addError.value = t('rss.pathRequired')
      return
    }
    await doAction(t('rss.folderAdded'), () => addRssFolder(target))
  }

  showAdd.value = false
}

// --- Removal -------------------------------------------------------------
const pendingRemove = ref<RssNode | null>(null)
const pendingRuleRemove = ref<string | null>(null)

/**
 * Drive each ConfirmDialog's `open` model from the pending target.
 *
 * Setting the model to false clears the target, so Cancel and Escape work
 * without a separate handler.
 */
const removeOpen = computed({
  get: () => pendingRemove.value !== null,
  set: (v: boolean) => {
    if (!v) pendingRemove.value = null
  },
})

const ruleRemoveOpen = computed({
  get: () => pendingRuleRemove.value !== null,
  set: (v: boolean) => {
    if (!v) pendingRuleRemove.value = null
  },
})

function confirmRemove(node: RssNode): void {
  pendingRemove.value = node
}

async function doRemove(): Promise<void> {
  const node = pendingRemove.value
  if (!node) return
  pendingRemove.value = null
  if (selectedPath.value === node.path) selectedPath.value = ''
  // Removing a folder also removes every feed inside it, so say so.
  await doAction(
    node.kind === 'folder' ? t('rss.folderRemoved') : t('rss.feedRemoved'),
    () => removeRssItem(node.path),
  )
}

// --- Article actions -----------------------------------------------------
/**
 * Which article's download is in flight.
 *
 * Keyed by `feedPath:id`, NOT by `id` alone: article ids are only unique within
 * a feed, so two feeds that both contain an article "1" made BOTH download
 * buttons spin when one was clicked (AGENT.md §15 — the same trap as a
 * non-unique v-for key, which the template below already avoids).
 */
const downloading = ref<string | null>(null)

/** The identity of an article for action bookkeeping. */
function articleKey(article: RssArticle & { feedPath: string }): string {
  return `${article.feedPath}:${article.id}`
}

async function download(article: RssArticle & { feedPath: string }): Promise<void> {
  const url = article.torrentURL || article.link
  if (!url) {
    toast.error(t('rss.noTorrentLink'))
    return
  }
  downloading.value = articleKey(article)
  try {
    // Reuse the torrents endpoint: magnet links and .torrent URLs both go
    // through the normal add path, so RSS needs no separate downloader.
    const { addTorrent } = await import('@/api/torrents')
    await addTorrent({ urls: url })
    toast.success(t('rss.downloadStarted'))
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    downloading.value = null
  }
}

async function markRead(article: RssArticle & { feedPath: string }): Promise<void> {
  await doAction(t('rss.markedRead'), () =>
    markRssAsRead(article.feedPath, article.id),
  )
}

async function markAllRead(): Promise<void> {
  const target = selectedNode.value
  if (target) {
    await doAction(t('rss.markedRead'), () => markRssAsRead(target.path))
    return
  }
  // No selection: mark every feed, in parallel.
  await doAction(t('rss.markedRead'), () =>
    Promise.all(feeds.value.map((f) => markRssAsRead(f.path))),
  )
}

async function refresh(): Promise<void> {
  const target = selectedNode.value
  if (target) {
    await doAction(t('rss.refreshed'), () => refreshRssItem(target.path))
    return
  }
  await doAction(t('rss.refreshed'), () =>
    Promise.all(feeds.value.map((f) => refreshRssItem(f.path))),
  )
}

// --- Rules ---------------------------------------------------------------
const ruleFilter = ref('')

const visibleRules = computed(() => {
  const q = ruleFilter.value.trim().toLowerCase()
  const list = ruleNames.value.map((name) => ({ name, rule: rules.value[name] }))
  return q ? list.filter((r) => r.name.toLowerCase().includes(q)) : list
})

async function toggleRule(name: string, enabled: boolean): Promise<void> {
  const rule = { ...rules.value[name], enabled }
  await doAction(enabled ? t('rss.ruleEnabled') : t('rss.ruleDisabled'), () =>
    setRssRule(name, rule),
  )
}

async function doRemoveRule(): Promise<void> {
  const name = pendingRuleRemove.value
  if (!name) return
  pendingRuleRemove.value = null
  await doAction(t('rss.ruleRemoved'), () => removeRssRule(name))
}

/** Article titles currently matching a rule, fetched on demand. */
const matchesFor = ref<string | null>(null)
const matches = ref<Record<string, string[]>>({})

async function showMatches(name: string): Promise<void> {
  if (matchesFor.value === name) {
    matchesFor.value = null
    return
  }
  try {
    matches.value = await getRssMatchingArticles(name)
    matchesFor.value = name
  } catch (err) {
    toast.error(describeError(err))
  }
}
</script>

<template>
  <div class="rss">
    <header class="rss__head">
      <div>
        <h1 class="rss__title">{{ t('rss.title') }}</h1>
        <p class="rss__sub">
          {{ t('rss.feedsCount', { feeds: feeds.length }) }}
          <template v-if="unread > 0">
            · <span class="rss__unread">{{ t('rss.unreadCount', { count: unread }) }}</span>
          </template>
        </p>
      </div>

      <div class="rss__head-actions">
        <MacButton variant="secondary" size="sm" :disabled="busy" @click="openAdd('folder')">
          {{ t('rss.addFolder') }}
        </MacButton>
        <MacButton variant="primary" size="sm" :disabled="busy" @click="openAdd('feed')">
          {{ t('rss.addFeed') }}
        </MacButton>
      </div>
    </header>

    <div v-if="loading" class="rss__loading">
      <MacSpinner :size="22" :label="t('status.loading')" />
    </div>

    <div v-else-if="loadError" class="rss__error">
      <p class="break-anywhere">{{ loadError }}</p>
      <MacButton variant="secondary" @click="load">{{ t('action.retry') }}</MacButton>
    </div>

    <MacEmptyState
      v-else-if="feeds.length === 0"
      :title="t('rss.emptyTitle')"
      :description="t('rss.emptyHint')"
    >
      <template #action>
        <MacButton variant="primary" @click="openAdd('feed')">{{ t('rss.addFeed') }}</MacButton>
      </template>
    </MacEmptyState>

    <div v-else class="rss__body" :class="{ 'rss__body--mobile': isMobile }">
      <!-- ===== Feed tree ===== -->
      <aside class="rss__tree" :aria-label="t('rss.title')">
        <button
          type="button"
          class="rss__node"
          :class="{ 'is-active': selectedPath === '' }"
          @click="selectedPath = ''"
        >
          <span class="rss__node-name">{{ t('rss.allFeeds') }}</span>
          <MacBadge v-if="unread > 0" tone="accent" size="sm">{{ unread }}</MacBadge>
        </button>

        <!--
          One recursive component per node. Rendering the tree inline with two
          hard-coded levels silently dropped folders nested inside folders; see
          RssTreeNode.vue for the full reasoning.
        -->
        <RssTreeNode
          v-for="node in tree"
          :key="node.path"
          :node="node"
          :selected-path="selectedPath"
          @select="selectedPath = $event"
        />
      </aside>

      <!-- ===== Articles ===== -->
      <section class="rss__articles">
        <div class="rss__toolbar">
          <MacInput
            v-model="search"
            type="search"
            :placeholder="t('rss.filterArticles')"
            inputmode="search"
          />
          <MacButton variant="secondary" size="sm" :disabled="busy" @click="refresh">
            {{ t('action.refresh') }}
          </MacButton>
          <MacButton variant="ghost" size="sm" :disabled="busy || unread === 0" @click="markAllRead">
            {{ t('rss.markAllRead') }}
          </MacButton>
          <MacButton
            v-if="selectedNode"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="confirmRemove(selectedNode)"
          >
            {{ t('action.delete') }}
          </MacButton>
        </div>

        <MacEmptyState v-if="articles.length === 0" compact :title="t('rss.noArticles')" />

        <ul v-else class="rss__list">
          <li
            v-for="article in articles"
            :key="`${article.feedPath}:${article.id}`"
            class="rss__article"
            :class="{ 'is-read': article.isRead }"
          >
            <div class="rss__article-main">
              <a
                v-if="article.link"
                class="rss__article-title"
                :href="article.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ article.title || t('rss.untitled') }}
              </a>
              <span v-else class="rss__article-title">
                {{ article.title || t('rss.untitled') }}
              </span>

              <p class="rss__article-meta">
                <span>{{ article.feedName }}</span>
                <template v-if="formatDate(article.date)">
                  · <span>{{ formatDate(article.date) }}</span>
                </template>
                <template v-if="article.author"> · <span>{{ article.author }}</span></template>
              </p>
            </div>

            <div class="rss__article-actions">
              <MacButton
                v-if="article.torrentURL || article.link"
                variant="primary"
                size="sm"
                :loading="downloading === articleKey(article)"
                @click="download(article)"
              >
                {{ t('action.download') }}
              </MacButton>
              <MacButton
                v-if="!article.isRead"
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="markRead(article)"
              >
                {{ t('rss.markRead') }}
              </MacButton>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- ===== Auto-download rules ===== -->
    <MacCard v-if="!loading && !loadError && ruleNames.length > 0" padding="md" class="rss__rules">
      <div class="rss__rules-head">
        <h2 class="rss__rules-title">{{ t('rss.rules') }}</h2>
        <MacInput
          v-model="ruleFilter"
          type="search"
          :placeholder="t('rss.filterRules')"
          class="rss__rules-filter"
        />
      </div>

      <ul class="rss__rule-list">
        <li v-for="entry in visibleRules" :key="entry.name" class="rss__rule">
          <div class="rss__rule-main">
            <span class="rss__rule-name">{{ entry.name }}</span>
            <p v-if="entry.rule.mustContain" class="rss__rule-desc">
              {{ t('rss.mustContain') }}: <code>{{ entry.rule.mustContain }}</code>
            </p>
            <p v-if="entry.rule.assignedCategory" class="rss__rule-desc">
              {{ t('rss.category') }}: {{ entry.rule.assignedCategory }}
            </p>
            <p v-if="entry.rule.savePath" class="rss__rule-desc">
              {{ t('rss.savePath') }}: {{ entry.rule.savePath }}
            </p>
          </div>

          <div class="rss__rule-actions">
            <MacButton variant="ghost" size="sm" @click="showMatches(entry.name)">
              {{ matchesFor === entry.name ? t('action.hide') : t('rss.showMatches') }}
            </MacButton>
            <MacButton variant="ghost" size="sm" @click="pendingRuleRemove = entry.name">
              {{ t('action.delete') }}
            </MacButton>
            <MacToggle
              :model-value="entry.rule.enabled !== false"
              @update:model-value="(v: boolean) => toggleRule(entry.name, v)"
            />
          </div>

          <div
            v-if="matchesFor === entry.name"
            class="rss__matches"
          >
            <p v-if="Object.keys(matches).length === 0" class="rss__rule-desc">
              {{ t('rss.noMatches') }}
            </p>
            <template v-for="(titles, feed) in matches" :key="feed">
              <p class="rss__matches-feed">{{ feed }}</p>
              <ul class="rss__matches-list">
                <li v-for="title in titles" :key="title">{{ title }}</li>
              </ul>
            </template>
          </div>
        </li>
      </ul>
    </MacCard>

    <!-- ===== Add feed / folder ===== -->
    <MacModal
      v-model:open="showAdd"
      :title="addMode === 'feed' ? t('rss.addFeed') : t('rss.addFolder')"
    >
      <div class="rss__form">
        <label v-if="addMode === 'feed'" class="rss__field">
          <span class="rss__label">{{ t('rss.feedUrl') }}</span>
          <MacInput v-model="addUrl" placeholder="https://example.com/feed.xml" />
        </label>

        <label class="rss__field">
          <span class="rss__label">
            {{ addMode === 'feed' ? t('rss.parentFolder') : t('rss.folderPath') }}
          </span>
          <MacInput v-model="addPath" :placeholder="t('rss.pathPlaceholder')" />
        </label>

        <p class="rss__hint">{{ addMode === 'feed' ? t('rss.feedPathHint') : t('rss.folderPathHint') }}</p>
        <p v-if="addError" class="rss__error-text">{{ addError }}</p>
      </div>

      <template #footer>
        <MacButton variant="secondary" @click="showAdd = false">{{ t('action.cancel') }}</MacButton>
        <MacButton variant="primary" :loading="busy" @click="submitAdd">
          {{ t('action.add') }}
        </MacButton>
      </template>
    </MacModal>

    <!-- ===== Confirmations =====
         ConfirmDialog owns dismissal (its Cancel sets the model false) and only
         emits `confirm`, so the handlers below close it themselves. -->
    <ConfirmDialog
      v-model:open="removeOpen"
      :title="t('action.delete')"
      :message="
        pendingRemove?.kind === 'folder' ? t('rss.confirmRemoveFolder') : t('rss.confirmRemoveFeed')
      "
      danger
      @confirm="doRemove"
    />

    <ConfirmDialog
      v-model:open="ruleRemoveOpen"
      :title="t('action.delete')"
      :message="t('rss.confirmRemoveRule')"
      danger
      @confirm="doRemoveRule"
    />
  </div>
</template>

<style scoped>
.rss {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.rss__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.rss__title {
  font-size: var(--text-xl);
  font-weight: 700;
}

.rss__sub {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.rss__unread {
  color: var(--accent-text);
  font-weight: 600;
}

.rss__head-actions {
  display: flex;
  gap: var(--space-2);
}

.rss__loading {
  display: grid;
  place-items: center;
  padding: var(--space-10);
}

.rss__error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--danger-soft);
  color: var(--danger-text);
}

/* ---- Body: tree | articles ---- */
.rss__body {
  display: grid;
  grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  min-width: 0;
}

.rss__body--mobile {
  grid-template-columns: minmax(0, 1fr);
}

.rss__tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  min-width: 0;
}

.rss__node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.rss__node:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.rss__node.is-active {
  background: var(--bg-selected);
  color: var(--text-primary);
  font-weight: 600;
}

.rss__node--folder {
  font-weight: 600;
  color: var(--text-primary);
}

.rss__node--child {
  padding-left: var(--space-4);
}

.rss__node-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rss__children {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.rss__warn {
  flex: none;
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: var(--radius-pill);
  background: var(--danger-soft);
  color: var(--danger-text);
  font-size: 10px;
  font-weight: 700;
}

/* ---- Articles ---- */
.rss__articles {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.rss__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.rss__toolbar > :first-child {
  flex: 1 1 14rem;
  min-width: 0;
}

.rss__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rss__article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  min-width: 0;
}

/* Read articles recede rather than disappearing, so the list does not reflow
   under the pointer when something is marked read. */
.rss__article.is-read {
  opacity: 0.62;
}

.rss__article-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.rss__article-title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  overflow-wrap: anywhere;
}

a.rss__article-title:hover {
  color: var(--accent-text);
  text-decoration: underline;
}

.rss__article-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.rss__article-actions {
  display: flex;
  gap: var(--space-2);
  flex: none;
}

/* ---- Rules ---- */
.rss__rules {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rss__rules-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.rss__rules-title {
  font-size: var(--text-md);
  font-weight: 600;
}

.rss__rules-filter {
  flex: 1 1 12rem;
  max-width: 20rem;
}

.rss__rule-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rss__rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2) var(--space-4);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  min-width: 0;
}

.rss__rule-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rss__rule-name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.rss__rule-desc {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.rss__rule-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.rss__matches {
  grid-column: 1 / -1;
  padding-top: var(--space-2);
  border-top: 1px solid var(--separator);
  min-width: 0;
}

.rss__matches-feed {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: var(--space-2);
}

.rss__matches-list {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* ---- Form ---- */
.rss__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.rss__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.rss__label {
  font-size: var(--text-sm);
  font-weight: 500;
}

.rss__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.rss__error-text {
  font-size: var(--text-sm);
  color: var(--danger-text);
}

@media (max-width: 599px) {
  .rss__article {
    flex-direction: column;
    align-items: stretch;
  }

  .rss__article-actions {
    justify-content: flex-end;
  }
}
</style>
