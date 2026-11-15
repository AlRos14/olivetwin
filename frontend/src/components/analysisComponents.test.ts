import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { setLocale } from '../i18n'
import { setDataCatalog } from '../i18n/dataText'

import type { ZoneAnalysis } from '../types/analysis'
import type { StudyZone } from '../types/manifest'
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from '../services/llmClient'
import { analysisFixture, makeFetch, settle, zone } from '../services/__fixtures__/analysisCube'
import { useZoneAnalysis } from '../composables/useZoneAnalysis'
import { useAnalysisWorkspace } from '../composables/useAnalysisWorkspace'
import AnalysisControls from './AnalysisControls.vue'
import AnalysisWorkspace from './AnalysisWorkspace.vue'
import LayerPanel from './LayerPanel.vue'
import LlmReport from './LlmReport.vue'
import SeriesChart from './SeriesChart.vue'
import StoryPanel from './StoryPanel.vue'

const stats = { mean: 0.2, median: 0.2, p10: 0.1, p90: 0.3, min: 0, max: 0.4, validFraction: 0.9 }
const prov = { provider: 'Fixture', product: 'Producto fixture', processingVersion: 't', license: 'Licencia fixture' }

const analysis: ZoneAnalysis = {
  schemaVersion: '1.3.0',
  zoneId: 'jaen',
  generatedAt: '2026-11-15T00:00:00Z',
  pipeline: { name: 't', version: '0' },
  grid: { crs: 'EPSG:3857', bbox: [-4, 37, -3, 38], width: 2, height: 2, cellSizeM: 250, encoding: 'png-uint8-linear', nodata: 255 },
  variables: [
    {
      id: 'soil-moisture', title: 'Humedad superficial', group: 'nisar', unit: 'm³/m³', scale: 0.0025, offset: 0,
      displayRange: [0.05, 0.4], palette: 'moisture', temporal: true, description: 'Qué es la humedad',
      caveat: 'No es riego', status: 'processed_real', provenance: { ...prov, maturity: 'PROVISIONAL', approvedBy: 'AlRos14' },
      steps: [
        { date: '2026-06-20T05:23:26Z', data: 'data/real/zones/jaen/analysis/soil-moisture/a.png', stats, provenance: { sceneId: 'SCENE-A' } },
        { date: '2026-07-02T05:23:25Z', data: 'data/real/zones/jaen/analysis/soil-moisture/b.png', stats: { ...stats, mean: 0.15 }, provenance: { sceneId: 'SCENE-B' } },
      ],
    },
    {
      id: 'slope', title: 'Pendiente', group: 'terrain', unit: '°', scale: 0.25, offset: 0,
      displayRange: [0, 30], palette: 'terrain', temporal: false, description: 'd', caveat: 'c',
      status: 'processed_real', provenance: prov,
      steps: [{ date: null, data: 'data/real/zones/jaen/analysis/slope/static.png', stats }],
    },
  ],
  zoneSeries: [
    { id: 'precipitation', title: 'Lluvia', unit: 'mm', chart: 'bar', provenance: prov, points: [{ date: '2026-06-25', value: 12 }, { date: '2026-06-26', value: 0 }] },
  ],
  unavailable: [{ id: 'gunw', title: 'Deformación InSAR', reason: 'Sin granulos en CMR' }],
  suitability: {
    title: 'Índice exploratorio de aptitud relativa',
    note: 'Índice exploratorio, relativo y no validado',
    criteria: [{ variable: 'slope', aggregate: 'static', direction: 'lower-better', weight: 1, rationale: 'Hipótesis: laderas' }],
  },
}


async function workspaceFixture() {
  const cube = await makeFetch({ jaen: analysisFixture('jaen', { withCrops: true }) })
  const selected = ref<StudyZone | null>(zone('jaen'))
  const zoneAnalysis = useZoneAnalysis(selected, { fetchImpl: cube.fetchImpl, toDataUrl: () => 'data:image/png;base64,AA' })
  const settings = reactive<LlmSettings>({ ...DEFAULT_LLM_SETTINGS })
  const workspace = useAnalysisWorkspace(zoneAnalysis, selected, settings, { fetchImpl: cube.fetchImpl })
  await settle()
  return { workspace, zoneAnalysis, settings }
}

