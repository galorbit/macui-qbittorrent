/**
 * `app` endpoints — version info and global preferences.
 *
 * Preferences are written via `setPreferences` with a single `json` parameter.
 * The server only applies keys it recognises (see appcontroller.cpp), so we
 * send a narrow whitelist and treat an unrecognised key as a silent no-op
 * rather than an error.
 */
import { http, toForm } from './http'
import type { AppPreferences, BuildInfo } from '@/types/api'

export async function getVersion(): Promise<string> {
  const res = await http.get<string>('app/version')
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}

export async function getWebApiVersion(): Promise<string> {
  const res = await http.get<string>('app/webapiVersion')
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}

export async function getBuildInfo(): Promise<BuildInfo> {
  const res = await http.get<BuildInfo>('app/buildInfo')
  return res.data
}

export async function getPreferences(): Promise<AppPreferences> {
  const res = await http.get<AppPreferences>('app/preferences')
  return res.data ?? {}
}

/**
 * Update preferences. Only the supplied keys are changed server-side.
 * Returns true when the server reported success.
 */
export async function setPreferences(prefs: Partial<AppPreferences>): Promise<boolean> {
  const res = await http.post('app/setPreferences', toForm({ json: JSON.stringify(prefs) }))
  return res.status >= 200 && res.status < 300
}

export async function getDefaultSavePath(): Promise<string> {
  const res = await http.get<string>('app/defaultSavePath')
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}

export async function shutdownApp(): Promise<void> {
  await http.post('app/shutdown')
}