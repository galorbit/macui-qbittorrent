import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n, applyInitialLocale } from './i18n'
import { initTheme } from './composables/useTheme'

import './styles/tokens.css'
import './styles/base.css'
import './styles/glass.css'

// Reconcile the pre-paint theme decision made in index.html with the user's
// persisted preference, and keep it in sync with the OS setting.
initTheme()

// Reflect the resolved language on <html lang> before anything renders, so the
// browser picks correct CJK font fallbacks from the very first paint.
applyInitialLocale()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')