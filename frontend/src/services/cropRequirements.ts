/**
 * Requisitos de cultivo por variable, tal como los publica el pipeline en el
 * cubo (factores del mapa de aptitud y requisitos citados que no entran en
 * él). No se calculan ni se inventan umbrales en el navegador: aquí solo se
 * localizan y se resume el reparto de la zona por tramos.
 */
import type {
  AnalysisVariable,
  CropFactor,
  CropSuitability,
  RequirementClasses,
  RequirementReference,
} from '../types/analysis'

export interface VariableRequirement {
  /** `factor`: entra en el mapa de aptitud; `other`: citado pero fuera del mapa. */
  kind: 'factor' | 'other'
  id: string
  label: string
  requirement: string
  classes: RequirementClasses | null
  /** Fuente propia; si es null, la fuente es la del cultivo (ficha ECOCROP). */
  reference: RequirementReference | null
  reason: string | null
}

export interface ClassShares {
  optimal: number
  acceptable: number
  unsuitable: number
  /** Fracción de la rejilla con puntuación. */
  valid: number
}

/**
 * Variables propias de un factor. La elevación figura en temperatura y
 * heladas porque corrige el clima por altitud, pero no es lo que se evalúa:
 * solo cuenta como propia cuando es la única variable (factor de altitud).
 */
export function factorOwnVariables(variables: string[]): string[] {
  const own = variables.filter((id) => id !== 'elevation')
  return own.length > 0 ? own : variables
}

export function factorForVariable(crop: CropSuitability, variableId: string): CropFactor | null {
  return crop.factors.find((factor) => factorOwnVariables(factor.variables).includes(variableId)) ?? null
}

export function requirementForVariable(crop: CropSuitability, variableId: string): VariableRequirement | null {
  const factor = factorForVariable(crop, variableId)
  if (factor) {
    return {
      kind: 'factor',
      id: factor.id,
      label: factor.label,
      requirement: factor.requirement,
      classes: factor.classes ?? null,
      reference: factor.reference ?? null,
      reason: null,
    }
  }
  const other = crop.otherRequirements?.find((candidate) => candidate.variables.includes(variableId))
  if (!other) return null
  return {
    kind: 'other',
    id: other.id,
    label: other.label,
    requirement: other.requirement,
    classes: other.classes ?? null,
    reference: other.reference ?? null,
    reason: other.reason ?? null,
  }
}

/** Fuente legible del requisito: la propia o la ficha ECOCROP del cultivo. */
export function requirementSource(crop: CropSuitability, requirement: VariableRequirement): string {
  if (requirement.reference) return requirement.reference.citation
  return `FAO ECOCROP — ${crop.source.product}`
}

const EPSILON = 1e-3

/** Reparto de la zona por tramos a partir de la puntuación 0–1 del factor. */
export function classShares(scores: Float32Array): ClassShares {
  let optimal = 0
  let acceptable = 0
  let unsuitable = 0
  for (const score of scores) {
    if (Number.isNaN(score)) continue
    if (score >= 1 - EPSILON) optimal += 1
    else if (score <= EPSILON) unsuitable += 1
    else acceptable += 1
  }
  const valid = optimal + acceptable + unsuitable
  if (valid === 0) return { optimal: 0, acceptable: 0, unsuitable: 0, valid: 0 }
  return {
    optimal: optimal / valid,
    acceptable: acceptable / valid,
    unsuitable: unsuitable / valid,
    valid: scores.length ? valid / scores.length : 0,
  }
}

/** Media y p10–p90 en la zona de variables estáticas (las que usan los factores de aptitud), como texto. */
export function observedValues(variables: AnalysisVariable[], ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const target = variables.find((candidate) => candidate.id === id)
    const stats = target?.steps[0]?.stats
    if (!target || !stats || target.temporal) continue
    const digits = typeof target.decimals === 'number' ? target.decimals : target.scale < 0.01 ? 3 : target.scale < 0.1 ? 2 : 1
    const f = (value: number | null) => (value === null ? 's/d' : Number(value.toFixed(digits)).toString())
    out.push(`${target.title}: media ${f(stats.mean)} ${target.unit} (p10–p90 ${f(stats.p10)}–${f(stats.p90)})`)
  }
  return out
}
