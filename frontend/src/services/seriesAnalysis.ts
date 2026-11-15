/**
 * Selección de fechas y métricas de una serie del cubo de análisis.
 *
 * Funciones puras: eligen qué pasos mostrar dentro de un intervalo (repartidos
 * uniformemente en el tiempo, nunca más de los disponibles) y resumen la serie
 * para la tabla, las gráficas y el contexto que se envía al modelo de IA.
 */
import type { AnalysisStep, ZoneSeries } from '../types/analysis'
import type { AreaMean } from './analysisMath'
import { t } from '../i18n'

/** Máximo de imágenes que se muestran a la vez: más no aportan lectura. */
export const MAX_SAMPLES = 12
const DAY_MS = 86_400_000

/** Unidades del dato que significan una cantidad adimensional (contrato: `1`). */
const DIMENSIONLESS = /^(1|adimensional(\s*\(\s*0[–-]1\s*\))?|fracci[oó]n)$/i
/** Lámina anual: el «anual» va en el título, la unidad es una longitud (mm). */
const ANNUAL_DEPTH = /^mm\s*\/\s*(a[nñ]o|year|yr)$/i

/**
 * Unidad para mostrar: las adimensionales (`1`, «adimensional», «fracción») se
 * presentan como «dimensionless» / «adimensional»; la precipitación anual se
 * muestra como lámina en mm (sin «/año»); el resto se deja tal cual (símbolos
 * SI de los datos).
 */
export function unitLabel(unit: string | null | undefined): string {
  const raw = (unit ?? '').trim()
  if (!raw) return ''
  if (DIMENSIONLESS.test(raw)) return t('analysis.units.dimensionless')
  if (ANNUAL_DEPTH.test(raw)) return 'mm'
  return raw
}

/** Nombre de una parte de la zona (cuadrante o franja de altitud) en el idioma activo. */
export function areaMeanLabel(area: AreaMean): string {
  switch (area.id) {
    case 'quadrant-nw':
      return t('analysis.areas.quadrant-nw')
    case 'quadrant-ne':
      return t('analysis.areas.quadrant-ne')
    case 'quadrant-sw':
      return t('analysis.areas.quadrant-sw')
    case 'quadrant-se':
      return t('analysis.areas.quadrant-se')
    case 'elevation-low':
      return t('analysis.areas.elevation-low', { max: area.max ?? 0 })
    case 'elevation-mid':
      return t('analysis.areas.elevation-mid', { min: area.min ?? 0, max: area.max ?? 0 })
    default:
      return t('analysis.areas.elevation-high', { min: area.min ?? 0 })
  }
}

export function stepTime(date: string | null): number | null {
  if (!date) return null
  const time = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date)
  return Number.isNaN(time) ? null : time
}

/** Índices de los pasos con fecha comprendidos entre `from` y `to` (incluidos, en cualquier orden). */
export function rangeIndices(steps: Pick<AnalysisStep, 'date'>[], from: number, to: number): number[] {
  if (steps.length === 0) return []
  const lo = Math.max(0, Math.min(from, to))
  const hi = Math.min(steps.length - 1, Math.max(from, to))
  const out: number[] = []
  for (let index = lo; index <= hi; index += 1) {
    if (stepTime(steps[index].date) !== null) out.push(index)
  }
  return out
}

export interface SampleResult {
  /** Índices elegidos, en orden cronológico. */
  indices: number[]
  /** Pasos con fecha disponibles en el intervalo. */
  available: number
  /** Número pedido tras recortarlo a [1, MAX_SAMPLES]. */
  requested: number
  /** Separación media en días entre las fechas elegidas (null con menos de dos). */
  spacingDays: number | null
}

/**
 * Elige `requested` pasos repartidos uniformemente en el tiempo: siempre el
 * primero y el último del intervalo, y para cada fecha objetivo intermedia el
 * paso más cercano aún no elegido. Si hay menos pasos que los pedidos, se
 * devuelven todos.
 */
export function sampleIndices(
  steps: Pick<AnalysisStep, 'date'>[],
  candidates: number[],
  requested: number,
): SampleResult {
  const wanted = Math.max(1, Math.min(MAX_SAMPLES, Math.round(requested) || 1))
  const available = candidates.length
  const finish = (indices: number[]): SampleResult => {
    const sorted = [...indices].sort((a, b) => a - b)
    const times = sorted.map((index) => stepTime(steps[index].date) as number)
    const spacingDays =
      times.length >= 2 ? (times[times.length - 1] - times[0]) / (times.length - 1) / DAY_MS : null
    return { indices: sorted, available, requested: wanted, spacingDays }
  }
  if (available === 0) return finish([])
  if (wanted >= available) return finish(candidates)
  if (wanted === 1) return finish([candidates[candidates.length - 1]])

  const times = candidates.map((index) => stepTime(steps[index].date) as number)
  const start = times[0]
  const end = times[times.length - 1]
  const chosen = new Set<number>()
  for (let k = 0; k < wanted; k += 1) {
    const target = start + ((end - start) * k) / (wanted - 1)
    let best = -1
    let bestDistance = Number.POSITIVE_INFINITY
    times.forEach((time, position) => {
      if (chosen.has(position)) return
      const distance = Math.abs(time - target)
      if (distance < bestDistance) {
        best = position
        bestDistance = distance
      }
    })
    if (best >= 0) chosen.add(best)
  }
  return finish([...chosen].map((position) => candidates[position]))
}

