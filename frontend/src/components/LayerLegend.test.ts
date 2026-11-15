import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerLegend from './LayerLegend.vue'
import type { StudyLayer } from '../types/manifest'
import { setLocale } from '../i18n'
import { setDataCatalog } from '../i18n/dataText'

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
    // Solo muestra la etiqueta de cada parada, sin columna de valores a la derecha.
    expect(wrapper.find('.ot-legend__stop-value').exists()).toBe(false)

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
    expect(real.text()).not.toContain('no permiten recuperar valores exactos')
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

describe('LayerLegend — English', () => {
  afterEach(() => {
    setDataCatalog({})
    setLocale('es', { persist: false })
  })

  it('traduce los textos de datos por el catálogo y muestra «dimensionless»', () => {
    setLocale('en', { persist: false })
    setDataCatalog({ 'Vegetación (NDVI)': 'Vegetation (NDVI)', Bajo: 'Low' })

    const wrapper = mount(LayerLegend, {
      props: { layer: { ...layer, unit: '1' } },
    })
    const text = wrapper.text()

    expect(text).toContain('Vegetation (NDVI)')
    expect(text).toContain('Low')
    expect(text).toContain('Unit:')
    expect(text).toContain('dimensionless')
    expect(text).not.toContain('Unidad')
    expect(text).not.toContain('adimensional')
    expect(wrapper.findAll('.ot-legend__stop-label')[0]!.text()).toBe('Low')
    expect(wrapper.get('.ot-legend__scale').attributes('aria-label')).toBe(
      'Colour scale for Vegetation (NDVI)',
    )
  })

  it.each(['1', 'adimensional', 'adimensional (0–1)', 'fracción'])(
    'trata la unidad %j como adimensional mientras los datos no migren',
    (unit) => {
      setLocale('en', { persist: false })
      const wrapper = mount(LayerLegend, { props: { layer: { ...layer, unit } } })
      expect(wrapper.text()).toContain('dimensionless')
    },
  )

  it('mantiene las unidades SI tal cual y sin texto en español', () => {
    setLocale('en', { persist: false })
    const wrapper = mount(LayerLegend, {
      props: { layer: { ...layer, unit: 'm³/m³', noData: true } },
    })
    const text = wrapper.text()
    expect(text).toContain('m³/m³')
    expect(text).not.toContain('Sin dato')
    expect(text).toContain('No data')
  })
})
