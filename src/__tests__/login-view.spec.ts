/**
 * Render test for the login screen using the SOURCE components.
 *
 * The production-bundle smoke test is limited by jsdom (no network, and the
 * bundle resolves axios' Node adapter), so this suite mounts the real
 * component tree with the API layer mocked. Together they cover both "the
 * bundle loads" and "the UI actually renders correctly".
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

// Mock the auth endpoint at the module boundary.
vi.mock('@/api/auth', () => ({
  login: vi.fn(async () => ({ ok: true })),
  logout: vi.fn(async () => undefined),
}))

// The auth store probes via getVersion on startup.
vi.mock('@/api/app', () => ({
  getVersion: vi.fn(async () => '5.1.4'),
  getWebApiVersion: vi.fn(async () => '2.11.0'),
  getBuildInfo: vi.fn(async () => ({})),
  getPreferences: vi.fn(async () => ({})),
  setPreferences: vi.fn(async () => true),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}))

import LoginView from '@/views/LoginView.vue'
import { i18n } from '@/i18n'

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function mountLogin() {
    return mount(LoginView, {
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          // RouterLink is irrelevant to the login screen.
          RouterLink: true,
        },
      },
    })
  }

  it('renders the macOS-styled sign-in form', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('.login__panel').exists()).toBe(true)
    expect(wrapper.find('.glass-panel').exists()).toBe(true)
    expect(wrapper.find('.mac-btn').exists()).toBe(true)

    const text = wrapper.text()
    expect(text).toContain('qBittorrent')
    expect(text).toContain('Username')
    expect(text).toContain('Password')
  })

  it('disables submit until both fields are filled', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('#login-username').setValue('admin')
    await wrapper.find('#login-password').setValue('secret')
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('uses a password-typed input so credentials are not shown', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    const input = wrapper.find('#login-password')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('current-password')
  })

  it('marks the username field for autofill but never the password value', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('#login-username').attributes('autocomplete')).toBe('username')
    // Nothing should ever be pre-filled into the password box.
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe('')
  })
})
