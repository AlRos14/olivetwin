/**
 * Date format for the whole UI: ISO 8601 (YYYY-MM-DD), the same in every
 * language, always in UTC so the acquisition day never shifts.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** ISO 8601; las fechas sin hora se validan estrictamente (`2026-13-40` → null). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null
    }
    return date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** `2026-06-20T05:23:00Z` → `2026-06-20`. Devuelve `fallback` si no es una fecha. */
export function formatDate(value: string | null | undefined, fallback = '—'): string {
  const date = parseIsoDate(value)
  return date ? isoDate(date) : fallback
}

/** With a time in the value: `2026-06-20 05:23 UTC`; date only: `2026-06-20`. */
export function formatDateTime(value: string | null | undefined, fallback = '—'): string {
  const date = parseIsoDate(value)
  if (!date || !value) return fallback
  if (DATE_ONLY.test(value)) return isoDate(date)
  return `${isoDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
}

/** Monthly axis tick: `2026-06`. */
export function formatMonth(time: number): string {
  const date = new Date(time)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}
