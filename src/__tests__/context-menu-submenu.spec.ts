/**
 * Rendering tests for the context menu's SUBMENUS.
 *
 * WHY THIS EXISTS
 * ---------------
 * `context-menu.spec.ts` tests the item DATA — which rows exist and when. It
 * cannot catch a submenu that exists but is unreadable, which is exactly what
 * shipped: opening "分类" / "标签" / "复制" on a long (scrolling) menu showed a
 * thin empty box with a scrollbar instead of the entries.
 *
 * The cause was layout, not data, and it needed two things to go wrong at once:
 *
 *   1. the submenu lived inside `.ctxmenu__list`, which sets `overflow-y: auto`
 *      — an absolutely positioned child of a scrolling box is clipped by it;
 *   2. making it `position: fixed` did not help, because `.ctxmenu` carries
 *      `backdrop-filter` (from `glass-panel`), and that makes it the containing
 *      block for fixed descendants. The popup was positioned against the menu
 *      and stayed clipped — measured at ~8 visible pixels of a 176px submenu.
 *
 * jsdom performs no layout, so these tests cannot assert pixel geometry. What
 * they CAN assert is the structural precondition that makes the clipping
 * impossible: the submenu must be teleported out of the scrolling menu subtree.
 * That is the property a future refactor is most likely to break, so it is the
 * one worth pinning.
 */
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MacContextMenu, { type ContextMenuItem } from '@/components/base/MacContextMenu.vue'

const ITEMS: ContextMenuItem[] = [
  { id: 'start', label: '开始' },
  {
    id: 'category',
    label: '分类',
    children: [
      { id: 'category:new', label: '新建分类…' },
      { id: 'category:Movies', label: 'Movies' },
      { id: 'category:Music', label: 'Music' },
    ],
  },
  {
    id: 'copy',
    label: '复制',
    children: [
      { id: 'copy:name', label: '名称' },
      { id: 'copy:hash', label: '哈希值' },
    ],
  },
  {
    id: 'queue',
    label: '队列',
    children: [
      { id: 'queue:top', label: '移至顶部' },
      { id: 'queue:up', label: '上移' },
    ],
  },
  { id: 'export', label: '导出 .torrent' },
]

function mountMenu() {
  return mount(MacContextMenu, {
    props: { open: true, x: 20, y: 20, items: ITEMS },
    attachTo: document.body,
  })
}

/**
 * Open a submenu by hovering its parent row, as a user would.
 *
 * The menu is teleported to <body>, so it is queried from the DOCUMENT rather
 * than through the wrapper — `wrapper.findAll` cannot see a teleported node.
 */
async function hoverParent(label: string): Promise<void> {
  const items = [...document.querySelectorAll('.ctxmenu__item')] as HTMLElement[]
  const item = items.find((b) => b.querySelector('.ctxmenu__label')?.textContent?.trim() === label)
  expect(item, `parent row "${label}" not found`).toBeTruthy()
  item!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  await flushPromises()
  await nextTick()
}

