import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LanguageSwitch from './LanguageSwitch.vue'
import { LOCALE_STORAGE_KEY, locale, setLocale } from '../i18n'

afterEach(() => {
  localStorage.clear()
  setLocale('es', { persist: false })
})

describe('LanguageSwitch', () => {
  it('muestra EN | ES como grupo accesible y marca el idioma activo', () => {
    setLocale('en', { persist: false })
    const wrapper = mount(LanguageSwitch)

    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Language')

    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['EN', 'ES'])
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true')
    expect(buttons[1]!.attributes('aria-pressed')).toBe('false')
    expect(buttons[0]!.classes()).toContain('is-selected')
    expect(buttons[1]!.attributes('title')).toBe('Español')
  })

  it('cambia de idioma al pulsar y persiste la elección', async () => {
    setLocale('en', { persist: false })
    const wrapper = mount(LanguageSwitch)

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(locale.value).toBe('es')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es')
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Idioma')
    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('button')[1]!.classes()).toContain('is-selected')
  })

  it('no persiste nada si se elige el idioma ya activo', async () => {
    localStorage.clear()
    setLocale('en', { persist: false })
    const wrapper = mount(LanguageSwitch)

    await wrapper.findAll('button')[0]!.trigger('click')

    expect(locale.value).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
  })
})
