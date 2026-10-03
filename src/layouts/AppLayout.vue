<script setup lang="ts">
/**
 * AppLayout — the authenticated shell.
 *
 * Responsive strategy:
 *   desktop (>=1024px)  persistent frosted sidebar, full toolbar
 *   tablet  (600–1023px) sidebar collapses to icons
 *   mobile  (<600px)    no sidebar; a slide-in drawer plus a fixed bottom tab
 *                       bar. A bottom bar is the standard iOS pattern and is
 *                       reachable with a thumb, unlike a hamburger alone.
 *
 * Only the chrome (sidebar / toolbar / drawer) uses backdrop blur — list rows
 * deliberately do not, because blurring hundreds of scrolling rows is a real
 * GPU cost on phones.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import { useTheme, type ThemePreference } from '@/composables/useTheme'
import {
  SUPPORTED_LOCALES,
  currentLocale,
  setLocale,
  type LocaleCode,
} from '@/i18n'
import MacButton from '@/components/base/MacButton.vue'
import MacBadge from '@/components/base/MacBadge.vue'
import MacSelect from '@/components/base/MacSelect.vue'
import NavIcon from '@/components/base/NavIcon.vue'
import ConnectionPanel from '@/components/torrent/ConnectionPanel.vue'
import { formatSpeed } from '@/utils/format'

const { t } = useI18n()
const { isMobile, isDesktop } = useBreakpoint()
const session = useSessionStore()
const auth = useAuthStore()
const theme = useTheme()
const route = useRoute()

const drawerOpen = ref(false)

/** Close the mobile drawer whenever navigation happens. */
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  },
)

