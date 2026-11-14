import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataModeSwitch from './DataModeSwitch.vue'
import type { DataMode } from '../types/manifest'

function mountSwitch(modelValue: DataMode = 'sample') {
  return mount(DataModeSwitch, { props: { modelValue } })
}

describe('DataModeSwitch', () => {
  it('expone un radiogroup accesible con las dos opciones', () => {
    const wrapper = mountSwitch()
    const group = wrapper.get('[role="radiogroup"]')
    expect(group.attributes('aria-labelledby')).toBeTruthy()

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios.map((radio) => radio.attributes('value'))).toEqual(['sample', 'real'])
    expect(radios[0].attributes('name')).toBe(radios[1].attributes('name'))

    expect(wrapper.text()).toContain('Datos de muestra')
    expect(wrapper.text()).toContain('Datos reales')
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)
    expect((radios[1].element as HTMLInputElement).checked).toBe(false)
  })

  it('emite update:modelValue al elegir Datos reales', async () => {
    const wrapper = mountSwitch('sample')
    await wrapper.get('input[value="real"]').setValue()
    expect(wrapper.emitted('update:modelValue')).toEqual([['real']])
  })

  it('no emite si se elige el modo que ya está activo', async () => {
    const wrapper = mountSwitch('sample')
    await wrapper.get('input[value="sample"]').setValue()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('refleja el modo activo recibido por props', () => {
    const wrapper = mountSwitch('real')
    expect((wrapper.get('input[value="real"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('input[value="sample"]').element as HTMLInputElement).checked).toBe(false)
  })
})
