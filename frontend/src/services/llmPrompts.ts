/**
 * Construcción de los mensajes que se envían al modelo de lenguaje.
 *
 * Se envían datos ya calculados (estadísticas por fecha, tendencia, cambio
 * celda a celda, clima y requisitos del cultivo), no solo imágenes: un modelo
 * interpreta mejor cifras explícitas que colores. Las cautelas científicas van
 * en las instrucciones del sistema para que la interpretación las respete.
 */
import type { AnalysisPalette } from '../types/analysis'
import type { ChatMessage, ChatPart } from './llmClient'
import type { SuitabilityBin, LimitingShare } from './cropSuitability'
import type { ChangeSummary, ClimateSummary, TrendResult } from './seriesAnalysis'
import { formatUsDate } from './dateFormat'
import type { HistogramBin } from './analysisMath'
import type { RequirementClasses } from '../types/analysis'
import type { ClassShares } from './cropRequirements'
import type { CropComparison, FactorComparison, Side, ZoneCropSummary } from './cropComparison'

export const SYSTEM_PROMPT = [
  'Eres un analista de teledetección y agronomía que ayuda a interpretar datos de la misión radar NISAR (NASA-ISRO) y fuentes complementarias sobre zonas agrícolas de España.',
  'Reglas:',
  '- Usa solo los datos que se te dan. No inventes cifras, fechas, fuentes ni ubicaciones concretas.',
  '- Distingue lo observado de las hipótesis; formula las causas como posibles explicaciones.',
  '- El radar no mide la cosecha. La humedad NISAR SME2 es de los ~5 cm superficiales, es un producto PROVISIONAL (no totalmente calibrado) y no equivale a necesidad de riego.',
  '- El NDVI y el NDMI son ópticos (Sentinel-2), no NISAR. Los datos de suelo de SoilGrids son modelados, no medidos en campo.',
  '- La aptitud por cultivo se basa en requisitos generales (FAO ECOCROP) y supuestos de secano; no está validada con rendimientos.',
  '- Escribe las fechas solo en formato numérico estadounidense (MM/DD/AAAA), como en los datos.',
  '- Los valores de referencia de los cultivos son los que se te dan (fuentes citadas); no añadas umbrales propios. Si una variable no tiene valor de referencia verificado, no inventes uno: razona de forma cualitativa.',
  '- Las medidas de manejo que propongas son orientativas y generales (sin dosis); recomienda confirmarlas con un técnico y con análisis de campo.',
  '- Responde en español, en Markdown sencillo: títulos con "## ", listas con "- " y **negrita**. Sin tablas. Máximo unas 450 palabras.',
].join('\n')

const PALETTE_HINTS: Record<AnalysisPalette | 'change' | 'suitability', string> = {
  moisture: 'marrón = valores bajos (más seco), azul oscuro = valores altos (más húmedo)',
  vegetation: 'marrón = valores bajos, verde oscuro = valores altos',
  radar: 'negro/morado = retrodispersión baja, amarillo claro = alta',
  terrain: 'blanco/verde claro = valores bajos, marrón oscuro = altos',
  soil: 'crema = valores bajos, rojo oscuro = altos',
  heat: 'azul = valores bajos, rojo = altos',
  change: 'rojo = disminuye, blanco = sin cambio, azul = aumenta',
  suitability: 'violeta = menos apto, verde = más apto',
}

export function fmt(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 's/d'
  return Number(value.toFixed(decimals)).toString()
}

