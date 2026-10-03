/**
 * Auth store.
 *
 * qBittorrent has no "who am I" endpoint, so session detection is indirect:
 * any authenticated endpoint returning 200 means we hold a valid session, and
 * a 403 means we do not.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin, logout as apiLogout } from '@/api/auth'
import { getVersion } from '@/api/app'

const USERNAME_KEY = 'macui.username'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  /** True while the initial session probe is in flight. */
  const probing = ref(true)
  const submitting = ref(false)
  const errorMessage = ref('')
  const banned = ref(false)
  const version = ref('')

  const rememberedUsername = ref(readRememberedUsername())

  function readRememberedUsername(): string {
    try {
      return localStorage.getItem(USERNAME_KEY) ?? ''
    } catch {
      return ''
    }
  }

  function rememberUsername(username: string): void {
    rememberedUsername.value = username
    try {
      if (username) localStorage.setItem(USERNAME_KEY, username)
      else localStorage.removeItem(USERNAME_KEY)
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  async function signIn(username: string, password: string, remember: boolean): Promise<boolean> {
    submitting.value = true
    errorMessage.value = ''
    banned.value = false
    try {
      const result = await apiLogin(username, password)
      if (result.ok) {
        isAuthenticated.value = true
        rememberUsername(remember ? username : '')
        void loadVersion()
        return true
      }
      errorMessage.value = result.message ?? 'Sign-in failed'
      banned.value = result.banned === true
      return false
    } finally {
      submitting.value = false
    }
  }

  async function signOut(): Promise<void> {
    await apiLogout()
    markSignedOut()
  }

  /** Called both on explicit logout and on an unexpected 403. */
  function markSignedOut(): void {
    isAuthenticated.value = false
  }

  async function loadVersion(): Promise<void> {
    try {
      version.value = await getVersion()
    } catch {
      /* version is cosmetic */
    }
  }

  /**
   * Determine whether a usable session already exists by calling a cheap
   * authenticated endpoint.
   */
  async function probe(): Promise<void> {
    probing.value = true
    try {
      const v = await getVersion()
      version.value = v
      isAuthenticated.value = true
    } catch {
      isAuthenticated.value = false
    } finally {
      probing.value = false
    }
  }

  const displayVersion = computed(() => version.value || '—')

  return {
    isAuthenticated,
    probing,
    submitting,
    errorMessage,
    banned,
    version,
    displayVersion,
    rememberedUsername,
    signIn,
    signOut,
    markSignedOut,
    probe,
    rememberUsername,
  }
})