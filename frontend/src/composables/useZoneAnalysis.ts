/**
 * Estado del cubo de análisis de la zona seleccionada (WP-04, contrato v1.3.0).
 *
 * - Carga `zone.analysis` al cambiar de zona; una respuesta tardía de otra zona
 *   nunca sobrescribe el estado (contador + AbortController).
 * - Decodifica bajo demanda los PNG de datos y los cachea por ruta, para que el
 *   mapa, la galería del análisis y los mapas de aptitud compartan descargas.
 * - Pinta en el mapa la variable seleccionada en el paso activo (`overlay`,
 *   `data:` URL georreferenciada por `grid.bbox`).
 */
import { computed, reactive, readonly, shallowRef, watch } from 'vue'
import type { ComputedRef, DeepReadonly, Ref, ShallowRef } from 'vue'

import type { AnalysisVariable, ZoneAnalysis } from '../types/analysis'
import type { BBox, StudyZone } from '../types/manifest'
import {
  AnalysisLoadError,
  loadRaster as fetchRaster,
  loadZoneAnalysis,
  preferredVariable,
  type EncodedRaster,
} from '../services/analysisService'
import { renderRgba, rgbaToDataUrl } from '../services/palettes'

export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AnalysisOverlay {
  key: string
  url: string
  bbox: BBox
}

export type DataUrlRenderer = (rgba: Uint8ClampedArray, width: number, height: number) => string | null

interface AnalysisState {
  status: AnalysisStatus
  error: string | null
  variableId: string | null
  stepIndex: number
  rendering: boolean
  renderError: string | null
}

export interface UseZoneAnalysisOptions {
  fetchImpl?: typeof fetch
  /** Sustituible en tests (jsdom no tiene canvas). */
  toDataUrl?: DataUrlRenderer
}

export interface UseZoneAnalysisReturn {
  state: DeepReadonly<AnalysisState>
  analysis: ShallowRef<ZoneAnalysis | null>
  variable: ComputedRef<AnalysisVariable | null>
  overlay: ShallowRef<AnalysisOverlay | null>
  selectVariable(id: string): void
  selectStep(index: number): void
  /** Valores físicos de un paso (cacheado). */
  loadStep(variable: AnalysisVariable, stepIndex: number): Promise<Float32Array>
  /** Valores de cualquier ráster del cubo, p. ej. de aptitud (cacheado). */
  loadRaster(raster: EncodedRaster): Promise<Float32Array>
  /** Renderizador de imágenes compartido (canvas en el navegador). */
  toDataUrl: DataUrlRenderer
}

function defaultVariableId(analysis: ZoneAnalysis): string | null {
  return (
    preferredVariable(analysis.variables, (variable) => variable.temporal)?.id ??
    analysis.variables[0]?.id ??
    null
  )
}

export function useZoneAnalysis(
  zone: Ref<StudyZone | null> | ComputedRef<StudyZone | null>,
  options: UseZoneAnalysisOptions = {},
): UseZoneAnalysisReturn {
  const state = reactive<AnalysisState>({
    status: 'idle',
    error: null,
    variableId: null,
    stepIndex: 0,
    rendering: false,
    renderError: null,
  })
  const analysis = shallowRef<ZoneAnalysis | null>(null)
  const overlay = shallowRef<AnalysisOverlay | null>(null)
  const toDataUrl = options.toDataUrl ?? rgbaToDataUrl

  const cache = new Map<string, Promise<Float32Array>>()
  let loadCounter = 0
  let renderCounter = 0
  let controller: AbortController | null = null

  const variable = computed<AnalysisVariable | null>(
    () => analysis.value?.variables.find((candidate) => candidate.id === state.variableId) ?? null,
  )

  function loadRaster(raster: EncodedRaster): Promise<Float32Array> {
    const current = analysis.value
    if (!current) return Promise.reject(new Error('Sin análisis cargado'))
    const key = `${current.zoneId}|${raster.data}|${raster.scale}|${raster.offset}`
    let promise = cache.get(key)
    if (!promise) {
      promise = fetchRaster(current.grid, raster, { fetchImpl: options.fetchImpl })
      promise.catch(() => cache.delete(key))
      cache.set(key, promise)
    }
    return promise
  }

  function loadStep(target: AnalysisVariable, stepIndex: number): Promise<Float32Array> {
    const step = target.steps[stepIndex]
    if (!step) {
      return Promise.reject(new AnalysisLoadError('semantic', `La variable «${target.id}» no tiene el paso ${stepIndex}.`))
    }
    return loadRaster({ data: step.data, scale: target.scale, offset: target.offset })
  }

  async function load(target: StudyZone | null): Promise<void> {
    loadCounter += 1
    const requestId = loadCounter
    controller?.abort()
    controller = null
    cache.clear()
    analysis.value = null
    overlay.value = null
    state.error = null
    state.renderError = null

    if (!target?.analysis) {
      state.status = 'idle'
      return
    }
    state.status = 'loading'
    const current = new AbortController()
    controller = current
    try {
      const result = await loadZoneAnalysis(target.analysis, target.id, {
        signal: current.signal,
        fetchImpl: options.fetchImpl,
      })
      if (requestId !== loadCounter) return
      analysis.value = result
      state.variableId = defaultVariableId(result)
      const selected = result.variables.find((candidate) => candidate.id === state.variableId)
      state.stepIndex = Math.max(0, (selected?.steps.length ?? 1) - 1)
      state.status = 'ready'
    } catch (error) {
      if (requestId !== loadCounter || (error as { name?: string })?.name === 'AbortError') return
      state.status = 'error'
      state.error =
        error instanceof AnalysisLoadError ? error.message : 'No se pudo cargar el análisis de la zona.'
    }
  }

  watch(
    () => [zone.value?.id ?? null, zone.value?.analysis ?? null] as const,
    () => void load(zone.value),
    { immediate: true },
  )

  async function render(): Promise<void> {
    renderCounter += 1
    const requestId = renderCounter
    const current = analysis.value
    const target = variable.value
    if (!current || !target || state.status !== 'ready') {
      overlay.value = null
      return
    }
    state.rendering = true
    state.renderError = null
    try {
      const index = Math.min(state.stepIndex, target.steps.length - 1)
      const values = await loadStep(target, index)
      if (requestId !== renderCounter) return
      const url = toDataUrl(
        renderRgba(values, target.displayRange, target.palette, { width: current.grid.width, hatchNoData: true }),
        current.grid.width,
        current.grid.height,
      )
      overlay.value = url ? { key: current.zoneId, url, bbox: current.grid.bbox } : null
    } catch (error) {
      if (requestId !== renderCounter) return
      overlay.value = null
      state.renderError =
        error instanceof AnalysisLoadError ? error.message : 'No se pudo calcular la capa de análisis.'
    } finally {
      if (requestId === renderCounter) state.rendering = false
    }
  }

  watch(() => [analysis.value, state.status, state.variableId, state.stepIndex], () => void render())

  function selectVariable(id: string): void {
    const target = analysis.value?.variables.find((candidate) => candidate.id === id)
    if (!target) return
    state.variableId = id
    state.stepIndex = Math.max(0, target.steps.length - 1)
  }

  return {
    state: readonly(state),
    analysis,
    variable,
    overlay,
    selectVariable,
    selectStep(index) {
      const target = variable.value
      if (!target || !Number.isInteger(index) || index < 0 || index >= target.steps.length) return
      state.stepIndex = index
    },
    loadStep,
    loadRaster,
    toDataUrl,
  }
}
