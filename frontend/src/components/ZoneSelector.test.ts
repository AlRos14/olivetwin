import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZoneSelector from './ZoneSelector.vue'
import type { StudyZone } from '../types/manifest'

const zone = (id: string, name: string): StudyZone => ({
  id,
  name,
  bbox: [-3.86, 37.69, -3.61, 37.9],
  layers: [],
})

const zones = [zone('jaen-demo', 'Jaén — demostración'), zone('toledo-demo', 'Toledo — demostración')]

describe('ZoneSelector', () => {
  it('asocia la etiqueta al select y ofrece una opción vacía', () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones, modelValue: null },
    })

    const select = wrapper.get('select')
    const label = wrapper.get('label')
    expect(label.attributes('for')).toBe(select.attributes('id'))
    expect(label.text()).toBe('Zona de estudio')

    const options = wrapper.findAll('option')
    expect(options).toHaveLength(3)
    expect(options[0].text()).toBe('Selecciona una zona')
    expect(options[0].attributes('value')).toBe('')
    expect((select.element as HTMLSelectElement).value).toBe('')
    expect(select.attributes('disabled')).toBeUndefined()
  })

  it('emite el id de la zona elegida', async () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones, modelValue: null },
    })
    await wrapper.get('select').setValue('toledo-demo')
    expect(wrapper.emitted('update:modelValue')).toEqual([['toledo-demo']])
  })

  it('emite null al volver a la opción vacía', async () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones, modelValue: 'jaen-demo' },
    })
    await wrapper.get('select').setValue('')
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })

  it('queda deshabilitado y lo explica cuando no hay zonas', () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones: [], modelValue: null },
    })
    const select = wrapper.get('select')
    expect(select.attributes('disabled')).toBeDefined()
    expect(wrapper.get('option').text()).toBe('No hay zonas disponibles')
    expect(wrapper.text()).toContain('No hay zonas disponibles en este modo de datos.')
    expect(select.attributes('aria-describedby')).toBeTruthy()
  })

  it('no duplica el etiquetado accesible en la sección', () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones, modelValue: null },
    })
    expect(wrapper.get('section').attributes('aria-labelledby')).toBeUndefined()
    // La etiqueta sigue asociada al control mediante `for`/`id`.
    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('select').attributes('id'))
  })

  it('respeta el prop disabled aunque existan zonas', () => {
    const wrapper = mount(ZoneSelector, {
      props: { zones, modelValue: null, disabled: true },
    })
    expect(wrapper.get('select').attributes('disabled')).toBeDefined()
  })
})
