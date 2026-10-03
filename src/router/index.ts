/**
 * Router.
 *
 * Hash history is mandatory here: an alternative WebUI is served as static
 * files from an arbitrary path and qBittorrent does not rewrite unknown paths
 * to index.html (it 404s anything that is not a real file). Path-based routing
 * would therefore break on reload or deep-link.
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: 'Sign In' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: 'Transfers' },
      },
      {
        path: 'torrent/:hash',
        name: 'torrent-detail',
        component: () => import('@/views/TorrentDetailView.vue'),
        props: true,
        meta: { title: 'Torrent' },
      },
      {
        path: 'search',
        name: 'search',
        component: () => import('@/views/SearchView.vue'),
        meta: { title: 'Search' },
      },
      {
        path: 'rss',
        name: 'rss',
        component: () => import('@/views/RssView.vue'),
        meta: { title: 'RSS' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: 'Settings' },
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/views/AboutView.vue'),
        meta: { title: 'About' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Wait for the initial session probe so a reload does not flash the login
  // screen before we know whether a session exists.
  if (auth.probing) {
    await auth.probe()
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }

  if (to.meta.public && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})

export default router