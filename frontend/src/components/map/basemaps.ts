import type { BaseMap } from '../../types/manifest'

/** Configuración de una capa base cartográfica (no científica). */
export interface BasemapDefinition {
  /** Plantilla XYZ/TMS. `{-y}` implica TMS: no se usa además `tms: true`. */
  url: string
  /** Atribución visible y enlazada. */
  attribution: string
  maxZoom: number
  maxNativeZoom: number
}

/**
 * Capas base admitidas por el contrato (`BaseMap = 'pnoa' | 'osm'`).
 *
 * PNOA: servicio oficial de ortofoto del IGN/CNIG. Puede fallar o limitar
 * peticiones; por eso la interfaz permite cambiar a OSM y `OliveMap` emite
 * `basemap-error` si se acumulan errores de tesela.
 * OSM: teselas estándar; su política pide atribución enlazada y uso moderado.
 */
export const BASEMAPS: Record<BaseMap, BasemapDefinition> = {
  pnoa: {
    url: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg',
    attribution:
      'PNOA cedido por © <a href="https://pnoa.ign.es" target="_blank" rel="noopener noreferrer">Instituto Geográfico Nacional de España</a>',
    maxZoom: 19,
    maxNativeZoom: 19,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
  },
}