// --- Global keyboard shortcut: Ctrl/Cmd+F focuses the torrent filter -----
function onGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const isTyping =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.tagName === 'SELECT' ||
    target?.isContentEditable

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !isTyping) {
    const input = document.getElementById('torrent-filter-input') as HTMLInputElement | null
    if (input) {
      event.preventDefault()
      input.focus()
      input.select()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  if (auth.isAuthenticated) session.start()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

const navItems = computed(() => [
  { name: 'dashboard', label: t('nav.transfers'), icon: 'transfers' },
  { name: 'search', label: t('nav.search'), icon: 'search' },
  { name: 'rss', label: t('nav.rss'), icon: 'rss' },
  { name: 'settings', label: t('nav.settings'), icon: 'settings' },
  { name: 'about', label: t('nav.about'), icon: 'about' },
])

const connectionTone = computed<'success' | 'warning' | 'danger'>(() => {
  if (!session.connected) return 'danger'
  const status = session.connectionStatus
  if (status === 'connected') return 'success'
  if (status === 'firewalled') return 'warning'
  return 'danger'
})

const connectionLabel = computed(() => {
  if (!session.connected) return t('status.disconnected')
  const status = session.connectionStatus
  if (status === 'connected') return t('status.connected')
  if (status === 'firewalled') return t('status.firewalled')
  return t('status.disconnected')
})

const themeIcon = computed(() => {
  const pref = theme.preference.value
  if (pref === 'light') return 'sun'
  if (pref === 'dark') return 'moon'
  return 'auto'
})

const themeLabel = computed(() => {
  const pref = theme.preference.value as ThemePreference
  return t(`theme.${pref}`)
})

// --- Language ------------------------------------------------------------
const locale = ref<LocaleCode>(currentLocale())

const localeOptions = computed(() =>
  SUPPORTED_LOCALES.map((l) => ({ value: l.code, label: l.label })),
)

function onLocaleChange(value: string): void {
  const code = value as LocaleCode
  locale.value = code
  setLocale(code)
}

/**
 * Sign out.
 *
 * The routing here is deliberate and load-bearing. Sending the user to the
 * in-app `login` route does not work: the router guard redirects *authenticated*
 * users away from `/login`, and the guard re-probes the session, so the
 * navigation is cancelled and the page appears to do nothing until a manual
 * refresh.
 *
 * Instead we leave the SPA entirely and load the site root. With the session
 * gone, qBittorrent resolves "/" to public/index.html — the sign-in page — which
 * is exactly where the user should land. A full navigation also guarantees no
 * stale authenticated state survives in memory.
 */
async function handleSignOut(): Promise<void> {
  // Stop polling first so in-flight requests do not 403 into a toast.
  session.stop()
  session.reset()

  await auth.signOut()

  // Hard navigation, not router.push: clears all app state and lets the server
  // choose the right document for an unauthenticated visitor.
  window.location.replace(new URL('index.html', window.location.origin + '/').href)
}
</script>

<template>
  <div class="layout" :class="{ 'layout--mobile': isMobile, 'layout--compact': !isDesktop }">
    <!-- ================= Sidebar (desktop / tablet) ================= -->
    <aside v-if="!isMobile" class="layout__sidebar glass" :class="{ 'is-collapsed': !isDesktop }">
      <div class="layout__brand">
        <span class="layout__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 1024 1024" width="26" height="26" class="layout__brand-glyph">
            <!-- Official qBittorrent letterforms: a white "b" over a lighter "q". -->
            <path class="layout__brand-b" d="m712.898 332.399q66.657 0 103.38 45.671 37.03 45.364 37.03 128.684 0 83.32-37.34 129.61-37.03 45.98-103.07 45.98-33.02 0-60.484-12.035-27.156-12.344-45.672-37.649h-3.703l-10.8 43.512h-36.724v-480.172h51.227v116.65q0 39.191-2.469 70.359h2.47q35.796-50.61 106.155-50.61zm-7.406 42.894q-52.46 0-75.605 30.242-23.145 29.934-23.145 101.219 0 71.285 23.762 102.145 23.761 30.55 76.222 30.55 47.215 0 70.36-34.254 23.144-34.562 23.144-99.058 0-66.04-23.144-98.442-23.145-32.402-71.594-32.402z" />
            <path class="layout__brand-q" d="m317.273 639.45q51.227 0 74.68-27.466 23.453-27.464 24.996-92.578v-11.418q0-70.976-24.07-102.144-24.07-31.168-76.223-31.168-45.055 0-69.125 35.18-23.762 34.87-23.762 98.75 0 63.879 23.454 97.515 23.761 33.328 70.05 33.328zm-7.715 42.894q-65.421 0-102.144-45.98-36.723-45.981-36.723-128.376 0-83.011 37.032-129.609 37.03-46.598 103.07-46.598 69.433 0 106.773 52.461h2.778l7.406-46.289h40.426v490.047h-51.227v-144.73q0-30.86 3.395-52.461h-4.012q-35.488 51.535-106.774 51.535z" />
          </svg>
        </span>
        <span v-if="isDesktop" class="layout__brand-text">
          <strong>{{ t('app.name') }}</strong>
        </span>
      </div>

      <nav class="layout__nav" :aria-label="t('app.name')">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="layout__nav-item"
          :class="{ 'is-active': route.name === item.name }"
          :title="!isDesktop ? item.label : undefined"
        >
          <span class="layout__nav-icon" aria-hidden="true">
            <NavIcon :name="item.icon" :size="18" />
          </span>
          <span v-if="isDesktop" class="layout__nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="layout__sidebar-footer">
        <!-- Connectivity lives in the sidebar: it is ambient state you glance
             at, not a primary task, and the column had a lot of dead space. -->
        <ConnectionPanel v-if="isDesktop" compact class="layout__sidebar-conn" />

        <div v-if="isDesktop" class="layout__sidebar-stats">
          <div class="layout__sidebar-stat">
            <span class="layout__sidebar-stat-label">{{ t('stats.download') }}</span>
            <span class="layout__sidebar-stat-value is-down">
              ↓ {{ formatSpeed(session.downloadSpeed) }}
            </span>
          </div>
          <div class="layout__sidebar-stat">
            <span class="layout__sidebar-stat-label">{{ t('stats.upload') }}</span>
            <span class="layout__sidebar-stat-value is-up">
              ↑ {{ formatSpeed(session.uploadSpeed) }}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="layout__theme-btn"
          :title="`${t('theme.label')}: ${themeLabel}`"
          @click="theme.cycleTheme()"
        >
          <svg v-if="themeIcon === 'sun'" viewBox="0 0 20 20" width="16" height="16">
            <circle cx="10" cy="10" r="3.6" fill="currentColor" />
            <path
              d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
          <svg v-else-if="themeIcon === 'moon'" viewBox="0 0 20 20" width="16" height="16">
            <path d="M16 12.4A7 7 0 017.6 4a7 7 0 108.4 8.4z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 20 20" width="16" height="16">
            <rect
              x="2.5"
              y="3.5"
              width="15"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path d="M7 16.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span v-if="isDesktop" class="layout__theme-label">{{ themeLabel }}</span>
        </button>

        <!-- Language switcher. Hidden on collapsed/icon-only sidebars where
             there is no room for a select control; the mobile drawer carries
             it instead. -->
        <div v-if="isDesktop" class="layout__locale">
          <span class="layout__locale-label">{{ t('language.label') }}</span>
          <MacSelect
            :model-value="locale"
            :options="localeOptions"
            :aria-label="t('language.label')"
            @update:model-value="onLocaleChange"
          />
        </div>

        <button v-if="isDesktop" type="button" class="layout__theme-btn" @click="handleSignOut">
          <svg viewBox="0 0 20 20" width="16" height="16">
            <path
              d="M12.5 6.5V4.8A1.3 1.3 0 0011.2 3.5H4.8A1.3 1.3 0 003.5 4.8v10.4a1.3 1.3 0 001.3 1.3h6.4a1.3 1.3 0 001.3-1.3v-1.7M8.5 10h8m0 0l-2.5-2.5M16.5 10l-2.5 2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="layout__theme-label">{{ t('action.signOut') }}</span>
        </button>
      </div>
    </aside>

    <!-- ================= Main column ================= -->
    <div class="layout__main">
      <!-- Mobile top bar -->
      <header v-if="isMobile" class="layout__mobile-bar glass-bar">
        <button
          type="button"
          class="layout__icon-btn"
          :aria-label="t('nav.transfers')"
          aria-controls="mobile-drawer"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = true"
        >
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path
              d="M3 5.5h14M3 10h14M3 14.5h14"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <h1 class="layout__mobile-title">{{ t('app.name') }}</h1>

        <button
          type="button"
          class="layout__icon-btn"
          :aria-label="themeLabel"
          @click="theme.cycleTheme()"
        >
          <svg v-if="themeIcon === 'sun'" viewBox="0 0 20 20" width="18" height="18">
            <circle cx="10" cy="10" r="3.6" fill="currentColor" />
            <path
              d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
          <svg v-else-if="themeIcon === 'moon'" viewBox="0 0 20 20" width="18" height="18">
            <path d="M16 12.4A7 7 0 017.6 4a7 7 0 108.4 8.4z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 20 20" width="18" height="18">
            <rect
              x="2.5"
              y="3.5"
              width="15"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path d="M7 16.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <!-- Offline / connection banner -->
      <Transition name="fade">
        <div v-if="!session.connected && session.lastError" class="layout__banner" role="status">
          <MacBadge tone="danger" size="sm" dot>{{ connectionLabel }}</MacBadge>
          <span class="layout__banner-text">{{ session.lastError }}</span>
          <MacButton size="sm" variant="ghost" @click="session.start()">
            {{ t('action.retry') }}
          </MacButton>
        </div>
      </Transition>

      <main class="layout__content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <!-- Mobile bottom navigation -->
      <nav v-if="isMobile" class="layout__tabbar glass-bar" aria-label="Primary">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="layout__tab"
          :class="{ 'is-active': route.name === item.name }"
        >
          <span class="layout__nav-icon" aria-hidden="true">
            <NavIcon :name="item.icon" :size="20" />
          </span>
          <span class="layout__tab-label">{{ item.label }}</span>
        </RouterLink>
      </nav>
    </div>

    <!-- ================= Mobile drawer ================= -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="drawerOpen && isMobile"
          class="layout__drawer-scrim"
          @click.self="drawerOpen = false"
        >
          <aside id="mobile-drawer" class="layout__drawer glass-panel">
            <div class="layout__drawer-head">
              <span class="layout__brand-text">
                <strong>{{ t('app.name') }}</strong>
                <small>{{ auth.displayVersion }}</small>
              </span>
            </div>

            <nav class="layout__nav">
              <RouterLink
                v-for="item in navItems"
                :key="item.name"
                :to="{ name: item.name }"
                class="layout__drawer-item"
                :class="{ 'is-active': route.name === item.name }"
                @click="drawerOpen = false"
              >
                {{ item.label }}
              </RouterLink>
            </nav>

            <div class="layout__drawer-stats">
              <MacBadge :tone="connectionTone" size="md" dot>{{ connectionLabel }}</MacBadge>
              <p class="layout__drawer-speed">↓ {{ formatSpeed(session.downloadSpeed) }}</p>
              <p class="layout__drawer-speed">↑ {{ formatSpeed(session.uploadSpeed) }}</p>
            </div>

            <MacButton variant="secondary" block @click="handleSignOut">{{ t('action.signOut') }}</MacButton>

            <div class="layout__locale">
              <span class="layout__locale-label">{{ t('language.label') }}</span>
              <MacSelect
                :model-value="locale"
                :options="localeOptions"
                :aria-label="t('language.label')"
                @update:model-value="onLocaleChange"
              />
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  min-height: 100dvh;
  background: var(--bg-base);
}

/* ===================== Sidebar ===================== */
.layout__sidebar {
  flex: none;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  border-right: 1px solid var(--border);
  border-top: none;
  border-bottom: none;
  border-left: none;
  border-radius: 0;
  transition: width var(--duration) var(--ease);
  z-index: 20;
}

.layout__sidebar.is-collapsed {
  width: 64px;
  align-items: center;
}

.layout__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  margin-bottom: var(--space-3);
  min-width: 0;
}