describe('AnalysisControls', () => {
  it('avisa cuando hay menos fechas que imágenes pedidas y cambia variable, intervalo y cultivo', async () => {
    const { workspace, settings } = await workspaceFixture()
    const wrapper = mount(AnalysisControls, { props: { workspace, status: 'ready', error: null, settings } })
    expect(wrapper.text()).toContain('Solo hay 2 fechas en el intervalo: se muestran todas')
    const selects = wrapper.findAll('select')
    await selects[1].setValue('1')
    expect(workspace.state.fromIndex).toBe(1)
    await settle()
    expect(wrapper.text()).toContain('Solo hay 1 fecha en el intervalo')
    await selects[3].setValue('')
    expect(workspace.state.cropId).toBe('')
    await wrapper.findAll('.ot-analysis__view')[1].trigger('click')
    expect(workspace.state.mode).toBe('crop')
  })

  it('muestra el estado de carga o error del cubo', () => {
    const fake = {} as never
    expect(mount(AnalysisControls, { props: { workspace: fake, status: 'error', error: 'Fallo X', settings: DEFAULT_LLM_SETTINGS } }).text()).toContain('Fallo X')
    expect(mount(AnalysisControls, { props: { workspace: fake, status: 'idle', error: null, settings: DEFAULT_LLM_SETTINGS } }).text()).toContain('no tiene cubo')
  })
})

describe('AnalysisWorkspace', () => {
  it('pinta las imágenes, el cambio, las gráficas y la tabla de valores; amplía con lectura del dato', async () => {
    const { workspace } = await workspaceFixture()
    const wrapper = mount(AnalysisWorkspace, {
      props: { workspace, zoneName: 'Jaén', zoneSeries: analysisFixture('jaen').zoneSeries ?? [] },
      attachTo: document.body,
    })
    expect(wrapper.findAll('.ot-gallery__item')).toHaveLength(2)
    expect(wrapper.text()).toContain('Cambio')
    expect(wrapper.text()).toContain('Suben')
    expect(wrapper.findComponent(SeriesChart).exists()).toBe(true)
    expect(wrapper.findAll('.ot-values tbody tr')).toHaveLength(2)
    await wrapper.find('.ot-gallery__button').trigger('click')
    expect(wrapper.find('.ot-lightbox').exists()).toBe(true)
    await wrapper.find('.ot-lightbox .ot-button').trigger('click')
    expect(wrapper.find('.ot-lightbox').exists()).toBe(false)
    wrapper.unmount()
  })

  it('en aptitud muestra el mapa, los tramos, el factor limitante y los factores', async () => {
    const { workspace } = await workspaceFixture()
    workspace.setMode('crop')
    await settle()
    const wrapper = mount(AnalysisWorkspace, { props: { workspace, zoneName: 'Jaén', zoneSeries: [] } })
    expect(wrapper.text()).toContain('Aptitud para olivo')
    expect(wrapper.text()).toContain('Qué limita')
    expect(wrapper.text()).toContain('Pendiente')
    expect(wrapper.text()).toContain('Óptimo < 10°')
    expect(wrapper.findAll('.ot-gallery--factors .ot-gallery__item')).toHaveLength(2)
  })
})

