/**
 * Cálculo sobre la rejilla del cubo de análisis (contrato v1.3.0).
 *
 * Funciones puras: no hacen fetch ni tocan el DOM. Los valores sin dato se
 * representan con `NaN` y nunca se rellenan ni se interpolan.
 */

/** Códigos uint8 → valores físicos; `nodata` → NaN. */
export function decodeValues(
  codes: Uint8Array,
  scale: number,
  offset: number,
  nodata = 255,
): Float32Array {
  const out = new Float32Array(codes.length)
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index]
    out[index] = code === nodata ? Number.NaN : offset + scale * code
  }
  return out
}

/** `to − from` por celda; NaN si falta cualquiera de los dos. */
export function difference(from: Float32Array, to: Float32Array): Float32Array {
  const out = new Float32Array(from.length)
  for (let index = 0; index < from.length; index += 1) {
    out[index] = to[index] - from[index]
  }
  return out
}

export interface ValueSummary {
  mean: number | null
  p10: number | null
  median: number | null
  p90: number | null
  min: number | null
  max: number | null
  validFraction: number
}

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function summarize(values: Float32Array): ValueSummary {
  const valid: number[] = []
  for (const value of values) {
    if (!Number.isNaN(value)) valid.push(value)
  }
  if (valid.length === 0) {
    return { mean: null, p10: null, median: null, p90: null, min: null, max: null, validFraction: 0 }
  }
  valid.sort((a, b) => a - b)
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length
  return {
    mean,
    p10: quantile(valid, 0.1),
    median: quantile(valid, 0.5),
    p90: quantile(valid, 0.9),
    min: valid[0],
    max: valid[valid.length - 1],
    validFraction: valid.length / values.length,
  }
}

/** Celdas con dato en TODAS las capas (1) frente a las que faltan en alguna (0). */
export function commonMask(stack: Float32Array[]): Uint8Array {
  const size = stack[0]?.length ?? 0
  const mask = new Uint8Array(size)
  for (let index = 0; index < size; index += 1) {
    mask[index] = stack.every((values) => !Number.isNaN(values[index])) ? 1 : 0
  }
  return mask
}

/** Copia de `values` con NaN fuera de la máscara. */
export function applyMask(values: Float32Array, mask: Uint8Array): Float32Array {
  const out = new Float32Array(values.length)
  for (let index = 0; index < values.length; index += 1) {
    out[index] = mask[index] ? values[index] : Number.NaN
  }
  return out
}

/** Rango simétrico robusto (p98 de |x|) para mapas de cambio. */
export function symmetricRange(values: Float32Array, fallback: number): number {
  const magnitudes: number[] = []
  for (const value of values) {
    if (!Number.isNaN(value)) magnitudes.push(Math.abs(value))
  }
  if (magnitudes.length === 0) return fallback
  magnitudes.sort((a, b) => a - b)
  const robust = quantile(magnitudes, 0.98)
  return robust > 0 ? robust : fallback
}

export interface HistogramBin {
  from: number
  to: number
  /** Fracción de las celdas con dato que caen en el tramo. */
  fraction: number
}

/**
 * Reparto de las celdas con dato en `bins` tramos iguales del rango de la
 * escala. Los valores fuera del rango se suman al primer o último tramo.
 */
export function histogram(values: Float32Array, range: [number, number], bins = 10): HistogramBin[] {
  const [min, max] = range
  const count = Math.max(1, Math.round(bins))
  const width = (max - min) / count
  const totals = new Array<number>(count).fill(0)
  let valid = 0
  for (const value of values) {
    if (Number.isNaN(value)) continue
    valid += 1
    const position = width > 0 ? Math.floor((value - min) / width) : 0
    totals[Math.min(count - 1, Math.max(0, position))] += 1
  }
  return totals.map((total, index) => ({
    from: min + width * index,
    to: min + width * (index + 1),
    fraction: valid ? total / valid : 0,
  }))
}