.layout__brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  flex: none;
  box-shadow: var(--shadow-xs);
}

/* ---- Brand glyph ----
   The official qBittorrent mark: a disc carrying a white "b" over a lighter
   "q". Here the badge IS the disc, so only the letterforms are drawn.

   Colours come from tokens rather than the official #fff / #c8e8ff pair, so the
   mark stays legible whichever blue the accent resolves to, and the "q" keeps
   the official two-tone relationship through opacity. */
.layout__brand-b {
  fill: currentColor;
}

.layout__brand-q {
  fill: currentColor;
  opacity: 0.55;
}

.layout__brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.layout__brand-text strong {
  font-size: var(--text-md);
  font-weight: 600;
}

.layout__brand-text small {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.layout__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout__nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-base);
  font-weight: 500;
  text-decoration: none;
  transition:
    background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.layout__sidebar.is-collapsed .layout__nav-item {
  justify-content: center;
  padding: 0;
  width: 40px;
}

.layout__nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  text-decoration: none;
}

.layout__nav-item.is-active {
  background: var(--bg-selected);
  color: var(--accent);
}

.layout__nav-icon {
  display: grid;
  place-items: center;
  flex: none;
}

.layout__nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout__sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

/* The connectivity block sits on the same tinted surface as the speed stats so
   the two read as one footer group rather than two stray widgets. */
