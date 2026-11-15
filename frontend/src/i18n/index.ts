/**
 * Internationalization core (EN default, ES available).
 *
 * Minimal, dependency-free i18n: a reactive `locale`, typed message catalogs
 * (`messages/en.ts` is the source of truth for keys; `messages/es.ts` must have
 * the same shape) and `t(key, params)`.
 *
 * - UI strings: `t('tabs.layers')`. Messages are strings with `{name}`
 *   placeholders or functions `(params) => string` (use functions for plurals).
 * - Strings that come from the published data (analysis.json / manifest.json,
 *   authored in Spanish by the pipelines) go through `dataText()` in
 *   `./dataText.ts`, never through `t()`.
 * - Numbers and dates go through `./format.ts` (locale-aware numbers, ISO 8601
 *   dates, SI units).
 *
 * The chosen locale is persisted in localStorage (best effort) and mirrored on
 * `<html lang>`.
 */
import { computed, ref } from 'vue'
import { en } from './messages/en'
import { es } from './messages/es'

export type Locale = 'en' | 'es'
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es'] as const
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_STORAGE_KEY = 'olivetwin.locale'

type Params = Record<string, string | number>
type MessageFn = (params: Params) => string
type MessageValue = string | MessageFn
export interface MessageTree {
  [key: string]: MessageValue | MessageTree
}

/** Same shape as `en`, with any string/function as leaf. */
export type Messages = DeepMessages<typeof en>
type DeepMessages<T> = {
  [K in keyof T]: T[K] extends string | MessageFn ? MessageValue : DeepMessages<T[K]>
}

/** Dotted keys of the English catalog, e.g. `'tabs.layers'`. */
export type MessageKey = Leaves<typeof en>
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | MessageFn ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

const catalogs: Record<Locale, MessageTree> = {
  en: en as unknown as MessageTree,
  es: es as unknown as MessageTree,
}

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es'
}

function readStoredLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Private mode / blocked storage: fall back to the default.
  }
  return DEFAULT_LOCALE
}

export const locale = ref<Locale>(readStoredLocale())

/** BCP 47 tag used by Intl for numbers. */
export const intlLocale = computed(() => (locale.value === 'es' ? 'es-ES' : 'en-GB'))

function syncDocumentLang(value: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = value
}
syncDocumentLang(locale.value)

export function setLocale(next: Locale, options: { persist?: boolean } = {}): void {
  if (!isLocale(next)) return
  locale.value = next
  syncDocumentLang(next)
  if (options.persist === false) return
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // Ignore storage failures; the choice still applies for this session.
  }
}

function lookup(tree: MessageTree, key: string): MessageValue | undefined {
  let node: MessageValue | MessageTree | undefined = tree
  for (const part of key.split('.')) {
    if (node === undefined || typeof node !== 'object') return undefined
    node = (node as MessageTree)[part]
  }
  return typeof node === 'string' || typeof node === 'function' ? node : undefined
}

function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Translates a UI key in the current locale (reactive when used in templates or
 * computed). Missing keys fall back to English, then to the key itself.
 */
export function t(key: MessageKey, params: Params = {}): string {
  const message = lookup(catalogs[locale.value], key) ?? lookup(catalogs.en, key)
  if (message === undefined) return key
  return typeof message === 'function' ? message(params) : interpolate(message, params)
}

/** Composable form for components: `const { t, locale } = useI18n()`. */
export function useI18n() {
  return { t, locale, setLocale, intlLocale }
}
