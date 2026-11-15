import { describe, expect, it } from 'vitest'
import { formatUsDate, formatUsDateTime, formatUsMonth, parseIsoDate } from './dateFormat'

describe('dateFormat', () => {
  it('formatea en MM/DD/YYYY y en UTC', () => {
    expect(formatUsDate('2026-06-20')).toBe('06/20/2026')
    expect(formatUsDate('2026-06-20T23:59:00-05:00')).toBe('06/21/2026')
    expect(formatUsDateTime('2026-10-18T05:23:26Z')).toBe('10/18/2026 05:23 UTC')
    expect(formatUsDateTime('2026-10-18')).toBe('10/18/2026')
    expect(formatUsMonth(Date.UTC(2026, 5, 1))).toBe('06/2026')
  })

  it('rechaza fechas imposibles y usa el texto alternativo', () => {
    expect(parseIsoDate('2026-13-40')).toBeNull()
    expect(formatUsDate('2026-02-30', 'Sin fecha')).toBe('Sin fecha')
    expect(formatUsDate(null)).toBe('—')
    expect(formatUsDateTime(undefined, 'x')).toBe('x')
  })
})
