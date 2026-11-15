import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import type { StudyZone } from '../types/manifest'
import { analysisFixture, H, makeFetch, settle, W, zone } from '../services/__fixtures__/analysisCube'
import { useZoneAnalysis } from './useZoneAnalysis'

describe('useZoneAnalysis', () => {
  it('carga el cubo y pinta la variable seleccionada en el último paso', async () => {
    const { fetchImpl } = await makeFetch()
    const rendered: number[] = []
    const analysis = useZoneAnalysis(ref<StudyZone | null>(zone('jaen')), {
      fetchImpl,
      toDataUrl: (rgba) => {
        rendered.push(rgba.length)
        return 'data:image/png;base64,TEST'
      },
    })
    await settle()
    expect(analysis.state.status).toBe('ready')
    expect(analysis.state.variableId).toBe('soil-moisture')
    expect(analysis.state.stepIndex).toBe(1)
    expect(analysis.overlay.value).toMatchObject({ url: 'data:image/png;base64,TEST', bbox: [-4, 37, -3, 38] })
    expect(rendered).toContain(W * H * 4)

    analysis.selectStep(0)
    await settle()
    expect(analysis.state.stepIndex).toBe(0)
    analysis.selectStep(9)
    expect(analysis.state.stepIndex).toBe(0)

    analysis.selectVariable('slope')
    await settle()
    expect(analysis.state.variableId).toBe('slope')
    expect(analysis.state.stepIndex).toBe(0)
  })

  it('el valor sin dato (255) se pinta con la trama neutra y se decodifica como NaN', async () => {
    const { fetchImpl } = await makeFetch()
    let lastRgba: Uint8ClampedArray | null = null
    const analysis = useZoneAnalysis(ref<StudyZone | null>(zone('jaen')), {
      fetchImpl,
      toDataUrl: (rgba) => {
        lastRgba = rgba
        return 'data:x'
      },
    })
    await settle()
    // Celda 0 sin dato: gris de la trama, semiopaca; celda 1 con dato: color opaco de la paleta.
    expect(lastRgba![3]).toBeGreaterThan(0)
    expect(lastRgba![3]).toBeLessThan(255)
    expect(Array.from(lastRgba!.slice(0, 3))).toEqual([148, 156, 150])
    expect(lastRgba![7]).toBe(255)
    const values = await analysis.loadStep(analysis.variable.value!, 1)
    expect(Number.isNaN(values[0])).toBe(true)
    expect(values[3]).toBeCloseTo((20 + 3 * 5) * 0.01)
  })

  it('cachea los rásteres por ruta: la galería y el mapa no repiten descargas', async () => {
    const { fetchImpl, requested } = await makeFetch()
    const analysis = useZoneAnalysis(ref<StudyZone | null>(zone('jaen')), { fetchImpl, toDataUrl: () => 'data:x' })
    await settle()
    const target = analysis.variable.value!
    await Promise.all([analysis.loadStep(target, 0), analysis.loadStep(target, 0), analysis.loadStep(target, 1)])
    const raster = await analysis.loadRaster({ data: target.steps[0].data, scale: target.scale, offset: target.offset })
    expect(raster[0]).toBeCloseTo(0.1)
    expect(requested.filter((url) => url.endsWith('a.png'))).toHaveLength(1)
    expect(requested.filter((url) => url.endsWith('b.png'))).toHaveLength(1)
  })

  it('sin zone.analysis queda en idle; un cubo de otra zona es un error visible', async () => {
    const wrong = analysisFixture('toledo')
    const { fetchImpl } = await makeFetch({ jaen: wrong })
    const selected = ref<StudyZone | null>(zone('sevilla', false))
    const analysis = useZoneAnalysis(selected, { fetchImpl, toDataUrl: () => 'data:x' })
    await settle()
    expect(analysis.state.status).toBe('idle')
    selected.value = zone('jaen')
    await settle()
    expect(analysis.state.status).toBe('error')
    expect(analysis.state.error).toContain('toledo')
    expect(analysis.overlay.value).toBeNull()
  })

  it('rechaza un cubo que no cumple el esquema', async () => {
    const broken = { ...analysisFixture('jaen'), schemaVersion: '1.2.0' }
    const { fetchImpl } = await makeFetch({ jaen: broken })
    const analysis = useZoneAnalysis(ref<StudyZone | null>(zone('jaen')), { fetchImpl, toDataUrl: () => 'data:x' })
    await settle()
    expect(analysis.state.status).toBe('error')
    expect(analysis.state.error).toContain('v1.3.0')
  })
})
