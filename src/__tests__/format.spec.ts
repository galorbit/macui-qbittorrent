/**
 * Formatter tests.
 *
 * These encode the awkward parts of the API contract: ETA uses 8640000 as an
 * "infinity" sentinel, ratio uses negative values for "no limit", and timestamps
 * use 0 for "not set".
 */
import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  formatTimestamp,
  isActive,
  isCompleted,
  isPaused,
  isRunning,
  isStalled,
  ordinal,
  stateTone,
} from '@/utils/format'
import { INFINITE_ETA } from '@/types/api'

/** Normalise the non-breaking space the formatters insert. */
const norm = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatBytes', () => {
  it('scales through the units', () => {
    expect(norm(formatBytes(0))).toBe('0 B')
    expect(norm(formatBytes(512))).toBe('512 B')
    expect(norm(formatBytes(1024))).toBe('1.0 KiB')
    expect(norm(formatBytes(1024 * 1024))).toBe('1.0 MiB')
    expect(norm(formatBytes(1024 ** 3))).toBe('1.0 GiB')
    expect(norm(formatBytes(1024 ** 4))).toBe('1.0 TiB')
  })

  it('handles missing values without printing NaN', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(NaN)).toBe('—')
  })
})

describe('formatSpeed', () => {
  it('appends a per-second suffix', () => {
    expect(norm(formatSpeed(1024))).toBe('1.0 KiB/s')
  })

  it('renders zero and missing values as 0 B/s', () => {
    expect(norm(formatSpeed(0))).toBe('0 B/s')
    expect(norm(formatSpeed(undefined))).toBe('0 B/s')
  })
})

describe('formatEta', () => {
  it('uses the infinity sentinel', () => {
    expect(formatEta(INFINITE_ETA)).toBe('∞')
    expect(formatEta(INFINITE_ETA + 1)).toBe('∞')
  })

  it('formats each magnitude', () => {
    expect(formatEta(0)).toBe('0s')
    expect(formatEta(45)).toBe('45s')
    expect(formatEta(90)).toBe('1m 30s')
    expect(formatEta(3700)).toBe('1h 1m')
    expect(formatEta(90000)).toBe('1d 1h')
  })

  it('treats negative values as unavailable', () => {
    expect(formatEta(-1)).toBe('—')
  })
})

describe('formatRatio', () => {
  it('shows infinity for negative ratio limits', () => {
    expect(formatRatio(-1)).toBe('∞')
    expect(formatRatio(-2)).toBe('∞')
  })

  it('formats positive ratios to two decimals', () => {
    expect(formatRatio(1.23456)).toBe('1.23')
    expect(formatRatio(0)).toBe('0.00')
  })
})

describe('formatPercent', () => {
  it('converts a 0..1 fraction to a percentage', () => {
    expect(formatPercent(0.5)).toBe('50.0%')
    expect(formatPercent(1)).toBe('100.0%')
    expect(formatPercent(0.1234, 0)).toBe('12%')
  })
})

describe('formatTimestamp', () => {
  it('renders "not set" sentinels as a dash', () => {
    expect(formatTimestamp(0)).toBe('—')
    expect(formatTimestamp(-1)).toBe('—')
    expect(formatTimestamp(undefined)).toBe('—')
  })

  it('produces a non-empty string for a real timestamp', () => {
    const out = formatTimestamp(1700000000)
    expect(out).not.toBe('—')
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('formatDuration', () => {
  it('formats durations and rejects nonsense', () => {
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-5)).toBe('—')
    expect(formatDuration(30)).toBe('30s')
    expect(formatDuration(3661)).toBe('1h 1m')
  })
})

describe('stateTone', () => {
  it('maps API states to visual tones', () => {
    expect(stateTone('downloading')).toBe('download')
    expect(stateTone('forcedDL')).toBe('download')
    expect(stateTone('uploading')).toBe('upload')
    expect(stateTone('pausedUP')).toBe('paused')
    expect(stateTone('error')).toBe('error')
    expect(stateTone('missingFiles')).toBe('error')
    expect(stateTone('stalledDL')).toBe('stalled')
    expect(stateTone('queuedUP')).toBe('queued')
    expect(stateTone('checkingDL')).toBe('checking')
    expect(stateTone('moving')).toBe('checking')
  })

  it('falls back to paused for unknown states', () => {
    expect(stateTone('somethingNew')).toBe('paused')
    expect(stateTone(undefined)).toBe('paused')
  })
})

describe('state predicates', () => {
  it('identifies active torrents by speed or state', () => {
    expect(isActive({ state: 'pausedDL', dlspeed: 10, upspeed: 0 })).toBe(true)
    expect(isActive({ state: 'downloading', dlspeed: 0, upspeed: 0 })).toBe(true)
    expect(isActive({ state: 'pausedDL', dlspeed: 0, upspeed: 0 })).toBe(false)
  })

  it('identifies paused and running states', () => {
    expect(isPaused('pausedDL')).toBe(true)
    expect(isPaused('pausedUP')).toBe(true)
    expect(isPaused('downloading')).toBe(false)

    expect(isRunning('downloading')).toBe(true)
    expect(isRunning('pausedUP')).toBe(false)
    // Error states are not "running" — pausing them makes no sense.
    expect(isRunning('error')).toBe(false)
    expect(isRunning('missingFiles')).toBe(false)
  })

  it('identifies completion, stalling and ordinals', () => {
    expect(isCompleted({ progress: 1 })).toBe(true)
    expect(isCompleted({ progress: 0.99 })).toBe(false)
    expect(isStalled('stalledDL')).toBe(true)
    expect(isStalled('stalledUP')).toBe(true)
    expect(isStalled('downloading')).toBe(false)

    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(21)).toBe('21st')
  })
})