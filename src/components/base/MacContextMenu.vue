<script setup lang="ts">
/**
 * MacContextMenu — a frosted-glass context menu matching the rest of the theme.
 *
 * WHY A CUSTOM COMPONENT
 * ----------------------
 * The official WebUI builds its menu from a static `<ul>` in index.html and
 * positions it with absolute coordinates. That approach cannot express the
 * per-item state this menu needs (checked marks computed from the selection,
 * submenus built from live categories and tags), so the menu is described as
 * data here and rendered by Vue.
 *
 * POSITIONING
 * -----------
 * The menu is placed at the pointer, then flipped or clamped so it always stays
 * on screen. A menu that opens off the bottom edge is a genuine bug — the user
 * cannot scroll to reach the item they wanted.
 *
 * KEYBOARD
 * --------
 * Escape closes. Arrow keys move between enabled items, Enter activates, and
 * Right/Left open and close a submenu. A context menu that can only be driven by
 * a mouse is unusable for anyone who right-clicks via the keyboard menu key.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface ContextMenuItem {
  /** Stable identifier; also the emit payload for leaf items. */
  id: string
  label: string
  /** Renders a tick when true. Only meaningful for toggles. */
  checked?: boolean
  /** Renders a dash instead of a tick (partially applied across a selection). */
  indeterminate?: boolean
  disabled?: boolean
  /** Draws a separator line above this item. */
  separator?: boolean
  /** Renders in the danger colour, for destructive actions. */
  danger?: boolean
  /** Nested items; when present the item opens a submenu instead of firing. */
  children?: ContextMenuItem[]
  /** Short right-aligned hint, e.g. a count or the current value. */
  hint?: string
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'close'): void
}>()

const root = ref<HTMLElement | null>(null)
/** Final on-screen position after flipping/clamping. */
const pos = ref({ x: 0, y: 0 })
/** id of the submenu currently open, if any. */
const openSub = ref<string | null>(null)
/** Index of the keyboard-focused item in the top level. */
const activeIndex = ref(-1)
/**
 * Viewport coordinates for the open submenu.
 *
 * WHY `fixed` RATHER THAN `absolute`
 * ----------------------------------
 * The submenu is a descendant of `.ctxmenu__list`, which scrolls
 * (`overflow-y: auto`) whenever the menu is taller than 75vh. An absolutely
 * positioned child of a scrolling box is CLIPPED by it, so opening "分类" on a
 * long menu left a ~8px sliver of a 176px submenu visible — measured, not
 * guessed: the list's right edge sat at x=536 while the submenu began at x=528.
 * The user saw a thin empty box with a scrollbar of its own.
 *
 * Positioning the submenu `fixed` takes it out of that clip. The coordinates are
 * measured from the parent row at the moment it opens, so the popup still lines
 * up with the item the user hovered.
 */
const subPos = ref({ x: 0, y: 0 })
/** Cap on the open submenu's height, so it scrolls rather than overflowing. */
const subMaxHeight = ref(0)

/**
 * The single open submenu element (at most one exists at a time).
 *
 * NOTE: this ref sits inside `v-for="item in items"`, and Vue assigns a template
 * ref declared inside a `v-for` an ARRAY rather than an element. Reading it as a
 * plain element therefore gave an array, `offsetHeight` came back `undefined`,
 * and the viewport clamp silently did nothing — which is why a submenu near the
 * bottom of the menu hung off the screen. `submenuNode` normalises both shapes.
 */
const submenuEl = ref<HTMLElement | HTMLElement[] | null>(null)

