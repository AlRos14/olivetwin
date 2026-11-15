/**
 * Construcción de los mensajes que se envían al modelo de lenguaje.
 *
 * Se envían datos ya calculados (estadísticas por fecha, tendencia, cambio
 * celda a celda, clima y requisitos del cultivo), no solo imágenes: un modelo
 * interpreta mejor cifras explícitas que colores. Las cautelas científicas van
 * en las instrucciones del sistema para que la interpretación las respete.
 *
 * El prompt se redacta en el idioma activo (inglés por defecto) y los textos
 * que vienen de los datos publicados pasan por `dataText()`. Las fechas van
 * siempre en ISO 8601 (YYYY-MM-DD).
 */
import type { AnalysisPalette } from '../types/analysis'
import type { ChatMessage, ChatPart } from './llmClient'
import { suitabilityBinLabel, type LimitingShare, type SuitabilityBin } from './cropSuitability'
import type { ChangeSummary, ClimateSummary, TrendResult } from './seriesAnalysis'
import { areaMeanLabel, unitLabel } from './seriesAnalysis'
import { formatDate } from './dateFormat'
import type { AreaMean, HistogramBin } from './analysisMath'
import type { RequirementClasses } from '../types/analysis'
import {
  observedText,
  requirementSourceText,
  type ClassShares,
  type ObservedValue,
  type RequirementSource,
} from './cropRequirements'
import type { CropComparison, FactorComparison, Side, ZoneCropSummary } from './cropComparison'
import { locale } from '../i18n'
import { dataText } from '../i18n/dataText'

type PaletteHints = Record<AnalysisPalette | 'change' | 'suitability', string>

interface PromptStrings {
  system: string[]
  palette: PaletteHints
  noData: string

  cropLine: (name: string, scientificName: string, assumptions: string) => string
  methodLine: (method: string) => string
  sourceLine: (source: string) => string
  suitabilityLine: (mean: string, range: string | null) => string
  surfaceByClass: (classes: string) => string
  factorsIntro: string
  factorLine: (args: {
    label: string
    mean: string
    range: string | null
    share: string
    classes: string | null
    requirement: string
    observed: string | null
    shares: string | null
  }) => string
  noLimiting: (pct: string) => string
  otherRequirements: string
  otherRequirementLine: (label: string, requirement: string, reason: string | null) => string
  unverified: (titles: string) => string
  byArea: (areas: string) => string

  classesText: (classes: RequirementClasses) => string
  sharesText: (shares: ClassShares) => string
  noValue: string
  optimal: string
  acceptable: string
  unsuitable: string

  requirementMissing: (crop: string) => string
  requirementLine: (args: { crop: string; label: string; source: string; requirement: string }) => string
  classesLine: (classes: string) => string
  sharesLine: (shares: string) => string
  notInMap: string

  rangeMean: string
  spatialDistribution: (label: string, unit: string, bins: string) => string
  spatialByArea: (label: string, areas: string) => string

  variableTaskWithCrop: (crop: string, temporal: boolean) => string[]
  variableTaskGeneral: (temporal: boolean) => string[]
  contextIntro: string
  contextItem: (title: string, mean: string, unit: string, p10: string, p90: string) => string

  zoneLine: (name: string, description: string | null) => string
  variableLine: (title: string, unit: string, product: string, maturity: string | null) => string
  whatItMeasures: (description: string) => string
  caveats: (caveat: string) => string
  rangeLine: (from: string, to: string, shown: number, available: number) => string
  commonAreaLine: (pct: string) => string
  pointsIntro: string
  pointLine: (args: {
    date: string
    mean: string
    median: string
    p10: string
    p90: string
    coverage: string
    rain: string
  }) => string
  trendLine: (slope: string, unit: string, r2: string) => string
  changeLine: (args: {
    from: string
    to: string
    mean: string
    unit: string
    increased: string
    decreased: string
    stable: string
    threshold: string
    comparable: string
  }) => string
  climateLine: (args: {
    days: number
    total: string
    rainyDays: string
    tMax: string
    tMin: string
    et0: string
  }) => string
  imagesLine: (count: number, palette: string) => string

  singleImageDated: (date: string) => string
  singleImageUndated: string
  statsLine: (args: {
    mean: string
    median: string
    p10: string
    p90: string
    min: string
    max: string
    coverage: string
  }) => string
  imageAttachedLine: (palette: string) => string

  cropImageAttached: (palette: string) => string
  compareFactorsIntro: string
  cropTask: (crop: string) => string
  cropStructure: (crop: string) => string

  compareCropLine: (name: string, scientificName: string, assumptions: string) => string
  compareScaleLine: string
  zoneSummaryStats: (args: {
    mean: string
    p10: string
    p90: string
    suitable: string
    unlimited: string
  }) => string
  zoneSummaryClasses: (side: string, classes: string) => string
  zoneSummaryBasis: (side: string, where: string, farmlandShare: string | null) => string
  compareVerdictTie: (crop: string, rule: string) => string
  compareVerdictWinner: (side: Side, crop: string, rule: string) => string
  compareRuleShare: (delta: string) => string
  compareRuleMean: (delta: string) => string
  compareRuleNone: string
  compareFactorsHeader: string
  compareTask: (crop: string) => string
  compareStructure: (crop: string) => string
  factorComparisonLine: (args: {
    label: string
    favors: string
    a: string
    b: string
    classes: string | null
  }) => string
  factorSide: (args: {
    zone: string
    score: string
    limiting: string
    observed: string | null
  }) => string
  factorSideMissing: (zone: string) => string
  favorsTie: string
  favorsZone: (side: Side) => string
  zoneLabel: (side: Side) => string
  farmland: string
  wholeBox: string
}

