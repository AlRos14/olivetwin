import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'

import type { StudyZone } from '../types/manifest'
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from '../services/llmClient'
import { analysisFixture, makeFetch, settle, zone } from '../services/__fixtures__/analysisCube'
import { useZoneAnalysis } from './useZoneAnalysis'
import { useAnalysisWorkspace } from './useAnalysisWorkspace'

function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(body, { status: 200 })
}

async function setup(options: { withCrops?: boolean; vision?: boolean } = {}) {
  const cube = await makeFetch({ jaen: analysisFixture('jaen', { withCrops: options.withCrops }) })
  const llmBodies: { messages: { role: string; content: unknown }[] }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/chat/completions')) {
      llmBodies.push(JSON.parse(String(init?.body)))
      return sse('## Resumen\nLa humedad **baja**.')
    }
    return cube.fetchImpl(input, init)
  }) as typeof fetch
  const selected = ref<StudyZone | null>(zone('jaen'))
  const zoneAnalysis = useZoneAnalysis(selected, { fetchImpl, toDataUrl: (rgba) => `data:${rgba.length}` })
  const settings = reactive<LlmSettings>({ ...DEFAULT_LLM_SETTINGS, vision: Boolean(options.vision) })
  const workspace = useAnalysisWorkspace(zoneAnalysis, selected, settings, { fetchImpl })
  await settle()
  return { workspace, llmBodies, selected }
}

describe('useAnalysisWorkspace — serie de una variable', () => {
  it('muestra todas las fechas si hay menos que las pedidas y calcula el cambio', async () => {
    const { workspace } = await setup()
    expect(workspace.state.variableId).toBe('soil-moisture')
    expect(workspace.temporalVariables.value.map((variable) => variable.id)).toEqual(['soil-moisture'])
    expect(workspace.sampling.value).toMatchObject({ available: 2, requested: 6, indices: [0, 1] })
    expect(workspace.frames.value.map((frame) => frame.date)).toEqual(['2026-06-20T05:00:00Z', '2026-07-02T05:00:00Z'])
    expect(workspace.frames.value[0].url).toBe('data:48')
    const change = workspace.change.value!
    expect(change.summary.meanDelta).toBeCloseTo(0.1)
    expect(change.summary.increased).toBeCloseTo(1)
    expect(change.summary.comparable).toBeCloseTo(11 / 12)
  })

  it('calcula las estadísticas sobre la zona común a todas las fechas del intervalo', async () => {
    const { workspace } = await setup()
    const stats = workspace.rangeStats.value!
    // La celda 0 no tiene dato en la segunda fecha: queda fuera de la zona común en ambas.
    expect(stats.commonFraction).toBeCloseTo(11 / 12)
    expect(stats.steps.map((step) => step.coverage)).toEqual([1, 11 / 12])
    expect(stats.steps.every((step) => step.stats.validFraction === 11 / 12)).toBe(true)
    // Media común de la primera fecha sin la celda 0 (valor 0,10): sube respecto a la media completa.
    const firstAll = workspace.frames.value[0].values.reduce((sum, value) => sum + value, 0) / 12
    expect(stats.steps[0].stats.mean!).toBeGreaterThan(firstAll)
    expect(workspace.frames.value[0].mean).toBeCloseTo(stats.steps[0].stats.mean!)
  })

  it('con una sola imagen muestra la última fecha; el cambio depende del intervalo, no de las imágenes', async () => {
    const { workspace } = await setup()
    workspace.setSampleCount(1)
    await settle()
    expect(workspace.frames.value.map((frame) => frame.index)).toEqual([1])
    expect(workspace.change.value).not.toBeNull()
    workspace.setRange(1, 1)
    await settle()
    expect(workspace.change.value).toBeNull()
    expect(workspace.rangeStats.value?.commonFraction).toBeCloseTo(11 / 12)
    workspace.setSampleCount(500)
    expect(workspace.state.sampleCount).toBe(12)
    workspace.setRange(1, 0)
    expect([workspace.state.fromIndex, workspace.state.toIndex]).toEqual([0, 1])
  })

  it('interpreta con IA enviando las estadísticas y, si se pide, las imágenes', async () => {
    const { workspace, llmBodies } = await setup({ withCrops: true, vision: true })
    expect(workspace.state.cropId).toBe('olivo')
    await workspace.runVariableReport()
    expect(workspace.variableReport.status).toBe('done')
    expect(workspace.variableReport.text).toContain('La humedad **baja**')
    const user = llmBodies[0].messages[1].content as { type: string; text?: string }[]
    expect(user[0].text).toContain('Humedad')
    expect(user[0].text).toContain('Cultivo: Olivo')
    expect(user[0].text).toContain('lluvia total 6 mm')
    expect(user[0].text).toContain('zona común con dato en todas las fechas (92 % de la superficie)')
    expect(user.filter((part) => part.type === 'image_url')).toHaveLength(2)
  })

  it('sin cultivo concreto la tarea es genérica y sin visión se envía solo texto', async () => {
    const { workspace, llmBodies } = await setup({ withCrops: true })
    workspace.setCrop('')
    await workspace.runVariableReport()
    const content = llmBodies[0].messages[1].content as string
    expect(typeof content).toBe('string')
    expect(content).not.toContain('Cultivo:')
    expect(content).toContain('## Qué es esta variable')
    expect(content).toContain('## Importancia para los cultivos')
    expect(content).not.toContain('Valor de referencia')
  })
})