function usDate(value: string): string {
  return formatUsDate(value, value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 's/d'
  return `${Math.round(value * 100)} %`
}

export interface ZoneInfo {
  name: string
  description?: string
}

export interface ContextVariable {
  title: string
  unit: string
  mean: number | null
  p10: number | null
  p90: number | null
}

export interface CropSummary {
  name: string
  scientificName: string
  assumptions: string
  method?: string
  sourceLabel: string
  suitabilityMean: number | null
  suitabilityP10?: number | null
  suitabilityP90?: number | null
  bins: SuitabilityBin[]
  factors: {
    label: string
    requirement: string
    mean: number | null
    p10?: number | null
    p90?: number | null
    classes?: RequirementClasses | null
    shares?: ClassShares | null
    /** Valor observado en la zona de las variables del factor (p. ej. «pH del suelo: media 7.62 (p10–p90 7.3–7.9)»). */
    observed?: string[]
  }[]
  limiting: LimitingShare[]
  unlimited: number
  /** Requisitos citados que no entran en el mapa (p. ej. solo cualitativos). */
  otherRequirements?: { label: string; requirement: string; reason?: string | null }[]
  /** Variables del cubo sin valor de referencia verificado para este cultivo. */
  unverified?: string[]
  /** Aptitud media por partes de la zona (cuadrantes, franjas de altitud…). */
  byArea?: { label: string; mean: number | null }[]
}

export interface VariableReportContext {
  zone: ZoneInfo
  variable: {
    title: string
    unit: string
    description: string
    caveat: string
    product: string
    maturity?: string
    palette: AnalysisPalette
  }
  /** `commonFraction`: parte de la zona con dato en todas las fechas, sobre la que se calculan las estadísticas. */
  range: { from: string; to: string; shown: number; available: number; commonFraction?: number }
  points: {
    date: string
    mean: number | null
    median: number | null
    p10: number | null
    p90: number | null
    validFraction: number
    rainPrev7d: number | null
  }[]
  trend: TrendResult
  change: (ChangeSummary & { from: string; to: string }) | null
  climate: ClimateSummary
  zoneContext: ContextVariable[]
  crop: CropSummary | null
  /** Valor de referencia del cultivo elegido para esta variable (null en el análisis general). */
  requirement?: RequirementContext | null
  /** Reparto en la zona de la media del intervalo. */
  spatial?: { histogram: HistogramBin[]; byArea: { label: string; mean: number | null }[] } | null
  decimals: number
}

/** Factores con su fracción limitante, de más a menos limitante (el modelo los lee en ese orden). */
function orderedFactors(crop: CropSummary): { factor: CropSummary['factors'][number]; share: number }[] {
  return crop.factors
    .map((factor) => ({
      factor,
      share: crop.limiting.find((candidate) => candidate.label === factor.label)?.fraction ?? 0,
    }))
    .sort((a, b) => b.share - a.share || (a.factor.mean ?? 1) - (b.factor.mean ?? 1))
}

function cropBlock(crop: CropSummary): string {
  const lines = [
    `Cultivo: ${crop.name} (${crop.scientificName}). Supuestos: ${crop.assumptions}`,
    crop.method ? `Método de aptitud: ${crop.method}` : '',
    `Fuente de requisitos: ${crop.sourceLabel}`,
    `Aptitud global (0 = no apto, 1 = óptimo): media ${fmt(crop.suitabilityMean, 2)}${
      crop.suitabilityP10 !== undefined ? `, p10–p90 ${fmt(crop.suitabilityP10, 2)}–${fmt(crop.suitabilityP90, 2)}` : ''
    }.`,
    `Superficie por tramos de aptitud: ${crop.bins.map((bin) => `${bin.label}: ${pct(bin.fraction)}`).join('; ')}.`,
    'Factores (puntuación 0–1 donde 1 = el factor no limita), ordenados de más a menos limitante:',
    ...orderedFactors(crop).map(
      ({ factor, share }) =>
        `- ${factor.label}: media ${fmt(factor.mean, 2)}${
          factor.p10 !== undefined ? ` (p10–p90 ${fmt(factor.p10, 2)}–${fmt(factor.p90, 2)})` : ''
        }; es el factor limitante en el ${pct(share)} de la superficie. ${
          factor.classes ? `Tramos: ${classesText(factor.classes)}.` : `Requisito: ${factor.requirement}`
        }${factor.observed?.length ? ` Valor observado en la zona: ${factor.observed.join('; ')}.` : ''}${
          factor.shares ? ` Superficie por tramo: ${sharesText(factor.shares)}.` : ''
        }`,
    ),
    `Superficie sin ningún factor limitante: ${pct(crop.unlimited)}.`,
  ]
  if (crop.otherRequirements?.length) {
    lines.push(
      'Requisitos citados que no entran en el mapa:',
      ...crop.otherRequirements.map((item) => `- ${item.label}: ${item.requirement}${item.reason ? ` (${item.reason})` : ''}`),
    )
  }
  if (crop.unverified?.length) {
    lines.push(`Variables sin valor de referencia verificado para este cultivo (no entran en el mapa): ${crop.unverified.join(', ')}.`)
  }
  if (crop.byArea?.length) {
    lines.push(`Aptitud media por partes de la zona: ${crop.byArea.map((area) => `${area.label} ${fmt(area.mean, 2)}`).join('; ')}.`)
  }
  return lines.filter(Boolean).join('\n')
}

function classesText(classes: RequirementClasses): string {
  return `óptimo ${classes.optimal}; aceptable ${classes.acceptable}; no apto ${classes.unsuitable}`
}

function sharesText(shares: ClassShares): string {
  return `óptimo ${pct(shares.optimal)}, aceptable ${pct(shares.acceptable)}, no apto ${pct(shares.unsuitable)}`
}

/** Valor de referencia de la variable para el cultivo elegido (fijo, del cubo; no lo genera el modelo). */
export interface RequirementContext {
  cropName: string
  /** null: no hay valor de referencia verificado para esta variable y este cultivo. */
  label: string | null
  requirement: string | null
  classes: RequirementClasses | null
  source: string | null
  /** Reparto de la zona por tramos según la puntuación del factor (si entra en el mapa). */
  shares: ClassShares | null
  inMap: boolean
}

function requirementBlock(context: RequirementContext): string {
  if (!context.label || !context.requirement) {
    return `Valor de referencia para el ${context.cropName.toLowerCase()}: no hay un valor de referencia verificado para esta variable; es un indicador del estado del terreno o del cultivo, no un requisito agronómico.`
  }
  return [
    `Valor de referencia para el ${context.cropName.toLowerCase()} (${context.label}; fuente: ${context.source}): ${context.requirement}`,
    context.classes ? `Tramos: ${classesText(context.classes)}.` : '',
    context.shares ? `Superficie de la zona en cada tramo: ${sharesText(context.shares)}.` : '',
    context.inMap ? '' : 'Este requisito no entra en el mapa de aptitud.',
  ]
    .filter(Boolean)
    .join('\n')
}

function spatialLines(
  spatial: { histogram: HistogramBin[]; byArea: { label: string; mean: number | null }[] } | null | undefined,
  unit: string,
  decimals: number,
  label: string,
): string[] {
  if (!spatial) return []
  const lines = [
    `Reparto de la superficie con dato por tramos${label} (${unit}): ${spatial.histogram
      .map((bin) => `${fmt(bin.from, decimals)}–${fmt(bin.to, decimals)}: ${pct(bin.fraction)}`)
      .join('; ')}.`,
  ]
  if (spatial.byArea.length) {
    lines.push(`Media por partes de la zona${label}: ${spatial.byArea.map((area) => `${area.label} ${fmt(area.mean, decimals)}`).join('; ')}.`)
  }
  return lines
}

/** Tarea común a los informes de una variable: con cultivo o análisis general. */
function variableTask(cropName: string | null, temporal: boolean): string[] {
  if (cropName) {
    const crop = cropName.toLowerCase()
    return [
      `Tarea: interpreta esta variable para el ${crop}, comparándola con su valor de referencia si lo hay.`,
      `Estructura: ## Interpretación de los datos${temporal ? ' (incluye la evolución en el tiempo)' : ''}, ## Reparto en la zona, ## Posibles causas (hipótesis), ## Conclusión para el ${crop} (clara y breve).`,
    ]
  }
  return [
    'Tarea: explica la variable y lo que dicen sus datos en esta zona.',
    `Estructura: ## Qué es esta variable, ## Importancia para los cultivos, ## Interpretación de los datos${temporal ? ' (incluye la evolución en el tiempo y el reparto en la zona)' : ' (incluye el reparto en la zona)'}.`,
  ]
}

function contextBlock(items: ContextVariable[]): string {
  if (items.length === 0) return ''
  return [
    'Contexto estático de la zona (media y p10–p90):',
    ...items.map((item) => `- ${item.title}: ${fmt(item.mean, 2)} ${item.unit} (${fmt(item.p10, 2)}–${fmt(item.p90, 2)})`),
  ].join('\n')
}

/** Mensajes para interpretar la evolución de una variable (con cultivo opcional). */
export function buildVariableMessages(context: VariableReportContext, images: string[] = []): ChatMessage[] {
  const { variable, range, decimals } = context
  const lines = [
    `Zona de estudio: ${context.zone.name}.${context.zone.description ? ` ${context.zone.description}` : ''}`,
    `Variable: ${variable.title} (${variable.unit}). Producto: ${variable.product}${variable.maturity ? `, madurez ${variable.maturity}` : ''}.`,
    `Qué mide: ${variable.description}`,
    `Cautelas del dato: ${variable.caveat}`,
    `Intervalo: ${usDate(range.from)} → ${usDate(range.to)}; se muestran ${range.shown} de ${range.available} fechas disponibles.`,
    '',
    range.commonFraction !== undefined
      ? `Las estadísticas se calculan sobre la zona común con dato en todas las fechas (${pct(range.commonFraction)} de la superficie), para que los cambios no se deban a diferencias de cobertura.`
      : '',
    'Estadísticas de la zona por fecha (media; mediana; p10–p90; % de la superficie con dato ese día; lluvia de los 7 días previos en mm):',
    ...context.points.map(
      (point) =>
        `- ${usDate(point.date)}: ${fmt(point.mean, decimals)}; ${fmt(point.median, decimals)}; ${fmt(point.p10, decimals)}–${fmt(
          point.p90,
          decimals,
        )}; ${pct(point.validFraction)}; lluvia ${fmt(point.rainPrev7d, 1)}`,
    ),
    '',
    `Tendencia lineal de la media: ${fmt(context.trend.slopePer30Days, decimals)} ${variable.unit} cada 30 días (R² ${fmt(
      context.trend.r2,
      2,
    )}).`,
  ]
  if (context.change) {
    const change = context.change
    lines.push(
      `Cambio celda a celda ${usDate(change.from)} → ${usDate(change.to)}: media ${fmt(change.meanDelta, decimals)} ${variable.unit}; suben ${pct(
        change.increased,
      )}, bajan ${pct(change.decreased)}, estables ${pct(change.stable)} (umbral ±${fmt(change.threshold, decimals)}); celdas comparables ${pct(
        change.comparable,
      )}.`,
    )
  }
  const climate = context.climate
  lines.push(
    `Clima de la zona en el intervalo (${climate.days} días): lluvia total ${fmt(climate.precipitationTotal, 1)} mm en ${
      climate.rainyDays ?? 's/d'
    } días con ≥1 mm; media de máximas ${fmt(climate.tMaxMean, 1)} °C y de mínimas ${fmt(climate.tMinMean, 1)} °C; ET0 acumulada ${fmt(
      climate.et0Total,
      0,
    )} mm.`,
  )
  lines.push(...spatialLines(context.spatial, variable.unit, decimals, ' (media del intervalo)'))
  if (context.requirement) lines.push('', requirementBlock(context.requirement))
  const contextText = contextBlock(context.zoneContext)
  if (contextText) lines.push('', contextText)
  if (context.crop) lines.push('', cropBlock(context.crop))
  if (images.length > 0) {
    lines.push(
      '',
      `Se adjuntan ${images.length} imágenes de la variable en orden cronológico. Colores: ${PALETTE_HINTS[variable.palette]}; transparente = sin dato.`,
    )
  }
  lines.push('', ...variableTask(context.crop?.name ?? context.requirement?.cropName ?? null, true))
  const text = lines.join('\n')
  const content: string | ChatPart[] =
    images.length > 0
      ? [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
      : text
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ]
}

export interface SpatialReportContext {
  zone: ZoneInfo
  variable: VariableReportContext['variable']
  /** Fecha de la imagen; null en capas estáticas (relieve, suelo, climatología). */
  date: string | null
  stats: {
    mean: number | null
    median: number | null
    p10: number | null
    p90: number | null
    min: number | null
    max: number | null
    validFraction: number
  }
  histogram: HistogramBin[]
  byArea: { label: string; mean: number | null }[]
  zoneContext: ContextVariable[]
  crop: CropSummary | null
  requirement?: RequirementContext | null
  decimals: number
}

/** Mensajes para interpretar una variable de una sola imagen: su reparto en el espacio. */
export function buildSpatialMessages(context: SpatialReportContext, image?: string): ChatMessage[] {
  const { variable, stats, decimals } = context
  const lines = [
    `Zona de estudio: ${context.zone.name}.${context.zone.description ? ` ${context.zone.description}` : ''}`,
    `Variable: ${variable.title} (${variable.unit}). Producto: ${variable.product}${variable.maturity ? `, madurez ${variable.maturity}` : ''}.`,
    `Qué mide: ${variable.description}`,
    `Cautelas del dato: ${variable.caveat}`,
    context.date
      ? `Una sola imagen, del ${formatUsDate(context.date, context.date)}: no hay serie temporal; analiza el reparto en el espacio.`
      : 'Capa sin fecha (valor de referencia del terreno, del suelo o del clima medio): analiza el reparto en el espacio.',
    '',
    `Estadísticas de la zona: media ${fmt(stats.mean, decimals)}; mediana ${fmt(stats.median, decimals)}; p10–p90 ${fmt(
      stats.p10,
      decimals,
    )}–${fmt(stats.p90, decimals)}; mínimo–máximo ${fmt(stats.min, decimals)}–${fmt(stats.max, decimals)}; superficie con dato ${pct(
      stats.validFraction,
    )}.`,
    ...spatialLines({ histogram: context.histogram, byArea: context.byArea }, variable.unit, decimals, ''),
  ]
  if (context.requirement) lines.push('', requirementBlock(context.requirement))
  const contextText = contextBlock(context.zoneContext)
  if (contextText) lines.push('', contextText)
  if (context.crop) lines.push('', cropBlock(context.crop))
  if (image) {
    lines.push('', `Se adjunta la imagen de la variable. Colores: ${PALETTE_HINTS[variable.palette]}; transparente = sin dato.`)
  }
  lines.push('', ...variableTask(context.crop?.name ?? context.requirement?.cropName ?? null, false))
  const text = lines.join('\n')
  const content: string | ChatPart[] = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] : text
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ]
}