const STRINGS: Record<'en' | 'es', PromptStrings> = {
  en: {
    system: [
      'You are a remote-sensing and agronomy analyst helping to interpret data from the NISAR radar mission (NASA-ISRO) and complementary sources over agricultural areas of Spain.',
      'Rules:',
      '- Use only the data you are given. Do not invent figures, dates, sources or specific locations.',
      '- Distinguish observations from hypotheses; frame causes as possible explanations.',
      '- Radar does not measure the harvest. NISAR SME2 moisture is the top ~5 cm, is a PROVISIONAL product (not fully calibrated) and does not equal irrigation need.',
      '- NDVI and NDMI are optical (Sentinel-2), not NISAR. SoilGrids soil data are modelled, not measured in the field.',
      '- Crop suitability is based on general requirements (FAO ECOCROP) and rainfed assumptions; it is not validated against yields.',
      '- Write dates only in ISO 8601 numeric format (YYYY-MM-DD), as in the data.',
      '- The crop reference values are the ones you are given (cited sources); do not add your own thresholds. If a variable has no verified reference value, do not invent one: reason qualitatively.',
      '- Management measures you propose are indicative and general (no doses); recommend confirming them with an agronomist and with field analyses.',
      '- Reply in English, in simple Markdown: headings with "## ", lists with "- " and **bold**. No tables. At most about 450 words.',
    ],
    palette: {
      moisture: 'brown = low values (drier), dark blue = high values (wetter)',
      vegetation: 'brown = low values, dark green = high values',
      radar: 'black/purple = low backscatter, pale yellow = high',
      terrain: 'white/light green = low values, dark brown = high',
      soil: 'cream = low values, dark red = high',
      heat: 'blue = low values, red = high',
      change: 'red = decrease, white = no change, blue = increase',
      suitability: 'violet = less suitable, green = more suitable',
    },
    noData: 'n/a',
    cropLine: (name, scientificName, assumptions) =>
      `Crop: ${name} (${scientificName}). Assumptions: ${assumptions}`,
    methodLine: (method) => `Suitability method: ${method}`,
    sourceLine: (source) => `Requirement source: ${source}`,
    suitabilityLine: (mean, range) =>
      `Overall suitability (0 = unsuitable, 1 = optimal): mean ${mean}${range ? `, p10–p90 ${range}` : ''}.`,
    surfaceByClass: (classes) => `Surface by suitability class: ${classes}.`,
    factorsIntro: 'Factors (score 0–1 where 1 = the factor is not limiting), ordered from most to least limiting:',
    factorLine: ({ label, mean, range, share, classes, requirement, observed, shares }) =>
      `- ${label}: mean ${mean}${range ? ` (p10–p90 ${range})` : ''}; it is the limiting factor on ${share} of the surface. ${
        classes ? `Classes: ${classes}.` : `Requirement: ${requirement}`
      }${observed ? ` Observed value in the area: ${observed}.` : ''}${shares ? ` Surface by class: ${shares}.` : ''}`,
    noLimiting: (pct) => `Surface with no limiting factor: ${pct}.`,
    otherRequirements: 'Cited requirements not included in the map:',
    otherRequirementLine: (label, requirement, reason) =>
      `- ${label}: ${requirement}${reason ? ` (${reason})` : ''}`,
    unverified: (titles) =>
      `Variables with no verified reference value for this crop (not included in the map): ${titles}.`,
    byArea: (areas) => `Mean suitability by parts of the zone: ${areas}.`,
    classesText: (classes) =>
      `optimal ${classes.optimal}; acceptable ${classes.acceptable}; unsuitable ${classes.unsuitable}`,
    sharesText: (shares) =>
      `optimal ${pct(shares.optimal)}, acceptable ${pct(shares.acceptable)}, unsuitable ${pct(shares.unsuitable)}`,
    noValue: 'n/a',
    optimal: 'optimal',
    acceptable: 'acceptable',
    unsuitable: 'unsuitable',
    requirementMissing: (crop) =>
      `Reference value for ${crop}: there is no verified reference value for this variable; it is an indicator of land or crop status, not an agronomic requirement.`,
    requirementLine: ({ crop, label, source, requirement }) =>
      `Reference value for ${crop} (${label}; source: ${source}): ${requirement}`,
    classesLine: (classes) => `Classes: ${classes}.`,
    sharesLine: (shares) => `Surface of the zone in each class: ${shares}.`,
    notInMap: 'This requirement is not included in the suitability map.',
    rangeMean: ' (range mean)',
    spatialDistribution: (label, unit, bins) =>
      `Distribution of the surface with data by class${label} (${unit}): ${bins}.`,
    spatialByArea: (label, areas) => `Mean by parts of the zone${label}: ${areas}.`,
    variableTaskWithCrop: (crop, temporal) => [
      `Task: interpret this variable for ${crop}, comparing it with its reference value if there is one.`,
      `Structure: ## Data interpretation${temporal ? ' (includes the evolution over time)' : ''}, ## Distribution over the zone, ## Possible causes (hypotheses), ## Conclusion for ${crop} (clear and brief).`,
    ],
    variableTaskGeneral: (temporal) => [
      'Task: explain the variable and what its data say in this area.',
      `Structure: ## What this variable is, ## Importance for crops, ## Data interpretation${temporal ? ' (includes the evolution over time and the distribution over the zone)' : ' (includes the distribution over the zone)'}.`,
    ],
    contextIntro: 'Static context of the area (mean and p10–p90):',
    contextItem: (title, mean, unit, p10, p90) => `- ${title}: ${mean} ${unit} (${p10}–${p90})`,
    zoneLine: (name, description) => `Study area: ${name}.${description ? ` ${description}` : ''}`,
    variableLine: (title, unit, product, maturity) =>
      `Variable: ${title} (${unit}). Product: ${product}${maturity ? `, maturity ${maturity}` : ''}.`,
    whatItMeasures: (description) => `What it measures: ${description}`,
    caveats: (caveat) => `Data caveats: ${caveat}`,
    rangeLine: (from, to, shown, available) =>
      `Range: ${from} → ${to}; showing ${shown} of ${available} available dates.`,
    commonAreaLine: (pctValue) =>
      `Statistics are computed over the common area with data on every date (${pctValue} of the surface), so that changes are not due to coverage differences.`,
    pointsIntro:
      'Zone statistics by date (mean; median; p10–p90; % of the surface with data that day; rainfall in the previous 7 days in mm):',
    pointLine: ({ date, mean, median, p10, p90, coverage, rain }) =>
      `- ${date}: ${mean}; ${median}; ${p10}–${p90}; ${coverage}; rain ${rain}`,
    trendLine: (slope, unit, r2) => `Linear trend of the mean: ${slope} ${unit} every 30 days (R² ${r2}).`,
    changeLine: ({ from, to, mean, unit, increased, decreased, stable, threshold, comparable }) =>
      `Cell-by-cell change ${from} → ${to}: mean ${mean} ${unit}; rising ${increased}, falling ${decreased}, stable ${stable} (threshold ±${threshold}); comparable cells ${comparable}.`,
    climateLine: ({ days, total, rainyDays, tMax, tMin, et0 }) =>
      `Climate of the area over the range (${days} days): total rainfall ${total} mm on ${rainyDays} days with ≥1 mm; mean of maximums ${tMax} °C and of minimums ${tMin} °C; accumulated ET0 ${et0} mm.`,
    imagesLine: (count, palette) =>
      `Attached: ${count} images of the variable in chronological order. Colours: ${palette}; transparent = no data.`,
    singleImageDated: (date) =>
      `A single image, from ${date}: there is no time series; analyse the distribution in space.`,
    singleImageUndated:
      'Layer without a date (terrain, soil or mean-climate reference value): analyse the distribution in space.',
    statsLine: ({ mean, median, p10, p90, min, max, coverage }) =>
      `Area statistics: mean ${mean}; median ${median}; p10–p90 ${p10}–${p90}; minimum–maximum ${min}–${max}; surface with data ${coverage}.`,
    imageAttachedLine: (palette) =>
      `The variable image is attached. Colours: ${palette}; transparent = no data.`,
    cropImageAttached: (palette) =>
      `The suitability map is attached (${palette}; north up; transparent = no data).`,
    compareFactorsIntro:
      'Compare the observed value of each factor with its classes to say whether it is above or below the optimum.',
    cropTask: (crop) =>
      `Task: analyse the values and the suitability map for ${crop}: why the area is more or less suitable, due to which variables, what impact it may have on the crop and how it could be remedied.`,
    cropStructure: (crop) =>
      `Structure: ## Suitability summary, ## Why: responsible variables (from most to least limiting, with their classes and the affected surface), ## Where it is most and least suitable, ## Impact on ${crop}, ## How to remedy it (possible management measures for each limiting factor, and what cannot be corrected).`,
    compareCropLine: (name, scientificName, assumptions) =>
      `Crop: ${name} (${scientificName}). Assumptions: ${assumptions}`,
    compareScaleLine:
      'Suitability 0 = unsuitable, 1 = optimal; it is the minimum of the factors (the worst rules). Classes: S1 ≥ 0.85, S2 0.60–0.85, S3 0.40–0.60, N < 0.40. Factor score 0–1 (1 = not limiting).',
    zoneSummaryStats: ({ mean, p10, p90, suitable, unlimited }) =>
      `Mean suitability ${mean} (p10–p90 ${p10}–${p90}); suitable surface (S1 + S2, ≥ 0.60): ${suitable}; with no limiting factor: ${unlimited}.`,
    zoneSummaryClasses: (side, classes) => `Surface by suitability class in Area ${side}: ${classes}.`,
    zoneSummaryBasis: (side, where, farmlandShare) =>
      `Area ${side}: statistics over the ${where}${farmlandShare ? ` (${farmlandShare} of the box is farmland)` : ''}.`,
    compareVerdictTie: (crop, rule) =>
      `Computed verdict: Area A and Area B are equivalent for ${crop}; ${rule}.`,
    compareVerdictWinner: (side, crop, rule) =>
      `Computed verdict: Area ${side} is more suitable for ${crop}; ${rule}.`,
    compareRuleShare: (delta) => `suitable surface decides (difference of ${delta})`,
    compareRuleMean: (delta) => `suitable surface is similar and mean suitability decides (difference ${delta})`,
    compareRuleNone: 'neither suitable surface nor mean suitability differs enough',
    compareFactorsHeader: 'Factors, from largest to smallest difference between areas:',
    compareTask: (crop) =>
      `Task: explain which area is better for ${crop} and why, without changing the computed verdict. Refer to them only as “Area A” and “Area B”: it is not known or relevant which region they are.`,
    compareStructure: (crop) =>
      `Structure: ## Verdict, ## Why (variables that make the difference, with their values and classes), ## What they have in common, ## Implications for ${crop} in each area, ## What could be improved in the less suitable area.`,
    factorComparisonLine: ({ label, favors, a, b, classes }) =>
      `- ${label} (${favors}). ${a}. ${b}.${classes ? ` Classes: ${classes}.` : ''}`,
    factorSide: ({ zone, score, limiting, observed }) =>
      `${zone}: score ${score}, limiting on ${limiting}${observed ? `, observed ${observed}` : ''}`,
    factorSideMissing: (zone) => `${zone}: no data`,
    favorsTie: 'similar in both',
    favorsZone: (side) => `favours Area ${side}`,
    zoneLabel: (side) => `Area ${side}`,
    farmland: 'farmland',
    wholeBox: 'whole box',
  },
  es: {
    system: [
      'Eres un analista de teledetección y agronomía que ayuda a interpretar datos de la misión radar NISAR (NASA-ISRO) y fuentes complementarias sobre zonas agrícolas de España.',
      'Reglas:',
      '- Usa solo los datos que se te dan. No inventes cifras, fechas, fuentes ni ubicaciones concretas.',
      '- Distingue lo observado de las hipótesis; formula las causas como posibles explicaciones.',
      '- El radar no mide la cosecha. La humedad NISAR SME2 es de los ~5 cm superficiales, es un producto PROVISIONAL (no totalmente calibrado) y no equivale a necesidad de riego.',
      '- El NDVI y el NDMI son ópticos (Sentinel-2), no NISAR. Los datos de suelo de SoilGrids son modelados, no medidos en campo.',
      '- La aptitud por cultivo se basa en requisitos generales (FAO ECOCROP) y supuestos de secano; no está validada con rendimientos.',
      '- Escribe las fechas solo en formato ISO 8601 (AAAA-MM-DD), como en los datos.',
      '- Los valores de referencia de los cultivos son los que se te dan (fuentes citadas); no añadas umbrales propios. Si una variable no tiene valor de referencia verificado, no inventes uno: razona de forma cualitativa.',
      '- Las medidas de manejo que propongas son orientativas y generales (sin dosis); recomienda confirmarlas con un técnico y con análisis de campo.',
      '- Responde en español, en Markdown sencillo: títulos con "## ", listas con "- " y **negrita**. Sin tablas. Máximo unas 450 palabras.',
    ],
    palette: {
      moisture: 'marrón = valores bajos (más seco), azul oscuro = valores altos (más húmedo)',
      vegetation: 'marrón = valores bajos, verde oscuro = valores altos',
      radar: 'negro/morado = retrodispersión baja, amarillo claro = alta',
      terrain: 'blanco/verde claro = valores bajos, marrón oscuro = altos',
      soil: 'crema = valores bajos, rojo oscuro = altos',
      heat: 'azul = valores bajos, rojo = altos',
      change: 'rojo = disminuye, blanco = sin cambio, azul = aumenta',
      suitability: 'violeta = menos apto, verde = más apto',
    },
    noData: 's/d',
    cropLine: (name, scientificName, assumptions) =>
      `Cultivo: ${name} (${scientificName}). Supuestos: ${assumptions}`,
    methodLine: (method) => `Método de aptitud: ${method}`,
    sourceLine: (source) => `Fuente de requisitos: ${source}`,
    suitabilityLine: (mean, range) =>
      `Aptitud global (0 = no apto, 1 = óptimo): media ${mean}${range ? `, p10–p90 ${range}` : ''}.`,
    surfaceByClass: (classes) => `Superficie por tramos de aptitud: ${classes}.`,
    factorsIntro: 'Factores (puntuación 0–1 donde 1 = el factor no limita), ordenados de más a menos limitante:',
    factorLine: ({ label, mean, range, share, classes, requirement, observed, shares }) =>
      `- ${label}: media ${mean}${range ? ` (p10–p90 ${range})` : ''}; es el factor limitante en el ${share} de la superficie. ${
        classes ? `Tramos: ${classes}.` : `Requisito: ${requirement}`
      }${observed ? ` Valor observado en la zona: ${observed}.` : ''}${shares ? ` Superficie por tramo: ${shares}.` : ''}`,
    noLimiting: (value) => `Superficie sin ningún factor limitante: ${value}.`,
    otherRequirements: 'Requisitos citados que no entran en el mapa:',
    otherRequirementLine: (label, requirement, reason) =>
      `- ${label}: ${requirement}${reason ? ` (${reason})` : ''}`,
    unverified: (titles) =>
      `Variables sin valor de referencia verificado para este cultivo (no entran en el mapa): ${titles}.`,
    byArea: (areas) => `Aptitud media por partes de la zona: ${areas}.`,
    classesText: (classes) =>
      `óptimo ${classes.optimal}; aceptable ${classes.acceptable}; no apto ${classes.unsuitable}`,
    sharesText: (shares) =>
      `óptimo ${pct(shares.optimal)}, aceptable ${pct(shares.acceptable)}, no apto ${pct(shares.unsuitable)}`,
    noValue: 's/d',
    optimal: 'óptimo',
    acceptable: 'aceptable',
    unsuitable: 'no apto',
    requirementMissing: (crop) =>
      `Valor de referencia para el ${crop}: no hay un valor de referencia verificado para esta variable; es un indicador del estado del terreno o del cultivo, no un requisito agronómico.`,
    requirementLine: ({ crop, label, source, requirement }) =>
      `Valor de referencia para el ${crop} (${label}; fuente: ${source}): ${requirement}`,
    classesLine: (classes) => `Tramos: ${classes}.`,
    sharesLine: (shares) => `Superficie de la zona en cada tramo: ${shares}.`,
    notInMap: 'Este requisito no entra en el mapa de aptitud.',
    rangeMean: ' (media del intervalo)',
    spatialDistribution: (label, unit, bins) =>
      `Reparto de la superficie con dato por tramos${label} (${unit}): ${bins}.`,
    spatialByArea: (label, areas) => `Media por partes de la zona${label}: ${areas}.`,
    variableTaskWithCrop: (crop, temporal) => [
      `Tarea: interpreta esta variable para el ${crop}, comparándola con su valor de referencia si lo hay.`,
      `Estructura: ## Interpretación de los datos${temporal ? ' (incluye la evolución en el tiempo)' : ''}, ## Reparto en la zona, ## Posibles causas (hipótesis), ## Conclusión para el ${crop} (clara y breve).`,
    ],
    variableTaskGeneral: (temporal) => [
      'Tarea: explica la variable y lo que dicen sus datos en esta zona.',
      `Estructura: ## Qué es esta variable, ## Importancia para los cultivos, ## Interpretación de los datos${temporal ? ' (incluye la evolución en el tiempo y el reparto en la zona)' : ' (incluye el reparto en la zona)'}.`,
    ],
    contextIntro: 'Contexto estático de la zona (media y p10–p90):',
    contextItem: (title, mean, unit, p10, p90) => `- ${title}: ${mean} ${unit} (${p10}–${p90})`,
    zoneLine: (name, description) => `Zona de estudio: ${name}.${description ? ` ${description}` : ''}`,
    variableLine: (title, unit, product, maturity) =>
      `Variable: ${title} (${unit}). Producto: ${product}${maturity ? `, madurez ${maturity}` : ''}.`,
    whatItMeasures: (description) => `Qué mide: ${description}`,
    caveats: (caveat) => `Cautelas del dato: ${caveat}`,
    rangeLine: (from, to, shown, available) =>
      `Intervalo: ${from} → ${to}; se muestran ${shown} de ${available} fechas disponibles.`,
    commonAreaLine: (value) =>
      `Las estadísticas se calculan sobre la zona común con dato en todas las fechas (${value} de la superficie), para que los cambios no se deban a diferencias de cobertura.`,
    pointsIntro:
      'Estadísticas de la zona por fecha (media; mediana; p10–p90; % de la superficie con dato ese día; lluvia de los 7 días previos en mm):',
    pointLine: ({ date, mean, median, p10, p90, coverage, rain }) =>
      `- ${date}: ${mean}; ${median}; ${p10}–${p90}; ${coverage}; lluvia ${rain}`,
    trendLine: (slope, unit, r2) => `Tendencia lineal de la media: ${slope} ${unit} cada 30 días (R² ${r2}).`,
    changeLine: ({ from, to, mean, unit, increased, decreased, stable, threshold, comparable }) =>
      `Cambio celda a celda ${from} → ${to}: media ${mean} ${unit}; suben ${increased}, bajan ${decreased}, estables ${stable} (umbral ±${threshold}); celdas comparables ${comparable}.`,
    climateLine: ({ days, total, rainyDays, tMax, tMin, et0 }) =>
      `Clima de la zona en el intervalo (${days} días): lluvia total ${total} mm en ${rainyDays} días con ≥1 mm; media de máximas ${tMax} °C y de mínimas ${tMin} °C; ET0 acumulada ${et0} mm.`,
    imagesLine: (count, palette) =>
      `Se adjuntan ${count} imágenes de la variable en orden cronológico. Colores: ${palette}; transparente = sin dato.`,
    singleImageDated: (date) =>
      `Una sola imagen, del ${date}: no hay serie temporal; analiza el reparto en el espacio.`,
    singleImageUndated:
      'Capa sin fecha (valor de referencia del terreno, del suelo o del clima medio): analiza el reparto en el espacio.',
    statsLine: ({ mean, median, p10, p90, min, max, coverage }) =>
      `Estadísticas de la zona: media ${mean}; mediana ${median}; p10–p90 ${p10}–${p90}; mínimo–máximo ${min}–${max}; superficie con dato ${coverage}.`,
    imageAttachedLine: (palette) =>
      `Se adjunta la imagen de la variable. Colores: ${palette}; transparente = sin dato.`,
    cropImageAttached: (palette) =>
      `Se adjunta el mapa de aptitud (${palette}; norte arriba; transparente = sin dato).`,
    compareFactorsIntro:
      'Compara el valor observado de cada factor con sus tramos para decir si está por encima o por debajo del óptimo.',
    cropTask: (crop) =>
      `Tarea: analiza los valores y el mapa de aptitud para el ${crop}: por qué la zona es más o menos apta, debido a qué variables, qué impacto puede tener en el cultivo y cómo podría remediarse.`,
    cropStructure: (crop) =>
      `Estructura: ## Resumen de la aptitud, ## Por qué: variables responsables (de más a menos limitante, con sus tramos y la superficie afectada), ## Dónde es más y menos apto, ## Impacto en el ${crop}, ## Cómo remediarlo (medidas de manejo posibles para cada factor limitante, y qué no se puede corregir).`,
    compareCropLine: (name, scientificName, assumptions) =>
      `Cultivo: ${name} (${scientificName}). Supuestos: ${assumptions}`,
    compareScaleLine:
      'Aptitud 0 = no apto, 1 = óptimo; es el mínimo de los factores (manda el peor). Clases: S1 ≥ 0,85, S2 0,60–0,85, S3 0,40–0,60, N < 0,40. Puntuación de cada factor 0–1 (1 = no limita).',
    zoneSummaryStats: ({ mean, p10, p90, suitable, unlimited }) =>
      `Aptitud media ${mean} (p10–p90 ${p10}–${p90}); superficie apta (S1 + S2, ≥ 0,60): ${suitable}; sin ningún factor limitante: ${unlimited}.`,
    zoneSummaryClasses: (side, classes) => `Superficie por tramos de aptitud en la zona ${side}: ${classes}.`,
    zoneSummaryBasis: (side, where, farmlandShare) =>
      `Zona ${side}: estadísticas sobre la ${where}${farmlandShare ? ` (${farmlandShare} del recuadro es agrícola)` : ''}.`,
    compareVerdictTie: (crop, rule) =>
      `Veredicto calculado: la zona A y la zona B son equivalentes para el ${crop}; ${rule}.`,
    compareVerdictWinner: (side, crop, rule) =>
      `Veredicto calculado: la zona ${side} es más apta para el ${crop}; ${rule}.`,
    compareRuleShare: (delta) => `decide la superficie apta (diferencia de ${delta})`,
    compareRuleMean: (delta) =>
      `la superficie apta es parecida y decide la aptitud media (diferencia ${delta})`,
    compareRuleNone: 'ni la superficie apta ni la aptitud media difieren lo suficiente',
    compareFactorsHeader: 'Factores, de mayor a menor diferencia entre zonas:',
    compareTask: (crop) =>
      `Tarea: explica qué zona es mejor para el ${crop} y por qué, sin cambiar el veredicto calculado. Refiérete a ellas solo como «zona A» y «zona B»: no se sabe ni importa de qué región son.`,
    compareStructure: (crop) =>
      `Estructura: ## Veredicto, ## Por qué (variables que marcan la diferencia, con sus valores y tramos), ## Qué tienen en común, ## Implicaciones para el ${crop} en cada zona, ## Qué se podría mejorar en la zona menos apta.`,
    factorComparisonLine: ({ label, favors, a, b, classes }) =>
      `- ${label} (${favors}). ${a}. ${b}.${classes ? ` Tramos: ${classes}.` : ''}`,
    factorSide: ({ zone, score, limiting, observed }) =>
      `${zone}: puntuación ${score}, limita en el ${limiting}${observed ? `, observado ${observed}` : ''}`,
    factorSideMissing: (zone) => `${zone}: sin dato`,
    favorsTie: 'similar en ambas',
    favorsZone: (side) => `favorece a la zona ${side}`,
    zoneLabel: (side) => (side === 'A' ? 'Zona A' : 'Zona B'),
    farmland: 'superficie agrícola',
    wholeBox: 'recuadro completo',
  },
}