describe('LlmReport', () => {
  it('pinta el texto del modelo como texto, nunca como HTML', async () => {
    const wrapper = mount(LlmReport, {
      props: {
        title: 'Interpretación',
        report: { status: 'done', text: '## Resumen\n<img src=x onerror=alert(1)> **ojo**\n- punto', error: null, model: 'gemma3:4b', stopped: false },
      },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('strong').text()).toBe('ojo')
    expect(wrapper.find('h4').text()).toBe('Resumen')
    expect(wrapper.text()).toContain('Generado por gemma3:4b')
    await wrapper.find('.ot-llm__run').trigger('click')
    expect(wrapper.emitted('run')).toHaveLength(1)
  })

  it('bloquea el botón con el motivo y muestra errores y la opción de detener', async () => {
    const blocked = mount(LlmReport, {
      props: { title: 'T', report: { status: 'idle', text: '', error: null, model: null, stopped: false }, disabledReason: 'Cargando' },
    })
    expect(blocked.find('.ot-llm__run').attributes('disabled')).toBeDefined()
    const failed = mount(LlmReport, {
      props: { title: 'T', report: { status: 'error', text: '', error: 'Sin conexión', model: null, stopped: false } },
    })
    expect(failed.text()).toContain('Sin conexión')
    const running = mount(LlmReport, {
      props: { title: 'T', report: { status: 'running', text: 'Hola', error: null, model: 'm', stopped: false } },
    })
    await running.find('.ot-button').trigger('click')
    expect(running.emitted('stop')).toHaveLength(1)
  })
})

describe('Sin dato', () => {
  it('las celdas vacías se pintan con trama y la leyenda de una variable del cubo lo indica', async () => {
    const { renderRgba } = await import('../services/palettes')
    const rgba = renderRgba(new Float32Array([Number.NaN, 0.5, Number.NaN, Number.NaN]), [0, 1], 'moisture', { width: 2, hatchNoData: true })
    expect(rgba[3]).toBeGreaterThan(0)
    expect(Array.from(rgba.slice(0, 3))).not.toEqual(Array.from(rgba.slice(12, 15)))
    expect(renderRgba(new Float32Array([Number.NaN]), [0, 1], 'moisture')[3]).toBe(0)
    const { variableLegend } = await import('./layerOptions')
    const LayerLegend = (await import('./LayerLegend.vue')).default
    const legend = mount(LayerLegend, { props: { layer: variableLegend(analysis.variables[0]) } })
    expect(legend.text()).toContain('Sin dato')
  })
})

describe('LayerPanel — variables del cubo', () => {
  it('reúne capas y variables del cubo en un único desplegable', async () => {
    const zoneWithLayer: StudyZone = { id: 'jaen', name: 'Jaén', bbox: [-4, 37, -3, 38], layers: [] }
    const wrapper = mount(LayerPanel, {
      props: {
        zone: zoneWithLayer,
        selectedLayerId: null,
        opacity: 0.5,
        visible: true,
        baseMap: 'pnoa',
        extraVariables: [{ id: 'ndvi', title: 'NDVI (Sentinel-2)', groupLabel: 'Óptico' }],
        selectedVariableId: 'ndvi',
      },
    })
    expect(wrapper.text()).not.toContain('Más variables')
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('cube:ndvi')
    expect(wrapper.get('optgroup').attributes('label')).toBe('Óptico')
    expect(wrapper.find('input[type="range"]').exists()).toBe(true)
    await wrapper.get('select').setValue('cube:ndvi')
    expect(wrapper.emitted('select-variable')).toEqual([['ndvi']])
  })
})

describe('SeriesChart', () => {
  it('pinta media, banda, barras de lluvia y emite la fecha pulsada', async () => {
    const wrapper = mount(SeriesChart, {
      props: {
        title: 'Humedad',
        unit: 'm³/m³',
        dates: analysis.variables[0].steps.map((step) => step.date),
        stats: analysis.variables[0].steps.map((step) => step.stats),
        seriesA: [0.1, 0.2],
        bars: analysis.zoneSeries![0].points,
      },
    })
    expect(wrapper.find('.ot-chart__mean').attributes('d')).toMatch(/^M/)
    expect(wrapper.find('.ot-chart__band').exists()).toBe(true)
    expect(wrapper.find('.ot-chart__a').exists()).toBe(true)
    expect(wrapper.findAll('.ot-chart__bars rect')).toHaveLength(1)
    await wrapper.findAll('.ot-chart__dot')[0].trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([0])
  })
})

describe('AnalysisWorkspace — inglés', () => {
  it('muestra la pestaña de análisis en inglés al cambiar de idioma', async () => {
    const { workspace } = await workspaceFixture()
    const wrapper = mount(AnalysisWorkspace, {
      props: { workspace, zoneName: 'Jaén', zoneSeries: analysisFixture('jaen').zoneSeries ?? [] },
    })
    expect(wrapper.text()).toContain('Valores')
    setLocale('en', { persist: false })
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('Distribution over the zone')
    expect(text).toContain('Values')
    expect(text).toContain('With data')
    expect(text).toContain('Mean change')
    expect(text).toContain('Rising')
    expect(text).not.toContain('Cambio medio')
    expect(text).not.toContain('Sin dato')
    expect(wrapper.text()).toContain('m³/m³')
    wrapper.unmount()
  })

  it('los controles y la aptitud se muestran en inglés', async () => {
    setDataCatalog({ Olivo: 'Olive', 'Secano.': 'Rainfed.' })
    setLocale('en', { persist: false })
    const { workspace, settings } = await workspaceFixture()
    const controls = mount(AnalysisControls, { props: { workspace, status: 'ready', error: null, settings } })
    expect(controls.text()).toContain('Single-variable analysis')
    expect(controls.text()).toContain('Crop suitability')
    expect(controls.text()).toContain('Images:')
    expect(controls.text()).toContain('Olive')
    expect(controls.text()).not.toContain('Cultivo')
    controls.unmount()

    workspace.setMode('crop')
    await settle()
    const wrapper = mount(AnalysisWorkspace, { props: { workspace, zoneName: 'Jaén', zoneSeries: [] } })
    expect(wrapper.text()).toContain('Suitability for olive')
    expect(wrapper.text()).toContain('What limits')
    expect(wrapper.text()).toContain('No limitation')
    expect(wrapper.text()).toContain('S1 · high (≥ 0.85)')
    expect(wrapper.text()).not.toContain('Qué limita')
    wrapper.unmount()
  })
})

describe('StoryPanel', () => {
  it('enlaza el reto y navega a las pestañas', async () => {
    const wrapper = mount(StoryPanel)
    expect(wrapper.find('a[href*="dancing-with-the-sars"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Lo que no se puede concluir')
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['compare'])
  })
})
