import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatMonth, parseIsoDate } from './dateFormat'

describe('dateFormat', () => {
  it('formatea en ISO 8601 y en UTC', () => {
    expect(formatDate('2026-06-20')).toBe('2026-06-20')
    expect(formatDate('2026-06-20T23:59:00-05:00')).toBe('2026-06-21')
    expect(formatDateTime('2026-10-18T05:23:26Z')).toBe('2026-10-18 05:23 UTC')
    expect(formatDateTime('2026-10-18')).toBe('2026-10-18')
    expect(formatMonth(Date.UTC(2026, 5, 1))).toBe('2026-06')
  })

  it('rechaza fechas imposibles y usa el texto alternativo', () => {
    expect(parseIsoDate('2026-13-40')).toBeNull()
    expect(formatDate('2026-02-30', 'Sin fecha')).toBe('Sin fecha')
    expect(formatDate(null)).toBe('—')
    expect(formatDateTime(undefined, 'x')).toBe('x')
  })
})
