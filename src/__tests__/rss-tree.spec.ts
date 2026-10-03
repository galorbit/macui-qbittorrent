/**
 * Tests for the RSS tree parser.
 *
 * The parser exists because `/api/v2/rss/items` returns a NESTED OBJECT, not an
 * array, and a folder and a feed are both plain objects — the only thing that
 * distinguishes them is that a feed carries `url` (Folder::toJsonValue vs
 * Feed::toJsonValue in the server source). Getting that discriminator wrong
 * turns every folder into a bogus feed, which looks like data corruption in the
 * UI rather than an error.
 *
 * It also derives each node's `path` while walking, because every mutation
 * endpoint addresses feeds by path, not by uid.
 */
import { describe, expect, it } from 'vitest'
import {
  flattenFeeds,
  parseRssItems,
  unreadCount,
} from '@/api/rss'

/** A feed payload shaped the way the server sends it. */
function feed(overrides: Record<string, unknown> = {}) {
  return {
    uid: '{00000000-0000-0000-0000-000000000001}',
    url: 'https://example.com/feed.xml',
    refreshInterval: 600,
    title: 'Example feed',
    lastBuildDate: 'Mon, 06 Oct 2025 12:00:00 +0000',
    isLoading: false,
    hasError: false,
    articles: [
      { id: 'a1', title: 'First', date: 'Mon, 06 Oct 2025 12:00:00 +0000', isRead: false },
      { id: 'a2', title: 'Second', date: 'Sun, 05 Oct 2025 12:00:00 +0000', isRead: true },
    ],
    ...overrides,
  }
}

describe('parseRssItems', () => {
  it('returns nothing for the empty object the server sends with no feeds', () => {
    // A fresh install returns `{}`. Treating that as "no feeds" rather than as
    // a malformed response is what lets the view show an add affordance.
    expect(parseRssItems({})).toEqual([])
  })

  it('tolerates null and non-objects', () => {
    expect(parseRssItems(null)).toEqual([])
    expect(parseRssItems(undefined)).toEqual([])
    expect(parseRssItems([])).toEqual([])
  })

  it('parses a feed at the root, with a path equal to its name', () => {
    const nodes = parseRssItems({ News: feed() })

    expect(nodes).toHaveLength(1)
    const node = nodes[0]
    expect(node.kind).toBe('feed')
    expect(node.path).toBe('News')
    expect(node.name).toBe('News')
    if (node.kind === 'feed') {
      expect(node.url).toBe('https://example.com/feed.xml')
      expect(node.articles).toHaveLength(2)
    }
  })

  it('distinguishes a folder from a feed by the presence of `url`', () => {
    // This is the crux: both are objects.
    const nodes = parseRssItems({
      Feeds: { Inner: feed() },
    })

    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('folder')
    if (nodes[0].kind === 'folder') {
      expect(nodes[0].children).toHaveLength(1)
      expect(nodes[0].children[0].kind).toBe('feed')
    }
  })

  it('derives nested paths, which is what every mutation endpoint needs', () => {
    const nodes = parseRssItems({
      Shows: { HD: { 'My feed': feed() } },
    })

    const feeds = flattenFeeds(nodes)
    expect(feeds).toHaveLength(1)
    expect(feeds[0].path).toBe('Shows/HD/My feed')
  })

  it('sorts folders before feeds, then alphabetically', () => {
    const nodes = parseRssItems({
      Zebra: feed(),
      Alpha: feed(),
      Folder: { Inner: feed() },
    })

    expect(nodes.map((n) => [n.kind, n.name])).toEqual([
      ['folder', 'Folder'],
      ['feed', 'Alpha'],
      ['feed', 'Zebra'],
    ])
  })

  it('drops malformed entries instead of throwing', () => {
    const nodes = parseRssItems({
      Good: feed(),
      NullEntry: null as unknown as Record<string, unknown>,
      StringEntry: 'nonsense' as unknown as Record<string, unknown>,
    })

    expect(nodes.map((n) => n.name)).toEqual(['Good'])
  })

  it('normalises a missing articles array to an empty one', () => {
    // `withData=false` omits titles and articles entirely; the parser must not
    // make callers null-check.
    const nodes = parseRssItems({ Bare: { uid: 'u', url: 'https://x/y' } })

    expect(nodes[0].kind).toBe('feed')
    if (nodes[0].kind === 'feed') {
      expect(nodes[0].articles).toEqual([])
      expect(nodes[0].title).toBeUndefined()
    }
  })

  it('surfaces the server error flag rather than hiding a failed feed', () => {
    const nodes = parseRssItems({ Broken: feed({ hasError: true }) })
    expect(nodes[0].kind === 'feed' && nodes[0].hasError).toBe(true)
  })
})

describe('flattenFeeds', () => {
  it('collects feeds at every depth, in document order', () => {
    // Folders sort before feeds at every level, so inside "Folder" the nested
    // "Deeper" branch is walked before its sibling feed "B".
    const nodes = parseRssItems({
      A: feed(),
      Folder: {
        B: feed(),
        Deeper: { C: feed() },
      },
    })

    expect(flattenFeeds(nodes).map((f) => f.path)).toEqual([
      'Folder/Deeper/C',
      'Folder/B',
      'A',
    ])
  })
})

describe('unreadCount', () => {
  it('counts unread articles across the whole tree', () => {
    // Two feeds, one unread each => 2. The fixture has one unread per feed.
    const nodes = parseRssItems({
      A: feed(),
      Folder: { B: feed() },
    })

    expect(unreadCount(nodes)).toBe(2)
  })

  it('counts articles the server has already marked read as read', () => {
    const nodes = parseRssItems({
      A: feed({
        articles: [
          { id: 'x', title: 'x', isRead: true },
          { id: 'y', title: 'y', isRead: true },
        ],
      }),
    })

    expect(unreadCount(nodes)).toBe(0)
  })

  it('treats a missing isRead as unread', () => {
    // The server omits the key rather than sending false.
    const nodes = parseRssItems({
      A: feed({ articles: [{ id: 'x', title: 'x' }] }),
    })

    expect(unreadCount(nodes)).toBe(1)
  })
})
