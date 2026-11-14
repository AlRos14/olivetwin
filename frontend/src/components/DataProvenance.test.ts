import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataProvenance from './DataProvenance.vue'
import type { Provenance, StudyLayer, TimeStep } from '../types/manifest'

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

function mountProvenance(layer: StudyLayer | null, timeStep: TimeStep | null = null) {
  return mount(DataProvenance, { props: { layer, dataMode: 'sample', timeStep } })
}

function makeStep(overrides: Partial<TimeStep> = {}): TimeStep {
  return {
    date: '2026-03-10',
    image: 'data/sample/zones/jaen-demo/ndvi-2026-03-10.png',
    bbox: [-3.86, 37.69, -3.61, 37.9],
    ...overrides,
  }
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

  it('formatea fechas con hora en UTC e indica la zona para no cambiar de día', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: '2026-01-15T23:30:00-05:00' }),
    )
    const text = wrapper.text()
    // En UTC ya es 16 de enero; formatear en zona local podría mostrar el 15.
    expect(text).toContain('16')
    expect(text).toContain('enero')
    expect(text).toContain('UTC')
    expect(text).not.toContain('15 de enero')
  })

  it('una fecha sin hora no añade el sufijo UTC', () => {
    const wrapper = mountProvenance(makeLayer({ acquisitionDate: '2026-01-15' }))
    expect(wrapper.text()).not.toContain('UTC')
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

  it('con timeStep muestra la procedencia efectiva del paso', () => {
    const wrapper = mountProvenance(
      makeLayer({ provider: 'Proveedor de la capa', processingVersion: 'layer-v1' }),
      makeStep({
        provenance: {
          provider: 'Proveedor del paso',
          product: 'NDVI del paso',
          acquisitionDate: '2026-03-10',
          sceneId: 'STEP-SCENE-002',
          processingVersion: 'step-v2',
          referenceUrl: 'https://example.org/paso',
          note: 'Nota del paso',
        },
      }),
    )
    const text = wrapper.text()

    expect(text).toContain('Proveedor del paso')
    expect(text).toContain('NDVI del paso')
    expect(text).toContain('STEP-SCENE-002')
    expect(text).toContain('step-v2')
    expect(text).toContain('Nota del paso')
    expect(text).not.toContain('Proveedor de la capa')
    expect(text).not.toContain('layer-v1')

    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://example.org/paso')
  })

  it('usa la fecha del paso cuando la procedencia efectiva no tiene acquisitionDate', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: null }),
      makeStep({ date: '2026-04-05' }),
    )
    const text = wrapper.text()

    expect(text).toContain('5 de abril de 2026')
    expect(text).not.toContain('Fecha no disponible')
  })

  it('prioriza acquisitionDate efectiva sobre timeStep.date', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: null }),
      makeStep({
        date: '2026-01-01',
        provenance: { acquisitionDate: '2026-02-20' },
      }),
    )
    const text = wrapper.text()

    expect(text).toContain('20 de febrero de 2026')
    expect(text).not.toContain('1 de enero de 2026')
  })

  it('con acquisitionDate null en el paso recurre a timeStep.date', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: '2026-01-01' }),
      makeStep({ date: '2026-05-12', provenance: { acquisitionDate: null } }),
    )
    const text = wrapper.text()

    expect(text).toContain('12 de mayo de 2026')
    expect(text).not.toContain('1 de enero de 2026')
  })

  it('formatea la fecha del paso con hora en UTC e indica la zona', () => {
    const wrapper = mountProvenance(
      makeLayer({ acquisitionDate: null }),
      makeStep({ date: '2026-01-15T23:30:00-05:00' }),
    )
    const text = wrapper.text()

    expect(text).toContain('16')
    expect(text).toContain('enero')
    expect(text).toContain('UTC')
    expect(text).not.toContain('15 de enero')
  })

  it('sin timeStep mantiene la procedencia y fecha de la capa', () => {
    const wrapper = mountProvenance(
      makeLayer({ provider: 'Proveedor de la capa', acquisitionDate: '2026-01-15' }),
    )
    const text = wrapper.text()

    expect(text).toContain('Proveedor de la capa')
    expect(text).toContain('15 de enero de 2026')
  })

  it('sin capa ofrece un mensaje en lugar de metadatos vacíos', () => {
    const wrapper = mountProvenance(null)
    expect(wrapper.text()).toContain('Selecciona una capa')
    expect(wrapper.find('dl').exists()).toBe(false)
  })
})