/** The open submenu as a plain element, whichever shape Vue assigned. */
function submenuNode(): HTMLElement | null {
  const v = submenuEl.value
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** The row element whose `id` is currently open, for measuring its position. */
const parentRowEl = ref<HTMLElement | null>(null)

/**
 * Open or close a submenu and, when opening, position it.
 *
 * Placement happens after `nextTick` because the element does not exist until
 * Vue has rendered it — measuring before that returns a zero-sized box and the
 * popup would be placed as if it had no width.
 */
async function setOpenSub(id: string | null): Promise<void> {
  openSub.value = id
  if (!id) {
    parentRowEl.value = null
    return
  }
  await positionOpenSubmenu()
}

/** Capture the hovered row so the submenu can be measured from it. */
function onItemEnter(item: ContextMenuItem, event: MouseEvent): void {
  if (!item.children?.length) {
    void setOpenSub(null)
    return
  }
  const row = (event.currentTarget as HTMLElement | null)?.closest('.ctxmenu__row')
  parentRowEl.value = (row as HTMLElement | null) ?? null
  void setOpenSub(item.id)
}

/** Measure the parent row and place its submenu beside it, inside the viewport. */
function placeSubmenu(parentRow: HTMLElement | null, el: HTMLElement | null): void {
  if (!parentRow || !el) return
  const row = parentRow.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 8

  // Prefer the right side; flip left when there is no room.
  let x = row.right + 2
  if (x + w + margin > vw) x = Math.max(margin, row.left - w - 2)

  /*
   * Vertical placement: sit beside the parent row, and lift ONLY as far as
   * needed to keep the popup on screen.
   *
   * `h` can legitimately be 0 on the first pass, before layout. What must NOT
   * happen is treating that as "the popup fills the viewport": doing so pinned
   * every submenu to the very top edge, far from the hovered item, which reads
   * as broken even though nothing overflows. An earlier attempt at the opposite
   * extreme — skipping the clamp when the height was unknown — let a submenu at
   * the bottom of the menu hang off the screen instead.
   *
   * So: with no measurable height, place it at the row and clamp nothing. The
   * post-paint pass has the real height and lifts it if it actually overflows.
   */
  let y = row.top - 4
  if (h > 0 && y + h + margin > vh) y = vh - h - margin
  // Never above the viewport top, whatever the arithmetic says.
  y = Math.max(margin, y)

  // A submenu taller than the space below it scrolls inside itself rather than
  // running off the screen.
  subMaxHeight.value = h > 0 ? Math.max(120, vh - y - margin) : 0
  subPos.value = { x, y }
}

/**
 * Place once the popup has been laid out, then again after paint.
 *
 * The second pass exists because a submenu's height is not final on the very
 * first frame: fonts and wrapped labels can change it. Re-running is cheap and
 * idempotent, and it is the difference between a tall submenu fitting on screen
 * and hanging off the bottom.
 */
async function positionOpenSubmenu(): Promise<void> {
  await nextTick()
  placeSubmenu(parentRowEl.value, submenuNode())
  // After the browser has painted, measure again in case the height settled.
  requestAnimationFrame(() => placeSubmenu(parentRowEl.value, submenuNode()))
}

/** Leaf items only — separators and submenu parents are not directly actionable. */
const flatIds = computed(() =>
  props.items.filter((i) => !i.children?.length && !i.disabled).map((i) => i.id),
)

/**
 * Place the menu, flipping it when it would overflow.
 *
 * Runs after render so the real size is known; measuring an unrendered element
 * returns zero and the clamp would do nothing.
 */
async function reposition(): Promise<void> {
  pos.value = { x: props.x, y: props.y }
  await nextTick()

  const el = root.value
  if (!el) return

  const margin = 8
  const w = el.offsetWidth
  const h = el.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x = props.x
  let y = props.y

  // Flip to the other side of the pointer when there is no room ahead.
  if (x + w + margin > vw) x = Math.max(margin, props.x - w)
  if (y + h + margin > vh) y = Math.max(margin, props.y - h)

  pos.value = { x, y }
}

watch(
  () => [props.open, props.x, props.y] as const,
  ([open]) => {
    void setOpenSub(null)
    activeIndex.value = -1
    if (open) void reposition()
  },
  { immediate: true },
)

function select(item: ContextMenuItem, event?: MouseEvent): void {
  if (item.disabled) return
  if (item.children?.length) {
    if (openSub.value === item.id) {
      void setOpenSub(null)
    } else {
      // Clicking (rather than hovering) also needs the row for measurement.
      const row = (event?.currentTarget as HTMLElement | null)?.closest('.ctxmenu__row')
      if (row) parentRowEl.value = row as HTMLElement
      void setOpenSub(item.id)
    }
    return
  }
  emit('select', item.id)
}

/** Close on outside click, Escape, scroll or resize. */
function onDocumentPointerDown(event: PointerEvent): void {
  if (!props.open) return
  const target = event.target as Node
  const el = root.value
  if (el?.contains(target)) return
  /*
   * The submenu is teleported to <body>, so it is NOT inside `root`. Without
   * this second check, pressing a submenu item would count as an outside click
   * and close the menu before the item's own handler ran.
   */
  if (submenuNode()?.contains(target)) return
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      if (openSub.value) void setOpenSub(null)
      else emit('close')
      break
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % Math.max(1, flatIds.value.length)
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value =
        (activeIndex.value - 1 + flatIds.value.length) % Math.max(1, flatIds.value.length)
      break
    case 'Enter':
    case ' ': {
      const id = flatIds.value[activeIndex.value]
      if (!id) return
      event.preventDefault()
      emit('select', id)
      break
    }
    default:
      break
  }
}

