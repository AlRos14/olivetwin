<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import * as L from 'leaflet'
import type { AnalysisOverlay } from '../composables/useZoneAnalysis'
import { bboxToLatLngBounds, isUsableBBox } from './map/geo'
import { t } from '../i18n'

/**
 * Capa calculada del cubo de análisis (valor, cambio o índice).
 *
 * La imagen llega como `data:` URL con la rejilla exacta de la zona (una celda
 * por píxel) y se georreferencia por `grid.bbox`; `pixelated` deja ver la
 * resolución real del dato. Cambiar solo la imagen usa `setUrl` para no
 * parpadear.
 */
const props = defineProps<{
  map: L.Map
  overlay: AnalysisOverlay | null
  opacity: number
  visible: boolean
}>()

let layer: L.ImageOverlay | null = null
let layerKey: string | null = null

function keyOf(overlay: AnalysisOverlay): string {
  return JSON.stringify([overlay.key, ...overlay.bbox])
}

function remove(): void {
  layer?.remove()
  layer = null
  layerKey = null
}

function apply(): void {
  const next = props.overlay
  if (!next || !isUsableBBox(next.bbox)) {
    remove()
    return
  }
  const opacity = Math.min(1, Math.max(0, props.opacity))
  if (!layer || layerKey !== keyOf(next)) {
    remove()
    layer = L.imageOverlay(next.url, bboxToLatLngBounds(next.bbox), {
      opacity,
      interactive: false,
      className: 'olive-scientific-overlay olive-analysis-overlay',
      pane: 'overlayPane',
      alt: t('analysis.results.overlayAlt'),
    })
    layerKey = keyOf(next)
  } else {
    layer.setUrl(next.url)
    layer.setOpacity(opacity)
  }
  if (props.visible) {
    if (!props.map.hasLayer(layer)) layer.addTo(props.map)
  } else if (props.map.hasLayer(layer)) {
    props.map.removeLayer(layer)
  }
}

onMounted(apply)
watch(() => [props.overlay, props.opacity, props.visible], apply)
onBeforeUnmount(remove)
</script>

<template>
  <span class="olive-map-child" aria-hidden="true" />
</template>
