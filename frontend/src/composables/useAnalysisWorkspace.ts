/**
 * Espacio de trabajo de la pestaña Análisis (sin mapa).
 *
 * - Análisis de una variable: intervalo de fechas, número de imágenes (repartidas
 *   uniformemente, como máximo `MAX_SAMPLES` y nunca más de las disponibles),
 *   imágenes, cambio entre la primera y la última fecha, y métricas. Las
 *   variables con una sola imagen (relieve, suelo, clima, coherencia) se
 *   analizan en el espacio: reparto por tramos y valores por partes de la zona.
 * - Aptitud por cultivo: mapa global y por factor publicados por el pipeline,
 *   reparto por tramos, factor limitante y aptitud por partes de la zona.
 * - Informes con un modelo de lenguaje a partir de esos datos calculados.
 */
import { computed, reactive, readonly, shallowRef, watch } from 'vue'
import type { ComputedRef, DeepReadonly, Ref, ShallowRef } from 'vue'

import type { AnalysisStats, AnalysisVariable, CropSuitability, ZoneAnalysis } from '../types/analysis'
import type { StudyZone } from '../types/manifest'
import {
  applyMask,
  commonMask,
  difference,
  histogram,
  summarize,
  symmetricRange,
  type HistogramBin,
} from '../services/analysisMath'
import { AnalysisLoadError, preferredVariable } from '../services/analysisService'
import { limitingShares, suitabilityBins, type LimitingShare, type SuitabilityBin } from '../services/cropSuitability'
import {
  classShares,
  factorOwnVariables,
  observedValues,
  requirementForVariable,
  requirementSource,
  type ClassShares,
  type VariableRequirement,
} from '../services/cropRequirements'
import type { LlmSettings } from '../services/llmClient'
import {
  buildCropMessages,
  buildSpatialMessages,
  buildVariableMessages,
  type ContextVariable,
  type CropSummary,
  type RequirementContext,
} from '../services/llmPrompts'
import { renderRgba } from '../services/palettes'
import {
  changeSummary,
  climateSummary,
  linearTrend,
  MAX_SAMPLES,
  rainBefore,
  rangeIndices,
  sampleIndices,
  stepTime,
  type ChangeSummary,
  type SampleResult,
} from '../services/seriesAnalysis'
import { useLlmReport, type LlmReportState } from './useLlm'
import type { UseZoneAnalysisReturn } from './useZoneAnalysis'

export type WorkspaceMode = 'series' | 'crop'
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SeriesFrame {
  index: number
  date: string
  url: string | null
  values: Float32Array
  mean: number | null
  validFraction: number
}

/** Estadísticas de un paso calculadas sobre la zona común del intervalo. */
export interface RangeStepStats {
  index: number
  date: string
  stats: AnalysisStats
  /** Fracción de la rejilla con dato en ESTA fecha (antes de aplicar la zona común). */
  coverage: number
}

export interface RangeStats {
  /** Fracción de la rejilla con dato en TODAS las fechas del intervalo. */
  commonFraction: number
  steps: RangeStepStats[]
}

export interface ChangeView {
  fromDate: string
  toDate: string
  url: string | null
  values: Float32Array
  range: [number, number]
  summary: ChangeSummary
}

/**
 * Reparto en la zona: de la imagen (variables de una sola fecha) o de la media
 * por celda del intervalo sobre la zona común (series).
 */
export interface SpatialView {
  histogram: HistogramBin[]
  byArea: { label: string; mean: number | null }[]
}

export const HISTOGRAM_BINS = 10

export interface CropFactorView {
  id: string
  label: string
  requirement: string
  url: string | null
  values: Float32Array
  stats: AnalysisStats
  /** Superficie de la zona en óptimo / aceptable / no apto según la puntuación del factor. */
  shares: ClassShares
}

/** Valor de referencia del cultivo elegido para la variable elegida (fijo, del cubo). */
export interface RequirementView {
  requirement: VariableRequirement | null
  source: string | null
  shares: ClassShares | null
}

