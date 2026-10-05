/**
 * End-to-end proof that every torrent context-menu item DOES something.
 *
 * WHY THIS EXISTS
 * ---------------
 * The requirement was explicit: the menu must not be decorative. Asserting that
 * the menu *renders* the right rows (context-menu.spec.ts) does not prove that
 * clicking them has an effect — the dispatcher could fall through to `default`
 * for every id and both the menu and its tests would look perfectly healthy.
 *
 * So this suite mounts the real DashboardView with the torrents API mocked, opens
 * the real menu on a real row, clicks each item, and asserts that a specific API
 * function was called with specific arguments. Anything that silently does
 * nothing fails here.
 *
 * A few items legitimately do NOT call the API (Copy writes to the clipboard,
 * Export downloads a file, Remove opens a confirmation first). Those are asserted
 * against their actual effect instead of being skipped, so no item goes unchecked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

/*
 * `vi.mock` factories are hoisted above every import and top-level const, so the
 * spies must be created inside `vi.hoisted` — otherwise the factory runs before
 * `api` exists and the whole file fails to load.
 */
const api = vi.hoisted(() => ({
  pauseTorrents: vi.fn(async () => undefined),
  resumeTorrents: vi.fn(async () => undefined),
  setForceStart: vi.fn(async () => undefined),
  deleteTorrents: vi.fn(async () => undefined),
  recheckTorrents: vi.fn(async () => undefined),
  reannounceTorrents: vi.fn(async () => undefined),
  setSequentialDownload: vi.fn(async () => undefined),
  toggleFirstLastPiecePrio: vi.fn(async () => undefined),
  setAutoManagement: vi.fn(async () => undefined),
  setSuperSeeding: vi.fn(async () => undefined),
  setCategory: vi.fn(async () => undefined),
  createCategory: vi.fn(async () => undefined),
  setLocation: vi.fn(async () => undefined),
  renameTorrent: vi.fn(async () => undefined),
  addTags: vi.fn(async () => undefined),
  removeTags: vi.fn(async () => undefined),
  createTags: vi.fn(async () => undefined),
  setTorrentDownloadLimit: vi.fn(async () => undefined),
  setTorrentUploadLimit: vi.fn(async () => undefined),
  setShareLimits: vi.fn(async () => undefined),
  setTorrentPriority: vi.fn(async () => undefined),
  getTorrentTrackers: vi.fn(async () => [{ url: 'https://tracker.example/announce', tier: 0 }]),
  exportTorrent: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
  getTorrentFiles: vi.fn(async () => []),
  buildMagnetLink: vi.fn((h: string, n?: string) => `magnet:?xt=urn:btih:${h}&dn=${n ?? ''}`),
  joinHashes: vi.fn((h: string[]) => h.join('|')),
}))

vi.mock('@/api/torrents', () => api)
vi.mock('@/api/app', () => ({
  getVersion: vi.fn(async () => '5.2.2'),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}))
vi.mock('@/api/sync', () => ({
  getMainData: vi.fn(async () => ({
    rid: 1,
    full_update: true,
    torrents: {},
    torrents_removed: [],
    categories: {},
    categories_removed: [],
    tags: [],
    tags_removed: [],
    server_state: { connection_status: 'connected', refresh_interval: 1500 },
  })),
}))
vi.mock('@/api/transfer', () => ({
  getTransferInfo: vi.fn(async () => ({ dl_info_speed: 0, up_info_speed: 0, dht_nodes: 0 })),
}))

import DashboardView from '@/views/DashboardView.vue'
import { i18n } from '@/i18n'
import { useSessionStore } from '@/stores/session'
import type { Torrent } from '@/types/api'

