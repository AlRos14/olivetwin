<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../styles/map.css'
import type { ActiveOverlay, BaseMap, StudyZone } from '../types/manifest'
import { BASEMAPS } from './map/basemaps'
import {
  CANARIAS_VIEW_BOUNDS,
  SPAIN_VIEW_BOUNDS,
  VIEW_FIT_OPTIONS,
  ZONE_FIT_OPTIONS,
  bboxToLatLngBounds,
  isUsableBBox,
} from './map/geo'
import {
  createTileErrorTracker,
  tileTouchesPnoaCoverage,
  type TileCoords,
} from './map/tileErrors'
import StudyZoneMarkers from './StudyZoneMarkers.vue'
import ScientificOverlay from './ScientificOverlay.vue'
import AnalysisOverlay from './AnalysisOverlay.vue'
import type { AnalysisOverlay as AnalysisOverlayData } from '../composables/useZoneAnalysis'

/**
 * Mapa principal OliveTwin (WP07-01).
 *
 * - Mapa base PNOA, OSM o PNOA + recintos SIGPAC; cambiarlo solo sustituye las
 *   capas de teselas, sin recrear el mapa ni tocar el overlay científico.
 * - Vista inicial Península + Baleares; un control propio de Leaflet permite
 *   saltar a Canarias. La navegación NO está restringida a España (el contrato
 *   admite bboxes globales y pueden probarse zonas NISAR fuera del país).
 * - Expone el `L.Map` a `StudyZoneMarkers` y `ScientificOverlay` por props.
 * - No hace fetch, no construye rutas y no importa servicios ni composables.
 */
const props = withDefaults(
  defineProps<{
    baseMap: BaseMap
    zones: StudyZone[]
    selectedZoneId: string | null
    overlay: ActiveOverlay | null
    /** v1.3.0: capa calculada del cubo de análisis (independiente de `overlay`). */
    analysisOverlay?: AnalysisOverlayData | null
    analysisOpacity?: number
    analysisVisible?: boolean
  }>(),
  { analysisOverlay: null, analysisOpacity: 0.8, analysisVisible: true },
)

const emit = defineEmits<{
  (event: 'select-zone', id: string): void
  (event: 'basemap-error', baseMap: BaseMap): void
  (event: 'image-error', url: string): void
}>()

const PARCEL_PANE = 'olive-parcels'

const containerRef = ref<HTMLDivElement | null>(null)
/** `shallowRef` evita que la reactividad profunda de Vue envuelva el mapa de Leaflet. */
const map = shallowRef<L.Map | null>(null)

let baseLayer: L.TileLayer | null = null
let parcelLayer: L.TileLayer.WMS | null = null
let activeBase: BaseMap | null = null
let baseErrorHandler: ((event: L.TileErrorEvent) => void) | null = null
let tileTracker = createTileErrorTracker()

/**
 * Control propio con dos encuadres. Se usa `L.Control` en lugar de botones Vue
 * superpuestos para que respete el posicionamiento, el teclado y los estilos
 * de Leaflet, y para que se elimine junto con el mapa.
 */
class SpainNavControl extends L.Control {
  private readonly goSpain: () => void
  private readonly goCanarias: () => void

  constructor(goSpain: () => void, goCanarias: () => void) {
    super({ position: 'topright' })
    this.goSpain = goSpain
    this.goCanarias = goCanarias
  }

  onAdd(): HTMLElement {
    const container = L.DomUtil.create('div', 'leaflet-bar olive-map-nav')
    container.setAttribute('role', 'group')
    container.setAttribute('aria-label', 'Vistas de España')

    const spainButton = this.createButton(
      'España',
      'Encuadrar la Península y Baleares',
      this.goSpain,
    )
    const canariasButton = this.createButton(
      'Canarias',
      'Encuadrar el archipiélago canario',
      this.goCanarias,
    )
    container.append(spainButton, canariasButton)

    // El clic en el control no debe propagarse al mapa (evita pan/zoom accidental).
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)
    return container
  }

  private createButton(label: string, title: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'olive-map-nav__button'
    button.textContent = label
    button.title = title
    button.setAttribute('aria-label', title)
    L.DomEvent.on(button, 'click', (event) => {
      L.DomEvent.stop(event)
      action()
    })
    return button
  }
}

function viewSpain(): void {
  const instance = map.value
  if (!instance) return
  instance.fitBounds(bboxToLatLngBounds(SPAIN_VIEW_BOUNDS), VIEW_FIT_OPTIONS)
}

function viewCanarias(): void {
  const instance = map.value
  if (!instance) return
  instance.fitBounds(bboxToLatLngBounds(CANARIAS_VIEW_BOUNDS), VIEW_FIT_OPTIONS)
}

/**
 * Aplica el encuadre de la zona activa. Si la selección pasa a `null` (p. ej.
 * cambio de modo) se vuelve a la vista de España. Un id inexistente no fuerza
 * ningún encuadre, para no mover el mapa ante estados transitorios.
 */