export interface CropView {
  crop: CropSuitability
  url: string | null
  values: Float32Array
  bins: SuitabilityBin[]
  validFraction: number
  factors: CropFactorView[]
  limiting: LimitingShare[]
  unlimited: number
  byArea: { label: string; mean: number | null }[]
}

interface WorkspaceState {
  mode: WorkspaceMode
  variableId: string | null
  fromIndex: number
  toIndex: number
  sampleCount: number
  /** '' = sin cultivo (en la serie); en aptitud siempre hay uno si el cubo los declara. */
  cropId: string
  seriesStatus: LoadStatus
  seriesError: string | null
  cropStatus: LoadStatus
  cropError: string | null
}

export const DEFAULT_SAMPLES = 6
/** Cambio «apreciable» en el resumen celda a celda: 5 % del rango de la escala. */
export const CHANGE_THRESHOLD_SHARE = 0.05
/**
 * Imágenes que se adjuntan como máximo a un modelo con visión: cada una ocupa
 * cientos de tokens y Ollama usa por defecto un contexto de 4096.
 */
export const MAX_LLM_IMAGES = 4

export interface UseAnalysisWorkspaceReturn {
  state: DeepReadonly<WorkspaceState>
  /** Variables con al menos una imagen (con y sin serie temporal). */
  variables: ComputedRef<AnalysisVariable[]>
  temporalVariables: ComputedRef<AnalysisVariable[]>
  variable: ComputedRef<AnalysisVariable | null>
  /** La variable elegida tiene una sola imagen: análisis espacial, sin intervalo. */
  isSingle: ComputedRef<boolean>
  crops: ComputedRef<CropSuitability[]>
  crop: ComputedRef<CropSuitability | null>
  candidates: ComputedRef<number[]>
  sampling: ComputedRef<SampleResult>
  decimals: ComputedRef<number>
  frames: ShallowRef<SeriesFrame[]>
  /** Medias, percentiles y cobertura de cada fecha del intervalo sobre la zona común. */
  rangeStats: ShallowRef<RangeStats | null>
  change: ShallowRef<ChangeView | null>
  spatial: ShallowRef<SpatialView | null>
  cropView: ShallowRef<CropView | null>
  /** Requisito de la variable para el cultivo elegido en el análisis de una variable (null sin cultivo). */
  requirementView: ComputedRef<RequirementView | null>
  variableReport: DeepReadonly<LlmReportState>
  cropReport: DeepReadonly<LlmReportState>
  grid: ComputedRef<ZoneAnalysis['grid'] | null>
  setMode(mode: WorkspaceMode): void
  selectVariable(id: string): void
  setRange(from: number, to: number): void
  setSampleCount(count: number): void
  setCrop(id: string): void
  runVariableReport(): Promise<void>
  runCropReport(): Promise<void>
  stopVariableReport(): void
  stopCropReport(): void
}

function variableDecimals(variable: AnalysisVariable | null): number {
  if (!variable) return 2
  if (typeof variable.decimals === 'number') return variable.decimals
  return variable.scale < 0.01 ? 3 : variable.scale < 0.1 ? 2 : 1
}