export interface CropReportContext {
  zone: ZoneInfo
  crop: CropSummary
  zoneContext: ContextVariable[]
}

/** Mensajes para interpretar el mapa de aptitud de un cultivo. */
export function buildCropMessages(context: CropReportContext, image?: string): ChatMessage[] {
  // Sin el contexto estático: los valores observados de cada factor ya van junto a sus tramos y el
  // texto debe caber en el contexto por defecto de los modelos locales (4096 tokens en Ollama).
  const lines = [
    `Zona de estudio: ${context.zone.name}.${context.zone.description ? ` ${context.zone.description}` : ''}`,
    cropBlock(context.crop),
  ]
  if (image) lines.push('', `Se adjunta el mapa de aptitud (${PALETTE_HINTS.suitability}; norte arriba; transparente = sin dato).`)
  const crop = context.crop.name.toLowerCase()
  lines.push(
    '',
    'Compara el valor observado de cada factor con sus tramos para decir si está por encima o por debajo del óptimo.',
    `Tarea: analiza los valores y el mapa de aptitud para el ${crop}: por qué la zona es más o menos apta, debido a qué variables, qué impacto puede tener en el cultivo y cómo podría remediarse.`,
    `Estructura: ## Resumen de la aptitud, ## Por qué: variables responsables (de más a menos limitante, con sus tramos y la superficie afectada), ## Dónde es más y menos apto, ## Impacto en el ${crop}, ## Cómo remediarlo (medidas de manejo posibles para cada factor limitante, y qué no se puede corregir).`,
  )
  const text = lines.join('\n')
  const content: string | ChatPart[] = image
    ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }]
    : text
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ]
}