function applyZoneView(zoneId: string | null): void {
  const instance = map.value
  if (!instance) return

  if (zoneId === null) {
    viewSpain()
    return
  }

  const zone = props.zones.find((candidate) => candidate.id === zoneId)
  if (!zone || !isUsableBBox(zone.bbox)) return
  instance.fitBounds(bboxToLatLngBounds(zone.bbox), ZONE_FIT_OPTIONS)
}

/**
 * Sustituye la capa base sin recrear el mapa. El overlay científico vive en
 * `overlayPane`, así que quitar/añadir teselas no lo elimina ni lo reordena.
 */
function setBaseLayer(next: BaseMap): void {
  const instance = map.value
  if (!instance) return
  if (activeBase === next && baseLayer) return

  if (baseLayer) {
    if (baseErrorHandler) baseLayer.off('tileerror', baseErrorHandler)
    instance.removeLayer(baseLayer)
    baseLayer = null
    baseErrorHandler = null
  }
  if (parcelLayer) {
    instance.removeLayer(parcelLayer)
    parcelLayer = null
  }

  const definition = BASEMAPS[next]
  const layer = L.tileLayer(definition.url, {
    attribution: definition.attribution,
    maxZoom: definition.maxZoom,
    maxNativeZoom: definition.maxNativeZoom,
  })

  // Nuevo contador por activación: una notificación como máximo por capa.
  tileTracker = createTileErrorTracker()
  const handleTileError = (event: L.TileErrorEvent) => {
    // PNOA solo cubre España: al navegar fuera, sus teselas fallan por diseño.
    // Solo cuentan los fallos de teselas que intersectan la cobertura real.
    // Si el evento no trae coordenadas (entornos de prueba), se contabiliza.
    const coords = (event as Partial<L.TileErrorEvent> | undefined)?.coords as
      | TileCoords
      | undefined
    if (definition.spainOnly && coords && !tileTouchesPnoaCoverage(coords)) return
    if (tileTracker.register()) emit('basemap-error', next)
  }
  layer.on('tileerror', handleTileError)
  layer.addTo(instance)

  if (definition.parcels) {
    const parcels = definition.parcels
    const wms = L.tileLayer.wms(parcels.url, {
      layers: parcels.layers,
      styles: '',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: parcels.attribution,
      minZoom: parcels.minZoom,
      maxZoom: definition.maxZoom,
      pane: PARCEL_PANE,
    })
    const pixels = 256 * parcels.pixelRatio
    wms.wmsParams.width = pixels
    wms.wmsParams.height = pixels
    // Los fallos de contornos no invalidan la ortofoto: no cuentan como error de base.
    wms.addTo(instance)
    parcelLayer = wms
  }

  baseLayer = layer
  baseErrorHandler = handleTileError
  activeBase = next
}

function handleSelectZone(id: string): void {
  emit('select-zone', id)
}

function handleImageError(url: string): void {
  emit('image-error', url)
}

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  const instance = L.map(container, {
    center: [40.2, -3.7],
    zoom: 5,
    minZoom: 2,
    maxZoom: 19,
    // Encuadre global amplio: no restringe la navegación a España.
    maxBounds: L.latLngBounds([
      [-85, -180],
      [85, 180],
    ]),
    maxBoundsViscosity: 0,
    zoomControl: true,
    attributionControl: true,
  })
  map.value = instance
  // Contornos de parcelas por encima de las capas de datos (overlayPane = 400).
  const parcelPane = instance.createPane(PARCEL_PANE)
  parcelPane.style.zIndex = '450'
  parcelPane.style.pointerEvents = 'none'
  instance.addControl(new SpainNavControl(viewSpain, viewCanarias))

  setBaseLayer(props.baseMap)
  applyZoneView(props.selectedZoneId)
})

watch(
  () => props.baseMap,
  (next) => setBaseLayer(next),
)

watch(
  () => props.selectedZoneId,
  (next) => applyZoneView(next),
)

onBeforeUnmount(() => {
  const instance = map.value
  if (!instance) return

  if (baseLayer && baseErrorHandler) {
    baseLayer.off('tileerror', baseErrorHandler)
  }
  baseLayer = null
  baseErrorHandler = null
  activeBase = null
  instance.remove()
  map.value = null
})

// Expuesto para pruebas de integración/QA; no forma parte de la API de props.
defineExpose({ map })
</script>

<template>
  <div class="olive-map-shell">
    <div
      ref="containerRef"
      class="olive-map"
      role="application"
      aria-label="Mapa de España con zonas de estudio y capas científicas"
    />
    <StudyZoneMarkers
      v-if="map"
      :map="map"
      :zones="zones"
      :selected-zone-id="selectedZoneId"
      @select-zone="handleSelectZone"
    />
    <ScientificOverlay v-if="map" :map="map" :overlay="overlay" @image-error="handleImageError" />
    <AnalysisOverlay
      v-if="map"
      :map="map"
      :overlay="analysisOverlay"
      :opacity="analysisOpacity"
      :visible="analysisVisible"
    />
  </div>
</template>
