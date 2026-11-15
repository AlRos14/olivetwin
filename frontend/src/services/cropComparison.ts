/**
 * Comparación de dos zonas de estudio para un cultivo.
 *
 * El veredicto y los motivos se calculan aquí, de forma determinista, a partir
 * de los mapas de aptitud que publica el pipeline: no dependen de la IA. Los
 * resúmenes de cada zona se calculan sobre su superficie agrícola (CORINE) si
 * está disponible. Gana la zona con más superficie apta (S1 + S2, aptitud ≥ 0,60) si la
 * diferencia llega a `SHARE_MARGIN`; si no, la de mayor aptitud media si la
 * diferencia llega a `MEAN_MARGIN`; si tampoco, se consideran equivalentes. Los
 * motivos son los factores cuya puntuación media difiere al menos
 * `FACTOR_THRESHOLD` entre las zonas.
 */
import type { RequirementClasses } from '../types/analysis'
import type { ClassShares } from './cropRequirements'
import { SUITABLE_MIN, type LimitingShare, type SuitabilityBin } from './cropSuitability'

/** Diferencia mínima de superficie apta (fracción) para declarar ganador. */
export const SHARE_MARGIN = 0.05
/** Diferencia mínima de aptitud media para declarar ganador si la superficie apta no decide. */
export const MEAN_MARGIN = 0.05
/** Diferencia de puntuación media de un factor a partir de la cual se cita como motivo. */
export const FACTOR_THRESHOLD = 0.05

export type Side = 'A' | 'B'

export interface ZoneFactorSummary {
  id: string
  label: string
  /** Puntuación media 0–1 del factor en la zona. */
  mean: number | null
  shares: ClassShares
  /** Fracción de la zona en que este factor es el que más limita. */
  limiting: number
  /** Valores observados de las variables del factor (texto ya formateado). */
  observed: string[]
  classes: RequirementClasses | null
}

export interface ZoneCropSummary {
  zoneId: string
  zoneName: string
  /** `farmland`: estadísticas solo sobre la superficie agrícola de CORINE; `zone`: todo el recuadro. */
  basis: 'farmland' | 'zone'
  /** Fracción del recuadro que es superficie agrícola (null sin datos de usos del suelo). */
  farmlandShare: number | null
  mean: number | null
  p10: number | null
  p90: number | null
  bins: SuitabilityBin[]
  /** Fracción de la zona apta (S1 + S2, aptitud ≥ 0,60). */
  suitableShare: number
  factors: ZoneFactorSummary[]
  limiting: LimitingShare[]
  unlimited: number
}

export interface FactorComparison {
  id: string
  label: string
  classes: RequirementClasses | null
  a: ZoneFactorSummary | null
  b: ZoneFactorSummary | null
  /** Puntuación media de B menos la de A (null si falta alguna). */
  delta: number | null
  favors: Side | 'tie'
}

export interface CropComparison {
  winner: Side | 'tie'
  /** Criterio que decide: superficie apta, aptitud media o ninguno (equivalentes). */
  decidedBy: 'share' | 'mean' | 'none'
  /** Aptitud media de B menos la de A. */
  delta: number | null
  /** Superficie apta de B menos la de A. */
  shareDelta: number
  factors: FactorComparison[]
  /** Factores que explican la diferencia, de mayor a menor diferencia. */
  reasons: FactorComparison[]
}

/** Fracción de la zona apta: clases S1 y S2 (aptitud ≥ `SUITABLE_MIN`). */
export function suitableShare(bins: SuitabilityBin[]): number {
  return bins.filter((bin) => bin.min >= SUITABLE_MIN - 1e-9).reduce((sum, bin) => sum + bin.fraction, 0)
}

export function compareZones(a: ZoneCropSummary, b: ZoneCropSummary): CropComparison {
  const delta = a.mean !== null && b.mean !== null ? b.mean - a.mean : null
  const shareDelta = b.suitableShare - a.suitableShare
  let winner: Side | 'tie' = 'tie'
  let decidedBy: CropComparison['decidedBy'] = 'none'
  if (Math.abs(shareDelta) >= SHARE_MARGIN - 1e-9) {
    winner = shareDelta > 0 ? 'B' : 'A'
    decidedBy = 'share'
  } else if (delta !== null && Math.abs(delta) >= MEAN_MARGIN - 1e-9) {
    winner = delta > 0 ? 'B' : 'A'
    decidedBy = 'mean'
  }

  const ids = [...a.factors.map((factor) => factor.id)]
  for (const factor of b.factors) if (!ids.includes(factor.id)) ids.push(factor.id)

  const factors = ids.map<FactorComparison>((id) => {
    const fa = a.factors.find((factor) => factor.id === id) ?? null
    const fb = b.factors.find((factor) => factor.id === id) ?? null
    const factorDelta = fa?.mean != null && fb?.mean != null ? fb.mean - fa.mean : null
    const favors: Side | 'tie' =
      factorDelta === null || Math.abs(factorDelta) < FACTOR_THRESHOLD ? 'tie' : factorDelta > 0 ? 'B' : 'A'
    return {
      id,
      label: fa?.label ?? fb?.label ?? id,
      classes: fa?.classes ?? fb?.classes ?? null,
      a: fa,
      b: fb,
      delta: factorDelta,
      favors,
    }
  })

  const reasons = factors
    .filter((factor) => factor.favors !== 'tie')
    .sort((x, y) => Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0))

  return { winner, decidedBy, delta, shareDelta, factors, reasons }
}
