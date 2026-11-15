/**
 * Textos breves de «Relevancia» para Capas: qué es cada variable y para qué
 * sirve en el cultivo. Son textos de interfaz y viven en el catálogo i18n
 * (`layers.relevanceTexts.*`); la descripción técnica completa sigue en los
 * datos del cubo.
 */
import { t, type MessageKey } from '../i18n'

export interface VariableRelevance {
  what: string
  crop: string
}

const RELEVANCE_KEYS: Record<string, { what: MessageKey; crop: MessageKey }> = {
  'soil-moisture-all': {
    what: 'layers.relevanceTexts.soilMoistureAll.what',
    crop: 'layers.relevanceTexts.soilMoistureAll.crop',
  },
  'soil-moisture': {
    what: 'layers.relevanceTexts.soilMoisture.what',
    crop: 'layers.relevanceTexts.soilMoisture.crop',
  },
  'radar-hh': {
    what: 'layers.relevanceTexts.radarHh.what',
    crop: 'layers.relevanceTexts.radarHh.crop',
  },
  'radar-hv': {
    what: 'layers.relevanceTexts.radarHv.what',
    crop: 'layers.relevanceTexts.radarHv.crop',
  },
  'radar-hv-hh': {
    what: 'layers.relevanceTexts.radarHvHh.what',
    crop: 'layers.relevanceTexts.radarHvHh.crop',
  },
  'insar-coherence': {
    what: 'layers.relevanceTexts.insarCoherence.what',
    crop: 'layers.relevanceTexts.insarCoherence.crop',
  },
  ndvi: {
    what: 'layers.relevanceTexts.ndvi.what',
    crop: 'layers.relevanceTexts.ndvi.crop',
  },
  ndmi: {
    what: 'layers.relevanceTexts.ndmi.what',
    crop: 'layers.relevanceTexts.ndmi.crop',
  },
  elevation: {
    what: 'layers.relevanceTexts.elevation.what',
    crop: 'layers.relevanceTexts.elevation.crop',
  },
  slope: {
    what: 'layers.relevanceTexts.slope.what',
    crop: 'layers.relevanceTexts.slope.crop',
  },
  'soil-clay': {
    what: 'layers.relevanceTexts.soilClay.what',
    crop: 'layers.relevanceTexts.soilClay.crop',
  },
  'soil-sand': {
    what: 'layers.relevanceTexts.soilSand.what',
    crop: 'layers.relevanceTexts.soilSand.crop',
  },
  'soil-soc': {
    what: 'layers.relevanceTexts.soilSoc.what',
    crop: 'layers.relevanceTexts.soilSoc.crop',
  },
  'soil-ph': {
    what: 'layers.relevanceTexts.soilPh.what',
    crop: 'layers.relevanceTexts.soilPh.crop',
  },
  'climate-precip-annual': {
    what: 'layers.relevanceTexts.climatePrecipAnnual.what',
    crop: 'layers.relevanceTexts.climatePrecipAnnual.crop',
  },
  'climate-tmean-annual': {
    what: 'layers.relevanceTexts.climateTmeanAnnual.what',
    crop: 'layers.relevanceTexts.climateTmeanAnnual.crop',
  },
  'climate-tmin-coldest': {
    what: 'layers.relevanceTexts.climateTminColdest.what',
    crop: 'layers.relevanceTexts.climateTminColdest.crop',
  },
  'climate-tabsmin': {
    what: 'layers.relevanceTexts.climateTabsmin.what',
    crop: 'layers.relevanceTexts.climateTabsmin.crop',
  },
  'landcover-agri': {
    what: 'layers.relevanceTexts.landcoverAgri.what',
    crop: 'layers.relevanceTexts.landcoverAgri.crop',
  },
  'landcover-olive': {
    what: 'layers.relevanceTexts.landcoverOlive.what',
    crop: 'layers.relevanceTexts.landcoverOlive.crop',
  },
}

export function variableRelevance(id: string | null | undefined): VariableRelevance | null {
  const keys = id ? RELEVANCE_KEYS[id] : undefined
  if (!keys) return null
  return { what: t(keys.what), crop: t(keys.crop) }
}
