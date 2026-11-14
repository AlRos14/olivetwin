import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataProvenance from './DataProvenance.vue'
import type { Provenance, StudyLayer } from '../types/manifest'

const baseProvenance: Provenance = {
  provider: 'Generador sintético',
  product: 'NDVI ilustrativo — no satelital',
  acquisitionDate: null,
  sceneId: null,
  processingVersion: 'sample-v1',
  referenceUrl: null,
  note: 'Datos inventados para probar la interfaz',
}

function makeLayer(provenance: Partial<Provenance> = {}): StudyLayer {
  return {
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
      { value: 1, color: '#01665e', label: 'Alto' },
    ],
    status: 'synthetic',
    provenance: { ...baseProvenance, ...provenance },
    qualityNote: 'NO apto para decisiones agronómicas',
  }
}

function mountProvenance(layer: StudyLayer | null) {
  return mount(DataProvenance, { props: { layer, dataMode: 'sample' } })
}

describe('DataProvenance', () => {
  it('muestra proveedor, producto, versión y la nota de calidad', () => {
    const wrapper = mountProvenance(makeLayer())
    const text = wrapper.text()
    expect(text).toContain('Generador sintético')
    expect(text).toContain('NDVI ilustrativo')
    expect(text).toContain('sample-v1')
    expect(text).toContain('NO apto para decisiones agronómicas')
    expect(text).toContain('Modo de datos: Datos de muestra')
  })

  it('con acquisitionDate null muestra «Fecha no disponible» y no inventa escena', () => {
    const wrapper = mountProvenance(makeLayer({ acquisitionDate: null, sceneId: null }))
    const text = wrapper.text()
    expect(text).toContain('Fecha no disponible')
    expect(text).not.toContain('null')
    expect(text).not.toContain('Escena')
  })

  it('trata acquisitionDate o sceneId undefined como ausentes', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: undefined, sceneId: undefined }),
    )
    expect(wrapper.text()).toContain('Fecha no disponible')
    expect(wrapper.text()).not.toContain('Escena')
  })

  it('formatea la fecha ISO en es-ES', () => {
    const wrapper = mountProvenance(makeLayer({ acquisitionDate: '2026-01-15' }))
    const text = wrapper.text()
    expect(text).toContain('2026')
    expect(text).toContain('enero')
    expect(text).toContain('15')
  })

  it('no presenta una fecha inválida como si fuera real', () => {
    const wrapper = mountProvenance(makeLayer({ acquisitionDate: '2026-13-40' }))
    expect(wrapper.text()).toContain('Fecha no disponible')
  })

  it('muestra la escena y el enlace externo cuando existen', () => {
    const wrapper = mountProvenance(
      makeLayer({
        acquisitionDate: '2026-02-03',
        sceneId: 'SAMPLE-SCENE-001',
        referenceUrl: 'https://example.org/producto',
      }),
    )
    const text = wrapper.text()
    expect(text).toContain('SAMPLE-SCENE-001')

    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://example.org/producto')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('muestra las extensiones maturity y approvedBy si existen', () => {
    const wrapper = mountProvenance(
      makeLayer({ maturity: 'validated', approvedBy: 'Equipo científico' }),
    )
    const text = wrapper.text()
    expect(text).toContain('Madurez')
    expect(text).toContain('validated')
    expect(text).toContain('Aprobado por')
    expect(text).toContain('Equipo científico')
  })

  it('sin capa ofrece un mensaje en lugar de metadatos vacíos', () => {
    const wrapper = mountProvenance(null)
    expect(wrapper.text()).toContain('Selecciona una capa')
    expect(wrapper.find('dl').exists()).toBe(false)
  })
})
