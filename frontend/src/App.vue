<script setup lang="ts">
/**
 * Composición de la aplicación OliveTwin (INT01).
 *
 * Este archivo solo conecta el estado de datos de WP-04 con los componentes
 * de WP-07; no carga manifiestos, no construye rutas, no crea capas Leaflet y
 * no define reglas científicas. El estado de datos es de solo lectura para la
 * UI y se modifica únicamente a través de las acciones congeladas en C0.
 */
import { computed, ref, watch } from 'vue'
import type { BaseMap, StudyZone } from './types/manifest'
import { useOliveTwinData } from './composables/useOliveTwinData'
import StatusBanner from './components/StatusBanner.vue'
import DataModeSwitch from './components/DataModeSwitch.vue'
import ZoneSelector from './components/ZoneSelector.vue'
import LayerPanel from './components/LayerPanel.vue'
import LayerLegend from './components/LayerLegend.vue'
import DataProvenance from './components/DataProvenance.vue'
import OliveMap from './components/OliveMap.vue'

const appTitle = 'OliveTwin'
const appSubtitle = 'NASA Space Apps 2026 · demo de interfaz'

const {
  vm,
  selectedZone,
  selectedLayer,
  overlay,
  setDataMode,
  selectZone,
  selectLayer,
  setOpacity,
  setOverlayVisible,
  reload,
} = useOliveTwinData()

/** Estado de presentación propio de INT01; no forma parte del contrato de datos. */
const baseMap = ref<BaseMap>('pnoa')
const overlayError = ref<string | null>(null)
const basemapError = ref<BaseMap | null>(null)

/** Aviso persistente cuando la capa activa es sintética (C0 §3). */
const hasSyntheticLayer = computed(
  () => selectedLayer.value?.status === 'synthetic',
)

/**
 * `vm` es `DeepReadonly`; los componentes WP-07 declaran props mutables porque
 * Vue no las congela en tiempo de ejecución. La proyección no copia datos y
 * ninguno de esos componentes muta sus props: solo leen el manifiesto.
 */
const zones = computed<StudyZone[]>(() => vm.zones as unknown as StudyZone[])

/**
 * Un error de imagen deja de aplicar en cuanto el usuario cambia de capa,
 * zona o modo: el aviso no debe sobrevivir a la selección que lo provocó.
 */
watch(
  () => [vm.dataMode, vm.selectedZoneId, vm.selectedLayerId],
  () => {
    overlayError.value = null
  },
)

/** Un error de teselas se descarta al cambiar de mapa base. */
watch(baseMap, () => {
  basemapError.value = null
})

function onBasemapError(failed: BaseMap): void {
  basemapError.value = failed
}

function onBaseMapChange(next: BaseMap): void {
  baseMap.value = next
}
</script>

<template>
  <div class="ot-layout">
    <div class="ot-map-area">
      <OliveMap
        :base-map="baseMap"
        :zones="zones"
        :selected-zone-id="vm.selectedZoneId"
        :overlay="overlay"
        @select-zone="selectZone"
        @basemap-error="onBasemapError"
        @image-error="overlayError = $event"
      />
    </div>

    <aside class="ot-panel" aria-label="Panel de control de OliveTwin">
      <header class="ot-panel__header">
        <h1 class="ot-panel__title">{{ appTitle }}</h1>
        <p class="ot-panel__subtitle">{{ appSubtitle }}</p>
      </header>

      <StatusBanner
        :data-mode="vm.dataMode"
        :load-status="vm.loadStatus"
        :error-message="vm.errorMessage"
        :has-synthetic-layer="hasSyntheticLayer"
        :overlay-error="overlayError"
        :basemap-error="basemapError"
        @retry="reload"
        @switch-basemap="onBaseMapChange"
        @dismiss-overlay-error="overlayError = null"
      />

      <DataModeSwitch
        :model-value="vm.dataMode"
        @update:model-value="setDataMode"
      />

      <ZoneSelector
        :zones="zones"
        :model-value="vm.selectedZoneId"
        @update:model-value="selectZone"
      />

      <LayerPanel
        :zone="selectedZone"
        :selected-layer-id="vm.selectedLayerId"
        :opacity="vm.overlayOpacity"
        :visible="vm.overlayVisible"
        :base-map="baseMap"
        @select-layer="selectLayer"
        @update:opacity="setOpacity"
        @update:visible="setOverlayVisible"
        @update:baseMap="onBaseMapChange"
      />

      <LayerLegend :layer="selectedLayer" />

      <DataProvenance :layer="selectedLayer" :data-mode="vm.dataMode" />
    </aside>
  </div>
</template>
