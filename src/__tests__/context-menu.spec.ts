/**
 * Tests for the torrent context menu.
 *
 * THE POINT OF THIS SUITE
 * -----------------------
 * A context menu is easy to make look complete and do nothing. The menu here
 * renders from data, so these tests can assert the two things that actually
 * matter:
 *
 *   1. every item the menu OFFERS has a handler that is wired to a real API
 *      call — no item reaches the UI without an implementation;
 *   2. the visibility rules match the official WebUI, because a menu that shows
 *      "Stop" for something already stopped (or hides "Start" when it is the
 *      only useful action) is wrong even though it is not broken.
 *
 * Item ids are declared once in the builder and consumed once in the dispatcher.
 * The first test below cross-checks those two lists, so adding an item without
 * wiring it up fails the build rather than shipping a dead menu row.
 */
import { describe, expect, it } from 'vitest'
import { buildTorrentMenu } from '@/composables/useTorrentContextMenu'
import type { Torrent } from '@/types/api'

/** Minimal torrent factory; only the fields the menu reads are meaningful. */
function torrent(over: Partial<Torrent> = {}): Torrent {
  return {
    hash: 'a'.repeat(40),
    name: 'debian-13.0.0-amd64-netinst.iso',
    size: 659554304,
    progress: 1,
    dlspeed: 0,
    upspeed: 0,
    priority: 0,
    num_seeds: 0,
    num_complete: 0,
    num_leechs: 0,
    num_incomplete: 0,
    ratio: 0,
    eta: 0,
    state: 'uploading',
    seq_dl: false,
    f_l_piece_prio: false,
    completion_on: 0,
    tracker: '',
    dl_limit: 0,
    up_limit: 0,
    downloaded: 0,
    uploaded: 0,
    downloaded_session: 0,
    uploaded_session: 0,
    amount_left: 0,
    save_path: '/downloads',
    completed: 0,
    max_ratio: -1,
    max_seeding_time: -1,
    ratio_limit: -2,
    seeding_time_limit: -2,
    seen_complete: 0,
    last_activity: 0,
    total_size: 659554304,
    category: '',
    tags: '',
    ...over,
  } as Torrent
}

/** Identity translator: the assertions are about structure, not wording. */
const t = (key: string) => key

function build(torrents: Torrent[], categories: string[] = [], tags: string[] = []) {
  return buildTorrentMenu({ t, torrents, categories, tags })
}

/** Flatten to every id reachable in the menu, including submenu children. */
function allIds(items: ReturnType<typeof build>): string[] {
  const out: string[] = []
  for (const item of items) {
    out.push(item.id)
    if (item.children?.length) out.push(...allIds(item.children))
  }
  return out
}

/** Return type is annotated because `find` calls itself, which otherwise
 *  makes TypeScript infer `any` for the recursive result. */
