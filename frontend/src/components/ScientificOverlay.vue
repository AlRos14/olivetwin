<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import * as L from 'leaflet'
import type { ActiveOverlay } from '../types/manifest'
import { bboxToLatLngBounds, isUsableBBox } from './map/geo'
import { locale, t } from '../i18n'

/**
 * Capa científica raster de una zona (WP07-03).
 *
 * - `L.imageOverlay` georreferenciado por `overlay.bbox`; nunca por el tamaño del PNG.
 * - Vive en `overlayPane` (por encima de las teselas del mapa base) y es
 *   independiente de la capa base: cambiar PNOA ↔ OSM no lo elimina.
 * - La opacidad se actualiza con `setOpacity`; no se recrea la imagen.
 * - `visible: false` quita la capa del mapa sin destruir su estado: al volver a
 *   `true` se reutiliza la misma instancia.
 * - Cambiar solo `url` (p. ej. de paso temporal, misma zona/capa/bbox) usa
 *   `setUrl`: no se recrea la capa y se conservan opacidad y visibilidad, así
 *   que la animación no parpadea. Cambiar bbox/zoneId/layerId sí la recrea.
 * - `null` elimina la imagen.
 * - Un error de carga de la imagen emite `image-error(url)` una sola vez por
 *   visualización y por URL; cambiar de URL vuelve a habilitar el aviso.
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
  /** `true` una vez emitido `image-error` para esta visualización de la capa. */
  reported: boolean
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

/** Un fallo por visualización: se reinicia al recrear o re-añadir el overlay. */
function reportOverlayError(current: OverlayState): void {
  if (current.reported) return
  current.reported = true
  emit('image-error', current.url)
}

/**
 * Identidad geométrica de la capa: si cambia zona, capa o bbox, se recrea.
 * La URL queda fuera: un cambio de paso temporal solo actualiza la imagen.
 */
function overlayKey(overlay: ActiveOverlay): string {
  return JSON.stringify([overlay.zoneId, overlay.layerId, ...overlay.bbox])
}

function attachElement(current: OverlayState): void {
  const element = current.layer.getElement()
  if (!element || element === current.element) return

  detachElement(current)
  current.element = element
  current.elementErrorHandler = current.reportError
  element.alt = t('layers.map.overlayAlt')
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
    if (!instance.hasLayer(current.layer)) {
      // Re-añadir la imagen inicia una nueva visualización: un fallo posterior
      // debe volver a informarse aunque ya se emitiera para la anterior.
      current.reported = false
      current.layer.addTo(instance)
    }
    attachElement(current)
    return
  }
  if (instance.hasLayer(current.layer)) instance.removeLayer(current.layer)
}

function createOverlay(overlay: ActiveOverlay): void {
  const layer = L.imageOverlay(overlay.url, bboxToLatLngBounds(overlay.bbox), {
    opacity: clampOpacity(overlay.opacity),
    interactive: false,
    className: 'olive-scientific-overlay',
    pane: 'overlayPane',
    alt: t('layers.map.overlayAlt'),
  })

  // Leaflet reemite como 'error' el fallo del <img>; el listener del elemento
  // cubre además navegadores/entornos donde solo llega el evento nativo.
  const current: OverlayState = {
    key: overlayKey(overlay),
    layer,
    url: overlay.url,
    reported: false,
    reportError: () => reportOverlayError(current),
    layerErrorHandler: () => reportOverlayError(current),
    element: null,
    elementErrorHandler: null,
  }
  layer.on('error', current.layerErrorHandler)

  state = current
  setVisible(current, overlay.visible)
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

  // Misma zona/capa/bbox: un cambio de paso temporal solo cambia la URL.
  // `setUrl` conserva la instancia (y su opacidad/visibilidad) sin parpadeo.
  if (state.url !== next.url) {
    state.url = next.url
    // Cada URL tiene su propio estado de aviso: un fallo de la imagen nueva
    // debe poder informarse aunque la anterior ya hubiera fallado.
    state.reported = false
    state.layer.setUrl(next.url)
  }

  // Misma imagen: opacidad y visibilidad se actualizan sin recrear la capa.
  state.layer.setOpacity(clampOpacity(next.opacity))
  setVisible(state, next.visible)
}

onMounted(() => applyOverlay(props.overlay))

watch(() => props.overlay, (next) => applyOverlay(next), { deep: true })

/** El texto alternativo de la imagen se actualiza al cambiar de idioma. */
watch(locale, () => {
  if (state?.element) state.element.alt = t('layers.map.overlayAlt')
})

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
