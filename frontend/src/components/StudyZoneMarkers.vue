<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'
import * as L from 'leaflet'
import type { StudyZone } from '../types/manifest'
import { bboxToLatLngBounds, isUsableBBox } from './map/geo'
import { dataText } from '../i18n/dataText'

/**
 * Contornos de las zonas de estudio (WP07-02).
 *
 * No contiene zonas hardcodeadas: todo sale de la prop `zones`, que proviene del
 * manifiesto activo. Al cambiar `zones` (por ejemplo al pasar de muestra a real)
 * se eliminan TODOS los rectángulos anteriores antes de crear los nuevos.
 *
 * Accesibilidad: las rutas SVG de Leaflet no son enfocables. La selección por
 * teclado se ofrece en `ZoneSelector`; aquí el clic es un atajo de ratón/táctil.
 */
const props = defineProps<{
  map: L.Map
  zones: StudyZone[]
  selectedZoneId: string | null
}>()

const emit = defineEmits<{
  (event: 'select-zone', id: string): void
}>()

interface ZoneRectangle {
  id: string
  rectangle: L.Rectangle
  /** Nombre de la zona ya renderizado en el tooltip; se actualiza al cambiar de idioma. */
  label: HTMLElement
}

let entries: ZoneRectangle[] = []
let attachedMap: L.Map | null = null

const BASE_STYLE: L.PathOptions = {
  color: '#c2410c',
  weight: 2,
  opacity: 0.95,
  dashArray: '6 4',
  fillColor: '#f97316',
  fillOpacity: 0.12,
}

const SELECTED_STYLE: L.PathOptions = {
  color: '#9a3412',
  weight: 3,
  opacity: 1,
  dashArray: undefined,
  fillColor: '#fb923c',
  fillOpacity: 0.24,
}

function styleFor(selected: boolean): L.PathOptions {
  return selected ? { ...SELECTED_STYLE } : { ...BASE_STYLE }
}

function removeEntry(entry: ZoneRectangle): void {
  const { rectangle } = entry
  rectangle.closeTooltip()
  rectangle.unbindTooltip()
  rectangle.off()
  attachedMap?.removeLayer(rectangle)
}

function clearRectangles(): void {
  for (const entry of entries) removeEntry(entry)
  entries = []
}

function syncZones(): void {
  clearRectangles()
  attachedMap = props.map

  for (const zone of props.zones) {
    if (!isUsableBBox(zone.bbox)) continue

    const selected = zone.id === props.selectedZoneId
    const rectangle = L.rectangle(bboxToLatLngBounds(zone.bbox), {
      ...styleFor(selected),
      interactive: true,
    })

    // El nombre llega del manifiesto: se inserta como texto, nunca como HTML.
    const label = document.createElement('span')
    label.className = 'olive-zone-tooltip'
    label.textContent = dataText(zone.name)
    rectangle.bindTooltip(label, { sticky: true, direction: 'top' })
    rectangle.on('click', () => emit('select-zone', zone.id))
    rectangle.addTo(props.map)
    if (selected) rectangle.bringToFront()

    entries.push({ id: zone.id, rectangle, label })
  }
}

function applySelection(): void {
  for (const entry of entries) {
    entry.rectangle.setStyle(styleFor(entry.id === props.selectedZoneId))
    if (entry.id === props.selectedZoneId) entry.rectangle.bringToFront()
  }
}

onMounted(syncZones)

// `deep` cubre tanto una lista nueva (cambio de modo) como ediciones internas.
watch(() => props.zones, syncZones, { deep: true })
watch(() => props.selectedZoneId, applySelection)

/** El nombre de la zona es un texto de datos: se recalcula al cambiar de idioma o catálogo. */
watchEffect(() => {
  // Leer idioma y catálogo (aunque no haya rectángulos todavía) mantiene el
  // efecto suscrito a ambos: los tooltips se actualizan sin recrear el mapa.
  void dataText('')
  for (const entry of entries) {
    const zone = props.zones.find((candidate) => candidate.id === entry.id)
    if (zone) entry.label.textContent = dataText(zone.name)
  }
})

watch(
  () => props.map,
  (next, previous) => {
    if (previous && previous !== next) {
      for (const entry of entries) previous.removeLayer(entry.rectangle)
      entries = []
    }
    attachedMap = next
    syncZones()
  },
)

onBeforeUnmount(clearRectangles)
</script>

<template>
  <span class="olive-map-child" aria-hidden="true" />
</template>