describe('MacContextMenu — submenu rendering', () => {
  it('renders every child of a submenu when its parent is hovered', async () => {
    const wrapper = mountMenu()
    await nextTick()

    await hoverParent('分类')
    const sub = document.querySelector('.ctxmenu__submenu')
    expect(sub, 'hovering the parent did not open a submenu').toBeTruthy()

    const labels = [...sub!.querySelectorAll('.ctxmenu__item')].map((b) => b.textContent?.trim())
    // This is the assertion the original bug would fail: the popup existed but
    // was an empty sliver, so no entries were readable.
    expect(labels).toContain('新建分类…')
    expect(labels).toContain('Movies')
    expect(labels).toContain('Music')

    wrapper.unmount()
  })

  it('teleports the submenu out of the scrolling menu subtree', async () => {
    /*
     * The structural fix. `.ctxmenu__list` scrolls (`overflow-y: auto`), so
     * anything rendered inside it can be clipped; the submenu must therefore be
     * a child of <body> rather than of the menu.
     */
    const wrapper = mountMenu()
    await hoverParent('复制')

    const sub = document.querySelector('.ctxmenu__submenu')
    expect(sub, 'no submenu').toBeTruthy()
    expect(
      sub!.parentElement === document.body,
      'the submenu must be teleported to <body>, or the scrolling menu clips it',
    ).toBe(true)
    // And it must not be inside the menu at all.
    expect(wrapper.element.contains(sub!)).toBe(false)

    wrapper.unmount()
  })

  /**
 * Give jsdom the geometry the placement maths depends on.
 *
 * jsdom performs no layout, so every `offsetHeight` is 0 and every
 * `getBoundingClientRect()` is all zeros — which makes the placement arithmetic
 * untestable and, worse, lets a broken clamp pass by coincidence. These stubs
 * supply a realistic row position and popup size so the real code path is
 * exercised.
 *
 * `rowTop` is where the hovered row sits; placing a popup taller than the
 * remaining space is what must trigger a lift.
 */
function stubGeometry(options: { rowTop: number; popupHeight: number; viewportHeight: number }) {
  const { rowTop, popupHeight, viewportHeight } = options

  // Viewport size drives `window.innerHeight` inside the component.
  Object.defineProperty(window, 'innerHeight', {
    value: viewportHeight,
    configurable: true,
    writable: true,
  })

  // The parent row's rect.
  const rowProto = Element.prototype
  const originalRect = rowProto.getBoundingClientRect
  rowProto.getBoundingClientRect = function stub(this: Element) {
    if (this.classList?.contains('ctxmenu__row')) {
      return {
        top: rowTop,
        bottom: rowTop + 25,
        left: 300,
        right: 500,
        width: 200,
        height: 25,
        x: 300,
        y: rowTop,
        toJSON: () => ({}),
      } as DOMRect
    }
    return originalRect.call(this)
  }

  // The popup's measured size.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList?.contains('ctxmenu__submenu') ? popupHeight : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList?.contains('ctxmenu__submenu') ? 176 : 0
    },
  })

  return () => {
    rowProto.getBoundingClientRect = originalRect
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
  }
}

