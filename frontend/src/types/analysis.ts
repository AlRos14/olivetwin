/**
 * Tipos del cubo de análisis por zona (contrato v1.3.0, aditivo).
 *
 * Owner: WP-04. Fuente de verdad estructural: contracts/analysis.schema.json.
 * Un manifiesto enlaza el cubo con `StudyZone.analysis`; sin ese campo la zona
 * funciona exactamente como en v1.2.0.
 */
import type { BBox } from './manifest'

export type AnalysisGroup = 'nisar' | 'optical' | 'terrain' | 'soil' | 'climate' | 'landcover'
export type AnalysisPalette = 'moisture' | 'vegetation' | 'radar' | 'terrain' | 'soil' | 'heat'
export type SuitabilityAggregate = 'mean' | 'latest' | 'std' | 'static'
export type SuitabilityDirection = 'higher-better' | 'lower-better'

/** Rejilla común de la zona: celdas cuadradas en Web Mercator, fila 0 = norte. */
export interface AnalysisGrid {
  crs: 'EPSG:3857'
  /** Extensión exacta de la rejilla en WGS84 [west, south, east, north]. */
  bbox: BBox
  width: number
  height: number
  cellSizeM: number
  encoding: 'png-uint8-linear'
  nodata: 255
}

export interface AnalysisStats {
  mean: number | null
  median: number | null
  p10: number | null
  p90: number | null
  min: number | null
  max: number | null
  validFraction: number
}

export interface AnalysisProvenance {
  provider: string
  product: string
  processingVersion: string
  license: string
  referenceUrl?: string | null
  maturity?: string
  approvedBy?: string
  note?: string | null
  [extra: string]: unknown
}

export interface AnalysisStep {
  /** ISO 8601; `null` solo en productos estáticos sin fecha de observación. */
  date: string | null
  label?: string
  /** PNG gris de 8 bits relativo a public/ (valor = offset + scale · código). */
  data: string
  stats: AnalysisStats
  provenance?: Record<string, unknown>
}

export interface AnalysisVariable {
  id: string
  title: string
  group: AnalysisGroup
  unit: string
  scale: number
  offset: number
  decimals?: number
  displayRange: [min: number, max: number]
  palette: AnalysisPalette
  temporal: boolean
  description: string
  caveat: string
  status: 'processed_real' | 'synthetic'
  provenance: AnalysisProvenance
  steps: AnalysisStep[]
}

export interface ZoneSeriesPoint {
  date: string
  value: number | null
}

export interface ZoneSeries {
  id: string
  title: string
  unit: string
  chart: 'bar' | 'line'
  caveat?: string
  provenance: AnalysisProvenance
  points: ZoneSeriesPoint[]
}

export interface UnavailableSource {
  id: string
  title: string
  reason: string
}

export interface SuitabilityCriterion {
  variable: string
  aggregate: SuitabilityAggregate
  direction: SuitabilityDirection
  weight: number
  rationale: string
}

export interface SuitabilityDefinition {
  title: string
  note: string
  criteria: SuitabilityCriterion[]
}

/** Ráster 0–1 (o físico) codificado como PNG gris de 8 bits. */
export interface AnalysisRaster {
  data: string
  scale: number
  offset: number
  stats: AnalysisStats
}

/** Tramos legibles de un requisito: óptimo, aceptable y no apto. */
export interface RequirementClasses {
  optimal: string
  acceptable: string
  unsuitable: string
}

/** Fuente de un requisito cuando no es la ficha ECOCROP del cultivo. */
export interface RequirementReference {
  citation: string
  url?: string
  license?: string
}

export interface CropFactor {
  id: string
  label: string
  /** Ids de variables del cubo que usa el factor. */
  variables: string[]
  /** Requisito del cultivo en lenguaje claro, con su fuente. */
  requirement: string
  parameters?: Record<string, unknown>
  classes?: RequirementClasses
  reference?: RequirementReference
  /** Puntuación 0 (no apto) … 1 (óptimo) del factor. */
  raster: AnalysisRaster
}

/** Aptitud por cultivo calculada por el pipeline (contrato v1.3.0, opcional). */
export interface CropSuitability {
  id: string
  name: string
  scientificName: string
  assumptions: string
  method: string
  source: AnalysisProvenance
  /** Puntuación global 0 (no apto) … 1 (óptimo). */
  suitability: AnalysisRaster
  factors: CropFactor[]
  /** Requisitos citados que no entran en el mapa de aptitud. */
  otherRequirements?: OtherRequirement[]
}

export interface OtherRequirement {
  id: string
  label: string
  variables: string[]
  requirement: string
  classes?: RequirementClasses
  reference?: RequirementReference
  /** Por qué no entra en el mapa de aptitud. */
  reason?: string
}

export interface ZoneAnalysis {
  schemaVersion: '1.3.0'
  zoneId: string
  generatedAt: string
  pipeline: { name: string; version: string; [extra: string]: unknown }
  grid: AnalysisGrid
  variables: AnalysisVariable[]
  zoneSeries?: ZoneSeries[]
  unavailable?: UnavailableSource[]
  suitability?: SuitabilityDefinition
  crops?: CropSuitability[]
}