describe('useAnalysisWorkspace — variables de una sola imagen', () => {
  it('ofrece también las variables estáticas y analiza su reparto en la zona', async () => {
    const { workspace } = await setup()
    expect(workspace.variables.value.map((variable) => variable.id)).toEqual(['soil-moisture', 'slope'])
    workspace.selectVariable('slope')
    await settle()
    expect(workspace.isSingle.value).toBe(true)
    expect(workspace.candidates.value).toEqual([0])
    expect(workspace.sampling.value).toMatchObject({ indices: [0], available: 1 })
    expect(workspace.frames.value).toHaveLength(1)
    expect(workspace.frames.value[0].date).toBe('')
    expect(workspace.change.value).toBeNull()
    const spatial = workspace.spatial.value!
    expect(spatial.histogram).toHaveLength(10)
    expect(spatial.histogram.reduce((sum, bin) => sum + bin.fraction, 0)).toBeCloseTo(1)
    expect(spatial.byArea.some((area) => area.label.startsWith('cuadrante'))).toBe(true)
  })

  it('la IA recibe el reparto espacial, sin intervalo ni tendencia', async () => {
    const { workspace, llmBodies } = await setup({ withCrops: true })
    workspace.selectVariable('slope')
    await settle()
    workspace.setCrop('')
    await workspace.runVariableReport()
    expect(workspace.variableReport.status).toBe('done')
    const content = llmBodies[0].messages[1].content as string
    expect(content).toContain('Capa sin fecha')
    expect(content).toContain('Reparto de la superficie con dato por tramos')
    expect(content).toContain('Media por partes de la zona')
    expect(content).not.toContain('Tendencia lineal')
    expect(content).not.toContain('- Pendiente:')
  })

  it('con cultivo da el valor de referencia fijo de la variable y lo pasa a la IA', async () => {
    const { workspace, llmBodies } = await setup({ withCrops: true })
    workspace.selectVariable('slope')
    await settle()
    const view = workspace.requirementView.value!
    expect(view.requirement).toMatchObject({ kind: 'factor', id: 'pendiente' })
    expect(view.source).toBe('Referencia de prueba')
    expect(view.shares).not.toBeNull()
    expect(view.shares!.optimal + view.shares!.acceptable + view.shares!.unsuitable).toBeCloseTo(1)
    await workspace.runVariableReport()
    const content = llmBodies[0].messages[1].content as string
    expect(content).toContain('Valor de referencia para el olivo (Pendiente; fuente: Referencia de prueba)')
    expect(content).toContain('Tramos: óptimo < 10°; aceptable 10–20°; no apto > 20°.')
    expect(content).toContain('## Conclusión para el olivo')
  })

  it('una variable sin requisito publicado lo indica sin inventar umbrales', async () => {
    const { workspace } = await setup({ withCrops: true })
    workspace.selectVariable('soil-moisture')
    workspace.setCrop('olivo')
    await settle()
    // En el fixture la humedad sí es un factor; sin cultivo no hay valor de referencia.
    expect(workspace.requirementView.value?.requirement?.id).toBe('humedad')
    workspace.setCrop('')
    expect(workspace.requirementView.value).toBeNull()
  })

  it('volver a una variable con serie restaura el intervalo; el reparto pasa a ser la media del intervalo', async () => {
    const { workspace } = await setup()
    workspace.selectVariable('slope')
    await settle()
    workspace.selectVariable('soil-moisture')
    await settle()
    expect(workspace.isSingle.value).toBe(false)
    // Media por celda de las dos fechas en la zona común (11 de 12 celdas).
    expect(workspace.spatial.value!.histogram.reduce((sum, bin) => sum + bin.fraction, 0)).toBeCloseTo(1)
    expect(workspace.frames.value).toHaveLength(2)
  })
})

describe('useAnalysisWorkspace — aptitud por cultivo', () => {
  it('carga los mapas, reparte tramos, detecta el factor limitante y lo interpreta', async () => {
    const { workspace, llmBodies } = await setup({ withCrops: true })
    workspace.setMode('crop')
    await settle()
    expect(workspace.state.cropStatus).toBe('ready')
    const view = workspace.cropView.value!
    expect(view.factors.map((factor) => factor.id)).toEqual(['pendiente', 'humedad'])
    expect(view.limiting[0]).toMatchObject({ id: 'pendiente' })
    expect(view.limiting[0].fraction).toBeCloseTo(2 / 3)
    expect(view.unlimited).toBeCloseTo(1 / 3)
    expect(view.bins[3].fraction).toBeCloseTo(1 / 3)
    expect(view.byArea.some((area) => area.label.startsWith('cuadrante'))).toBe(true)
    await workspace.runCropReport()
    expect(workspace.cropReport.status).toBe('done')
    expect(llmBodies[0].messages[1].content).toContain('Pendiente: media')
    expect(llmBodies[0].messages[1].content).toContain('es el factor limitante en el 67 % de la superficie')
    expect(llmBodies[0].messages[1].content).toContain('Valor observado en la zona:')
    expect(llmBodies[0].messages[1].content).toContain('## Cómo remediarlo')
    expect(llmBodies[0].messages[1].content).toContain('Tramos: óptimo < 10°')
  })

  it('un cultivo inexistente se ignora y cambiar de zona reinicia el espacio', async () => {
    const { workspace, selected } = await setup({ withCrops: true })
    workspace.setCrop('kiwi')
    expect(workspace.state.cropId).toBe('olivo')
    selected.value = zone('sevilla', false)
    await settle()
    expect(workspace.state.variableId).toBeNull()
    expect(workspace.frames.value).toEqual([])
  })
})
