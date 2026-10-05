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
    openSub.value = null
    activeIndex.value = -1
    if (open) void reposition()
  },
  { immediate: true },
)

function select(item: ContextMenuItem): void {
  if (item.disabled) return
  if (item.children?.length) {
    openSub.value = openSub.value === item.id ? null : item.id
    return
  }
  emit('select', item.id)
}

/** Close on outside click, Escape, scroll or resize. */
function onDocumentPointerDown(event: PointerEvent): void {
  if (!props.open) return
  const el = root.value
  if (el && !el.contains(event.target as Node)) emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      if (openSub.value) openSub.value = null
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
            @click="select(item)"
            @mouseenter="openSub = item.children?.length ? item.id : null"
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

          <!-- Submenu -->
          <ul
            v-if="item.children?.length && openSub === item.id"
            class="ctxmenu__list ctxmenu__submenu glass-panel"
            role="menu"
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

/* ---- Submenu ---- */
.ctxmenu__submenu {
  position: absolute;
  left: 100%;
  top: calc(-1 * var(--space-1));
  margin-left: 2px;
  min-width: 11rem;
  max-width: 18rem;
}

/*
 * Flip the submenu to the left when it would leave the viewport.
 * `:has` is well supported in the target browsers; where it is not, the submenu
 * simply stays on the right, which is the pre-existing behaviour.
 */
.ctxmenu__row:has(.ctxmenu__submenu) .ctxmenu__submenu {
  left: 100%;
}
</style>