describe('MacContextMenu — submenu placement', () => {
  it('anchors the popup beside the hovered row, not at the top of the screen', async () => {
    /*
     * An earlier fix for the clipping bug treated a not-yet-measured height as
     * "the popup fills the viewport", which pinned EVERY submenu to the top
     * edge — far from the highlighted item and plainly disorienting.
     *
     * With room to spare, the popup must sit at the row (rowTop - 4) and the
     * viewport clamp must not move it at all.
     */
    const restore = stubGeometry({ rowTop: 300, popupHeight: 120, viewportHeight: 900 })
    try {
      const wrapper = mountMenu()
      await hoverParent('复制')

      const sub = document.querySelector('.ctxmenu__submenu') as HTMLElement
      expect(sub, 'no submenu').toBeTruthy()
      expect(
        Number.parseFloat(sub.style.top),
        'a popup with room below it must sit beside its row, not be lifted',
      ).toBe(296) // rowTop - 4

      wrapper.unmount()
    } finally {
      restore()
    }
  })

  it('lifts the popup only as far as needed when it would overflow', async () => {
    /*
     * The opposite failure: a submenu near the bottom of the menu hung off the
     * screen entirely because the clamp silently did not run (the ref had been
     * read as an array, so `offsetHeight` was undefined).
     *
     * Row at 850, popup 120 tall, viewport 900 -> it must be lifted to
     * 900 - 120 - 8 = 772, and never beyond the top margin.
     */
    const restore = stubGeometry({ rowTop: 850, popupHeight: 120, viewportHeight: 900 })
    try {
      const wrapper = mountMenu()
      await hoverParent('复制')

      const sub = document.querySelector('.ctxmenu__submenu') as HTMLElement
      const top = Number.parseFloat(sub.style.top)
      expect(top, `expected a lift to 772, got ${sub.style.top}`).toBe(772)
      expect(top + 120, 'the popup must fit above the bottom edge').toBeLessThanOrEqual(900)

      wrapper.unmount()
    } finally {
      restore()
    }
  })

  it('reads the submenu ref as an element, not as an array', async () => {
    /*
     * `ref="submenuEl"` is declared inside `v-for="item in items"`, and Vue
     * assigns a template ref inside a v-for an ARRAY of elements. Reading it as
     * a plain element made `offsetHeight` undefined, so the clamp was skipped —
     * while every other test still passed, since the popup was present and
     * populated.
     *
     * The observable consequence is a missing lift, exactly as asserted above;
     * this test pins the specific case of a popup that would leave the viewport.
     */
    const restore = stubGeometry({ rowTop: 880, popupHeight: 200, viewportHeight: 900 })
    try {
      const wrapper = mountMenu()
      await hoverParent('队列')

      const sub = document.querySelector('.ctxmenu__submenu') as HTMLElement
      const top = Number.parseFloat(sub.style.top)
      // 900 - 200 - 8 = 692
      expect(top, `expected a lift to 692, got ${sub.style.top}`).toBe(692)

      wrapper.unmount()
    } finally {
      restore()
    }
  })

  it('places the popup at its row when the height cannot be measured yet', async () => {
    /*
     * THE REGRESSION THE USER REPORTED: every submenu appeared at the TOP of the
     * screen instead of beside the hovered item.
     *
     * On the first pass the popup has been inserted but not laid out, so
     * `offsetHeight` reads 0. An attempt at fixing an overflow bug treated that
     * 0 as "the popup is as tall as the viewport", so the clamp computed
     * `vh - vh - margin` and pinned it to the top margin — for EVERY popup,
     * regardless of which item was hovered.
     *
     * With no measurable height the placement must simply use the row.
     */
    const restore = stubGeometry({ rowTop: 300, popupHeight: 0, viewportHeight: 900 })
    try {
      const wrapper = mountMenu()
      await hoverParent('复制')

      const sub = document.querySelector('.ctxmenu__submenu') as HTMLElement
      const top = Number.parseFloat(sub.style.top)
      expect(
        top,
        `with an unknown height the popup must sit beside its row (296), got ${sub.style.top}`,
      ).toBe(296)

      wrapper.unmount()
    } finally {
      restore()
    }
  })
})

  it('emits the child id when a submenu entry is clicked', async () => {
    const wrapper = mountMenu()
    await hoverParent('复制')

    const child = [...document.querySelectorAll('.ctxmenu__submenu .ctxmenu__item')].find(
      (b) => b.textContent?.trim() === '哈希值',
    )
    expect(child, 'child entry not rendered').toBeTruthy()
    ;(child as HTMLElement).click()
    await flushPromises()
    await nextTick()

    const emitted = (wrapper.emitted('select') ?? []).map((e) => e[0])
    expect(emitted, `expected copy:hash, got ${JSON.stringify(emitted)}`).toContain('copy:hash')
    wrapper.unmount()
  })

  it('does not open a submenu for a leaf item', async () => {
    const wrapper = mountMenu()
    await hoverParent('开始')
    expect(document.querySelector('.ctxmenu__submenu')).toBeNull()
    wrapper.unmount()
  })

  it('closes the submenu when the pointer moves to a leaf item', async () => {
    const wrapper = mountMenu()
    await hoverParent('分类')
    expect(document.querySelector('.ctxmenu__submenu')).toBeTruthy()

    await hoverParent('导出 .torrent')
    expect(document.querySelector('.ctxmenu__submenu')).toBeNull()
    wrapper.unmount()
  })

  it('keeps a submenu entry click from being treated as an outside click', async () => {
    /*
     * Teleporting puts the submenu outside the menu's own root, so the
     * outside-click handler must also accept the submenu element. Without that
     * check the pointerdown would close the menu before the click landed.
     */
    const wrapper = mountMenu()
    await hoverParent('分类')

    const sub = document.querySelector('.ctxmenu__submenu')!
    /*
     * jsdom does not implement PointerEvent, so dispatch a MouseEvent of the
     * same type name — the handler only reads `event.target`, which both carry.
     */
    sub.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('close'), 'a click inside the submenu closed the menu').toBeUndefined()
    wrapper.unmount()
  })
})