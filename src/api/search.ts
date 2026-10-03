/**
 * `search` endpoints.
 *
 * PYTHON DEPENDENCY
 * -----------------
 * `search/start` returns 409 Conflict when Python is not installed on the
 * qBittorrent host ("Python must be installed to use the Search Engine"). That
 * is an environment problem, not a bug, so `isPythonMissing` lets the view
 * explain it instead of showing a generic error.
 *
 * PLUGINS
 * -------
 * A fresh install has zero plugins (`search/plugins` returns `[]`) and a search
 * with none returns no results. The view therefore treats "no plugins" as a
 * distinct state with an install affordance, rather than as "no results found".
 */
import { http, toForm, ApiError } from './http'
import type { SearchPlugin, SearchResult, SearchResultsPage, SearchStatus } from '@/types/api'

/** True when the server refused because Python is unavailable. */
export function isPythonMissing(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    /python/i.test(error.message)
  )
}

export async function getSearchPlugins(): Promise<SearchPlugin[]> {
  const { data } = await http.get('search/plugins')
  return Array.isArray(data) ? (data as SearchPlugin[]) : []
}

export async function installSearchPlugins(sources: string[]): Promise<void> {
  await http.post('search/installPlugin', toForm({ sources: sources.join('|') }))
}

export async function uninstallSearchPlugins(names: string[]): Promise<void> {
  await http.post('search/uninstallPlugin', toForm({ names: names.join('|') }))
}

export async function enableSearchPlugins(names: string[], enable: boolean): Promise<void> {
  await http.post('search/enablePlugin', toForm({ names: names.join('|'), enable }))
}

export async function updateSearchPlugins(): Promise<void> {
  await http.post('search/updatePlugins')
}

/**
 * Start a search and return its id.
 *
 * `plugins` accepts the literals the server understands: "all", "enabled", or a
 * "|"-separated list of plugin names.
 */
export async function startSearch(
  pattern: string,
  category = 'all',
  plugins = 'enabled',
): Promise<number> {
  const { data } = await http.post('search/start', toForm({ pattern, category, plugins }))
  return Number((data as { id?: number })?.id ?? 0)
}

export async function stopSearch(id: number): Promise<void> {
  await http.post('search/stop', toForm({ id }))
}

export async function deleteSearch(id: number): Promise<void> {
  await http.post('search/delete', toForm({ id }))
}

/** `id = 0` returns every search the server is tracking. */
export async function getSearchStatus(id = 0): Promise<SearchStatus[]> {
  const { data } = await http.get('search/status', { params: { id } })
  return Array.isArray(data) ? (data as SearchStatus[]) : []
}

export async function getSearchResults(
  id: number,
  limit = 0,
  offset = 0,
): Promise<SearchResultsPage> {
  const { data } = await http.get('search/results', { params: { id, limit, offset } })
  const page = (data ?? {}) as Partial<SearchResultsPage>
  return {
    status: page.status ?? 'Stopped',
    results: (page.results ?? []) as SearchResult[],
    total: Number(page.total ?? 0),
  }
}

/**
 * Hand a result to the downloader.
 *
 * Magnet links are added directly by the server; http(s) URLs go through the
 * plugin that produced them, which is why the plugin name is required.
 */
export async function downloadSearchResult(
  torrentUrl: string,
  pluginName: string,
): Promise<void> {
  await http.post('search/downloadTorrent', toForm({ torrentUrl, pluginName }))
}