function strings(): PromptStrings {
  return STRINGS[locale.value]
}

/** Instrucciones del sistema en el idioma activo (incluidas las cautelas científicas). */
export function systemPrompt(): string {
  return strings().system.join('\n')
}

export function fmt(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return strings().noData
  return Number(value.toFixed(decimals)).toString()
}

/** Fechas del prompt: ISO 8601 (YYYY-MM-DD) en todos los idiomas. */
function isoDate(value: string): string {
  return formatDate(value, value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return strings().noData
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
    /** Valor observado en la zona de las variables del factor (sin formatear). */
    observed?: ObservedValue[]
  }[]
  limiting: LimitingShare[]
  unlimited: number
  /** Requisitos citados que no entran en el mapa (p. ej. solo cualitativos). */
  otherRequirements?: { label: string; requirement: string; reason?: string | null }[]
  /** Variables del cubo sin valor de referencia verificado para este cultivo. */
  unverified?: string[]
  /** Aptitud media por partes de la zona (cuadrantes, franjas de altitud…). */
  byArea?: AreaMean[]
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
  spatial?: { histogram: HistogramBin[]; byArea: AreaMean[] } | null
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

function factorsRange(factor: CropSummary['factors'][number]): string | null {
  return factor.p10 !== undefined ? `${fmt(factor.p10, 2)}–${fmt(factor.p90, 2)}` : null
}

function cropBlock(crop: CropSummary): string {
  const text = strings()
  const lines = [
    text.cropLine(dataText(crop.name), dataText(crop.scientificName), dataText(crop.assumptions)),
    crop.method ? text.methodLine(dataText(crop.method)) : '',
    text.sourceLine(dataText(crop.sourceLabel)),
    text.suitabilityLine(
      fmt(crop.suitabilityMean, 2),
      crop.suitabilityP10 !== undefined
        ? `${fmt(crop.suitabilityP10, 2)}–${fmt(crop.suitabilityP90, 2)}`
        : null,
    ),
    text.surfaceByClass(
      crop.bins.map((bin) => `${suitabilityBinLabel(bin.id)}: ${pct(bin.fraction)}`).join('; '),
    ),
    text.factorsIntro,
    ...orderedFactors(crop).map(({ factor, share }) =>
      text.factorLine({
        label: dataText(factor.label),
        mean: fmt(factor.mean, 2),
        range: factorsRange(factor),
        share: pct(share),
        classes: factor.classes ? classesText(factor.classes) : null,
        requirement: dataText(factor.requirement),
        observed: factor.observed?.length ? factor.observed.map(observedText).join('; ') : null,
        shares: factor.shares ? sharesText(factor.shares) : null,
      }),
    ),
    text.noLimiting(pct(crop.unlimited)),
  ]
  if (crop.otherRequirements?.length) {
    lines.push(
      text.otherRequirements,
      ...crop.otherRequirements.map((item) =>
        text.otherRequirementLine(
          dataText(item.label),
          dataText(item.requirement),
          item.reason ? dataText(item.reason) : null,
        ),
      ),
    )
  }
  if (crop.unverified?.length) {
    lines.push(text.unverified(crop.unverified.map(dataText).join(', ')))
  }
  if (crop.byArea?.length) {
    lines.push(text.byArea(crop.byArea.map((area) => `${areaMeanLabel(area)} ${fmt(area.mean, 2)}`).join('; ')))
  }
  return lines.filter(Boolean).join('\n')
}

function classesText(classes: RequirementClasses): string {
  const text = strings()
  return `${text.optimal} ${dataText(classes.optimal)}; ${text.acceptable} ${dataText(classes.acceptable)}; ${
    text.unsuitable
  } ${dataText(classes.unsuitable)}`
}

function sharesText(shares: ClassShares): string {
  const text = strings()
  return `${text.optimal} ${pct(shares.optimal)}, ${text.acceptable} ${pct(shares.acceptable)}, ${
    text.unsuitable
  } ${pct(shares.unsuitable)}`
}

/** Valor de referencia de la variable para el cultivo elegido (fijo, del cubo; no lo genera el modelo). */
export interface RequirementContext {
  cropName: string
  /** null: no hay valor de referencia verificado para esta variable y este cultivo. */
  label: string | null
  requirement: string | null
  classes: RequirementClasses | null
  source: RequirementSource | null
  /** Reparto de la zona por tramos según la puntuación del factor (si entra en el mapa). */
  shares: ClassShares | null
  inMap: boolean
}

function requirementBlock(context: RequirementContext): string {
  const text = strings()
  const crop = dataText(context.cropName).toLowerCase()
  if (!context.label || !context.requirement) return text.requirementMissing(crop)
  return [
    text.requirementLine({
      crop,
      label: dataText(context.label),
      source: context.source ? requirementSourceText(context.source) : text.noData,
      requirement: dataText(context.requirement),
    }),
    context.classes ? text.classesLine(classesText(context.classes)) : '',
    context.shares ? text.sharesLine(sharesText(context.shares)) : '',
    context.inMap ? '' : text.notInMap,
  ]
    .filter(Boolean)
    .join('\n')
}

function spatialLines(
  spatial: { histogram: HistogramBin[]; byArea: AreaMean[] } | null | undefined,
  unit: string,
  decimals: number,
  label: string,
): string[] {
  if (!spatial) return []
  const text = strings()
  const lines = [
    text.spatialDistribution(
      label,
      unitLabel(unit),
      spatial.histogram
        .map((bin) => `${fmt(bin.from, decimals)}–${fmt(bin.to, decimals)}: ${pct(bin.fraction)}`)
        .join('; '),
    ),
  ]
  if (spatial.byArea.length) {
    lines.push(
      text.spatialByArea(
        label,
        spatial.byArea.map((area) => `${areaMeanLabel(area)} ${fmt(area.mean, decimals)}`).join('; '),
      ),
    )
  }
  return lines
}

/** Tarea común a los informes de una variable: con cultivo o análisis general. */
function variableTask(cropName: string | null, temporal: boolean): string[] {
  const text = strings()
  if (cropName) return text.variableTaskWithCrop(dataText(cropName).toLowerCase(), temporal)
  return text.variableTaskGeneral(temporal)
}

function contextBlock(items: ContextVariable[]): string {
  if (items.length === 0) return ''
  const text = strings()
  return [
    text.contextIntro,
    ...items.map((item) =>
      text.contextItem(
        dataText(item.title),
        fmt(item.mean, 2),
        unitLabel(item.unit),
        fmt(item.p10, 2),
        fmt(item.p90, 2),
      ),
    ),
  ].join('\n')
}

/** Mensajes para interpretar la evolución de una variable (con cultivo opcional). */
export function buildVariableMessages(context: VariableReportContext, images: string[] = []): ChatMessage[] {
  const text = strings()
  const { variable, range, decimals } = context
  const lines = [
    text.zoneLine(dataText(context.zone.name), context.zone.description ? dataText(context.zone.description) : null),
    text.variableLine(
      dataText(variable.title),
      unitLabel(variable.unit),
      dataText(variable.product),
      variable.maturity ? dataText(variable.maturity) : null,
    ),
    text.whatItMeasures(dataText(variable.description)),
    text.caveats(dataText(variable.caveat)),
    text.rangeLine(isoDate(range.from), isoDate(range.to), range.shown, range.available),
    '',
    range.commonFraction !== undefined ? text.commonAreaLine(pct(range.commonFraction)) : '',
    text.pointsIntro,
    ...context.points.map((point) =>
      text.pointLine({
        date: isoDate(point.date),
        mean: fmt(point.mean, decimals),
        median: fmt(point.median, decimals),
        p10: fmt(point.p10, decimals),
        p90: fmt(point.p90, decimals),
        coverage: pct(point.validFraction),
        rain: fmt(point.rainPrev7d, 1),
      }),
    ),
    '',
    text.trendLine(fmt(context.trend.slopePer30Days, decimals), unitLabel(variable.unit), fmt(context.trend.r2, 2)),
  ]
  if (context.change) {
    const change = context.change
    lines.push(
      text.changeLine({
        from: isoDate(change.from),
        to: isoDate(change.to),
        mean: fmt(change.meanDelta, decimals),
        unit: unitLabel(variable.unit),
        increased: pct(change.increased),
        decreased: pct(change.decreased),
        stable: pct(change.stable),
        threshold: fmt(change.threshold, decimals),
        comparable: pct(change.comparable),
      }),
    )
  }
  const climate = context.climate
  lines.push(
    text.climateLine({
      days: climate.days,
      total: fmt(climate.precipitationTotal, 1),
      rainyDays: climate.rainyDays === null ? text.noData : String(climate.rainyDays),
      tMax: fmt(climate.tMaxMean, 1),
      tMin: fmt(climate.tMinMean, 1),
      et0: fmt(climate.et0Total, 0),
    }),
  )
  lines.push(...spatialLines(context.spatial, variable.unit, decimals, text.rangeMean))
  if (context.requirement) lines.push('', requirementBlock(context.requirement))
  const contextText = contextBlock(context.zoneContext)
  if (contextText) lines.push('', contextText)
  if (context.crop) lines.push('', cropBlock(context.crop))
  if (images.length > 0) {
    lines.push('', text.imagesLine(images.length, text.palette[variable.palette]))
  }
  lines.push('', ...variableTask(context.crop?.name ?? context.requirement?.cropName ?? null, true))
  const body = lines.join('\n')
  const content: string | ChatPart[] =
    images.length > 0
      ? [{ type: 'text', text: body }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
      : body
  return [
    { role: 'system', content: systemPrompt() },
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
  byArea: AreaMean[]
  zoneContext: ContextVariable[]
  crop: CropSummary | null
  requirement?: RequirementContext | null
  decimals: number
}

/** Mensajes para interpretar una variable de una sola imagen: su reparto en el espacio. */
export function buildSpatialMessages(context: SpatialReportContext, image?: string): ChatMessage[] {
  const text = strings()
  const { variable, stats, decimals } = context
  const lines = [
    text.zoneLine(dataText(context.zone.name), context.zone.description ? dataText(context.zone.description) : null),
    text.variableLine(
      dataText(variable.title),
      unitLabel(variable.unit),
      dataText(variable.product),
      variable.maturity ? dataText(variable.maturity) : null,
    ),
    text.whatItMeasures(dataText(variable.description)),
    text.caveats(dataText(variable.caveat)),
    context.date ? text.singleImageDated(isoDate(context.date)) : text.singleImageUndated,
    '',
    text.statsLine({
      mean: fmt(stats.mean, decimals),
      median: fmt(stats.median, decimals),
      p10: fmt(stats.p10, decimals),
      p90: fmt(stats.p90, decimals),
      min: fmt(stats.min, decimals),
      max: fmt(stats.max, decimals),
      coverage: pct(stats.validFraction),
    }),
    ...spatialLines({ histogram: context.histogram, byArea: context.byArea }, variable.unit, decimals, ''),
  ]
  if (context.requirement) lines.push('', requirementBlock(context.requirement))
  const contextText = contextBlock(context.zoneContext)
  if (contextText) lines.push('', contextText)
  if (context.crop) lines.push('', cropBlock(context.crop))
  if (image) {
    lines.push('', text.imageAttachedLine(text.palette[variable.palette]))
  }
  lines.push('', ...variableTask(context.crop?.name ?? context.requirement?.cropName ?? null, false))
  const body = lines.join('\n')
  const content: string | ChatPart[] = image
    ? [{ type: 'text', text: body }, { type: 'image_url', image_url: { url: image } }]
    : body
  return [
    { role: 'system', content: systemPrompt() },
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
  const text = strings()
  // Sin el contexto estático: los valores observados de cada factor ya van junto a sus tramos y el
  // texto debe caber en el contexto por defecto de los modelos locales (4096 tokens en Ollama).
  const lines = [
    text.zoneLine(dataText(context.zone.name), context.zone.description ? dataText(context.zone.description) : null),
    cropBlock(context.crop),
  ]
  if (image) lines.push('', text.cropImageAttached(text.palette.suitability))
  const crop = dataText(context.crop.name).toLowerCase()
  lines.push('', text.compareFactorsIntro, text.cropTask(crop), text.cropStructure(crop))
  const body = lines.join('\n')
  const content: string | ChatPart[] = image
    ? [{ type: 'text', text: body }, { type: 'image_url', image_url: { url: image } }]
    : body
  return [
    { role: 'system', content: systemPrompt() },
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

function zoneSummaryBlock(side: Side, zone: ZoneCropSummary): string {
  const text = strings()
  return [
    text.zoneSummaryBasis(
      side,
      zone.basis === 'farmland' ? text.farmland : text.wholeBox,
      zone.farmlandShare !== null ? pct(zone.farmlandShare) : null,
    ),
    text.zoneSummaryStats({
      mean: fmt(zone.mean, 2),
      p10: fmt(zone.p10, 2),
      p90: fmt(zone.p90, 2),
      suitable: pct(zone.suitableShare),
      unlimited: pct(zone.unlimited),
    }),
    text.zoneSummaryClasses(
      side,
      zone.bins.map((bin) => `${suitabilityBinLabel(bin.id)}: ${pct(bin.fraction)}`).join('; '),
    ),
  ].join('\n')
}

function factorLine(factor: FactorComparison): string {
  const text = strings()
  const side = (label: Side, summary: FactorComparison['a']) =>
    summary
      ? text.factorSide({
          zone: text.zoneLabel(label),
          score: fmt(summary.mean, 2),
          limiting: pct(summary.limiting),
          observed: summary.observed.length ? summary.observed.map(observedText).join('; ') : null,
        })
      : text.factorSideMissing(text.zoneLabel(label))
  return text.factorComparisonLine({
    label: dataText(factor.label),
    favors: factor.favors === 'tie' ? text.favorsTie : text.favorsZone(factor.favors),
    a: side('A', factor.a),
    b: side('B', factor.b),
    classes: factor.classes ? classesText(factor.classes) : null,
  })
}

/** Mensajes para explicar qué zona es mejor para un cultivo; el veredicto ya viene calculado. */
export function buildComparisonMessages(context: ComparisonReportContext): ChatMessage[] {
  const text = strings()
  const { zoneA, zoneB, comparison } = context
  const crop = dataText(context.cropName).toLowerCase()
  const rule =
    comparison.decidedBy === 'share'
      ? text.compareRuleShare(pct(Math.abs(comparison.shareDelta)))
      : comparison.decidedBy === 'mean'
        ? text.compareRuleMean(fmt(Math.abs(comparison.delta ?? 0), 2))
        : text.compareRuleNone
  const verdict =
    comparison.winner === 'tie'
      ? text.compareVerdictTie(crop, rule)
      : text.compareVerdictWinner(comparison.winner, crop, rule)
  const lines = [
    text.compareCropLine(dataText(context.cropName), dataText(context.scientificName), dataText(context.assumptions)),
    text.compareScaleLine,
    '',
    zoneSummaryBlock('A', zoneA),
    zoneSummaryBlock('B', zoneB),
    '',
    verdict,
    text.compareFactorsHeader,
    ...[...comparison.reasons, ...comparison.factors.filter((factor) => factor.favors === 'tie')].map((factor) =>
      factorLine(factor),
    ),
    '',
    text.compareTask(crop),
    text.compareStructure(crop),
  ]
  return [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: lines.join('\n') },
  ]
}
