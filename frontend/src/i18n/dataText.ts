/**
 * Translation of strings that come from the published data.
 *
 * The pipelines author every free-text field of `manifest.json` and
 * `analysis.json` (titles, descriptions, caveats, provenance, legend labels,
 * crop requirements…) in Spanish. The English rendering lives next to the data
 * in `data/<mode>/i18n/en.json`:
 *
 *   { "sourceLocale": "es", "locale": "en", "entries": { "<exact Spanish>": "<English>" } }
 *
 * `dataText(text)` returns the text in the current locale: unchanged in
 * Spanish, looked up by exact match in English, falling back to the Spanish
 * source when an entry is missing (never blank). `npm run validate:data`
 * reports data strings without an English entry.
 */
import { reactive } from 'vue'
import { resolveAssetUrl } from '../services/assetUrl'
import { locale } from './index'

export interface DataCatalogFile {
  sourceLocale: 'es'
  locale: 'en'
  entries: Record<string, string>
}

const state = reactive({ entries: {} as Record<string, string>, loaded: false })

export function setDataCatalog(entries: Record<string, string>): void {
  state.entries = entries
  state.loaded = true
}

/** Loads `data/<mode>/i18n/en.json`. Failures leave the Spanish source visible. */
export async function loadDataCatalog(
  mode: 'real' | 'sample' = 'real',
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<void> {
  try {
    const response = await fetchImpl(resolveAssetUrl(`data/${mode}/i18n/en.json`))
    if (!response.ok) return
    const file = (await response.json()) as Partial<DataCatalogFile>
    if (file && typeof file.entries === 'object' && file.entries !== null) setDataCatalog(file.entries)
  } catch {
    // Network or JSON error: keep Spanish source strings.
  }
}

/** Current-locale rendering of a data string. `null`/`undefined` → `''`. */
export function dataText(text: string | null | undefined): string {
  if (text === null || text === undefined) return ''
  if (locale.value === 'es') return text
  return state.entries[text] ?? text
}