export interface ComparisonReportContext {
  cropName: string
  scientificName: string
  assumptions: string
  zoneA: ZoneCropSummary
  zoneB: ZoneCropSummary
  comparison: CropComparison
}

/** Etiqueta neutra de cada zona: el informe no nombra la provincia del recuadro. */
function zoneLabel(side: Side): string {
  return `Zona ${side}`
}

function zoneSummaryBlock(side: Side, zone: ZoneCropSummary): string {
  const where = zone.basis === 'farmland' ? 'superficie agrícola' : 'recuadro completo'
  return [
    `${zoneLabel(side)}: estadísticas sobre la ${where}${
      zone.farmlandShare !== null ? ` (${pct(zone.farmlandShare)} del recuadro es agrícola)` : ''
    }.`,
    `Aptitud media ${fmt(zone.mean, 2)} (p10–p90 ${fmt(zone.p10, 2)}–${fmt(zone.p90, 2)}); superficie apta (S1 + S2, ≥ 0,60): ${pct(zone.suitableShare)}; sin ningún factor limitante: ${pct(zone.unlimited)}.`,
    `Superficie por tramos de aptitud en la zona ${side}: ${zone.bins.map((bin) => `${bin.label}: ${pct(bin.fraction)}`).join('; ')}.`,
  ].join('\n')
}

