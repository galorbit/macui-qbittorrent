/**
 * Display formatters.
 *
 * qBittorrent reports speeds in bytes/second, sizes in bytes, and ETA in
 * seconds with 8640000 meaning "infinity".
 */
import { INFINITE_ETA, type TorrentState } from '@/types/api'

const KIB = 1024
const MIB = KIB * 1024
const GIB = MIB * 1024
const TIB = GIB * 1024

const NBSP = '\u00a0'

/** Human-readable byte size, e.g. "1.42 GiB". */
export function formatBytes(bytes: number | undefined | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return '—'
  const value = Math.abs(bytes)
  if (value < KIB) return `${Math.round(bytes)}${NBSP}B`
  if (value < MIB) return `${(bytes / KIB).toFixed(decimals)}${NBSP}KiB`
  if (value < GIB) return `${(bytes / MIB).toFixed(decimals)}${NBSP}MiB`
  if (value < TIB) return `${(bytes / GIB).toFixed(decimals)}${NBSP}GiB`
  return `${(bytes / TIB).toFixed(decimals)}${NBSP}TiB`
}

/** Bytes/second, e.g. "3.1 MiB/s". */
export function formatSpeed(bytesPerSecond: number | undefined | null): string {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return `0${NBSP}B/s`
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * Compact speed for tight layouts, dropping the space and using "M"/"K".
 * e.g. "3.1M" — used in the mobile card list.
 */
export function formatSpeedCompact(bytesPerSecond: number | undefined | null): string {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return '0'
  const v = Math.abs(bytesPerSecond)
  if (v < KIB) return `${Math.round(bytesPerSecond)}B`
  if (v < MIB) return `${(bytesPerSecond / KIB).toFixed(0)}K`
  if (v < GIB) return `${(bytesPerSecond / MIB).toFixed(1)}M`
  return `${(bytesPerSecond / GIB).toFixed(1)}G`
}

/**
 * Remaining time. Returns "∞" for the API's infinity sentinel and "—" when the
 * value is not meaningful (e.g. a paused torrent).
 */
export function formatEta(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds >= INFINITE_ETA) return '∞'
  if (seconds < 0) return '—'
  if (seconds === 0) return '0s'

  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Elapsed/uptime style duration, e.g. "2d 4h" or "13m". */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Percentage, e.g. "42.7%". */
export function formatPercent(fraction: number | undefined | null, decimals = 1): string {
  if (fraction === undefined || fraction === null || !Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(decimals)}%`
}

/**
 * Share ratio. The API uses -1 for "no limit" and may send -2 for "use global".
 */
export function formatRatio(ratio: number | undefined | null): string {
  if (ratio === undefined || ratio === null || !Number.isFinite(ratio)) return '—'
  if (ratio < 0) return '∞'
  return ratio.toFixed(2)
}

/** Unix seconds → local date/time string. 0 or -1 means "not set". */
export function formatTimestamp(
  seconds: number | undefined | null,
  opts: { dateOnly?: boolean } = {},
): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return opts.dateOnly
      ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
  } catch {
    return date.toISOString()
  }
}

/** Relative time, e.g. "3 min ago". Falls back to an absolute date when old. */
export function formatRelative(seconds: number | undefined | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const deltaSec = Math.floor(Date.now() / 1000 - seconds)
  if (deltaSec < 0) return 'just now'
  if (deltaSec < 60) return 'just now'
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} h ago`
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)} d ago`
  return formatTimestamp(seconds, { dateOnly: true })
}

/** 1 → "1st", 2 → "2nd" … used for tracker tiers. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// ---- Torrent state helpers ---------------------------------------------

export type StateTone = 'download' | 'upload' | 'paused' | 'error' | 'stalled' | 'queued' | 'checking'

/**
 * States that mean "not running", across BOTH naming generations.
 *
 * qBittorrent renamed this state in 5.0: `pausedDL` / `pausedUP` became
 * `stoppedDL` / `stoppedUP`, and `torrentStateToString()` in
 * `src/webui/api/serialize/serialize_torrent.cpp` has NO `paused*` case on
 * 5.x — it emits `stopped*` only. Both names are accepted here because this
 * theme is installed on 4.x and 5.x alike.
 *
 * Getting this wrong is not cosmetic: the filter chip labelled "stopped"
 * matched nothing, stopped torrents were counted in no category at all, and the
 * detail page offered "Stop" for a torrent that was already stopped. The test
 * fixtures had the same blind spot (they only ever used `paused*`), which is why
 * a fully green suite did not catch it.
 */
const STOPPED_STATES = ['pausedDL', 'pausedUP', 'stoppedDL', 'stoppedUP']

/** True when the torrent is stopped/paused, in either naming generation. */
export function isStopped(state: string | undefined): boolean {
  return STOPPED_STATES.includes(String(state))
}

/**
 * Map an API state onto a visual tone, which selects a colour token.
 *
 * Unknown states fall through to 'paused' deliberately — an unrecognised state
 * is rendered neutrally rather than as an alarm.
 */
export function stateTone(state: TorrentState | string | undefined): StateTone {
  switch (state) {
    case 'downloading':
    case 'forcedDL':
    case 'metaDL':
    case 'forcedMetaDL':
      return 'download'
    case 'uploading':
    case 'forcedUP':
      return 'upload'
    case 'pausedDL':
    case 'pausedUP':
    case 'stoppedDL':
    case 'stoppedUP':
      return 'paused'
    case 'error':
    case 'missingFiles':
      return 'error'
    case 'stalledDL':
    case 'stalledUP':
      return 'stalled'
    case 'queuedDL':
    case 'queuedUP':
    case 'allocating':
      return 'queued'
    case 'checkingDL':
    case 'checkingUP':
    case 'checkingResumeData':
    case 'moving':
      return 'checking'
    default:
      return 'paused'
  }
}

/** True when the torrent is actively transferring (for the "active" filter). */
export function isActive(torrent: { state: string; dlspeed: number; upspeed: number }): boolean {
  if (torrent.dlspeed > 0 || torrent.upspeed > 0) return true
  return ['downloading', 'uploading', 'forcedDL', 'forcedUP', 'metaDL'].includes(torrent.state)
}

/** True for states where a "resume" action makes sense. */
export function isPaused(state: string): boolean {
  return state === 'pausedDL' || state === 'pausedUP'
}

/** True for states where a "pause" action makes sense. */
export function isRunning(state: string): boolean {
  return !isPaused(state) && state !== 'error' && state !== 'missingFiles'
}

/** Whether the torrent is finished downloading. */
export function isCompleted(torrent: { progress: number }): boolean {
  return torrent.progress >= 1
}

/** Whether the torrent counts as "stalled" for filtering purposes. */
export function isStalled(state: string): boolean {
  return state === 'stalledDL' || state === 'stalledUP'
}