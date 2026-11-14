import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerPanel from './LayerPanel.vue'
import type { StudyLayer, StudyZone } from '../types/manifest'

const ndvi: StudyLayer = {
  id: 'ndvi',
  title: 'Vegetación (NDVI)',
  kind: 'image-overlay',
  variable: 'NDVI',
  image: 'data/sample/zones/jaen-demo/ndvi.png',
  bbox: [-3.86, 37.69, -3.61, 37.9],
  imageCrs: 'EPSG:3857',
  unit: 'index',
  range: [-1, 1],
  legend: [
    { value: -1, color: '#8c510a', label: 'Bajo' },
    { value: 0, color: '#dfc27d', label: 'Intermedio' },
    { value: 1, color: '#01665e', label: 'Alto' },
  ],
  status: 'synthetic',
  provenance: {
    provider: 'Generador sintético',
    product: 'NDVI ilustrativo — no satelital',
    acquisitionDate: null,
    sceneId: null,
    processingVersion: 'sample-v1',
    referenceUrl: null,
    note: 'Datos inventados para probar la interfaz',
  },
  qualityNote: 'NO apto para decisiones agronómicas',
}

const moisture: StudyLayer = {
  ...ndvi,
  id: 'soil-moisture',
  title: 'Humedad superficial',
  variable: 'Humedad superficial',
  image: 'data/sample/zones/jaen-demo/moisture.png',
  unit: '%',
  range: [0, 100],
  legend: [
    { value: 0, color: '#f7fbff', label: 'Seco' },
    { value: 100, color: '#08306b', label: 'Húmedo' },
  ],
}

const zone = (layers: StudyLayer[]): StudyZone => ({
  id: 'jaen-demo',
  name: 'Jaén — demostración',
  bbox: [-3.86, 37.69, -3.61, 37.9],
  layers,
})

const baseProps = {
  zone: zone([ndvi, moisture]),
  selectedLayerId: 'ndvi',
  opacity: 0.4,
  visible: true,
  baseMap: 'pnoa' as const,
}

describe('LayerPanel', () => {
  it('muestra solo las capas declaradas por la zona', () => {
    const wrapper = mount(LayerPanel, { props: baseProps })

    expect(wrapper.find('input[type="radio"][value="ndvi"]').exists()).toBe(true)
    expect(wrapper.find('input[type="radio"][value="soil-moisture"]').exists()).toBe(true)
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(4) // 2 base + 2 capas

    const onlyNdvi = mount(LayerPanel, {
      props: { ...baseProps, zone: zone([ndvi]), selectedLayerId: 'ndvi' },
    })
    expect(onlyNdvi.find('input[type="radio"][value="ndvi"]').exists()).toBe(true)
    expect(onlyNdvi.find('input[type="radio"][value="soil-moisture"]').exists()).toBe(false)
  })

  it('emite update:baseMap al cambiar el mapa base', async () => {
    const wrapper = mount(LayerPanel, { props: baseProps })
    await wrapper.get('input[type="radio"][value="osm"]').setValue()
    expect(wrapper.emitted('update:baseMap')).toEqual([['osm']])
  })

  it('emite select-layer con el id de la capa pulsada', async () => {
    const wrapper = mount(LayerPanel, { props: baseProps })
    await wrapper.get('input[type="radio"][value="soil-moisture"]').setValue()
    expect(wrapper.emitted('select-layer')).toEqual([['soil-moisture']])
  })

  it('convierte la opacidad 0–1 en un slider 0–100 % accesible', async () => {
    const wrapper = mount(LayerPanel, { props: baseProps })

    const range = wrapper.get('input[type="range"]')
    const input = range.element as HTMLInputElement
    expect(input.value).toBe('40')
    expect(input.min).toBe('0')
    expect(input.max).toBe('100')
    expect(range.attributes('aria-valuetext')).toBe('40 %')
    expect(wrapper.get('output').text()).toBe('40 %')

    const label = wrapper.get('label[for="' + range.attributes('id') + '"]')
    expect(label.text()).toBe('Opacidad')

    await range.setValue('55')
    expect(wrapper.emitted('update:opacity')).toEqual([[0.55]])
  })

  it('emite update:visible al marcar o desmarcar la casilla', async () => {
    const wrapper = mount(LayerPanel, { props: baseProps })
    const checkbox = wrapper.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    await checkbox.setValue(false)
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  it('sin zona no ofrece controles de capa ni opacidad', () => {
    const wrapper = mount(LayerPanel, {
      props: { ...baseProps, zone: null, selectedLayerId: null },
    })
    expect(wrapper.text()).toContain('Selecciona una zona de estudio')
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('input[type="radio"][value="ndvi"]').exists()).toBe(false)
    // El mapa base sigue siendo elegible aunque no haya zona.
    expect(wrapper.find('input[type="radio"][value="pnoa"]').exists()).toBe(true)
  })

  it('avisa cuando la zona no tiene capas y evita controles inertes', () => {
    const wrapper = mount(LayerPanel, {
      props: { ...baseProps, zone: zone([]), selectedLayerId: null },
    })
    expect(wrapper.text()).toContain('Esta zona no tiene capas científicas disponibles.')
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('pide elegir variable si no hay una capa activa', () => {
    const wrapper = mount(LayerPanel, {
      props: { ...baseProps, selectedLayerId: null },
    })
    expect(wrapper.text()).toContain('Selecciona una variable para ajustar')
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('marca como seleccionados el mapa base y la capa activos', () => {
    const wrapper = mount(LayerPanel, { props: baseProps })
    expect((wrapper.get('input[value="pnoa"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('input[value="ndvi"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('input[value="osm"]').element as HTMLInputElement).checked).toBe(false)
  })
})
