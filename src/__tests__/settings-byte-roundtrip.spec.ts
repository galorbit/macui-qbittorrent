/**
 * Byte-unit settings must survive a display → edit → save round trip.
 *
 * The display layer scales bytes into KiB/MiB and rounds to 2 decimals, while
 * the setter scaled the typed number back by the *displayed* unit. That made the
 * round trip lossy: a stored 1500 B/s rendered as "1.46 KiB/s", and committing
 * that visible value produced `trunc(1.46 * 1024)` = 1495. The settings page
 * compares `toApi(draft)` against the server snapshot, so any drift here is a
 * phantom change that writes a subtly wrong number back to qBittorrent.
 *
 * `toApi(fromApi(x)) === x` was already covered; what was NOT covered is
 * `toApi(fromUserEdit(display(x)))`, which is the path a real edit takes.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingFieldControl from '@/components/settings/SettingFieldControl.vue'
import { i18n } from '@/i18n'
import type { SettingField } from '@/config/settings-schema'

const KIB = 1024

/** A minimal byte-per-second field, shaped exactly like the real schema. */
function rateField(): SettingField {
  return {
    key: 'dl_limit',
    kind: 'integer',
    unit: 'bytesPerSec',
    min: 0,
  } as SettingField
}

function mountField(modelValue: number) {
  return mount(SettingFieldControl, {
    props: { field: rateField(), modelValue },
    global: { plugins: [i18n] },
  })
}

/**
 * The value committed when the user clears the field and retypes the number they
 * were shown — an ordinary edit (select-all, delete, type).
 *
 * This is the reachable form of the drift. Re-committing identical text does NOT
 * reach the setter, because `<input type="number">` normalises the string and the
 * DOM value never changes; clearing the field first forces a real edit, and the
 * retyped number is then scaled by the displayed unit. With the bug, a stored
 * 1500 B/s (shown as "1.46 KiB/s") came back as `trunc(1.46 * 1024)` = 1495.
 */
function retypeShownValue(modelValue: number): number | undefined {
  const wrapper = mountField(modelValue)
  const input = wrapper.find('input')
  const shown = (input.element as HTMLInputElement).value
  input.setValue('')
  input.setValue(shown)
  const emitted = wrapper.emitted('update:modelValue')
  wrapper.unmount()
  return emitted ? (emitted[emitted.length - 1][0] as number) : undefined
}

describe('byte-unit settings — display round trip', () => {
  it('does not drift when the shown value is retyped', () => {
    const samples = [1024, 1025, 1500, 2000, 50000, 1048575, 1048577, 1500000]
    for (const stored of samples) {
      const committed = retypeShownValue(stored)
      expect(
        committed === undefined || committed === stored,
        `stored ${stored} drifted to ${committed} when retyped`,
      ).toBe(true)
    }
  })

  it('never corrupts a value that is not retyped at all', () => {
    for (const stored of [0, 1, 100, 511, 512, 10240, 1048576]) {
      const wrapper = mountField(stored)
      expect(wrapper.emitted('update:modelValue'), `stored ${stored} emitted on mount`).toBeUndefined()
      wrapper.unmount()
    }
  })

  it('renders the scaled value and its unit', () => {
    const wrapper = mountField(1500)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('1.46')
    expect(wrapper.text()).toContain('KiB/s')
    wrapper.unmount()
  })

  it('scales a genuinely new number through the displayed unit', () => {
    const wrapper = mountField(1500)
    // 2 KiB/s typed while the field is showing KiB.
    wrapper.find('input').setValue('2')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[emitted.length - 1][0]).toBe(2 * KIB)
    wrapper.unmount()
  })

  it('treats a number below 1 KiB as plain bytes', () => {
    const wrapper = mountField(300)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('300')
    expect(wrapper.text()).toContain('B/s')
    wrapper.find('input').setValue('400')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[emitted.length - 1][0]).toBe(400)
    wrapper.unmount()
  })

  it('does not drift inside the MiB range either', () => {
    // 1500000 used to come back as 1499463 (-537 bytes).
    const committed = retypeShownValue(1500000)
    expect(committed === undefined || committed === 1500000).toBe(true)
  })
})