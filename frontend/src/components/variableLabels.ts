/**
 * Nombres cortos de las variables para la interfaz. Los títulos completos (con
 * producto y fuente) siguen en los datos y se envían al modelo de IA.
 *
 * Las etiquetas viven en el catálogo i18n por id (`layers.variables.*`): así no
 * se duplican los textos de datos en código y la interfaz cambia de idioma sin
 * recargar. Un id desconocido cae al título del dato, sin la fuente entre
 * paréntesis, traducido con `dataText()` cuando exista entrada.
 */
import { t, type MessageKey } from '../i18n'
import { dataText } from '../i18n/dataText'
import type { AnalysisVariable } from '../types/analysis'
import type { StudyLayer } from '../types/manifest'

const VARIABLE_LABEL_KEYS: Record<string, MessageKey> = {
  'soil-moisture-all': 'layers.variables.soilMoistureAll',
  'soil-moisture': 'layers.variables.soilMoisture',
  'radar-hh': 'layers.variables.radarHh',
  'radar-hv': 'layers.variables.radarHv',
  'radar-hv-hh': 'layers.variables.radarHvHh',
  'insar-coherence': 'layers.variables.insarCoherence',
  ndvi: 'layers.variables.ndvi',
  ndmi: 'layers.variables.ndmi',
  elevation: 'layers.variables.elevation',
  slope: 'layers.variables.slope',
  'soil-clay': 'layers.variables.soilClay',
  'soil-sand': 'layers.variables.soilSand',
  'soil-soc': 'layers.variables.soilSoc',
  'soil-ph': 'layers.variables.soilPh',
  'climate-precip-annual': 'layers.variables.climatePrecipAnnual',
  'climate-tmean-annual': 'layers.variables.climateTmeanAnnual',
  'climate-tmin-coldest': 'layers.variables.climateTminColdest',
  'climate-tabsmin': 'layers.variables.climateTabsmin',
  'landcover-agri': 'layers.variables.landcoverAgri',
  'landcover-olive': 'layers.variables.landcoverOlive',
}

const LAYER_LABEL_KEYS: Record<string, MessageKey> = {
  'soil-moisture': 'layers.variables.layerSoilMoisture',
  ndvi: 'layers.variables.ndvi',
}

/**
 * Etiqueta de grupo del cubo. Es un objeto con `getters` (no valores fijos) para
 * que los componentes que ya lo consumen —incluidos los de Análisis— se
 * actualicen al cambiar de idioma sin tocar su código.
 */
/**
 * Getters call t() on each read, so reads inside computed/templates react to the
 * locale. Do NOT spread, copy or cache this object: a copy freezes one language.
 */
export const GROUP_LABELS: Record<string, string> = {
  get nisar() {
    return t('layers.groups.nisar')
  },
  get optical() {
    return t('layers.groups.optical')
  },
  get terrain() {
    return t('layers.groups.terrain')
  },
  get soil() {
    return t('layers.groups.soil')
  },
  get climate() {
    return t('layers.groups.climate')
  },
  get landcover() {
    return t('layers.groups.landcover')
  },
}

/** Quita la fuente entre paréntesis del final de un título largo. */
function stripSource(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '') || title
}

/** Nombre corto por id del catálogo; si el id no está, el título del dato. */
function labelFrom(key: MessageKey | undefined, title: string): string {
  return key ? t(key) : dataText(stripSource(title))
}

export function variableLabel(variable: Pick<AnalysisVariable, 'id' | 'title'>): string {
  return labelFrom(VARIABLE_LABEL_KEYS[variable.id], variable.title)
}

export function layerLabel(layer: Pick<StudyLayer, 'id' | 'title'>): string {
  return labelFrom(LAYER_LABEL_KEYS[layer.id], layer.title)
}
