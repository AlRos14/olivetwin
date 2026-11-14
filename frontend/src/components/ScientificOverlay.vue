<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import * as L from 'leaflet'
import type { ActiveOverlay } from '../types/manifest'
import { bboxToLatLngBounds, isUsableBBox } from './map/geo'

/**
 * Capa científica raster de una zona (WP07-03).
 *
 * - `L.imageOverlay` georreferenciado por `overlay.bbox`; nunca por el tamaño del PNG.
 * - Vive en `overlayPane` (por encima de las teselas del mapa base) y es
 *   independiente de la capa base: cambiar PNOA ↔ OSM no lo elimina.
 * - La opacidad se actualiza con `setOpacity`; no se recrea la imagen.
 * - `visible: false` quita la capa del mapa sin destruir su estado: al volver a
 *   `true` se reutiliza la misma instancia.
 * - Cambiar url/bbox/zoneId/layerId reemplaza la imagen anterior; `null` la elimina.
 * - Un error de carga de la imagen emite `image-error(url)` una sola vez.
 */
const props = defineProps<{
  map: L.Map
  overlay: ActiveOverlay | null
}>()

const emit = defineEmits<{
  (event: 'image-error', url: string): void
}>()

interface OverlayState {
  key: string
  layer: L.ImageOverlay
  url: string
  reportError: () => void
  layerErrorHandler: () => void
  element: HTMLImageElement | null
  elementErrorHandler: (() => void) | null
}

let state: OverlayState | null = null

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

/** Identidad de la capa: si cambia cualquiera de estos campos, se recrea. */
function overlayKey(overlay: ActiveOverlay): string {
  return [overlay.zoneId, overlay.layerId, overlay.url, ...overlay.bbox].join('|')
}

function attachElement(current: OverlayState): void {
  const element = current.layer.getElement()
  if (!element || element === current.element) return

  detachElement(current)
  current.element = element
  current.elementErrorHandler = current.reportError
  element.addEventListener('error', current.elementErrorHandler)
}

function detachElement(current: OverlayState): void {
  if (current.element && current.elementErrorHandler) {
    current.element.removeEventListener('error', current.elementErrorHandler)
  }
  current.element = null
  current.elementErrorHandler = null
}

function removeCurrent(): void {
  if (!state) return
  state.layer.off('error', state.layerErrorHandler)
  detachElement(state)
  state.layer.remove()
  state = null
}

function setVisible(current: OverlayState, visible: boolean): void {
  const instance = props.map
  if (visible) {
    if (!instance.hasLayer(current.layer)) current.layer.addTo(instance)
    attachElement(current)
    return
  }
  if (instance.hasLayer(current.layer)) instance.removeLayer(current.layer)
}

function createOverlay(overlay: ActiveOverlay): void {
  let reported = false
  const reportError = () => {
    if (reported) return
    reported = true
    emit('image-error', overlay.url)
  }

  const layer = L.imageOverlay(overlay.url, bboxToLatLngBounds(overlay.bbox), {
    opacity: clampOpacity(overlay.opacity),
    interactive: false,
    className: 'olive-scientific-overlay',
    pane: 'overlayPane',
    alt: 'Capa científica georreferenciada de la zona seleccionada',
  })

  // Leaflet reemite como 'error' el fallo del <img>; el listener del elemento
  // cubre además navegadores/entornos donde solo llega el evento nativo.
  const layerErrorHandler = reportError
  layer.on('error', layerErrorHandler)

  state = {
    key: overlayKey(overlay),
    layer,
    url: overlay.url,
    reportError,
    layerErrorHandler,
    element: null,
    elementErrorHandler: null,
  }

  setVisible(state, overlay.visible)
}

function applyOverlay(next: ActiveOverlay | null): void {
  if (!next || !isUsableBBox(next.bbox)) {
    removeCurrent()
    return
  }

  if (!state || state.key !== overlayKey(next)) {
    removeCurrent()
    createOverlay(next)
    return
  }

  // Misma imagen: opacidad y visibilidad se actualizan sin recrear la capa.
  state.layer.setOpacity(clampOpacity(next.opacity))
  setVisible(state, next.visible)
}

onMounted(() => applyOverlay(props.overlay))

watch(() => props.overlay, (next) => applyOverlay(next), { deep: true })

watch(
  () => props.map,
  (next, previous) => {
    if (!state || next === previous) return
    if (previous.hasLayer(state.layer)) previous.removeLayer(state.layer)
    if (props.overlay?.visible) next.addLayer(state.layer)
  },
)

onBeforeUnmount(removeCurrent)
</script>

<template>
  <span class="olive-map-child" aria-hidden="true" />
</template>
