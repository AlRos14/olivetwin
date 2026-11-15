/**
 * Resúmenes de los mapas de aptitud por cultivo (contrato v1.3.0, `crops`).
 *
 * El pipeline publica la puntuación global y la de cada factor (0 = no apto,
 * 1 = óptimo). Aquí solo se resumen: reparto de superficie por tramos y qué
 * factor limita en cada celda (el de menor puntuación, como en Ecocrop).
 */

import { t } from '../i18n'

export type SuitabilityClassId = 'N' | 'S3' | 'S2' | 'S1'

export interface SuitabilityBin {
  id: SuitabilityClassId
  min: number
  max: number
  fraction: number
}

/**
 * Clases de aptitud de LUSET (Yen et al., 2006; Selmy et al., 2024, Agronomy
 * 14(11):2601, tabla 3, CC BY 4.0): N < 0,40, S3 0,40–0,60, S2 0,60–0,85 y
 * S1 ≥ 0,85. «Apta» = S1 + S2.
 */
export const SUITABILITY_CLASSES = [
  { id: 'N', min: 0, max: 0.4 },
  { id: 'S3', min: 0.4, max: 0.6 },
  { id: 'S2', min: 0.6, max: 0.85 },
  { id: 'S1', min: 0.85, max: 1 },
] as const

/** Texto de la clase en el idioma activo (incluye el rango). */
export function suitabilityBinLabel(id: SuitabilityClassId): string {
  switch (id) {
    case 'S1':
      return t('analysis.crops.suitability.S1')
    case 'S2':
      return t('analysis.crops.suitability.S2')
    case 'S3':
      return t('analysis.crops.suitability.S3')
    default:
      return t('analysis.crops.suitability.N')
  }
}

/** Aptitud mínima para contar como «apta» (S1 + S2). */
export const SUITABLE_MIN = 0.6

/** Reparto de las celdas con dato en las clases de aptitud N, S3, S2 y S1. */
export function suitabilityBins(values: Float32Array): { bins: SuitabilityBin[]; validFraction: number } {
  const counts = [0, 0, 0, 0]
  let valid = 0
  for (const value of values) {
    if (Number.isNaN(value)) continue
    valid += 1
    const bin = value >= 0.85 ? 3 : value >= 0.6 ? 2 : value >= 0.4 ? 1 : 0
    counts[bin] += 1
  }
  const bins = SUITABILITY_CLASSES.map((cls, index) => ({
    id: cls.id,
    min: cls.min,
    max: cls.max,
    fraction: valid > 0 ? counts[index] / valid : 0,
  }))
  return { bins, validFraction: values.length > 0 ? valid / values.length : 0 }
}

export interface LimitingShare {
  id: string
  label: string
  /** Fracción de las celdas con dato en las que este factor es el de menor puntuación (< 1). */
  fraction: number
}

/**
 * Factor limitante por celda: el de menor puntuación entre los que tienen dato.
 * Las celdas donde todos los factores puntúan 1 cuentan como «sin limitación».
 */
export function limitingShares(
  factors: { id: string; label: string; values: Float32Array }[],
): { shares: LimitingShare[]; unlimited: number } {
  if (factors.length === 0) return { shares: [], unlimited: 0 }
  const size = factors[0].values.length
  const counts = new Array<number>(factors.length).fill(0)
  let unlimited = 0
  let valid = 0
  for (let cell = 0; cell < size; cell += 1) {
    let best = -1
    let bestValue = Number.POSITIVE_INFINITY
    factors.forEach((factor, position) => {
      const value = factor.values[cell]
      if (!Number.isNaN(value) && value < bestValue) {
        best = position
        bestValue = value
      }
    })
    if (best < 0) continue
    valid += 1
    if (bestValue >= 1) unlimited += 1
    else counts[best] += 1
  }
  const shares = factors
    .map((factor, position) => ({
      id: factor.id,
      label: factor.label,
      fraction: valid > 0 ? counts[position] / valid : 0,
    }))
    .sort((a, b) => b.fraction - a.fraction)
  return { shares, unlimited: valid > 0 ? unlimited / valid : 0 }
}