function meanOf(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

/** Media por cuadrantes y por tercios de altitud (para describir dónde es mayor o menor). */
function areaBreakdown(
  analysis: ZoneAnalysis,
  suitability: Float32Array,
  elevation: Float32Array | null,
): { label: string; mean: number | null }[] {
  const { width, height } = analysis.grid
  const quadrants: Record<string, number[]> = { noroeste: [], noreste: [], suroeste: [], sureste: [] }
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = suitability[row * width + col]
      if (Number.isNaN(value)) continue
      const key = `${row < height / 2 ? 'nor' : 'sur'}${col < width / 2 ? 'oeste' : 'este'}`
      quadrants[key].push(value)
    }
  }
  const result = Object.entries(quadrants).map(([label, values]) => ({ label: `cuadrante ${label}`, mean: meanOf(values) }))
  if (elevation) {
    const pairs: [number, number][] = []
    for (let index = 0; index < suitability.length; index += 1) {
      if (!Number.isNaN(suitability[index]) && !Number.isNaN(elevation[index])) pairs.push([elevation[index], suitability[index]])
    }
    if (pairs.length >= 3) {
      const sorted = pairs.map(([z]) => z).sort((a, b) => a - b)
      const t1 = sorted[Math.floor(sorted.length / 3)]
      const t2 = sorted[Math.floor((2 * sorted.length) / 3)]
      const low = pairs.filter(([z]) => z < t1).map(([, s]) => s)
      const mid = pairs.filter(([z]) => z >= t1 && z < t2).map(([, s]) => s)
      const high = pairs.filter(([z]) => z >= t2).map(([, s]) => s)
      result.push(
        { label: `cotas bajas (< ${Math.round(t1)} m)`, mean: meanOf(low) },
        { label: `cotas medias (${Math.round(t1)}–${Math.round(t2)} m)`, mean: meanOf(mid) },
        { label: `cotas altas (≥ ${Math.round(t2)} m)`, mean: meanOf(high) },
      )
    }
  }
  return result
}

/** Media por celda de varias fechas, solo en la zona común (fuera de ella, sin dato). */
function cellMean(stack: Float32Array[], mask: Uint8Array): Float32Array {
  const out = new Float32Array(mask.length).fill(Number.NaN)
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    let sum = 0
    for (const values of stack) sum += values[index]
    out[index] = sum / stack.length
  }
  return out
}

