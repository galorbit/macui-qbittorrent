/**
 * `transfer` endpoints — global speed info and the alternative-rate-limits
 * toggle.
 */
import { http, toForm } from './http'
import type { TransferInfo } from '@/types/api'

export async function getTransferInfo(signal?: AbortSignal): Promise<TransferInfo> {
  const res = await http.get<TransferInfo>('transfer/info', { signal })
  return res.data ?? ({} as TransferInfo)
}

/** Returns true when alternative speed limits are currently active. */
export async function getSpeedLimitsMode(): Promise<boolean> {
  const res = await http.get<number | string>('transfer/speedLimitsMode')
  return Number(res.data) === 1
}

export async function toggleSpeedLimitsMode(): Promise<void> {
  await http.post('transfer/toggleSpeedLimitsMode')
}

export async function getGlobalDownloadLimit(): Promise<number> {
  const res = await http.get<number>('transfer/downloadLimit')
  return Number(res.data) || 0
}

export async function getGlobalUploadLimit(): Promise<number> {
  const res = await http.get<number>('transfer/uploadLimit')
  return Number(res.data) || 0
}

export async function setGlobalDownloadLimit(limit: number): Promise<void> {
  await http.post('transfer/setDownloadLimit', toForm({ limit }))
}

export async function setGlobalUploadLimit(limit: number): Promise<void> {
  await http.post('transfer/setUploadLimit', toForm({ limit }))
}

export async function banPeers(peers: string[]): Promise<void> {
  await http.post('transfer/banPeers', toForm({ peers: peers.join('|') }))
}