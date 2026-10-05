/**
 * Builds the torrent context menu from the current selection.
 *
 * MODELLED ON THE OFFICIAL WEBUI
 * ------------------------------
 * The item set mirrors `torrentsTableMenu` in qBittorrent's index.html, and the
 * visibility rules mirror `TorrentsTableContextMenu.updateMenuItems` in
 * contextmenu.js. Two behaviours are worth calling out because they are not
 * obvious until you use the official menu:
 *
 *  * Start / Stop / Force Start are MUTUALLY PRUNED. When everything selected is
 *    already stopped only "start" shows; when everything is force-started only
 *    "start" hides; otherwise "start" is dropped and the other two remain. The
 *    official code does exactly this, and it is what makes the menu feel like it
 *    knows what you are looking at.
 *  * A completed torrent swaps the sequential / first-last controls for Super
 *    Seeding, because those two only apply while downloading.
 *
 * Items are data, not markup, so the visibility rules can be unit-tested
 * without mounting a component.
 */
import type { ContextMenuItem } from '@/components/base/MacContextMenu.vue'
import type { Torrent } from '@/types/api'
import { isStopped } from '@/utils/format'

export interface MenuContext {
  t: (key: string, named?: Record<string, unknown>) => string
  torrents: Torrent[]
  categories: string[]
  tags: string[]
}

/**
 * True while a magnet link is still resolving.
 *
 * Metadata states differ across versions (`metaDL`, and `forcedMetaDL` on newer
 * builds), and the check is written against `string` so a state this version's
 * union does not list is still handled rather than compared against a type it
 * can never be.
 */
function isFetchingMetadata(t: Torrent): boolean {
  const s = t.state as string
  return s === 'metaDL' || s === 'forcedMetaDL'
}

/** A torrent counts as complete once progress reaches 1. */
function isComplete(t: Torrent): boolean {
  return t.progress >= 1
}

/**
 * Tick state across a mixed selection.
 *
 * `checked` means "every selected torrent has it"; `indeterminate` means "some
 * do". Showing a plain tick for a mixed selection would misrepresent the state,
 * and the next click would apply to all of them.
 */
function triState(values: boolean[]): { checked: boolean; indeterminate: boolean } {
  if (values.length === 0) return { checked: false, indeterminate: false }
  const on = values.filter(Boolean).length
  return { checked: on === values.length, indeterminate: on > 0 && on < values.length }
}

