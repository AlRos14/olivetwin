import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerLegend from './LayerLegend.vue'
import type { StudyLayer } from '../types/manifest'

const layer: StudyLayer = {
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
    processingVersion: 'sample-v1',
  },
  qualityNote: 'NO apto para decisiones agronómicas',
}

describe('LayerLegend', () => {
  it('pinta las paradas declaradas con etiquetas, unidad y rango', () => {
    const wrapper = mount(LayerLegend, { props: { layer } })

    const text = wrapper.text()
    expect(text).toContain('Bajo')
    expect(text).toContain('Intermedio')
    expect(text).toContain('Alto')
    expect(text).toContain('Unidad:')
    expect(text).toContain('index')
    expect(text).toContain('Rango:')
    expect(text).toContain('NDVI')

    const stops = wrapper.findAll('.ot-legend__stop')
    expect(stops).toHaveLength(3)

    const style = wrapper.get('.ot-legend__scale').attributes('style') ?? ''
    expect(style).toContain('linear-gradient')
    // jsdom normaliza los colores hexadecimales a rgb().
    expect(style).toContain('rgb(140, 81, 10)')
    expect(style).toContain('rgb(1, 102, 94)')

    const swatches = wrapper.findAll('.ot-legend__swatch')
    expect(swatches[0].attributes('style')).toContain('rgb(140, 81, 10)')
  })

  it('añade la nota de escala ilustrativa solo en capas sintéticas', () => {
    const synthetic = mount(LayerLegend, { props: { layer } })
    expect(synthetic.text()).toContain(
      'Escala ilustrativa: los colores no representan medidas reales',
    )

    const real = mount(LayerLegend, {
      props: { layer: { ...layer, status: 'processed_real' } },
    })
    expect(real.text()).not.toContain('Escala ilustrativa')
    expect(real.text()).toContain('no permiten recuperar valores exactos')
  })

  it('indica «No declarado» si la capa no trae rango', () => {
    const withoutRange: StudyLayer = { ...layer, range: undefined }
    const wrapper = mount(LayerLegend, {
      props: { layer: withoutRange },
    })
    expect(wrapper.text()).toContain('Rango:')
    expect(wrapper.text()).toContain('No declarado')
  })

  it('sin capa muestra un mensaje en lugar de una leyenda vacía', () => {
    const wrapper = mount(LayerLegend, { props: { layer: null } })
    expect(wrapper.text()).toContain('Selecciona una zona y una variable')
    expect(wrapper.find('.ot-legend__scale').exists()).toBe(false)
  })
})
