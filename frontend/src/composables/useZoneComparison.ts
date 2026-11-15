/**
 * Pestaña «Comparar»: dos zonas de estudio (A y B) y un cultivo.
 *
 * Carga el cubo de análisis de cada zona (independiente de la zona elegida en
 * el selector general), resume su mapa de aptitud y el de cada factor, y
 * calcula el veredicto y los motivos con `compareZones` (determinista). El
 * informe con IA solo explica ese resultado.
 *
 * Si el cubo trae `landcover-agri` (CORINE), los resúmenes se calculan solo
 * sobre las celdas con al menos `FARMLAND_MIN` de superficie agrícola, para no
 * comparar sierra, monte o ciudad.
 */
import { computed, reactive, readonly, shallowRef, watch } from 'vue'
import type { ComputedRef, DeepReadonly, Ref, ShallowRef } from 'vue'

import type { AnalysisVariable, CropSuitability, ZoneAnalysis } from '../types/analysis'
import type { StudyZone } from '../types/manifest'
import { AnalysisLoadError, loadRaster, loadZoneAnalysis } from '../services/analysisService'
import { applyMask, summarize } from '../services/analysisMath'
import { compareZones, suitableShare, type CropComparison, type ZoneCropSummary } from '../services/cropComparison'
import { classShares, factorOwnVariables, type ObservedValue } from '../services/cropRequirements'
import { limitingShares, suitabilityBins } from '../services/cropSuitability'
import type { LlmSettings } from '../services/llmClient'
import { buildComparisonMessages } from '../services/llmPrompts'
import { renderRgba, rgbaToDataUrl } from '../services/palettes'
import { useLlmReport, type LlmReportState } from './useLlm'
import { t } from '../i18n'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Celdas con al menos esta fracción de superficie agrícola (CORINE) entran en la comparación. */
export const FARMLAND_MIN = 0.5

export interface ZoneCropView {
  summary: ZoneCropSummary
  /** Mapa de aptitud pintado (data URL). */
  url: string | null
  values: Float32Array
  grid: ZoneAnalysis['grid']
}

interface ComparisonState {
  zoneAId: string | null
  zoneBId: string | null
  cropId: string
  status: LoadStatus
  error: string | null
}

export interface UseZoneComparisonReturn {
  state: DeepReadonly<ComparisonState>
  /** Zonas con cubo de análisis publicado. */
  zones: ComputedRef<StudyZone[]>
  /** Cultivos presentes en las dos zonas elegidas. */
  crops: ComputedRef<{ id: string; name: string }[]>
  crop: ComputedRef<CropSuitability | null>
  viewA: ShallowRef<ZoneCropView | null>
  viewB: ShallowRef<ZoneCropView | null>
  comparison: ComputedRef<CropComparison | null>
  report: DeepReadonly<LlmReportState>
  setZoneA(id: string): void
  setZoneB(id: string): void
  setCrop(id: string): void
  runReport(): Promise<void>
  stopReport(): void
}

export interface ZoneComparisonOptions {
  fetchImpl?: typeof fetch
  base?: string
  toDataUrl?: (rgba: Uint8ClampedArray, width: number, height: number) => string | null
}

function farmlandMask(agri: Float32Array): Uint8Array {
  const mask = new Uint8Array(agri.length)
  for (let index = 0; index < agri.length; index += 1) mask[index] = agri[index] >= FARMLAND_MIN ? 1 : 0
  return mask
}

function meanOf(values: Float32Array): number | null {
  let sum = 0
  let count = 0
  for (const value of values) {
    if (Number.isNaN(value)) continue
    sum += value
    count += 1
  }
  return count ? sum / count : null
}

/** Media y p10–p90 de una variable en las celdas comparadas, sin formatear (se traduce al mostrar). */
function observedValue(variable: AnalysisVariable, stats: ReturnType<typeof summarize>): ObservedValue {
  const digits = typeof variable.decimals === 'number' ? variable.decimals : variable.scale < 0.01 ? 3 : variable.scale < 0.1 ? 2 : 1
  return {
    title: variable.title,
    unit: variable.unit,
    mean: stats.mean,
    p10: stats.p10,
    p90: stats.p90,
    decimals: digits,
  }
}