function find(
  items: ReturnType<typeof build>,
  id: string,
): ReturnType<typeof build>[number] | undefined {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children?.length) {
      const hit = find(item.children, id)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Every id the dispatcher in DashboardView handles.
 *
 * Kept in sync by hand on purpose: the test below fails if the builder starts
 * emitting an id that is not in this set, which is the signal that someone added
 * a menu row without an implementation.
 */
const HANDLED = new Set([
  // direct actions
  'start', 'stop', 'forceStart', 'remove', 'removeWithFiles', 'setLocation',
  'rename', 'renameFiles', 'autoTMM', 'sequential', 'firstLast', 'superSeeding',
  'downloadLimit', 'uploadLimit', 'shareRatio', 'recheck', 'reannounce', 'export',
  'superSeedingDisabled',
  // prefixed families, handled by prefix in onMenuSelect
  'category', 'tags', 'queue', 'copy',
])

describe('buildTorrentMenu — completeness', () => {
  it('returns nothing for an empty selection', () => {
    expect(build([])).toEqual([])
  })

  it('emits no item that the dispatcher cannot handle', () => {
    // A row that renders but does nothing is the failure this guards against.
    const items = build(
      [torrent()],
      ['Linux'],
      ['iso'],
    )
    const unknown = allIds(items).filter(
      (id) =>
        !HANDLED.has(id) &&
        !id.startsWith('category:') &&
        !id.startsWith('tag:') &&
        !id.startsWith('queue:') &&
        !id.startsWith('copy:') &&
        id !== 'tags:add' &&
        id !== 'tags:none',
    )
    expect(unknown).toEqual([])
  })

  it('offers every action the official WebUI menu offers', () => {
    /*
     * A union over two selections, not one fixture.
     *
     * The lifecycle trio is mutually pruned (see the rules further down), so no
     * selection can contain all three at once — and rename/renameFiles exist
     * only for a single torrent. Asserting this against one fixture is therefore
     * impossible rather than merely awkward; it only passed before because the
     * pruning was incomplete and Start was offered for a running torrent.
     */
    const ids = new Set([
      ...allIds(build([torrent({ progress: 0.5, state: 'downloading' })], ['Linux'], ['iso'])),
      ...allIds(
        build(
          [
            torrent({ hash: 'a'.repeat(40), state: 'pausedDL' }),
            torrent({ hash: 'b'.repeat(40), state: 'downloading', progress: 0.5 }),
          ],
          ['Linux'],
          ['iso'],
        ),
      ),
    ])
    const has = (id: string) => ids.has(id)

    // From torrentsTableMenu in qBittorrent's index.html.
    for (const required of [
      'start', 'stop', 'forceStart', 'remove', 'setLocation', 'rename', 'renameFiles',
      'autoTMM', 'downloadLimit', 'uploadLimit', 'shareRatio',
      'sequential', 'firstLast', 'recheck', 'reannounce', 'export',
    ]) {
      expect(has(required), `missing official menu item: ${required}`).toBe(true)
    }

    // Submenu parents
    for (const parent of ['category', 'tags', 'queue', 'copy']) {
      expect(has(parent), `missing submenu: ${parent}`).toBe(true)
    }
  })
})

describe('buildTorrentMenu — lifecycle rules', () => {
  it('hides Stop when every selected torrent is already stopped', () => {
    const items = build([torrent({ state: 'pausedDL', progress: 0.3 })])
    expect(find(items, 'start')).toBeDefined()
    expect(find(items, 'stop'), 'Stop shown for an already-stopped torrent').toBeUndefined()
  })

  it('hides Force Start (not Start) when everything is already force-started', () => {
    /*
     * The official rule, from TorrentsTableContextMenu.updateMenuItems:
     *
     *   if (all_are_stopped)      hideItem("stop")
     *   else if (all_are_force_start) hideItem("forceStart")
     *   else if (!there_are_stopped && !there_are_force_start) hideItem("start")
     *
     * So a fully force-started selection keeps Start and loses Force Start. My
     * first version of this test asserted the opposite and was wrong — the
     * implementation matched upstream.
     */
    const items = build([torrent({ force_start: true })])
    expect(find(items, 'start'), 'Start should remain available').toBeDefined()
    expect(find(items, 'forceStart'), 'Force Start is already applied').toBeUndefined()
    expect(find(items, 'stop')).toBeDefined()
  })

  it('hides Start for a torrent that is already running', () => {
    /*
     * The third branch of the official chain quoted above. This test used to
     * assert the opposite ("shows Start and Stop for a running torrent") while
     * its sibling quoted the rule that forbids it — the implementation offered a
     * Start that could only ever be a no-op.
     */
    const items = build([torrent({ state: 'downloading', progress: 0.5 })])
    expect(find(items, 'start'), 'Start cannot do anything for a running torrent').toBeUndefined()
    expect(find(items, 'stop')).toBeDefined()
    expect(find(items, 'forceStart')).toBeDefined()
  })

  it('keeps all three lifecycle items across a mixed selection', () => {
    // Official behaviour: a mix has something to start and something to stop,
    // and nothing is force-started, so the first two branches do not apply.
    // (`there_are_stopped` being true is what keeps Start visible here.)
    const items = build([
      torrent({ hash: 'a'.repeat(40), state: 'pausedDL' }),
      torrent({ hash: 'b'.repeat(40), state: 'downloading', progress: 0.5 }),
    ])
    expect(find(items, 'stop')).toBeDefined()
    expect(find(items, 'start')).toBeDefined()
    expect(find(items, 'forceStart')).toBeDefined()
  })
})

describe('buildTorrentMenu — completion-dependent items', () => {
  it('offers Super Seeding and drops the download-only toggles once complete', () => {
    const items = build([torrent({ progress: 1 })])
    expect(find(items, 'superSeeding')).toBeDefined()
    expect(find(items, 'sequential'), 'sequential download offered for a complete torrent').toBeUndefined()
    expect(find(items, 'firstLast')).toBeUndefined()
    // As in the stock menu, a finished torrent has no use for a download limit.
    expect(find(items, 'downloadLimit'), 'download limit offered for a complete torrent').toBeUndefined()
    expect(find(items, 'uploadLimit')?.separator, 'the separator must move down').toBe(true)
  })

  it('offers the download-only toggles while still downloading', () => {
    const items = build([torrent({ progress: 0.4, state: 'downloading' })])
    expect(find(items, 'sequential')).toBeDefined()
    expect(find(items, 'firstLast')).toBeDefined()
    expect(find(items, 'superSeeding')).toBeUndefined()
    expect(find(items, 'downloadLimit')).toBeDefined()
  })
})

describe('buildTorrentMenu — single versus multiple', () => {
  it('offers rename only for exactly one torrent', () => {
    const one = build([torrent()])
    expect(find(one, 'rename')).toBeDefined()

    const many = build([torrent({ hash: 'a'.repeat(40) }), torrent({ hash: 'b'.repeat(40) })])
    expect(find(many, 'rename')).toBeUndefined()
    expect(find(many, 'renameFiles')).toBeUndefined()
  })

  it('hides renameFiles while metadata is still being fetched', () => {
    // A magnet link that has not resolved has no file list to rename.
    const items = build([torrent({ state: 'metaDL', size: 0, total_size: -1 })])
    expect(find(items, 'rename')).toBeDefined()
    expect(find(items, 'renameFiles')).toBeUndefined()
  })

  it('disables export while metadata is still being fetched', () => {
    const items = build([torrent({ state: 'metaDL', size: 0, total_size: -1 })])
    const exportItem = find(items, 'export')
    expect(exportItem?.disabled).toBe(true)
  })
})

describe('buildTorrentMenu — checked and indeterminate state', () => {
  it('ticks a flag when every selected torrent has it', () => {
    const items = build([
      torrent({ hash: 'a'.repeat(40), seq_dl: true, progress: 0.5, state: 'downloading' }),
      torrent({ hash: 'b'.repeat(40), seq_dl: true, progress: 0.5, state: 'downloading' }),
    ])
    expect(find(items, 'sequential')?.checked).toBe(true)
    expect(find(items, 'sequential')?.indeterminate).toBe(false)
  })

  it('shows a partial mark when only some selected torrents have it', () => {
    const items = build([
      torrent({ hash: 'a'.repeat(40), seq_dl: true, progress: 0.5, state: 'downloading' }),
      torrent({ hash: 'b'.repeat(40), seq_dl: false, progress: 0.5, state: 'downloading' }),
    ])
    expect(find(items, 'sequential')?.checked).toBe(false)
    expect(find(items, 'sequential')?.indeterminate).toBe(true)
  })

  it('ticks a category only when the whole selection shares it', () => {
    const items = build(
      [
        torrent({ hash: 'a'.repeat(40), category: 'Linux' }),
        torrent({ hash: 'b'.repeat(40), category: 'Linux' }),
      ],
      ['Linux', 'Other'],
    )
    expect(find(items, 'category:Linux')?.checked).toBe(true)
    expect(find(items, 'category:Other')?.checked).toBe(false)
  })

  it('lists every category and tag the server knows about', () => {
    const items = build([torrent()], ['Linux', 'Films'], ['iso', 'archive'])
    for (const name of ['Linux', 'Films']) expect(find(items, `category:${name}`)).toBeDefined()
    for (const name of ['iso', 'archive']) expect(find(items, `tag:${name}`)).toBeDefined()
  })

  it('marks a tag as indeterminate when only some torrents carry it', () => {
    const items = build(
      [
        torrent({ hash: 'a'.repeat(40), tags: 'iso, archive' }),
        torrent({ hash: 'b'.repeat(40), tags: 'iso' }),
      ],
      [],
      ['iso', 'archive'],
    )
    expect(find(items, 'tag:iso')?.checked).toBe(true)
    expect(find(items, 'tag:archive')?.indeterminate).toBe(true)
  })
})

describe('buildTorrentMenu — destructive items', () => {
  it('marks both removal items as dangerous', () => {
    const items = build([torrent()])
    expect(find(items, 'remove')?.danger).toBe(true)
    expect(find(items, 'removeWithFiles')?.danger).toBe(true)
  })
})
