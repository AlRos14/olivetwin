/**
 * Locale-aware formatting shared by the whole UI.
 *
 * - Numbers: `Intl.NumberFormat` with the current locale (decimal point in
 *   English, decimal comma in Spanish).
 * - Dates: ISO 8601 in UTC in every locale (`2026-06-20`,
 *   `2026-06-20 05:23 UTC`, month ticks `2026-06`), never MM/DD/YYYY.
 * - Units: SI symbols (see `siUnit`), separated from the value by a space.
 */
import { intlLocale } from './index'

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale.value, options).format(value)
}

export function numberFormatter(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocale.value, options)
}