.layout__sidebar-conn {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-hover);
}

/* The column is not scrollable, so the nav must absorb any overflow: with the
   connectivity panel added, a short window could otherwise push the footer off
   screen with no way to reach it. */
.layout__nav {
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.layout__nav::-webkit-scrollbar {
  display: none;
}

.layout__sidebar-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  margin-bottom: var(--space-1);
}

.layout__sidebar-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.layout__sidebar-stat-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.layout__sidebar-stat-value {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.layout__sidebar-stat-value.is-down {
  color: var(--state-download);
}

.layout__sidebar-stat-value.is-up {
  color: var(--state-upload);
}

.layout__theme-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 32px;
  padding: 0 var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease);
}

.layout__theme-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.layout__sidebar.is-collapsed .layout__theme-btn {
  justify-content: center;
  width: 40px;
  padding: 0;
}

.layout__theme-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Language switcher ---- */
.layout__locale {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
}

.layout__locale-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  padding-left: var(--space-1);
}

.layout__locale :deep(.mac-select) {
  width: 100%;
}

/* ===================== Main ===================== */
.layout__main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.layout__content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.layout__banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--danger-soft);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  flex: none;
}

.layout__banner-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--danger);
}

/* ===================== Mobile ===================== */
.layout__mobile-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  height: var(--mobile-bar-height);
  padding: 0 var(--space-2);
  padding-top: env(safe-area-inset-top, 0);
  flex: none;
  position: sticky;
  top: 0;
  z-index: 30;
}

.layout__mobile-title {
  font-size: var(--text-md);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.layout__icon-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  flex: none;
}

.layout__icon-btn:active {
  background: var(--bg-active);
}

.layout__tabbar {
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  border-top: 1px solid var(--border);
  border-bottom: none;
  flex: none;
  padding-bottom: env(safe-area-inset-bottom, 0);
  z-index: 30;
}

.layout__tab {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--space-2) 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  text-decoration: none;
  min-width: 0;
  min-height: 48px;
}

.layout__tab.is-active {
  color: var(--accent);
}

.layout__tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* ===================== Drawer ===================== */
.layout__drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  display: flex;
}

.layout__drawer {
  width: min(78vw, 300px);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-4);
  padding-top: calc(var(--space-5) + env(safe-area-inset-top, 0px));
  border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
  border-left: none;
  overflow-y: auto;
}

.layout__drawer-head {
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--separator);
}

.layout__drawer-item {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-md);
  font-weight: 500;
  text-decoration: none;
}

.layout__drawer-item.is-active {
  background: var(--bg-selected);
  color: var(--accent);
}

.layout__drawer-stats {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.layout__drawer-speed {
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/* Drawer slide-in from the left. */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--duration) var(--ease);
}

.drawer-enter-active .layout__drawer,
.drawer-leave-active .layout__drawer {
  transition: transform var(--duration-slow) var(--ease-out);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .layout__drawer,
.drawer-leave-to .layout__drawer {
  transform: translateX(-100%);
}
</style>
