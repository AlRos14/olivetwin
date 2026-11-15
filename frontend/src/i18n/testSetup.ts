/**
 * Vitest setup: the existing suites were written against the Spanish UI, so
 * every test starts in Spanish. Tests that cover English (the app default)
 * call `setLocale('en', { persist: false })` explicitly.
 */
import { beforeEach } from 'vitest'
import { setLocale } from './index'

beforeEach(() => {
  setLocale('es', { persist: false })
})
