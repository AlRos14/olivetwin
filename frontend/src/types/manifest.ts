/**
 * Tipos compartidos del contrato OliveTwin v1.1.0 (interfaz C0).
 *
 * Owner: WP-04. Creado por R1 en C0 como stub congelado; WP-04 lo amplía de forma
 * ADITIVA (nuevos campos opcionales). Cambiar o quitar un campo existente es un
 * cambio de interfaz y requiere revisión de WP-04 y WP-07 (docs/c0-interfaces.md).
 * Fuente de verdad estructural: contracts/manifest.schema.json.
 */

export type DataMode = 'sample' | 'real'
export type BaseMap = 'pnoa' | 'osm'
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error'
/** [west, south, east, north] en grados WGS84 (EPSG:4326). */
export type BBox = [west: number, south: number, east: number, north: number]

export type LayerId = 'ndvi' | 'soil-moisture'
export type LayerStatus = 'synthetic' | 'processed_real'

export interface LegendStop {
  value: number
  color: string
  label: string
}

export interface Provenance {
  provider: string
  product: string
  /** ISO 8601 o null. La UI muestra «Fecha no disponible» si es null; nunca inventa una. */
  acquisitionDate: string | null
  sceneId: string | null
  processingVersion: string
  referenceUrl: string | null
  note: string | null
  /** Extensiones aditivas (p. ej. maturity, crid, approvedBy en datos NISAR). */
  [extra: string]: unknown
}

export interface StudyLayer {
  id: LayerId
  title: string
  kind: 'image-overlay'
  variable?: string
  /** Ruta relativa a public/ (sin "/" inicial). Los componentes NO la usan directamente. */
  image: string
  bbox: BBox
  imageCrs: string
  unit: string
  range?: [min: number, max: number]
  legend: LegendStop[]
  status: LayerStatus
  provenance: Provenance
  qualityNote: string
}

export interface StudyZone {
  id: string
  name: string
  description?: string
  bbox: BBox
  layers: StudyLayer[]
}

export interface OliveTwinManifest {
  schemaVersion: string
  datasetMode: DataMode
  appTitle: string
  zones: StudyZone[]
}

/** Estado que WP-04 expone y la UI (WP-07) solo lee. */
export interface OliveTwinViewModel {
  dataMode: DataMode
  loadStatus: ManifestLoadStatus
  zones: StudyZone[]
  selectedZoneId: string | null
  selectedLayerId: string | null
  overlayVisible: boolean
  /** 0…1 (el slider muestra 0…100 %). */
  overlayOpacity: number
  errorMessage: string | null
}

/** Overlay listo para pintar: URL ya resuelta con import.meta.env.BASE_URL. */
export interface ActiveOverlay {
  zoneId: string
  layerId: LayerId
  url: string
  bbox: BBox
  opacity: number
  visible: boolean
  status: LayerStatus
}

/** Acciones de useOliveTwinData(). Nombres y semántica congelados en C0. */
export interface OliveTwinActions {
  /** Cambia de manifiesto; invalida cargas en vuelo, limpia zona/capa y carga el nuevo. */
  setDataMode(mode: DataMode): void
  /** null deselecciona. Un id inexistente en el manifiesto activo se ignora. */
  selectZone(zoneId: string | null): void
  /** null deselecciona. Debe existir en la zona seleccionada del manifiesto activo. */
  selectLayer(layerId: LayerId | null): void
  /** Se recorta a [0, 1]. */
  setOpacity(opacity: number): void
  setOverlayVisible(visible: boolean): void
  /** Recarga el manifiesto del modo actual (p. ej. tras un error). */
  reload(): void
}