function makeTorrent(over: Partial<Torrent> = {}): Torrent {
  return {
    hash: 'a'.repeat(40),
    name: 'debian-13.0.0-amd64-netinst.iso',
    size: 659554304,
    progress: 0.5,
    dlspeed: 1024,
    upspeed: 0,
    priority: 0,
    num_seeds: 3,
    num_complete: 10,
    num_leechs: 1,
    num_incomplete: 5,
    ratio: 0.5,
    eta: 120,
    state: 'downloading',
    seq_dl: false,
    f_l_piece_prio: false,
    completion_on: 0,
    tracker: '',
    dl_limit: 0,
    up_limit: 0,
    downloaded: 1000,
    uploaded: 100,
    downloaded_session: 1000,
    uploaded_session: 100,
    amount_left: 1000,
    save_path: '/downloads',
    completed: 0,
    max_ratio: -1,
    max_seeding_time: -1,
    ratio_limit: -2,
    seeding_time_limit: -2,
    seen_complete: 0,
    last_activity: 0,
    total_size: 659554304,
    category: 'Linux',
    tags: 'iso',
    ...over,
  } as Torrent
}

/** Mount the dashboard with one or more torrents already in the store. */
async function mountDashboard(torrents: Torrent[]) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const session = useSessionStore()
  session.applyMainData({
    rid: 1,
    full_update: true,
    torrents: Object.fromEntries(torrents.map((t) => [t.hash, t])),
    torrents_removed: [],
    categories: { Linux: { name: 'Linux', savePath: '/downloads' } },
    categories_removed: [],
    tags: ['iso', 'archive'],
    tags_removed: [],
    server_state: { connection_status: 'connected', refresh_interval: 1500 },
  } as never)

  const wrapper = mount(DashboardView, {
    global: { plugins: [pinia, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  await nextTick()
  return { wrapper, session }
}

/**
 * Open the context menu on the first row by dispatching a real right-click.
 *
 * The menu is teleported to <body>, so it is queried from the document rather
 * than from the wrapper.
 */
async function openMenu(wrapper: ReturnType<typeof mount>): Promise<void> {
  const row = wrapper.find('.ttable__row')
  expect(row.exists(), 'no torrent row rendered — cannot open the menu').toBe(true)

  await row.trigger('contextmenu', { clientX: 40, clientY: 40 })
  await flushPromises()
  await nextTick()
}

/** Click a top-level menu item by its visible label. */
async function clickItem(label: string): Promise<boolean> {
  const buttons = [...document.querySelectorAll('.ctxmenu__item')] as HTMLElement[]
  const hit = buttons.find((b) => (b.textContent ?? '').trim().startsWith(label))
  if (!hit) return false
  hit.click()
  await flushPromises()
  await nextTick()
  return true
}

/** Open a submenu by hovering its parent, then click a child. */
async function clickSubmenu(parentLabel: string, childLabel: string): Promise<boolean> {
  const buttons = [...document.querySelectorAll('.ctxmenu__item')] as HTMLElement[]
  const parent = buttons.find((b) => (b.textContent ?? '').trim().startsWith(parentLabel))
  if (!parent) return false
  parent.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  await flushPromises()
  await nextTick()
  return clickItem(childLabel)
}

/** The menu is teleported and removed on close. */
function menuIsOpen(): boolean {
  return document.querySelector('.ctxmenu') !== null
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('context menu acts on the torrents API', () => {
  it('opens on right-click and closes on Escape', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    expect(menuIsOpen()).toBe(false)

    await openMenu(wrapper)
    expect(menuIsOpen(), 'right-click did not open the menu').toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    await nextTick()
    expect(menuIsOpen(), 'Escape did not close the menu').toBe(false)
  })

  it('Start calls resumeTorrents', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ state: 'pausedDL' })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.start'))).toBe(true)
    expect(api.resumeTorrents).toHaveBeenCalledWith(['a'.repeat(40)])
  })

  it('Stop calls pauseTorrents', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ state: 'downloading' })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.pause'))).toBe(true)
    expect(api.pauseTorrents).toHaveBeenCalledWith(['a'.repeat(40)])
  })

  it('Force start calls setForceStart(true)', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ state: 'downloading' })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.forceStart'))).toBe(true)
    expect(api.setForceStart).toHaveBeenCalledWith(['a'.repeat(40)], true)
  })

  it('Force recheck calls recheckTorrents', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.recheck'))).toBe(true)
    expect(api.recheckTorrents).toHaveBeenCalledWith(['a'.repeat(40)])
  })

  it('Force reannounce calls reannounceTorrents', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.reannounce'))).toBe(true)
    expect(api.reannounceTorrents).toHaveBeenCalledWith(['a'.repeat(40)])
  })

  it('Sequential download calls the toggle endpoint', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ seq_dl: false })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.sequential'))).toBe(true)
    expect(api.setSequentialDownload).toHaveBeenCalledWith(['a'.repeat(40)], true)
  })

  it('First/last piece priority calls the toggle endpoint', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ f_l_piece_prio: false })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.firstLast'))).toBe(true)
    expect(api.toggleFirstLastPiecePrio).toHaveBeenCalledWith(['a'.repeat(40)])
  })

  it('Automatic torrent management calls setAutoManagement', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ auto_tmm: false })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.autoTmm'))).toBe(true)
    expect(api.setAutoManagement).toHaveBeenCalledWith(['a'.repeat(40)], true)
  })

  it('Super seeding calls setSuperSeeding for a complete torrent', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ progress: 1, super_seeding: false })])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('menu.superSeeding'))).toBe(true)
    expect(api.setSuperSeeding).toHaveBeenCalledWith(['a'.repeat(40)], true)
  })

  it('Category submenu assigns the chosen category', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ category: '' })])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('torrent.category'), 'Linux')).toBe(true)
    expect(api.setCategory).toHaveBeenCalledWith(['a'.repeat(40)], 'Linux')
  })

  it('Tag submenu adds the chosen tag', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ tags: '' })])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('torrent.tags'), 'archive')).toBe(true)
    expect(api.addTags).toHaveBeenCalledWith(['a'.repeat(40)], ['archive'])
  })

  it('Remove all tags calls removeTags with every tag present', async () => {
    const { wrapper } = await mountDashboard([makeTorrent({ tags: 'iso, archive' })])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('torrent.tags'), i18n.global.t('menu.removeAllTags'))).toBe(true)
    const [hashes, tags] = api.removeTags.mock.calls[0] as unknown as [string[], string[]]
    expect(hashes).toEqual(['a'.repeat(40)])
    expect(tags.sort()).toEqual(['archive', 'iso'])
  })

  it('Queue submenu calls setTorrentPriority', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('menu.queue'), i18n.global.t('action.queueTop'))).toBe(true)
    expect(api.setTorrentPriority).toHaveBeenCalledWith(['a'.repeat(40)], 'topPrio')
  })

  it('Copy name writes to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined)
    // jsdom exposes `clipboard` as a getter-only property, so it must be
    // redefined rather than assigned.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })

    const { wrapper } = await mountDashboard([makeTorrent({ name: 'debian.iso' })])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('menu.copy'), i18n.global.t('torrent.name'))).toBe(true)
    expect(writeText).toHaveBeenCalledWith('debian.iso')
  })

  it('Copy magnet link builds and copies a magnet', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })

    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickSubmenu(i18n.global.t('menu.copy'), i18n.global.t('action.copyMagnet'))).toBe(true)
    expect(api.buildMagnetLink).toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('magnet:?'))
  })

  it('Export fetches the .torrent blob', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.export'))).toBe(true)
    expect(api.exportTorrent).toHaveBeenCalledWith('a'.repeat(40))
  })

  it('Remove opens a confirmation before touching the API', async () => {
    // Destructive actions must ask first; this asserts the guard exists rather
    // than skipping the item.
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.remove'))).toBe(true)
    expect(api.deleteTorrents, 'removed without confirming').not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(i18n.global.t('confirm.removeOne').slice(0, 20))
  })

  it('Remove (with files) also asks first', async () => {
    const { wrapper } = await mountDashboard([makeTorrent()])
    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.removeWithFiles'))).toBe(true)
    expect(api.deleteTorrents).not.toHaveBeenCalled()
  })
})