/** Any scroll invalidates the anchor position, so the menu closes. */
function onViewportChange(): void {
  if (props.open) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      document.addEventListener('keydown', onKeydown)
      window.addEventListener('scroll', onViewportChange, true)
      window.addEventListener('resize', onViewportChange)
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onKeydown)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="root"
      class="ctxmenu glass-panel"
      role="menu"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <ul class="ctxmenu__list">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          class="ctxmenu__row"
          :class="{
            'is-separator': item.separator,
            'is-danger': item.danger,
            'is-disabled': item.disabled,
            'is-active': activeIndex === index,
            'has-sub': item.children?.length,
          }"
        >
          <button
            type="button"
            class="ctxmenu__item"
            role="menuitem"
            :aria-checked="item.checked === undefined ? undefined : item.checked"
            :aria-haspopup="item.children?.length ? 'menu' : undefined"
            :disabled="item.disabled"
            @click="select(item, $event)"
            @mouseenter="onItemEnter(item, $event)"
          >
            <!-- Tick column. Always present so labels line up whether or not an
                 item is a toggle. -->
            <span class="ctxmenu__tick" aria-hidden="true">
              <svg v-if="item.indeterminate" viewBox="0 0 16 16" width="12" height="12">
                <path d="M4 8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              <svg v-else-if="item.checked" viewBox="0 0 16 16" width="12" height="12">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>

            <span class="ctxmenu__label truncate">{{ item.label }}</span>
            <span v-if="item.hint" class="ctxmenu__hint">{{ item.hint }}</span>
            <svg
              v-if="item.children?.length"
              class="ctxmenu__arrow"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              aria-hidden="true"
            >
              <path
                d="M6 3.5l4.5 4.5L6 12.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <!--
            Submenu, TELEPORTED to <body>.
 
            Teleporting is what actually fixes the clipping, and the reason is
            subtle enough to be worth recording. Making it `position: fixed`
            inside the menu did NOT work: `.ctxmenu` carries `backdrop-filter`
            (from `glass-panel`), and an element with a backdrop-filter becomes
            the containing block for its fixed-position descendants. So `fixed`
            resolved against the menu rather than the viewport, and the submenu
            stayed inside the scrolling `.ctxmenu__list` that clipped it —
            measured: the submenu was placed at left=862 while the menu itself
            sat at left=333, and only ~8px of it was visible.

            Moving it out of the menu subtree removes both problems at once: no
            clipping ancestor, and no containing block.
          -->
          <Teleport to="body">
            <ul
              v-if="item.children?.length && openSub === item.id"
              ref="submenuEl"
              class="ctxmenu__submenu glass-panel"
              role="menu"
              :style="{
                left: `${subPos.x}px`,
                top: `${subPos.y}px`,
                maxHeight: subMaxHeight ? `${subMaxHeight}px` : undefined,
              }"
            >
            <li
              v-for="child in item.children"
              :key="child.id"
              class="ctxmenu__row"
              :class="{
                'is-separator': child.separator,
                'is-danger': child.danger,
                'is-disabled': child.disabled,
              }"
            >
              <button
                type="button"
                class="ctxmenu__item"
                role="menuitem"
                :aria-checked="child.checked === undefined ? undefined : child.checked"
                :disabled="child.disabled"
                @click="select(child)"
              >
                <span class="ctxmenu__tick" aria-hidden="true">
                  <svg v-if="child.indeterminate" viewBox="0 0 16 16" width="12" height="12">
                    <path d="M4 8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else-if="child.checked" viewBox="0 0 16 16" width="12" height="12">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="ctxmenu__label truncate">{{ child.label }}</span>
                <span v-if="child.hint" class="ctxmenu__hint">{{ child.hint }}</span>
              </button>
            </li>
          </ul>
          </Teleport>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
