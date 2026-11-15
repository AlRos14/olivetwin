import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, locale, setLocale, t } from './index'
import { dataText, setDataCatalog } from './dataText'
import { formatNumber } from './format'

afterEach(() => {
  localStorage.clear()
  setDataCatalog({})
})

describe('i18n core', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })

  it('translates UI keys in the current locale and persists the choice', () => {
    setLocale('en')
    expect(t('app.subtitle')).toContain('vegetation, soil and climate')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    setLocale('es')
    expect(locale.value).toBe('es')
    expect(t('app.subtitle')).toContain('vegetación, suelo y clima')
  })

  it('translates data strings in English and keeps the Spanish source otherwise', () => {
    setDataCatalog({ 'Humedad del suelo': 'Soil moisture' })
    setLocale('en', { persist: false })
    expect(dataText('Humedad del suelo')).toBe('Soil moisture')
    expect(dataText('Sin traducción')).toBe('Sin traducción')
    expect(dataText(null)).toBe('')
    setLocale('es', { persist: false })
    expect(dataText('Humedad del suelo')).toBe('Humedad del suelo')
  })

  it('formats numbers with the locale decimal separator', () => {
    setLocale('en', { persist: false })
    expect(formatNumber(0.25)).toBe('0.25')
    setLocale('es', { persist: false })
    expect(formatNumber(0.25)).toBe('0,25')
  })
})
