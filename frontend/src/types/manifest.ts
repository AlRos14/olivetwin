/**
 * Tipos compartidos del contrato OliveTwin v1.2.0 (interfaz C0).
 *
 * Owner: WP-04. Creado por R1 en C0 como stub congelado; WP-04 lo amplía de forma
 * ADITIVA (nuevos campos opcionales). Cambiar o quitar un campo existente es un
 * cambio de interfaz y requiere revisión de WP-04 y WP-07 (docs/c0-interfaces.md).
 * La v1.2.0 añade la línea temporal opcional (`TimeStep`, `StudyLayer.timeSteps`,
 * `selectedTimeIndex`, `ActiveOverlay.timeIndex/timeStep`); los manifiestos v1.1.0
 * sin `timeSteps` siguen siendo válidos.
 * Fuente de verdad estructural: contracts/manifest.schema.json.
 */

export type DataMode = 'sample' | 'real'
export type BaseMap = 'pnoa' | 'osm' | 'pnoa-sigpac'
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
  acquisitionDate?: string | null
  sceneId?: string | null
  processingVersion: string
  referenceUrl?: string | null
  note?: string | null
  /** Extensiones aditivas (p. ej. maturity, crid, approvedBy en datos NISAR). */
  [extra: string]: unknown
}

/**
 * Paso temporal de una capa (contrato v1.2.0, aditivo). Comparte unidad, rango y leyenda con la capa.
 * La procedencia efectiva de un paso es `{ ...layer.provenance, ...step.provenance }`.
 */
export interface TimeStep {
  /** ISO 8601 (fecha o fecha-hora UTC) de la adquisición. Pasos ordenados de más antiguo a más reciente. */
  date: string
  /** Etiqueta corta opcional para el slider; si falta, la UI formatea `date`. */
  label?: string
  /** Ruta relativa a public/ bajo data/<modo>/ (mismas reglas que layer.image). */
  image: string
  bbox: BBox
  provenance?: Partial<Provenance>
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
  /** Coherencia con datasetMode (sample⇒synthetic, real⇒processed_real): validación de WP-04, no del tipo. */
  status: LayerStatus
  provenance: Provenance
  qualityNote: string
  /**
   * v1.2.0: serie temporal opcional. Si existe, `image`/`bbox` de la capa deben coincidir con el ÚLTIMO
   * paso (paso por defecto), para que un consumidor v1.1 siga mostrando la fecha más reciente.
   */
  timeSteps?: TimeStep[]
}

export interface StudyZone {
  id: string
  name: string
  description?: string
  bbox: BBox
  layers: StudyLayer[]
  /** v1.3.0: ruta relativa a public/ del cubo de análisis (contracts/analysis.schema.json). */
  analysis?: string
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
  /** v1.2.0: índice del paso temporal activo de la capa seleccionada; null si la capa no tiene timeSteps. */
  selectedTimeIndex: number | null
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
  /** v1.2.0: índice del paso activo y el paso en sí (null si la capa no tiene timeSteps). */
  timeIndex?: number | null
  timeStep?: TimeStep | null
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
  /** v1.2.0: selecciona el paso temporal (índice en layer.timeSteps). Fuera de rango o sin timeSteps → se ignora. */
  selectTimeStep(index: number): void
}
