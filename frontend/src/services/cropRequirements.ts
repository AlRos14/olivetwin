/**
 * Requisitos de cultivo por variable, tal como los publica el pipeline en el
 * cubo (factores del mapa de aptitud y requisitos citados que no entran en
 * él). No se calculan ni se inventan umbrales en el navegador: aquí solo se
 * localizan y se resume el reparto de la zona por tramos.
 */
import { dataText } from '../i18n/dataText'
import { numberFormatter } from '../i18n/format'
import { t } from '../i18n'
import { unitLabel } from './seriesAnalysis'
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

/** Fuente legible de un requisito, sin componer el texto (los datos se traducen al pintar). */
export interface RequirementSource {
  citation: string | null
  /** Producto del cultivo cuando la fuente es su ficha ECOCROP. */
  product: string | null
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

/** Fuente del requisito: la propia o la ficha ECOCROP del cultivo (datos sin traducir). */
export function requirementSource(crop: CropSuitability, requirement: VariableRequirement): RequirementSource {
  if (requirement.reference) return { citation: requirement.reference.citation, product: null }
  return { citation: null, product: crop.source.product }
}

/** Fuente en el idioma activo, con los textos de los datos traducidos. */
export function requirementSourceText(source: RequirementSource): string {
  if (source.citation) return dataText(source.citation)
  return t('analysis.crops.ecocrop', { product: dataText(source.product ?? '') })
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

/**
 * Valor observado en la zona de una variable estática (media y p10–p90), sin
 * formatear: el texto se compone en el idioma activo al mostrarlo.
 */
export interface ObservedValue {
  title: string
  unit: string
  mean: number | null
  p10: number | null
  p90: number | null
  decimals: number
}

function decimalsOf(variable: AnalysisVariable): number {
  if (typeof variable.decimals === 'number') return variable.decimals
  return variable.scale < 0.01 ? 3 : variable.scale < 0.1 ? 2 : 1
}

/** Media y p10–p90 en la zona de las variables estáticas que usa un factor. */
export function observedValues(variables: AnalysisVariable[], ids: string[]): ObservedValue[] {
  const out: ObservedValue[] = []
  for (const id of ids) {
    const target = variables.find((candidate) => candidate.id === id)
    const stats = target?.steps[0]?.stats
    if (!target || !stats || target.temporal) continue
    out.push({
      title: target.title,
      unit: target.unit,
      mean: stats.mean,
      p10: stats.p10,
      p90: stats.p90,
      decimals: decimalsOf(target),
    })
  }
  return out
}

/** Valor observado como texto, en el idioma activo (título del dato incluido). */
export function observedText(value: ObservedValue): string {
  const digits = value.decimals
  const number = (candidate: number | null) =>
    candidate === null ? t('analysis.charts.noValue') : numberFormatter({ maximumFractionDigits: digits }).format(candidate)
  return t('analysis.crops.observed', {
    title: dataText(value.title),
    mean: number(value.mean),
    unit: unitLabel(value.unit),
    p10: number(value.p10),
    p90: number(value.p90),
  })
}
