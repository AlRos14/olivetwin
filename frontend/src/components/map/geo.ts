import * as L from 'leaflet'
import type { BBox } from '../../types/manifest'

/** Esquinas Leaflet `[[sur, oeste], [norte, este]]`. */
export type LeafletCorners = [[number, number], [number, number]]

/**
 * Convierte el `bbox` del contrato `[west, south, east, north]` (WGS84) a las
 * esquinas que espera Leaflet: `[[south, west], [north, east]]`.
 *
 * La transformación es pura para poder probarla sin instanciar un mapa.
 */
export function bboxToLeafletCorners(bbox: BBox): LeafletCorners {
  const [west, south, east, north] = bbox
  return [
    [south, west],
    [north, east],
  ]
}

/** `bbox` del contrato → `L.LatLngBounds` para capas y `fitBounds`. */
export function bboxToLatLngBounds(bbox: BBox): L.LatLngBounds {
  return L.latLngBounds(bboxToLeafletCorners(bbox))
}

/**
 * Comprueba que el `bbox` es utilizable para dibujar. La validación semántica
 * completa es de WP-04; aquí solo evitamos pasar geometrías vacías o invertidas
 * a Leaflet (`fitBounds` con bounds no válidos puede lanzar o encuadrar mal).
 */
export function isUsableBBox(bbox: BBox | null | undefined): bbox is BBox {
  if (!bbox || bbox.length !== 4) return false
  if (!bbox.every((value) => Number.isFinite(value))) return false
  const [west, south, east, north] = bbox
  return west < east && south < north
}

/**
 * Encuadre inicial: Península + Baleares. Canarias queda accesible mediante el
 * control «Canarias» de `OliveMap`, sin ampliar el encuadre nacional.
 */
export const SPAIN_VIEW_BOUNDS: BBox = [-9.9, 35.8, 4.6, 43.9]

/** Encuadre del archipiélago canario para el control «Canarias». */
export const CANARIAS_VIEW_BOUNDS: BBox = [-18.5, 27.5, -13.0, 29.5]

/** Opciones comunes de encuadre (padding visual y evitar sobrezoom). */
export const VIEW_FIT_OPTIONS: L.FitBoundsOptions = {
  padding: [24, 24],
  maxZoom: 8,
}

/** Encuadre de una zona seleccionada; el zoom se limita para no pixelar el PNG. */
export const ZONE_FIT_OPTIONS: L.FitBoundsOptions = {
  padding: [28, 28],
  maxZoom: 15,
}