const A_HASH = 'a'.repeat(40)
const B_HASH = 'b'.repeat(40)

/**
 * The two-torrent fixture used by the selection tests.
 *
 * The names are distinct on purpose: the table's default sort is `added_on`
 * descending with a hash tiebreak, so two torrents that differ only by hash
 * render in the OPPOSITE order to the one they were passed in. Reading the hash
 * back from the row's visible name keeps these tests about "which row did the
 * menu act on" instead of accidentally re-testing the sort.
 */
function pair() {
  return [
    makeTorrent({ hash: A_HASH, name: 'torrent-A' }),
    makeTorrent({ hash: B_HASH, name: 'torrent-B' }),
  ]
}

/** Which torrent a rendered row stands for, taken from its visible name. */
function hashOfRow(row: { find: (selector: string) => { text: () => string } }): string {
  const name = row.find('.ttable__name').text()
  if (name === 'torrent-A') return A_HASH
  if (name === 'torrent-B') return B_HASH
  throw new Error(`unexpected row in the table: ${name}`)
}

/** Row-scoped checkbox lookup: the header carries a select-all box too. */
function rowCheckboxes(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.ttable__row .ttable__cell--check input[type="checkbox"]')
}

describe('context menu acts on the whole selection', () => {
  /**
   * The important safety property: right-clicking a row that is NOT already
   * selected must act on THAT row, not on whatever was selected before.
   *
   * Without adopt-on-open, "Remove" on row B would delete row A — the menu
   * would be pointing at the wrong torrent, which is the worst possible bug for
   * a menu whose items are destructive.
   */
  it('acts on the right-clicked row even when another row was selected', async () => {
    const [a, b] = pair()
    const { wrapper } = await mountDashboard([a, b])
    await flushPromises()

    const rows = wrapper.findAll('.ttable__row')
    expect(rows.length, 'expected one row per torrent').toBe(2)

    /*
     * Set the trap: select one row first, then right-click the OTHER one. The
     * original version of this test never selected anything, so it could not
     * have caught the bug it was written for.
     */
    const selectedFirst = rows[0]
    const rightClicked = rows[1]
    const selectedHash = hashOfRow(selectedFirst)
    const expectedHash = hashOfRow(rightClicked)
    expect(selectedHash, 'the two fixtures must be distinguishable').not.toBe(expectedHash)

    const box = selectedFirst.find('.ttable__cell--check input[type="checkbox"]')
    /*
     * A real click, not `setValue`: the table listens for `click` on the input.
     * `setValue` only fires `change`, so it used to leave the app's selection
     * untouched while still flipping `.checked` — which made the precondition
     * below pass against a DOM property the helper had just written itself.
     */
    await box.trigger('click')
    await flushPromises()
    expect(
      selectedFirst.classes(),
      'precondition: row A must be selected in app state',
    ).toContain('is-selected')

    await rightClicked.trigger('contextmenu', { clientX: 40, clientY: 80 })
    await flushPromises()
    await nextTick()

    expect(await clickItem(i18n.global.t('action.recheck'))).toBe(true)

    const call = api.recheckTorrents.mock.calls[0] as unknown as [string[]]
    expect(call?.[0], 'the menu acted on the previously selected torrent').toEqual([expectedHash])
  })

  it('applies to every row once several are ticked', async () => {
    const [a, b] = pair()
    const { wrapper } = await mountDashboard([a, b])
    await flushPromises()

    // Tick both rows directly. Driving the header "select all" would test that
    // control rather than the selection itself — hence the row-scoped lookup,
    // which must not pick up the header's own checkbox.
    const boxes = rowCheckboxes(wrapper)
    expect(boxes.length, 'expected one checkbox per row').toBe(2)
    await boxes[0].trigger('click')
    await boxes[1].trigger('click')
    await flushPromises()
    expect(
      wrapper.findAll('.ttable__row.is-selected').length,
      'precondition: both rows must be selected in app state',
    ).toBe(2)

    await openMenu(wrapper)
    expect(await clickItem(i18n.global.t('action.recheck'))).toBe(true)

    const call = api.recheckTorrents.mock.calls[0] as unknown as [string[]]
    expect(call?.[0].slice().sort()).toEqual([A_HASH, B_HASH].sort())
  })
})
