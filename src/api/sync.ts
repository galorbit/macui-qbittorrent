/**
 * `sync` endpoints — the primary realtime data channel.
 *
 * `GET /sync/maindata?rid=N` implements incremental sync:
 *   - rid=0 (or after any gap) → full snapshot
 *   - afterwards the server replies with only what changed
 *   - any response may set `full_update: true`, meaning "discard local state"
 *
 * Everything in the response is optional, so callers must merge.
 */
import { http } from './http'
import type { MainData } from '@/types/api'

/**
 * Fetch maindata. Pass the last seen `rid`, or 0 for a full snapshot.
 *
 * `signal` lets the caller abort an in-flight request when the component
 * unmounts or when polling is paused (avoids leaking requests on navigation).
 */
export async function getMainData(rid = 0, signal?: AbortSignal): Promise<MainData> {
  const res = await http.get<MainData>(`sync/maindata?rid=${rid}`, { signal })
  const data = (res.data ?? {}) as MainData
  // The API uses both `full_update` and, historically, `fullUpdate`.
  const raw = data as unknown as Record<string, unknown>
  const fullUpdate = raw.full_update === true || raw.fullUpdate === true
  return { ...data, full_update: fullUpdate, rid: Number(data.rid ?? rid) }
}

export interface PeerData {
  peers: Record<string, Record<string, unknown>>
  rid: number
}

export async function getTorrentPeers(
  hash: string,
  rid = 0,
  signal?: AbortSignal,
): Promise<PeerData> {
  const res = await http.get<PeerData>(
    `sync/torrentPeers?hash=${encodeURIComponent(hash)}&rid=${rid}`,
    { signal },
  )
  return res.data ?? { peers: {}, rid: 0 }
}