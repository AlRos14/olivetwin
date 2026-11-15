/**
 * Formato de fechas de toda la interfaz: numérico estadounidense
 * (MM/DD/YYYY), siempre en UTC para no desplazar el día de adquisición.
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

function usDate(date: Date): string {
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()}`
}

/** `2026-06-20T05:23:00Z` → `06/20/2026`. Devuelve `fallback` si no es una fecha. */
export function formatUsDate(value: string | null | undefined, fallback = '—'): string {
  const date = parseIsoDate(value)
  return date ? usDate(date) : fallback
}

/** Con hora en el valor: `06/20/2026 05:23 UTC`; sin hora: `06/20/2026`. */
export function formatUsDateTime(value: string | null | undefined, fallback = '—'): string {
  const date = parseIsoDate(value)
  if (!date || !value) return fallback
  if (DATE_ONLY.test(value)) return usDate(date)
  return `${usDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
}

/** Marca de eje mensual: `06/2026`. */
export function formatUsMonth(time: number): string {
  const date = new Date(time)
  return `${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
}