export function useZoneComparison(
  allZones: Ref<StudyZone[]> | ComputedRef<StudyZone[]>,
  settings: LlmSettings,
  options: ZoneComparisonOptions = {},
): UseZoneComparisonReturn {
  const state = reactive<ComparisonState>({ zoneAId: null, zoneBId: null, cropId: '', status: 'idle', error: null })
  const cubes = shallowRef<Record<string, ZoneAnalysis>>({})
  const viewA = shallowRef<ZoneCropView | null>(null)
  const viewB = shallowRef<ZoneCropView | null>(null)
  const llm = useLlmReport(settings, { fetchImpl: options.fetchImpl })
  const toDataUrl = options.toDataUrl ?? rgbaToDataUrl
  const cubeCache = new Map<string, Promise<ZoneAnalysis>>()
  const viewCache = new Map<string, Promise<ZoneCropView>>()

  const zones = computed(() => allZones.value.filter((zone) => Boolean(zone.analysis)))

  watch(
    zones,
    (list) => {
      const ids = list.map((zone) => zone.id)
      if (!state.zoneAId || !ids.includes(state.zoneAId)) state.zoneAId = ids[0] ?? null
      if (!state.zoneBId || !ids.includes(state.zoneBId)) state.zoneBId = ids.find((id) => id !== state.zoneAId) ?? null
    },
    { immediate: true },
  )

  function cubeFor(zone: StudyZone): Promise<ZoneAnalysis> {
    let promise = cubeCache.get(zone.id)
    if (!promise) {
      promise = loadZoneAnalysis(zone.analysis as string, zone.id, { fetchImpl: options.fetchImpl, base: options.base })
      promise.catch(() => cubeCache.delete(zone.id))
      cubeCache.set(zone.id, promise)
    }
    return promise
  }

  const crops = computed(() => {
    const a = state.zoneAId ? cubes.value[state.zoneAId] : undefined
    const b = state.zoneBId ? cubes.value[state.zoneBId] : undefined
    if (!a || !b) return []
    const inB = new Set((b.crops ?? []).map((crop) => crop.id))
    return (a.crops ?? []).filter((crop) => inB.has(crop.id)).map((crop) => ({ id: crop.id, name: crop.name }))
  })

  const crop = computed(() => {
    const a = state.zoneAId ? cubes.value[state.zoneAId] : undefined
    return a?.crops?.find((candidate) => candidate.id === state.cropId) ?? null
  })

  watch(crops, (list) => {
    if (!list.some((candidate) => candidate.id === state.cropId)) state.cropId = list[0]?.id ?? ''
  })

  function viewFor(zone: StudyZone, cube: ZoneAnalysis, cropId: string): Promise<ZoneCropView> {
    const key = `${zone.id}/${cropId}`
    let promise = viewCache.get(key)
    if (!promise) {
      promise = (async () => {
        const target = cube.crops?.find((candidate) => candidate.id === cropId)
        if (!target) {
          throw new AnalysisLoadError(
            'semantic',
            t('analysis.errors.zoneCropMissing', { zone: zone.name, crop: cropId }),
          )
        }
        const fetchOptions = { fetchImpl: options.fetchImpl, base: options.base }
        const stepOf = (variable: AnalysisVariable) =>
          loadRaster(cube.grid, { data: variable.steps[0].data, scale: variable.scale, offset: variable.offset }, fetchOptions)
        const agriVariable = cube.variables.find((variable) => variable.id === 'landcover-agri')
        const [values, factorValues, agri] = await Promise.all([
          loadRaster(cube.grid, target.suitability, fetchOptions),
          Promise.all(target.factors.map((factor) => loadRaster(cube.grid, factor.raster, fetchOptions))),
          agriVariable ? stepOf(agriVariable) : Promise.resolve(null),
        ])
        const mask = agri ? farmlandMask(agri) : null
        const restrict = (array: Float32Array) => (mask ? applyMask(array, mask) : array)
        const suitability = restrict(values)
        const factorScores = factorValues.map(restrict)
        const stats = summarize(suitability)
        const { bins } = suitabilityBins(suitability)
        const { shares, unlimited } = limitingShares(
          target.factors.map((factor, position) => ({ id: factor.id, label: factor.label, values: factorScores[position] })),
        )
        const observed = await Promise.all(
          target.factors.map(async (factor) => {
            const values: ObservedValue[] = []
            for (const id of factorOwnVariables(factor.variables)) {
              const variable = cube.variables.find((candidate) => candidate.id === id)
              if (!variable || variable.temporal || !variable.steps[0]) continue
              values.push(observedValue(variable, summarize(restrict(await stepOf(variable)))))
            }
            return values
          }),
        )
        const summary: ZoneCropSummary = {
          zoneId: zone.id,
          zoneName: zone.name,
          basis: mask ? 'farmland' : 'zone',
          farmlandShare: agri ? meanOf(agri) : null,
          mean: stats.mean,
          p10: stats.p10,
          p90: stats.p90,
          bins,
          suitableShare: suitableShare(bins),
          factors: target.factors.map((factor, position) => ({
            id: factor.id,
            label: factor.label,
            mean: summarize(factorScores[position]).mean,
            shares: classShares(factorScores[position]),
            limiting: shares.find((share) => share.id === factor.id)?.fraction ?? 0,
            observed: observed[position],
            classes: factor.classes ?? null,
          })),
          limiting: shares,
          unlimited,
        }
        const { width, height } = cube.grid
        const url = toDataUrl(renderRgba(values, [0, 1], 'suitability', { width, hatchNoData: true }), width, height)
        return { summary, url, values, grid: cube.grid }
      })()
      promise.catch(() => viewCache.delete(key))
      viewCache.set(key, promise)
    }
    return promise
  }

  let counter = 0
  async function refresh(): Promise<void> {
    counter += 1
    const token = counter
    const zoneA = zones.value.find((zone) => zone.id === state.zoneAId)
    const zoneB = zones.value.find((zone) => zone.id === state.zoneBId)
    llm.reset()
    if (!zoneA || !zoneB) {
      viewA.value = null
      viewB.value = null
      state.status = 'idle'
      return
    }
    state.status = 'loading'
    state.error = null
    try {
      const [cubeA, cubeB] = await Promise.all([cubeFor(zoneA), cubeFor(zoneB)])
      if (token !== counter) return
      cubes.value = { ...cubes.value, [zoneA.id]: cubeA, [zoneB.id]: cubeB }
      const cropId = crops.value.some((candidate) => candidate.id === state.cropId) ? state.cropId : (crops.value[0]?.id ?? '')
      state.cropId = cropId
      if (!cropId) {
        viewA.value = null
        viewB.value = null
        state.status = 'error'
        state.error = t('analysis.errors.noCommonCrop')
        return
      }
      const [a, b] = await Promise.all([viewFor(zoneA, cubeA, cropId), viewFor(zoneB, cubeB, cropId)])
      if (token !== counter) return
      viewA.value = a
      viewB.value = b
      state.status = 'ready'
    } catch (error) {
      if (token !== counter) return
      viewA.value = null
      viewB.value = null
      state.status = 'error'
      state.error = error instanceof AnalysisLoadError ? error.message : t('analysis.errors.compareLoad')
    }
  }

  watch(() => [state.zoneAId, state.zoneBId, state.cropId] as const, () => void refresh(), { immediate: true })

  const comparison = computed(() =>
    viewA.value && viewB.value && state.zoneAId !== state.zoneBId ? compareZones(viewA.value.summary, viewB.value.summary) : null,
  )

  async function runReport(): Promise<void> {
    const target = crop.value
    const result = comparison.value
    if (!target || !result || !viewA.value || !viewB.value) return
    await llm.run(
      buildComparisonMessages({
        cropName: target.name,
        scientificName: target.scientificName,
        assumptions: target.assumptions,
        zoneA: viewA.value.summary,
        zoneB: viewB.value.summary,
        comparison: result,
      }),
    )
  }

  return {
    state: readonly(state),
    zones,
    crops,
    crop,
    viewA,
    viewB,
    comparison,
    report: llm.report,
    setZoneA(id) {
      if (zones.value.some((zone) => zone.id === id)) state.zoneAId = id
    },
    setZoneB(id) {
      if (zones.value.some((zone) => zone.id === id)) state.zoneBId = id
    },
    setCrop(id) {
      if (crops.value.some((candidate) => candidate.id === id)) state.cropId = id
    },
    runReport,
    stopReport: llm.stop,
  }
}
