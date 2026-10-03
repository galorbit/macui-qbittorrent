<script setup lang="ts">
/**
 * NavIcon — the navigation glyphs, in one place.
 *
 * The desktop sidebar and the mobile tab bar each used to carry their own copy
 * of this `v-if`/`v-else-if` chain. They drifted: when Search and RSS were added,
 * only the sidebar was updated, so the tab bar rendered those two as the generic
 * fallback glyph. Duplicating a conditional chain across two templates makes that
 * failure mode almost inevitable, so the chain lives here instead.
 *
 * An unknown name renders the fallback rather than nothing, so a future nav item
 * without an icon is still visible and clickable.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    /** Rendered size in px. Sidebar uses 18, the mobile tab bar 20. */
    size?: number
  }>(),
  { size: 18 },
)

/** Stroke width, kept visually consistent as the glyph scales up. */
const stroke = computed(() => (props.size >= 20 ? 1.7 : 1.6))
</script>

<template>
  <svg
    v-if="name === 'transfers'"
    viewBox="0 0 20 20"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path
      d="M10 3v10m0 0l-3.2-3.2M10 13l3.2-3.2M4 16h12"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>

  <svg
    v-else-if="name === 'search'"
    viewBox="0 0 20 20"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <circle cx="8.8" cy="8.8" r="5.3" fill="none" stroke="currentColor" :stroke-width="stroke" />
    <path
      d="M12.7 12.7l4 4"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke + 0.2"
      stroke-linecap="round"
    />
  </svg>

  <svg
    v-else-if="name === 'rss'"
    viewBox="0 0 20 20"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <circle cx="5" cy="15" r="1.6" fill="currentColor" />
    <path
      d="M4.5 9.5a6 6 0 016 6M4.5 4.8a10.7 10.7 0 0110.7 10.7"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke + 0.1"
      stroke-linecap="round"
    />
  </svg>

  <svg
    v-else-if="name === 'settings'"
    viewBox="0 0 20 20"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" :stroke-width="stroke" />
    <path
      d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke - 0.1"
      stroke-linecap="round"
    />
  </svg>

  <svg
    v-else-if="name === 'about'"
    viewBox="0 0 20 20"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" :stroke-width="stroke" />
    <path
      d="M10 9v5M10 6.4v.2"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke + 0.2"
      stroke-linecap="round"
    />
  </svg>

  <!-- Fallback: an unlabelled nav item should still be visible. -->
  <svg v-else viewBox="0 0 20 20" :width="size" :height="size" aria-hidden="true">
    <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" :stroke-width="stroke" />
    <path
      d="M10 9v5M10 6.4v.2"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke + 0.2"
      stroke-linecap="round"
    />
  </svg>
</template>