.ctxmenu {
  position: fixed;
  z-index: 2000;
  min-width: 13rem;
  max-width: 20rem;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  /* The menu can be tall on a big selection; let it scroll rather than clip. */
  max-height: 75vh;
  overflow: visible;
  animation: ctxmenu-in 110ms ease-out;
}

@keyframes ctxmenu-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ctxmenu {
    animation: none;
  }
}

.ctxmenu__list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 75vh;
  overflow-y: auto;
}

.ctxmenu__row {
  position: relative;
}

.ctxmenu__row.is-separator {
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px solid var(--separator);
}

.ctxmenu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.ctxmenu__item:hover:not(:disabled),
.ctxmenu__row.is-active > .ctxmenu__item {
  background: var(--accent);
  color: var(--text-inverse);
}

.ctxmenu__row.is-disabled > .ctxmenu__item,
.ctxmenu__item:disabled {
  color: var(--text-tertiary);
  cursor: default;
  opacity: 0.6;
}

.ctxmenu__row.is-danger > .ctxmenu__item {
  color: var(--danger);
}

.ctxmenu__row.is-danger > .ctxmenu__item:hover {
  background: var(--danger);
  color: #fff;
}

/* Fixed-width tick column keeps every label aligned. */
.ctxmenu__tick {
  display: grid;
  place-items: center;
  width: 14px;
  flex: none;
  color: currentColor;
}

.ctxmenu__label {
  flex: 1 1 auto;
  min-width: 0;
}

.ctxmenu__hint {
  flex: none;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.ctxmenu__item:hover .ctxmenu__hint,
.ctxmenu__row.is-active > .ctxmenu__item .ctxmenu__hint {
  color: inherit;
  opacity: 0.8;
}

.ctxmenu__arrow {
  flex: none;
  opacity: 0.7;
}

/* ---- Submenu ----
 *
 * Teleported to <body> (see the template), so it is `fixed` against the
 * VIEWPORT and no ancestor can clip it. Two things made the in-place version
 * fail, and both are worth remembering:
 *
 *   1. it lived inside `.ctxmenu__list`, which scrolls (`overflow-y: auto`) —
 *      an absolutely positioned child of a scrolling box is clipped by it;
 *   2. `position: fixed` alone did not help, because `.ctxmenu` has
 *      `backdrop-filter` (glass-panel), which makes it the containing block for
 *      fixed descendants. The submenu was therefore positioned relative to the
 *      menu and still clipped.
 *
 * Result before the fix: an ~8px sliver of a 176px submenu, which is what the
 * user saw as "a thin box with a scrollbar".
 */
.ctxmenu__submenu {
  position: fixed;
  z-index: 2001;
  margin: 0;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  min-width: 11rem;
  max-width: 18rem;
  /* Long submenus scroll inside themselves rather than running off screen. */
  max-height: 75vh;
  overflow-y: auto;
}
</style>
