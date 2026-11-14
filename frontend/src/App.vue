<script setup lang="ts">
/**
 * Composición de la aplicación OliveTwin (INT01).
 *
 * Este archivo solo conecta el estado de datos de WP-04 con los componentes
 * de WP-07; no carga manifiestos, no construye rutas, no crea capas Leaflet y
 * no define reglas científicas. El estado de datos es de solo lectura para la
 * UI y se modifica únicamente a través de las acciones congeladas en C0.
 *
 * Decisión del responsable de proyecto (2026-11-14): la demo publica
 * exclusivamente datos reales NISAR SME2 de Jaén y Toledo. No se ofrece el
 * selector de modo ni se cargan datos de muestra; el componente
 * `DataModeSwitch.vue` permanece en el repositorio sin uso.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BaseMap, StudyZone } from './types/manifest'
import { useOliveTwinData } from './composables/useOliveTwinData'
import StatusBanner from './components/StatusBanner.vue'
import ZoneSelector from './components/ZoneSelector.vue'
import LayerPanel from './components/LayerPanel.vue'
import LayerLegend from './components/LayerLegend.vue'
import DataProvenance from './components/DataProvenance.vue'
import TimeSlider from './components/TimeSlider.vue'
import OliveMap from './components/OliveMap.vue'

const appTitle = 'OliveTwin'
const appSubtitle = 'NISAR L3 SME2 · humedad superficial · datos PROVISIONAL'
const provisionalNotice =
  'Producto NISAR SME2 PROVISIONAL: no totalmente calibrado; humedad superficial ≠ necesidad de riego'

const {
  vm,
  selectedZone,
  selectedLayer,
  activeTimeStep,
  overlay,
  selectZone,
  selectLayer,
  setOpacity,
  setOverlayVisible,
  reload,
  selectTimeStep,
} = useOliveTwinData({ initialMode: 'real' })

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

/** Pasos temporales de la capa activa (vacío si no declara serie). */
const timeSteps = computed(() => selectedLayer.value?.timeSteps ?? [])

/**
 * La línea temporal flota sobre el mapa en escritorio y vive dentro del panel
 * en móvil. Se usa `matchMedia` (y no solo CSS) para montar un único control:
 * dos instancias duplicarían el temporizador y los `id` de los sliders.
 */
const isMobile = ref(false)
let mobileQuery: MediaQueryList | null = null

function syncMobileLayout(): void {
  isMobile.value = mobileQuery?.matches ?? false
}

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  mobileQuery = window.matchMedia('(max-width: 767px)')
  syncMobileLayout()
  mobileQuery.addEventListener('change', syncMobileLayout)
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', syncMobileLayout)
})

/**
 * La demo debe mostrar datos al abrirse: tras la primera carga con zonas se
 * selecciona la primera zona. Las dos zonas siguen visibles en el selector y
 * en el mapa. Si la primera carga falla, un reintento correcto aún puede
 * autoseleccionar (la marca solo se activa con un manifiesto listo).
 *
 * La selección se difiere brevemente: OliveMap encuadra España al montarse con
 * una animación de zoom y un `fitBounds` de zona disparado en ese mismo instante
 * puede quedar cancelado por la animación anterior. El retardo es solo de
 * composición; no retrasa la carga ni oculta estados de error.
 */
const AUTO_SELECT_DELAY_MS = 400
let didAutoSelect = false
let autoSelectTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSelect(): void {
  if (didAutoSelect || autoSelectTimer !== null) return
  if (vm.loadStatus !== 'ready' || vm.zones.length === 0) return
  autoSelectTimer = setTimeout(() => {
    autoSelectTimer = null
    if (didAutoSelect) return
    if (vm.loadStatus !== 'ready' || vm.zones.length === 0) return
    didAutoSelect = true
    if (vm.selectedZoneId === null) selectZone(vm.zones[0]!.id)
  }, AUTO_SELECT_DELAY_MS)
}

watch(
  () => [vm.loadStatus, vm.zones.length, vm.selectedZoneId] as const,
  () => {
    if (didAutoSelect) return
    if (vm.selectedZoneId !== null) {
      didAutoSelect = true
      return
    }
    scheduleAutoSelect()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (autoSelectTimer !== null) clearTimeout(autoSelectTimer)
})

/**
 * Un error de imagen deja de aplicar en cuanto el usuario cambia de capa,
 * zona, modo o paso temporal: el aviso no debe sobrevivir a la URL que lo
 * provocó.
 */
watch(
  () => [vm.dataMode, vm.selectedZoneId, vm.selectedLayerId, vm.selectedTimeIndex],
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

function onTimeStepChange(index: number): void {
  selectTimeStep(index)
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

      <div
        v-if="!isMobile && timeSteps.length >= 2"
        class="ot-time-slider-dock"
      >
        <TimeSlider
          :steps="timeSteps"
          :model-value="vm.selectedTimeIndex"
          @update:model-value="onTimeStepChange"
        />
      </div>
    </div>

    <aside class="ot-panel" aria-label="Panel de control de OliveTwin">
      <header class="ot-panel__header">
        <h1 class="ot-panel__title">{{ appTitle }}</h1>
        <p class="ot-panel__subtitle">{{ appSubtitle }}</p>
        <p class="ot-panel__notice">{{ provisionalNotice }}</p>
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

      <div v-if="isMobile && timeSteps.length >= 2" class="ot-time-slider-inline">
        <TimeSlider
          :steps="timeSteps"
          :model-value="vm.selectedTimeIndex"
          @update:model-value="onTimeStepChange"
        />
      </div>

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

      <DataProvenance
        :layer="selectedLayer"
        :data-mode="vm.dataMode"
        :time-step="activeTimeStep"
      />
    </aside>
  </div>
</template>
