/**
 * The RSS tree must RENDER to the depth the parser builds.
 *
 * `parseRssItems` is fully recursive and the server nests folders arbitrarily
 * deep, but the view used to render exactly two levels inline — a root loop, and
 * for a folder `children.filter(c => c.kind === 'feed')`. A folder inside a
 * folder was never put in the DOM at all: unreachable, unclickable, yet still
 * counted in the folder's unread badge. Rendering is delegated to a recursive
 * component now, and this test pins the behaviour so it cannot regress to a
 * fixed number of levels again.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const items = {
  Outer: {
    Sub: {
      Deep: {
        uid: '{d}',
        url: 'https://example.com/deep.xml',
        title: 'Deep feed',
        isLoading: false,
        hasError: false,
        articles: [{ id: 'x1', title: 'Deep article', isRead: false }],
      },
    },
  },
  Loose: {
    uid: '{l}',
    url: 'https://example.com/loose.xml',
    title: 'Loose feed',
    isLoading: false,
    hasError: false,
    articles: [],
  },
}

vi.mock('@/api/rss', async () => {
  const actual = await vi.importActual<typeof import('@/api/rss')>('@/api/rss')
  return {
    ...actual,
    getRssItems: vi.fn(async () => items),
    getRssRules: vi.fn(async () => ({})),
  }
})

import RssView from '@/views/RssView.vue'
import { i18n } from '@/i18n'

describe('RssView — nested folder rendering', () => {
  it('renders folders and feeds at any depth', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(RssView, { global: { plugins: [i18n] }, attachTo: document.body })
    await flushPromises()
    await flushPromises()

    const text = wrapper.text()

    // Every level must be present, including the folder inside a folder and the
    // feed inside that.
    expect(text, 'first-level folder missing').toContain('Outer')
    expect(text, 'nested folder missing — nesting collapsed to one level').toContain('Sub')
    expect(text, 'a feed only reachable through two folders is missing').toContain('Deep feed')
    // A feed at the root must still render.
    expect(text, 'root-level feed missing').toContain('Loose feed')

    wrapper.unmount()
  })

  it('makes the deeply nested feed selectable', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(RssView, { global: { plugins: [i18n] }, attachTo: document.body })
    await flushPromises()
    await flushPromises()

    // The node must be a real button the user can click, not just text.
    const buttons = wrapper.findAll('button')
    const deep = buttons.find((b) => b.text().includes('Deep feed'))
    expect(deep, 'the nested feed has no clickable node').toBeTruthy()

    await deep!.trigger('click')
    await flushPromises()
    // Selecting it must reveal its articles, which is the whole point of
    // reaching it.
    expect(wrapper.text()).toContain('Deep article')

    wrapper.unmount()
  })
})