export function buildTorrentMenu(ctx: MenuContext): ContextMenuItem[] {
  const { t, torrents, categories, tags } = ctx
  if (torrents.length === 0) return []

  const single = torrents.length === 1
  const one = torrents[0]

  const allStopped = torrents.every((x) => isStopped(x.state))
  const allForceStart = torrents.every((x) => x.force_start === true)
  const allComplete = torrents.every(isComplete)

  const seq = triState(torrents.map((x) => x.seq_dl === true))
  const flp = triState(torrents.map((x) => x.f_l_piece_prio === true))
  const tmm = triState(torrents.map((x) => x.auto_tmm === true))
  const superSeed = triState(torrents.map((x) => x.super_seeding === true))

  /** Category membership across the selection. */
  const categoryCount = new Map<string, number>()
  for (const x of torrents) {
    const key = x.category ?? ''
    categoryCount.set(key, (categoryCount.get(key) ?? 0) + 1)
  }

  /** Tag membership: a tag is ticked only when every torrent carries it. */
  const tagCount = new Map<string, number>()
  for (const x of torrents) {
    for (const tag of (x.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
    }
  }

  const items: ContextMenuItem[] = []

  // ---- Lifecycle: mutually pruned, matching the official rules -------------
  /*
   * Transcribed from `TorrentsTableContextMenu.updateMenuItems`:
   *
   *   show start, stop, forceStart
   *   if (all_are_stopped)                                   hide stop
   *   else if (all_are_force_start)                          hide forceStart
   *   else if (!there_are_stopped && !there_are_force_start)  hide start
   *
   * The third branch is the one that is easy to drop: when everything selected
   * is already running normally, "start" cannot do anything, so the stock menu
   * removes it instead of offering a no-op. (It also means "start" is never
   * disabled-then-clickable-but-inert, which is what this used to render.)
   */
  const anythingStopped = torrents.some((x) => isStopped(x.state))
  const anythingForceStarted = torrents.some((x) => x.force_start === true)

  let hiddenLifecycleItem: string | null = null
  if (allStopped) hiddenLifecycleItem = 'stop'
  else if (allForceStart) hiddenLifecycleItem = 'forceStart'
  else if (!anythingStopped && !anythingForceStarted) hiddenLifecycleItem = 'start'

  const lifecycle: ContextMenuItem[] = [
    { id: 'start', label: t('menu.start') },
    { id: 'forceStart', label: t('menu.forceStart') },
    { id: 'stop', label: t('action.pause') },
  ]
  items.push(...lifecycle.filter((item) => item.id !== hiddenLifecycleItem))

  // ---- Removal ------------------------------------------------------------
  items.push({ id: 'remove', label: t('action.remove'), separator: true, danger: true })
  items.push({ id: 'removeWithFiles', label: t('action.removeWithFiles'), danger: true })

  // ---- Path and naming ----------------------------------------------------
  items.push({ id: 'setLocation', label: t('action.setLocation'), separator: true })

  // Renaming is only meaningful for exactly one torrent.
  if (single) {
    items.push({ id: 'rename', label: t('action.rename') })

    // Renaming files needs metadata, which a magnet link still fetching lacks.
    const hasMetadata = !isFetchingMetadata(one) && one.size > 0
    if (hasMetadata) items.push({ id: 'renameFiles', label: t('menu.renameFiles') })
  }

  // ---- Category -----------------------------------------------------------
  const categoryChildren: ContextMenuItem[] = [
    { id: 'category:new', label: t('menu.newCategory') },
    { id: 'category:', label: t('add.uncategorized'), separator: true },
  ]
  for (const name of [...categories].sort()) {
    const n = categoryCount.get(name) ?? 0
    categoryChildren.push({
      id: `category:${name}`,
      label: name,
      checked: n === torrents.length,
      indeterminate: n > 0 && n < torrents.length,
    })
  }
  items.push({ id: 'category', label: t('torrent.category'), children: categoryChildren })

  // ---- Tags ---------------------------------------------------------------
  const tagChildren: ContextMenuItem[] = [
    { id: 'tags:add', label: t('menu.addTags') },
    { id: 'tags:none', label: t('menu.removeAllTags'), separator: true },
  ]
  for (const name of [...tags].sort()) {
    const n = tagCount.get(name) ?? 0
    tagChildren.push({
      id: `tag:${name}`,
      label: name,
      checked: n === torrents.length,
      indeterminate: n > 0 && n < torrents.length,
    })
  }
  items.push({ id: 'tags', label: t('torrent.tags'), children: tagChildren })

  // ---- Automatic management ----------------------------------------------
  items.push({
    id: 'autoTMM',
    label: t('menu.autoTmm'),
    checked: tmm.checked,
    indeterminate: tmm.indeterminate,
  })

  // ---- Rate limits --------------------------------------------------------
  /*
   * The stock menu hides the download limit once the whole selection is
   * complete, and moves the separator down to the upload limit: a finished
   * torrent has nothing left to download, so offering the limit there is a
   * decoration rather than a control.
   */
  if (!allComplete) {
    items.push({ id: 'downloadLimit', label: t('menu.downloadLimit'), separator: true })
  }
  items.push({ id: 'uploadLimit', label: t('menu.uploadLimit'), separator: allComplete })
  items.push({ id: 'shareRatio', label: t('menu.shareRatio') })

  // ---- Completion-dependent toggles --------------------------------------
  if (allComplete) {
    // Sequential download only applies while downloading; once complete the
    // useful toggle is Super Seeding.
    items.push({
      id: 'superSeeding',
      label: t('menu.superSeeding'),
      checked: superSeed.checked,
      indeterminate: superSeed.indeterminate,
    })
  } else {
    items.push({
      id: 'sequential',
      label: t('menu.sequential'),
      separator: true,
      checked: seq.checked,
      indeterminate: seq.indeterminate,
    })
    items.push({
      id: 'firstLast',
      label: t('menu.firstLast'),
      checked: flp.checked,
      indeterminate: flp.indeterminate,
    })
    // Only meaningful for a fully downloaded torrent, which is not the case
    // here — offered but disabled so the item does not vanish and reappear.
    items.push({ id: 'superSeedingDisabled', label: t('menu.superSeeding'), disabled: true })
  }

  // ---- Maintenance --------------------------------------------------------
  items.push({ id: 'recheck', label: t('action.recheck'), separator: true })
  items.push({ id: 'reannounce', label: t('action.reannounce') })

  // ---- Queue --------------------------------------------------------------
  items.push({
    id: 'queue',
    label: t('menu.queue'),
    separator: true,
    children: [
      { id: 'queue:top', label: t('action.queueTop') },
      { id: 'queue:up', label: t('action.queueUp') },
      { id: 'queue:down', label: t('action.queueDown') },
      { id: 'queue:bottom', label: t('action.queueBottom') },
    ],
  })

  // ---- Copy (client-side only, no API call) -------------------------------
  items.push({
    id: 'copy',
    label: t('menu.copy'),
    children: [
      { id: 'copy:name', label: t('torrent.name') },
      { id: 'copy:hash', label: t('menu.infoHash') },
      { id: 'copy:magnet', label: t('action.copyMagnet') },
      { id: 'copy:path', label: t('menu.contentPath') },
    ],
  })

  // Exporting needs the .torrent metadata the server only has once it has been
  // fetched, so a magnet still resolving cannot be exported.
  const canExport = single && !isFetchingMetadata(one) && one.size > 0
  items.push({ id: 'export', label: t('action.export'), disabled: !canExport })

  return items
}