function factorLine(factor: FactorComparison): string {
  const side = (label: Side, summary: FactorComparison['a']) =>
    summary
      ? `${zoneLabel(label)}: puntuación ${fmt(summary.mean, 2)}, limita en el ${pct(summary.limiting)}${
          summary.observed.length ? `, observado ${summary.observed.join('; ')}` : ''
        }`
      : `${zoneLabel(label)}: sin dato`
  const favors = factor.favors === 'tie' ? 'similar en ambas' : `favorece a la zona ${factor.favors}`
  return `- ${factor.label} (${favors}). ${side('A', factor.a)}. ${side('B', factor.b)}.${
    factor.classes ? ` Tramos: ${classesText(factor.classes)}.` : ''
  }`
}

/** Mensajes para explicar qué zona es mejor para un cultivo; el veredicto ya viene calculado. */
export function buildComparisonMessages(context: ComparisonReportContext): ChatMessage[] {
  const { zoneA, zoneB, comparison } = context
  const crop = context.cropName.toLowerCase()
  const rule =
    comparison.decidedBy === 'share'
      ? `decide la superficie apta (diferencia de ${pct(Math.abs(comparison.shareDelta))})`
      : comparison.decidedBy === 'mean'
        ? `la superficie apta es parecida y decide la aptitud media (diferencia ${fmt(Math.abs(comparison.delta ?? 0), 2)})`
        : 'ni la superficie apta ni la aptitud media difieren lo suficiente'
  const verdict =
    comparison.winner === 'tie'
      ? `Veredicto calculado: la zona A y la zona B son equivalentes para el ${crop}; ${rule}.`
      : `Veredicto calculado: la zona ${comparison.winner} es más apta para el ${crop}; ${rule}.`
  const lines = [
    `Cultivo: ${context.cropName} (${context.scientificName}). Supuestos: ${context.assumptions}`,
    'Aptitud 0 = no apto, 1 = óptimo; es el mínimo de los factores (manda el peor). Clases: S1 ≥ 0,85, S2 0,60–0,85, S3 0,40–0,60, N < 0,40. Puntuación de cada factor 0–1 (1 = no limita).',
    '',
    zoneSummaryBlock('A', zoneA),
    zoneSummaryBlock('B', zoneB),
    '',
    verdict,
    'Factores, de mayor a menor diferencia entre zonas:',
    ...[...comparison.reasons, ...comparison.factors.filter((factor) => factor.favors === 'tie')].map((factor) =>
      factorLine(factor),
    ),
    '',
    `Tarea: explica qué zona es mejor para el ${crop} y por qué, sin cambiar el veredicto calculado. Refiérete a ellas solo como «zona A» y «zona B»: no se sabe ni importa de qué región son.`,
    `Estructura: ## Veredicto, ## Por qué (variables que marcan la diferencia, con sus valores y tramos), ## Qué tienen en común, ## Implicaciones para el ${crop} en cada zona, ## Qué se podría mejorar en la zona menos apta.`,
  ]
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ]
}