export function useAnalysisWorkspace(
  zoneAnalysis: UseZoneAnalysisReturn,
  zone: Ref<StudyZone | null> | ComputedRef<StudyZone | null>,
  settings: LlmSettings,
  options: { fetchImpl?: typeof fetch } = {},
): UseAnalysisWorkspaceReturn {
  const state = reactive<WorkspaceState>({
    mode: 'series',
    variableId: null,
    fromIndex: 0,
    toIndex: 0,
    sampleCount: DEFAULT_SAMPLES,
    cropId: '',
    seriesStatus: 'idle',
    seriesError: null,
    cropStatus: 'idle',
    cropError: null,
  })
  const frames = shallowRef<SeriesFrame[]>([])
  const rangeStats = shallowRef<RangeStats | null>(null)
  const change = shallowRef<ChangeView | null>(null)
  const spatial = shallowRef<SpatialView | null>(null)
  const cropView = shallowRef<CropView | null>(null)
  const variableReport = useLlmReport(settings, options)
  const cropReport = useLlmReport(settings, options)
  const analysis = zoneAnalysis.analysis
  let cropCache = new Map<string, Promise<CropView>>()

  const grid = computed(() => analysis.value?.grid ?? null)
  const temporalVariables = computed(
    () => analysis.value?.variables.filter((candidate) => candidate.temporal && candidate.steps.length > 0) ?? [],
  )
  const variables = computed(() => analysis.value?.variables.filter((candidate) => candidate.steps.length > 0) ?? [])
  const variable = computed(
    () => variables.value.find((candidate) => candidate.id === state.variableId) ?? null,
  )
  const isSingle = computed(() => variable.value?.steps.length === 1)
  const crops = computed(() => analysis.value?.crops ?? [])
  const crop = computed(() => crops.value.find((candidate) => candidate.id === state.cropId) ?? null)
  const candidates = computed(() => {
    if (!variable.value) return []
    if (isSingle.value) return [0]
    return rangeIndices(variable.value.steps, state.fromIndex, state.toIndex)
  })
  const sampling = computed<SampleResult>(() => {
    if (variable.value && isSingle.value) return { indices: [0], available: 1, requested: state.sampleCount, spacingDays: null }
    return variable.value
      ? sampleIndices(variable.value.steps, candidates.value, state.sampleCount)
      : { indices: [], available: 0, requested: state.sampleCount, spacingDays: null }
  })
  const decimals = computed(() => variableDecimals(variable.value))

  watch(
    analysis,
    (current) => {
      variableReport.reset()
      cropReport.reset()
      frames.value = []
      rangeStats.value = null
      change.value = null
      spatial.value = null
      cropView.value = null
      cropCache = new Map()
      state.seriesStatus = 'idle'
      state.cropStatus = 'idle'
      if (!current) {
        state.variableId = null
        state.cropId = ''
        return
      }
      const preferred = preferredVariable(current.variables, (candidate) => candidate.temporal && candidate.steps.length > 0)
      state.variableId = preferred?.id ?? null
      state.fromIndex = 0
      state.toIndex = Math.max(0, (preferred?.steps.length ?? 1) - 1)
      state.cropId = current.crops?.[0]?.id ?? ''
    },
    { immediate: true },
  )

  let seriesCounter = 0
  /**
   * Carga TODAS las fechas del intervalo (no solo las que se muestran) para
   * calcular la zona común —celdas con dato en todas ellas— y sacar de ahí las
   * medias, el cambio y el contexto de la IA. Así una fecha con menos cobertura
   * no aparenta un cambio que solo es de superficie observada.
   */
  async function computeSeries(): Promise<void> {
    seriesCounter += 1
    const token = seriesCounter
    const current = analysis.value
    const target = variable.value
    const range = candidates.value
    const indices = sampling.value.indices
    if (!current || !target || range.length === 0 || indices.length === 0) {
      frames.value = []
      rangeStats.value = null
      change.value = null
      spatial.value = null
      state.seriesStatus = 'idle'
      return
    }
    state.seriesStatus = 'loading'
    state.seriesError = null
    try {
      const stack = await Promise.all(range.map((index) => zoneAnalysis.loadStep(target, index)))
      if (token !== seriesCounter) return
      const { width, height } = current.grid
      const mask = commonMask(stack)
      const commonCells = mask.reduce((total, flag) => total + flag, 0)
      const steps = range.map((index, position) => {
        const masked = summarize(applyMask(stack[position], mask))
        return {
          index,
          date: target.steps[index].date ?? '',
          coverage: summarize(stack[position]).validFraction,
          stats: {
            mean: masked.mean,
            median: masked.median,
            p10: masked.p10,
            p90: masked.p90,
            min: masked.min,
            max: masked.max,
            validFraction: masked.validFraction,
          },
        }
      })
      rangeStats.value = { commonFraction: mask.length ? commonCells / mask.length : 0, steps }
      const valuesOf = (index: number) => stack[range.indexOf(index)]
      const render = (values: Float32Array, scale: [number, number], palette: Parameters<typeof renderRgba>[2]) =>
        zoneAnalysis.toDataUrl(renderRgba(values, scale, palette, { width, hatchNoData: true }), width, height)
      frames.value = indices.map((index) => {
        const values = valuesOf(index)
        const step = steps.find((candidate) => candidate.index === index)
        return {
          index,
          date: target.steps[index].date ?? '',
          url: render(values, target.displayRange, target.palette),
          values,
          mean: step?.stats.mean ?? null,
          validFraction: step?.coverage ?? 0,
        }
      })
      if (range.length >= 2) {
        const first = stack[0]
        const last = stack[stack.length - 1]
        const span = target.displayRange[1] - target.displayRange[0]
        const diff = difference(first, last)
        const limit = symmetricRange(diff, span / 4)
        change.value = {
          fromDate: target.steps[range[0]].date ?? '',
          toDate: target.steps[range[range.length - 1]].date ?? '',
          url: render(diff, [-limit, limit], 'change'),
          values: diff,
          range: [-limit, limit],
          summary: changeSummary(applyMask(first, mask), applyMask(last, mask), span * CHANGE_THRESHOLD_SHARE),
        }
      } else {
        change.value = null
      }
      {
        const values = range.length === 1 ? stack[0] : cellMean(stack, mask)
        const elevationVariable = target.id === 'elevation' ? undefined : current.variables.find((candidate) => candidate.id === 'elevation')
        const elevation = elevationVariable ? await zoneAnalysis.loadStep(elevationVariable, 0).catch(() => null) : null
        if (token !== seriesCounter) return
        spatial.value = {
          histogram: histogram(values, target.displayRange, HISTOGRAM_BINS),
          byArea: areaBreakdown(current, values, elevation),
        }
      }
      state.seriesStatus = 'ready'
    } catch (error) {
      if (token !== seriesCounter) return
      frames.value = []
      rangeStats.value = null
      change.value = null
      spatial.value = null
      state.seriesStatus = 'error'
      state.seriesError =
        error instanceof AnalysisLoadError ? error.message : 'No se pudieron cargar las imágenes de la serie.'
    }
  }

  watch(
    () => [variable.value, candidates.value.join(','), sampling.value.indices.join(',')],
    () => void computeSeries(),
    { immediate: true },
  )

  function ensureCropView(target: CropSuitability): Promise<CropView> {
    let promise = cropCache.get(target.id)
    if (!promise) {
      promise = (async () => {
        const current = analysis.value
        if (!current) throw new Error('Sin análisis cargado')
        const { width, height } = current.grid
        const [values, factorValues] = await Promise.all([
          zoneAnalysis.loadRaster(target.suitability),
          Promise.all(target.factors.map((factor) => zoneAnalysis.loadRaster(factor.raster))),
        ])
        const elevationVariable = current.variables.find((candidate) => candidate.id === 'elevation')
        const elevation = elevationVariable ? await zoneAnalysis.loadStep(elevationVariable, 0).catch(() => null) : null
        const { bins, validFraction } = suitabilityBins(values)
        const { shares, unlimited } = limitingShares(
          target.factors.map((factor, position) => ({ id: factor.id, label: factor.label, values: factorValues[position] })),
        )
        return {
          crop: target,
          url: zoneAnalysis.toDataUrl(renderRgba(values, [0, 1], 'suitability', { width, hatchNoData: true }), width, height),
          values,
          bins,
          validFraction,
          factors: target.factors.map((factor, position) => ({
            id: factor.id,
            label: factor.label,
            requirement: factor.requirement,
            url: zoneAnalysis.toDataUrl(
              renderRgba(factorValues[position], [0, 1], 'suitability', { width, hatchNoData: true }),
              width,
              height,
            ),
            values: factorValues[position],
            stats: factor.raster.stats,
            shares: classShares(factorValues[position]),
          })),
          limiting: shares,
          unlimited,
          byArea: areaBreakdown(current, values, elevation),
        }
      })()
      promise.catch(() => cropCache.delete(target.id))
      cropCache.set(target.id, promise)
    }
    return promise
  }

  let cropCounter = 0
  // Se carga con cualquier modo: el análisis de una variable usa sus factores para el valor de referencia.
  watch(
    crop,
    async (target) => {
      cropCounter += 1
      const token = cropCounter
      if (!target) {
        cropView.value = null
        state.cropStatus = 'idle'
        return
      }
      state.cropStatus = 'loading'
      state.cropError = null
      try {
        const view = await ensureCropView(target)
        if (token !== cropCounter) return
        cropView.value = view
        state.cropStatus = 'ready'
      } catch (error) {
        if (token !== cropCounter) return
        cropView.value = null
        state.cropStatus = 'error'
        state.cropError =
          error instanceof AnalysisLoadError ? error.message : 'No se pudieron cargar los mapas de aptitud.'
      }
    },
    { immediate: true },
  )

  const requirementView = computed<RequirementView | null>(() => {
    const target = crop.value
    const current = variable.value
    if (!target || !current) return null
    const requirement = requirementForVariable(target, current.id)
    const view = cropView.value?.crop.id === target.id ? cropView.value : null
    const factor = requirement?.kind === 'factor' ? view?.factors.find((candidate) => candidate.id === requirement.id) : null
    return {
      requirement,
      source: requirement ? requirementSource(target, requirement) : null,
      shares: factor?.shares ?? null,
    }
  })

  function requirementContext(): RequirementContext | null {
    const target = crop.value
    const view = requirementView.value
    if (!target || !view) return null
    const requirement = view.requirement
    return {
      cropName: target.name,
      label: requirement?.label ?? null,
      requirement: requirement?.requirement ?? null,
      classes: requirement?.classes ?? null,
      source: view.source,
      shares: view.shares,
      inMap: requirement?.kind === 'factor',
    }
  }

  function zoneContext(excludeId?: string): ContextVariable[] {
    return (analysis.value?.variables ?? [])
      .filter((candidate) => !candidate.temporal && candidate.steps[0] && candidate.id !== excludeId)
      .map((candidate) => ({
        title: candidate.title,
        unit: candidate.unit,
        mean: candidate.steps[0].stats.mean,
        p10: candidate.steps[0].stats.p10,
        p90: candidate.steps[0].stats.p90,
      }))
  }

  function cropSummary(view: CropView): CropSummary {
    const { crop: target } = view
    return {
      name: target.name,
      scientificName: target.scientificName,
      assumptions: target.assumptions,
      method: target.method,
      sourceLabel: `${target.source.provider} — ${target.source.product}`,
      suitabilityMean: target.suitability.stats.mean,
      suitabilityP10: target.suitability.stats.p10,
      suitabilityP90: target.suitability.stats.p90,
      bins: view.bins,
      factors: target.factors.map((factor, position) => ({
        label: factor.label,
        requirement: factor.requirement,
        mean: factor.raster.stats.mean,
        p10: factor.raster.stats.p10,
        p90: factor.raster.stats.p90,
        classes: factor.classes ?? null,
        shares: view.factors[position]?.shares ?? null,
        observed: observedValues(analysis.value?.variables ?? [], factorOwnVariables(factor.variables)),
      })),
      limiting: view.limiting,
      unlimited: view.unlimited,
      byArea: view.byArea,
      otherRequirements: (target.otherRequirements ?? []).map((item) => ({
        label: item.label,
        requirement: item.requirement,
        reason: item.reason ?? null,
      })),
      unverified: (analysis.value?.variables ?? [])
        .filter((candidate) => !requirementForVariable(target, candidate.id))
        .map((candidate) => candidate.title),
    }
  }

  function zoneInfo() {
    return { name: zone.value?.name ?? analysis.value?.zoneId ?? 'zona', description: zone.value?.description }
  }

  async function runVariableReport(): Promise<void> {
    const current = analysis.value
    const target = variable.value
    const range = candidates.value
    if (!current || !target || range.length === 0) return
    if (isSingle.value) {
      await runSpatialReport(target)
      return
    }
    const first = target.steps[range[0]].date
    const last = target.steps[range[range.length - 1]].date
    const stats = rangeStats.value
    if (!stats) return
    const points = stats.steps.map((step) => ({
      date: step.date,
      mean: step.stats.mean,
      median: step.stats.median,
      p10: step.stats.p10,
      p90: step.stats.p90,
      validFraction: step.coverage,
      rainPrev7d: rainBefore(current.zoneSeries, step.date, 7),
    }))
    const cropContext = await cropContextFor()
    const images = settings.vision
      ? sampleIndices(
          frames.value.map((frame) => ({ date: frame.date })),
          frames.value.map((_, position) => position),
          MAX_LLM_IMAGES,
        ).indices
          .map((position) => frames.value[position]?.url)
          .filter((url): url is string => Boolean(url))
      : []
    const messages = buildVariableMessages(
      {
        zone: zoneInfo(),
        variable: {
          title: target.title,
          unit: target.unit,
          description: target.description,
          caveat: target.caveat,
          product: target.provenance.product,
          maturity: target.provenance.maturity,
          palette: target.palette,
        },
        range: {
          from: first ?? '',
          to: last ?? '',
          shown: frames.value.length,
          available: range.length,
          commonFraction: stats.commonFraction,
        },
        points,
        trend: linearTrend(stats.steps.map((step) => ({ time: stepTime(step.date) ?? 0, value: step.stats.mean }))),
        change: change.value ? { ...change.value.summary, from: change.value.fromDate, to: change.value.toDate } : null,
        climate: climateSummary(current.zoneSeries, first, last),
        zoneContext: zoneContext(),
        crop: cropContext,
        requirement: requirementContext(),
        spatial: spatial.value,
        decimals: decimals.value,
      },
      images,
    )
    await variableReport.run(messages)
  }

  /** Resumen breve del cultivo para los informes de una variable (sin método ni listas largas). */
  async function cropContextFor(): Promise<CropSummary | null> {
    if (!crop.value) return null
    try {
      const summary = cropSummary(await ensureCropView(crop.value))
      return { ...summary, method: undefined, otherRequirements: undefined, unverified: undefined }
    } catch {
      return null
    }
  }

  async function runSpatialReport(target: AnalysisVariable): Promise<void> {
    const stats = rangeStats.value?.steps[0]
    const view = spatial.value
    if (!stats || !view) return
    const image = settings.vision ? frames.value[0]?.url ?? undefined : undefined
    const messages = buildSpatialMessages(
      {
        zone: zoneInfo(),
        variable: {
          title: target.title,
          unit: target.unit,
          description: target.description,
          caveat: target.caveat,
          product: target.provenance.product,
          maturity: target.provenance.maturity,
          palette: target.palette,
        },
        date: target.steps[0].date,
        stats: { ...stats.stats, validFraction: stats.coverage },
        histogram: view.histogram,
        byArea: view.byArea,
        zoneContext: zoneContext(target.id),
        crop: await cropContextFor(),
        requirement: requirementContext(),
        decimals: decimals.value,
      },
      image,
    )
    await variableReport.run(messages)
  }

  async function runCropReport(): Promise<void> {
    const target = crop.value
    if (!target) return
    let view: CropView
    try {
      view = await ensureCropView(target)
    } catch {
      return
    }
    const summary = { ...cropSummary(view), method: undefined }
    const messages = buildCropMessages(
      { zone: zoneInfo(), crop: summary, zoneContext: [] },
      settings.vision && view.url ? view.url : undefined,
    )
    await cropReport.run(messages)
  }

  return {
    state: readonly(state),
    variables,
    temporalVariables,
    variable,
    isSingle,
    crops,
    crop,
    candidates,
    sampling,
    decimals,
    frames,
    rangeStats,
    change,
    spatial,
    cropView,
    requirementView,
    variableReport: variableReport.report,
    cropReport: cropReport.report,
    grid,
    setMode(mode) {
      state.mode = mode
      if (mode === 'crop' && !state.cropId && crops.value[0]) state.cropId = crops.value[0].id
    },
    selectVariable(id) {
      const target = variables.value.find((candidate) => candidate.id === id)
      if (!target) return
      state.variableId = id
      state.fromIndex = 0
      state.toIndex = Math.max(0, target.steps.length - 1)
      variableReport.reset()
    },
    setRange(from, to) {
      const target = variable.value
      if (!target || !Number.isInteger(from) || !Number.isInteger(to)) return
      const last = target.steps.length - 1
      const lo = Math.min(Math.max(0, Math.min(from, to)), last)
      const hi = Math.min(Math.max(0, Math.max(from, to)), last)
      state.fromIndex = lo
      state.toIndex = hi
      variableReport.reset()
    },
    setSampleCount(count) {
      if (!Number.isFinite(count)) return
      state.sampleCount = Math.max(1, Math.min(MAX_SAMPLES, Math.round(count)))
    },
    setCrop(id) {
      if (id !== '' && !crops.value.some((candidate) => candidate.id === id)) return
      state.cropId = id
      variableReport.reset()
      cropReport.reset()
    },
    runVariableReport,
    runCropReport,
    stopVariableReport: variableReport.stop,
    stopCropReport: cropReport.stop,
  }
}
