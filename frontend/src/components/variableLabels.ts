/**
 * Nombres cortos de las variables para la interfaz. Los títulos completos (con
 * producto y fuente) siguen en los datos y se envían al modelo de IA.
 */
import type { AnalysisVariable } from '../types/analysis'
import type { StudyLayer } from '../types/manifest'

const VARIABLE_LABELS: Record<string, string> = {
  'soil-moisture-all': 'Humedad del suelo',
  'soil-moisture': 'Humedad del suelo (fiable)',
  'radar-hh': 'Radar HH',
  'radar-hv': 'Radar HV',
  'radar-hv-hh': 'Relación HV/HH',
  'insar-coherence': 'Coherencia radar',
  ndvi: 'Vegetación (NDVI)',
  ndmi: 'Agua en la vegetación (NDMI)',
  elevation: 'Altitud',
  slope: 'Pendiente',
  'soil-clay': 'Arcilla',
  'soil-sand': 'Arena',
  'soil-soc': 'Carbono orgánico',
  'soil-ph': 'pH del suelo',
  'climate-precip-annual': 'Lluvia anual',
  'climate-tmean-annual': 'Temperatura media',
  'climate-tmin-coldest': 'Mínima del mes más frío',
  'climate-tabsmin': 'Mínima absoluta',
  'landcover-agri': 'Superficie agrícola',
  'landcover-olive': 'Olivar actual',
}

const LAYER_LABELS: Record<string, string> = {
  'soil-moisture': 'Humedad del suelo',
  ndvi: 'Vegetación (NDVI)',
}

export const GROUP_LABELS: Record<string, string> = {
  nisar: 'Humedad y radar',
  optical: 'Vegetación',
  terrain: 'Relieve',
  soil: 'Suelo',
  climate: 'Clima',
  landcover: 'Usos del suelo',
}

/** Quita la fuente entre paréntesis del final de un título largo. */
function stripSource(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '') || title
}

export function variableLabel(variable: Pick<AnalysisVariable, 'id' | 'title'>): string {
  return VARIABLE_LABELS[variable.id] ?? stripSource(variable.title)
}

export function layerLabel(layer: Pick<StudyLayer, 'id' | 'title'>): string {
  return LAYER_LABELS[layer.id] ?? stripSource(layer.title)
}
