import type { BaseMap } from '../../types/manifest'

/** Configuración de una capa base cartográfica (no científica). */
export interface BasemapDefinition {
  /** Plantilla XYZ/TMS. `{-y}` implica TMS: no se usa además `tms: true`. */
  url: string
  /** Atribución visible y enlazada. */
  attribution: string
  maxZoom: number
  maxNativeZoom: number
  /** Las teselas solo existen en España: se ignoran fallos fuera de cobertura. */
  spainOnly?: boolean
  /** Contornos de parcelas (WMS transparente) dibujados encima de los datos. */
  parcels?: ParcelOverlayDefinition
}

/** Capa WMS de contornos de parcelas. */
export interface ParcelOverlayDefinition {
  url: string
  layers: string
  attribution: string
  /** Por debajo de este zoom el servidor no dibuja nada: no se piden teselas. */
  minZoom: number
  /**
   * Píxeles pedidos por píxel de tesela. SIGPAC decide qué dibujar por la
   * escala de la petición; pedir 512 px por tesela de 256 adelanta un nivel de
   * zoom la aparición de los recintos y da líneas nítidas.
   */
  pixelRatio: number
}

const PNOA_URL = 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg'
const PNOA_ATTRIBUTION =
  'PNOA cedido por © <a href="https://pnoa.ign.es" target="_blank" rel="noopener noreferrer">Instituto Geográfico Nacional de España</a>'

/**
 * Capas base de la interfaz (`BaseMap`).
 *
 * PNOA: servicio oficial de ortofoto del IGN/CNIG. Puede fallar o limitar
 * peticiones; por eso la interfaz permite cambiar a OSM y `OliveMap` emite
 * `basemap-error` si se acumulan errores de tesela.
 * OSM: teselas estándar; su política pide atribución enlazada y uso moderado.
 * PNOA + SIGPAC: ortofoto con los recintos agrícolas del SIGPAC (FEGA,
 * servicio WMS público sin restricciones de acceso declaradas).
 */
export const BASEMAPS: Record<BaseMap, BasemapDefinition> = {
  pnoa: {
    url: PNOA_URL,
    attribution: PNOA_ATTRIBUTION,
    maxZoom: 19,
    maxNativeZoom: 19,
    spainOnly: true,
  },
  'pnoa-sigpac': {
    url: PNOA_URL,
    attribution: PNOA_ATTRIBUTION,
    maxZoom: 19,
    maxNativeZoom: 19,
    spainOnly: true,
    parcels: {
      url: 'https://sigpac-hubcloud.es/wms',
      layers: 'AU.Sigpac:recinto',
      attribution:
        'Recintos SIGPAC © <a href="https://www.fega.gob.es" target="_blank" rel="noopener noreferrer">Fondo Español de Garantía Agraria (FEGA)</a>',
      minZoom: 15,
      pixelRatio: 2,
    },
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
  },
}