export interface TrendResult {
  /** Pendiente de la media de la zona por cada 30 días. */
  slopePer30Days: number | null
  r2: number | null
}

/** Tendencia lineal por mínimos cuadrados de la media frente al tiempo. */
export function linearTrend(points: { time: number; value: number | null }[]): TrendResult {
  const valid = points.filter((point): point is { time: number; value: number } => point.value !== null)
  if (valid.length < 3) return { slopePer30Days: null, r2: null }
  const xs = valid.map((point) => point.time / (30 * DAY_MS))
  const ys = valid.map((point) => point.value)
  const n = valid.length
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
    syy += (ys[i] - meanY) ** 2
  }
  if (sxx === 0) return { slopePer30Days: null, r2: null }
  const slope = sxy / sxx
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { slopePer30Days: slope, r2 }
}

export interface ChangeSummary {
  /** Media de (posterior − anterior) en las celdas con dato en ambas fechas. */
  meanDelta: number | null
  /** Fracción de celdas comparables que suben, bajan o se mantienen (±umbral). */
  increased: number
  decreased: number
  stable: number
  /** Fracción de celdas con dato en ambas fechas. */
  comparable: number
  threshold: number
}

/** Resume el cambio celda a celda entre dos fechas. */
export function changeSummary(before: Float32Array, after: Float32Array, threshold: number): ChangeSummary {
  let count = 0
  let sum = 0
  let up = 0
  let down = 0
  for (let index = 0; index < before.length; index += 1) {
    const a = before[index]
    const b = after[index]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const delta = b - a
    count += 1
    sum += delta
    if (delta > threshold) up += 1
    else if (delta < -threshold) down += 1
  }
  if (count === 0) {
    return { meanDelta: null, increased: 0, decreased: 0, stable: 0, comparable: 0, threshold }
  }
  return {
    meanDelta: sum / count,
    increased: up / count,
    decreased: down / count,
    stable: (count - up - down) / count,
    comparable: count / before.length,
    threshold,
  }
}

function seriesById(series: ZoneSeries[] | undefined, id: string): ZoneSeries | null {
  return series?.find((candidate) => candidate.id === id) ?? null
}

/** Lluvia acumulada en los `days` días anteriores a una fecha (incluido el propio día). */
export function rainBefore(series: ZoneSeries[] | undefined, date: string | null, days: number): number | null {
  const precipitation = seriesById(series, 'precipitation')
  const end = stepTime(date)
  if (!precipitation || end === null) return null
  const endDay = Math.floor(end / DAY_MS)
  let total = 0
  let found = false
  for (const point of precipitation.points) {
    const time = stepTime(point.date)
    if (time === null || point.value === null) continue
    const day = Math.floor(time / DAY_MS)
    if (day <= endDay && day > endDay - days) {
      total += point.value
      found = true
    }
  }
  return found ? total : null
}

export interface ClimateSummary {
  precipitationTotal: number | null
  rainyDays: number | null
  tMaxMean: number | null
  tMinMean: number | null
  et0Total: number | null
  days: number
}

/** Clima de la zona entre dos fechas (series diarias de `zoneSeries`). */
export function climateSummary(series: ZoneSeries[] | undefined, from: string | null, to: string | null): ClimateSummary {
  const start = stepTime(from)
  const end = stepTime(to)
  const empty: ClimateSummary = {
    precipitationTotal: null,
    rainyDays: null,
    tMaxMean: null,
    tMinMean: null,
    et0Total: null,
    days: 0,
  }
  if (start === null || end === null) return empty
  const startDay = Math.floor(Math.min(start, end) / DAY_MS)
  const endDay = Math.floor(Math.max(start, end) / DAY_MS)
  const within = (id: string) =>
    (seriesById(series, id)?.points ?? []).filter((point) => {
      const time = stepTime(point.date)
      if (time === null || point.value === null) return false
      const day = Math.floor(time / DAY_MS)
      return day >= startDay && day <= endDay
    }) as { date: string; value: number }[]
  const sum = (points: { value: number }[]) => (points.length ? points.reduce((total, point) => total + point.value, 0) : null)
  const mean = (points: { value: number }[]) => (points.length ? sum(points)! / points.length : null)
  const rain = within('precipitation')
  return {
    precipitationTotal: sum(rain),
    rainyDays: rain.length ? rain.filter((point) => point.value >= 1).length : null,
    tMaxMean: mean(within('temperature-max')),
    tMinMean: mean(within('temperature-min')),
    et0Total: sum(within('et0')),
    days: endDay - startDay + 1,
  }
}
