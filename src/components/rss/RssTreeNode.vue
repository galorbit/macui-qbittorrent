<script setup lang="ts">
/**
 * One node of the RSS tree — recursively, so nesting is not limited to a depth
 * the template happens to mention.
 *
 * WHY THIS COMPONENT EXISTS
 * ------------------------
 * The tree was previously rendered inline with exactly two levels hard-coded: a
 * root loop, and for a folder a loop over `children.filter(c => c.kind ===
 * 'feed')`. A folder *inside* a folder was therefore dropped from the DOM
 * entirely — invisible and unclickable — even though `parseRssItems` builds the
 * tree recursively and the server nests arbitrarily deep. A folder could even
 * advertise "1 unread" for a feed the user had no way to reach.
 *
 * Recursion is the only shape that cannot drift out of step with the parser.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { unreadCount } from '@/api/rss'
import type { RssFeed, RssFolder, RssNode } from '@/types/api'
import MacBadge from '@/components/base/MacBadge.vue'

const props = defineProps<{
  node: RssNode
  selectedPath: string
  /** Nesting level, used only for indentation. */
  depth?: number
}>()

const emit = defineEmits<{ (e: 'select', path: string): void }>()

const { t } = useI18n()

const feed = computed(() => (props.node.kind === 'feed' ? (props.node as RssFeed) : null))
const folder = computed(() => (props.node.kind === 'folder' ? (props.node as RssFolder) : null))

/** Unread articles directly on a feed. */
const feedUnread = computed(() => (feed.value?.articles ?? []).filter((a) => !a.isRead).length)

/** Unread articles anywhere beneath a folder. */
const folderUnread = computed(() => (folder.value ? unreadCount(folder.value.children) : 0))

/** Feeds may carry a display title distinct from their node name. */
const label = computed(() => feed.value?.title || props.node.name)
const indent = computed(() => ({ '--rss-depth': String(props.depth ?? 0) }))
</script>

<template>
  <!-- Folder: a header plus its children, at any depth -->
  <div v-if="folder" class="rss__folder" :style="indent">
    <button
      type="button"
      class="rss__node rss__node--folder"
      :class="{ 'is-active': selectedPath === folder.path }"
      @click="emit('select', folder.path)"
    >
      <span class="rss__node-name">{{ folder.name }}</span>
      <MacBadge v-if="folderUnread > 0" tone="accent" size="sm">{{ folderUnread }}</MacBadge>
    </button>
    <div class="rss__children">
      <RssTreeNode
        v-for="child in folder.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
      />
    </div>
  </div>

  <!-- Feed -->
  <button
    v-else-if="feed"
    type="button"
    class="rss__node"
    :class="[depth ? 'rss__node--child' : '', { 'is-active': selectedPath === feed.path }]"
    :style="indent"
    @click="emit('select', feed.path)"
  >
    <span class="rss__node-name" :title="feed.name">{{ label }}</span>
    <span v-if="feed.hasError" class="rss__warn" :title="t('rss.feedError')">!</span>
    <MacBadge v-if="feedUnread > 0" tone="accent" size="sm">{{ feedUnread }}</MacBadge>
  </button>
</template>

<style scoped>
/*
 * Indentation by depth.
 *
 * Applied as padding rather than nested margins so that arbitrarily deep folders
 * stay readable in a narrow sidebar, and so the highlight of the active node
 * still spans the full row width.
 */
.rss__node {
  padding-left: calc(var(--space-3) + (var(--rss-depth, 0) * var(--space-3)));
}

.rss__node--child {
  font-size: var(--text-sm);
}
</style>