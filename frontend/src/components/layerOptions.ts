import type { AnalysisVariable } from '../types/analysis'
import type { StudyLayer } from '../types/manifest'
import { t } from '../i18n'
import { numberFormatter } from '../i18n/format'
import { PALETTES } from '../services/palettes'
import { GROUP_LABELS, variableLabel } from './variableLabels'

/** Variable del cubo de análisis que se puede elegir en Capas además de las capas del manifiesto. */
export interface ExtraVariableOption {
  id: string
  title: string
  groupLabel: string
}

/** Lo que necesita la leyenda: una capa del manifiesto o una variable del cubo adaptada. */
export type LegendSource = Pick<StudyLayer, 'title' | 'variable' | 'unit' | 'range' | 'legend' | 'status'> & {
  /** Las celdas sin dato se pintan con la trama neutra: se añade a la leyenda. */
  noData?: boolean
}

/**
 * Las cantidades adimensionales usan la unidad `1` en los datos (índices,
 * fracciones 0–1, coherencia). Mientras el catálogo de datos todavía declare
 * «adimensional» o «fracción», se tratan igual y se muestran como
 * «dimensionless» / «adimensional».
 */
const DIMENSIONLESS = /^(1|dimensionless)$|^adimensional|^fracci/i

export function isDimensionlessUnit(unit: string | null | undefined): boolean {
  return typeof unit === 'string' && DIMENSIONLESS.test(unit.trim())
}

/** Unidad lista para mostrar: las adimensionales pasan por el catálogo; el resto ya es SI. */
export function displayUnit(unit: string | null | undefined): string {
  if (!unit) return ''
  return isDimensionlessUnit(unit) ? t('units.dimensionless') : unit
}

/** Une valor y unidad con un espacio; sin unidad no deja un espacio final. */
export function withUnit(value: string, unit: string): string {
  return unit ? `${value} ${unit}` : value
}

/** Opción de Capas para una variable del cubo. */
export function variableOption(variable: AnalysisVariable): ExtraVariableOption {
  return {
    id: variable.id,
    title: variableLabel(variable),
    groupLabel: GROUP_LABELS[variable.group] ?? variable.group,
  }
}

/** Leyenda de una variable del cubo con las paradas de su paleta sobre `displayRange`. */
export function variableLegend(variable: AnalysisVariable): LegendSource {
  const [min, max] = variable.displayRange
  const digits = typeof variable.decimals === 'number' ? variable.decimals : variable.scale < 0.01 ? 3 : variable.scale < 0.1 ? 2 : 1
  const format = numberFormatter({ maximumFractionDigits: digits })
  const unit = displayUnit(variable.unit)
  return {
    title: variableLabel(variable),
    variable: undefined,
    unit: variable.unit,
    range: [min, max],
    status: variable.status,
    noData: true,
    legend: PALETTES[variable.palette].map(([position, color]) => {
      const value = Number((min + (max - min) * position).toFixed(digits))
      return { value, color, label: withUnit(format.format(value), unit) }
    }),
  }
}
