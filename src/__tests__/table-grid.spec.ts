/**
 * The table's grid template must have exactly as many tracks as there are cells.
 *
 * Every row and the header are laid out with `grid-template-columns` built from a
 * string, while the cells are individual elements with `v-if` conditions. The two
 * can silently disagree: dropping the status column from compact mode without
 * adjusting the template (or vice versa) shifts every column one track to the
 * left, so the sizes appear under the names. Nothing else in the suite would
 * notice, because the DOM is still perfectly valid.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TorrentTable from '@/components/torrent/TorrentTable.vue'
import { i18n } from '@/i18n'
import type { Torrent } from '@/types/api'

function torrent(): Torrent {
  return {
    hash: 'a'.repeat(40), name: 'x.iso', size: 1, progress: 0.5, dlspeed: 0, upspeed: 0,
    priority: 0, num_seeds: 0, num_complete: 0, num_leechs: 0, num_incomplete: 0,
    ratio: 0, eta: 100, state: 'downloading', seq_dl: false, f_l_piece_prio: false,
    completion_on: 0, tracker: '', dl_limit: 0, up_limit: 0, downloaded: 1, uploaded: 1,
    downloaded_session: 1, uploaded_session: 1, amount_left: 0, save_path: '/x',
    completed: 0, max_ratio: -1, max_seeding_time: -1, ratio_limit: -2,
    seeding_time_limit: -2, seen_complete: 0, last_activity: 0, total_size: 1,
    category: '', tags: '',
  } as Torrent
}

function mountTable(compact: boolean) {
  return mount(TorrentTable, {
    props: {
      torrents: [torrent()],
      selected: new Set<string>(),
      selectionMode: false,
      sortKey: 'added_on',
      sortReverse: true,
      compact,
    },
    global: { plugins: [i18n] },
  })
}

/** Count the tracks in the inline `grid-template-columns` style. */
function trackCount(wrapper: ReturnType<typeof mountTable>): number {
  const style = wrapper.find('.ttable__header').attributes('style') ?? ''
  return (style.match(/minmax|[0-9.]+px/g) ?? []).length
}

describe('TorrentTable grid alignment', () => {
  for (const compact of [false, true]) {
    it(`keeps the grid in step with the cells (compact=${compact})`, () => {
      const wrapper = mountTable(compact)
      const headerCells = wrapper.findAll('.ttable__header .ttable__cell').length
      const rowCells = wrapper.findAll('.ttable__row .ttable__cell').length

      expect(trackCount(wrapper), 'tracks must equal header cells').toBe(headerCells)
      expect(rowCells, 'every row must have as many cells as the header').toBe(headerCells)
      wrapper.unmount()
    })
  }

  it('shows the status badge in compact mode', () => {
    // The tablet view used to hide it, leaving no way to tell a downloading
    // torrent from a stopped or errored one without opening it.
    const wrapper = mountTable(true)
    expect(wrapper.find('.ttable__row .mac-badge').exists(), 'status badge missing').toBe(true)
    wrapper.unmount()
  })
})