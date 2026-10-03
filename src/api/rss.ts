/**
 * `rss` endpoints.
 *
 * THE TREE SHAPE
 * --------------
 * `/api/v2/rss/items` returns the ROOT FOLDER as a plain object, not an array:
 *
 *   {
 *     "Feed name":  { uid, url, title, articles: [...] },
 *     "Folder name": {
 *       "Nested feed": { uid, url, ... }
 *     }
 *   }
 *
 * A folder and a feed are BOTH objects, so the only way to tell them apart is
 * that a feed carries `url` (see Feed::toJsonValue vs Folder::toJsonValue in
 * the server source). `parseRssItems` relies on exactly that, and is the reason
 * this lives here rather than in the view.
 *
 * Paths are built while walking, because every mutation endpoint takes a
 * slash-separated `path` — not the `uid`.
 */
import { http, toForm } from './http'
import type { RssNode, RssArticle, RssFeed, RssRule } from '@/types/api'

/** Raw payload: folder name -> feed or nested folder. */
type RawItems = Record<string, Record<string, unknown>>

/** True when a node object is a feed rather than a folder. */
function isFeed(node: Record<string, unknown>): boolean {
  return typeof node.url === 'string'
}

function toArticles(raw: unknown): RssArticle[] {
  if (!Array.isArray(raw)) return []
  return raw.map((a) => {
    const o = (a ?? {}) as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      title: String(o.title ?? ''),
      date: o.date === undefined ? undefined : String(o.date),
      author: o.author === undefined ? undefined : String(o.author),
      description: o.description === undefined ? undefined : String(o.description),
      torrentURL: o.torrentURL === undefined ? undefined : String(o.torrentURL),
      link: o.link === undefined ? undefined : String(o.link),
      isRead: Boolean(o.isRead),
    }
  })
}

/**
 * Walk the nested object into a node tree, deriving each path as it goes.
 *
 * `parentPath` is the already-joined path of the containing folder, so a feed
 * at the root is "Name" and one inside "News" is "News/Name".
 */
export function parseRssItems(raw: unknown, parentPath = ''): RssNode[] {
  if (!raw || typeof raw !== 'object') return []

  const out: RssNode[] = []

  for (const [name, value] of Object.entries(raw as RawItems)) {
    if (!value || typeof value !== 'object') continue

    const path = parentPath ? `${parentPath}/${name}` : name

    if (isFeed(value)) {
      const feed: RssFeed = {
        kind: 'feed',
        path,
        name,
        uid: String(value.uid ?? ''),
        url: String(value.url ?? ''),
        refreshInterval: value.refreshInterval === undefined ? undefined : Number(value.refreshInterval),
        title: value.title === undefined ? undefined : String(value.title),
        lastBuildDate: value.lastBuildDate === undefined ? undefined : String(value.lastBuildDate),
        isLoading: Boolean(value.isLoading),
        hasError: Boolean(value.hasError),
        articles: toArticles(value.articles),
      }
      out.push(feed)
    } else {
      out.push({
        kind: 'folder',
        path,
        name,
        children: parseRssItems(value, path),
      })
    }
  }

  return out.sort((a, b) => {
    // Folders first, then alphabetically — matches how a file tree is read.
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** Flatten a tree to just its feeds, for the article list and counts. */
export function flattenFeeds(nodes: RssNode[]): RssFeed[] {
  const out: RssFeed[] = []
  for (const node of nodes) {
    if (node.kind === 'feed') out.push(node)
    else out.push(...flattenFeeds(node.children))
  }
  return out
}

/** Unread count for a subtree (folders aggregate their children). */
export function unreadCount(nodes: RssNode[]): number {
  let total = 0
  for (const node of nodes) {
    if (node.kind === 'feed') {
      total += (node.articles ?? []).filter((a) => !a.isRead).length
    } else {
      total += unreadCount(node.children)
    }
  }
  return total
}

/**
 * The whole feed tree.
 *
 * `withData` is required for titles and articles; without it the server returns
 * only uid/url/refreshInterval, which is not enough to render anything.
 */
export async function getRssItems(withData = true): Promise<Record<string, unknown>> {
  const { data } = await http.get('rss/items', { params: { withData } })
  return (data ?? {}) as Record<string, unknown>
}

export async function addRssFeed(
  url: string,
  path: string,
  refreshInterval = 0,
): Promise<void> {
  await http.post('rss/addFeed', toForm({ url, path, refreshInterval }))
}

export async function addRssFolder(path: string): Promise<void> {
  await http.post('rss/addFolder', toForm({ path }))
}

export async function removeRssItem(path: string): Promise<void> {
  await http.post('rss/removeItem', toForm({ path }))
}

export async function moveRssItem(itemPath: string, destPath: string): Promise<void> {
  await http.post('rss/moveItem', toForm({ itemPath, destPath }))
}

/** Mark a whole feed/folder read, or a single article when `articleId` is given. */
export async function markRssAsRead(itemPath: string, articleId?: string): Promise<void> {
  await http.post('rss/markAsRead', toForm(articleId ? { itemPath, articleId } : { itemPath }))
}

export async function refreshRssItem(itemPath: string): Promise<void> {
  await http.post('rss/refreshItem', toForm({ itemPath }))
}

export async function setRssFeedUrl(path: string, url: string): Promise<void> {
  await http.post('rss/setFeedURL', toForm({ path, url }))
}

export async function setRssFeedRefreshInterval(
  path: string,
  refreshInterval: number,
): Promise<void> {
  await http.post('rss/setFeedRefreshInterval', toForm({ path, refreshInterval }))
}

export async function getRssRules(): Promise<Record<string, RssRule>> {
  const { data } = await http.get('rss/rules')
  return (data ?? {}) as Record<string, RssRule>
}

export async function setRssRule(ruleName: string, rule: RssRule): Promise<void> {
  await http.post('rss/setRule', toForm({ ruleName, ruleDef: JSON.stringify(rule) }))
}

export async function removeRssRule(ruleName: string): Promise<void> {
  await http.post('rss/removeRule', toForm({ ruleName }))
}

export async function renameRssRule(ruleName: string, newRuleName: string): Promise<void> {
  await http.post('rss/renameRule', toForm({ ruleName, newRuleName }))
}

/** Feed name -> article titles that currently match a rule. */
export async function getRssMatchingArticles(
  ruleName: string,
): Promise<Record<string, string[]>> {
  const { data } = await http.get('rss/matchingArticles', { params: { ruleName } })
  return (data ?? {}) as Record<string, string[]>
}
