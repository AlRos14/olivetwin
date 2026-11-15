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
 * selector de modo ni se cargan datos de muestra.
 *
 * v1.3.0: si la zona declara un cubo de análisis, la pestaña «Análisis» lo
 * explora con `useZoneAnalysis`; «Comparar» enfrenta dos zonas con cubo para un
 * cultivo (`useZoneComparison`); «Capas» mantiene la vista v1.2.0 y es la
 * pestaña inicial.
 *
 * Decisión del responsable de proyecto (2026-11-15): la interfaz no muestra el
 * aviso de cabecera, el panel «Procedencia y calidad» ni los textos de
 * advertencia; el subtítulo (general, no solo humedad) conserva «datos NISAR PROVISIONALES».
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BaseMap, StudyZone, TimeStep } from './types/manifest'
import { useOliveTwinData } from './composables/useOliveTwinData'
import StatusBanner from './components/StatusBanner.vue'
import ZoneSelector from './components/ZoneSelector.vue'
import LayerPanel from './components/LayerPanel.vue'
import LayerLegend from './components/LayerLegend.vue'
import TimeSlider from './components/TimeSlider.vue'
import OliveMap from './components/OliveMap.vue'
import AnalysisControls from './components/AnalysisControls.vue'
import AnalysisWorkspace from './components/AnalysisWorkspace.vue'
import CompareControls from './components/CompareControls.vue'
import CompareWorkspace from './components/CompareWorkspace.vue'
import StoryPanel from './components/StoryPanel.vue'
import { variableLegend, variableOption, type LegendSource } from './components/layerOptions'
import { layerLabel } from './components/variableLabels'
import LayerRelevance from './components/LayerRelevance.vue'
import { useZoneAnalysis } from './composables/useZoneAnalysis'
import { useAnalysisWorkspace } from './composables/useAnalysisWorkspace'
import { useZoneComparison } from './composables/useZoneComparison'
import { useLlmSettings } from './composables/useLlm'
import type { LlmSettings } from './services/llmClient'
import './styles/analysis.css'
import { t } from './i18n'


const {
  vm,
  selectedZone,
  selectedLayer,
  overlay,
  selectZone,
  selectLayer,
  setOpacity,
  setOverlayVisible,
  reload,
  selectTimeStep,
} = useOliveTwinData({ initialMode: 'real' })

const zoneAnalysis = useZoneAnalysis(selectedZone)
const { state: analysisState, analysis, overlay: analysisOverlay } = zoneAnalysis

const llmSettings = useLlmSettings()
const workspace = useAnalysisWorkspace(zoneAnalysis, selectedZone, llmSettings)

function updateLlmSettings(patch: Partial<LlmSettings>): void {
  Object.assign(llmSettings, patch)
}

/**
 * Capas: además de las capas del manifiesto se puede pintar cualquier variable
 * del cubo de análisis, con su línea temporal y su leyenda. `null` = capa del
 * manifiesto (comportamiento v1.2.0).
 */
const capasVariableId = ref<string | null>(null)
const capasVariable = computed(
  () => analysis.value?.variables.find((candidate) => candidate.id === capasVariableId.value) ?? null,
)
const extraVariables = computed(() => (analysis.value?.variables ?? []).map(variableOption))

watch(
  () => selectedZone.value?.id ?? null,
  () => {
    capasVariableId.value = null
  },
)

/**
 * Con cubo de análisis, Capas ofrece solo sus variables y arranca con la
 * variable por defecto (humedad del suelo). Si el cubo falla o la zona no lo
 * tiene, se mantiene la capa del manifiesto (comportamiento v1.2.0).
 */
const capasUsesCube = computed(() => Boolean(selectedZone.value?.analysis) && analysisState.status !== 'error')

watch(
  () => [analysisState.status, analysisState.variableId] as const,
  ([status, variableId]) => {
    if (status === 'ready' && capasVariableId.value === null && variableId) capasVariableId.value = variableId
  },
  { immediate: true },
)

function onSelectLayer(id: Parameters<typeof selectLayer>[0]): void {
  capasVariableId.value = null
  selectLayer(id)
}

function onSelectCapasVariable(id: string | null): void {
  capasVariableId.value = id
  if (id) zoneAnalysis.selectVariable(id)
}

/**
 * Variable visible en Capas para el recuadro «Relevancia». La capa de humedad
 * del manifiesto contiene todas las estimaciones, como `soil-moisture-all`.
 */
const relevanceId = computed<string | null>(() => {
  if (capasVariable.value) return capasVariable.value.id
  if (capasUsesCube.value) return null
  const layer = selectedLayer.value
  if (!layer) return null
  return layer.id === 'soil-moisture' ? 'soil-moisture-all' : layer.id
})

const legendSource = computed<LegendSource | null>(() => {
  if (capasVariable.value) return variableLegend(capasVariable.value)
  if (capasUsesCube.value) return null
  const layer = selectedLayer.value
  return layer ? { ...layer, title: layerLabel(layer), variable: undefined } : null
})

type PanelTab = 'layers' | 'analysis' | 'compare' | 'story'
const PANEL_TABS: { value: PanelTab; label: string }[] = [
  { value: 'layers', label: 'Capas' },
  { value: 'analysis', label: 'Análisis' },
  { value: 'compare', label: 'Comparar' },
  { value: 'story', label: 'Historia' },
]
const activeTab = ref<PanelTab>('layers')
const hasAnalysis = computed(() => Boolean(selectedZone.value?.analysis))

function isTabDisabled(tab: PanelTab): boolean {
  if (tab === 'analysis') return !hasAnalysis.value
  if (tab === 'compare') return comparison.zones.value.length < 2
  return false
}

function tabTitle(tab: PanelTab): string | undefined {
  if (!isTabDisabled(tab)) return undefined
  return tab === 'compare' ? 'Hacen falta dos zonas con análisis publicado' : 'Esta zona no tiene cubo de análisis publicado'
}

function selectTab(tab: PanelTab): void {
  if (!isTabDisabled(tab)) activeTab.value = tab
}

watch(hasAnalysis, (available) => {
  if (!available && activeTab.value === 'analysis') activeTab.value = 'layers'
})

/** Capas e Historia muestran la selección de Capas en el mapa. */
const capasOnMap = computed(() => activeTab.value === 'layers' || activeTab.value === 'story')

/** La capa del manifiesto y la del cubo no se superponen: se pinta una u otra. */
const mapOverlay = computed(() =>
  capasOnMap.value && !capasVariable.value && !capasUsesCube.value ? overlay.value : null,
)
const mapAnalysisOverlay = computed(() => (capasOnMap.value && capasVariable.value ? analysisOverlay.value : null))

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

const comparison = useZoneComparison(zones, llmSettings)

/** Pasos temporales de la selección de Capas (vacío si no hay serie). */
const timeSteps = computed<TimeStep[]>(() => {
  const target = capasVariable.value
  const grid = analysis.value?.grid
  if (target && grid) {
    if (!target.temporal) return []
    return target.steps
      .filter((step) => step.date !== null)
      .map((step) => ({ date: step.date as string, image: step.data, bbox: grid.bbox }))
  }
  if (capasUsesCube.value) return []
  return selectedLayer.value?.timeSteps ?? []
})
const timeIndex = computed(() => (capasVariable.value ? analysisState.stepIndex : vm.selectedTimeIndex))

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
  if (capasVariable.value) zoneAnalysis.selectStep(index)
  else selectTimeStep(index)
}
</script>

<template>
  <div class="ot-layout">
    <div class="ot-map-area">
      <OliveMap
        :base-map="baseMap"
        :zones="zones"
        :selected-zone-id="vm.selectedZoneId"
        :overlay="mapOverlay"
        :analysis-overlay="mapAnalysisOverlay"
        :analysis-opacity="vm.overlayOpacity"
        :analysis-visible="vm.overlayVisible"
        @select-zone="selectZone"
        @basemap-error="onBasemapError"
        @image-error="overlayError = $event"
      />

      <div
        v-if="!isMobile && timeSteps.length >= 2 && activeTab === 'layers'"
        class="ot-time-slider-dock"
      >
        <TimeSlider
          :steps="timeSteps"
          :model-value="timeIndex"
          @update:model-value="onTimeStepChange"
        />
      </div>

      <template v-if="activeTab === 'analysis'">
        <AnalysisWorkspace
          v-if="analysisState.status === 'ready'"
          :workspace="workspace"
          :zone-name="selectedZone?.name ?? ''"
          :zone-series="analysis?.zoneSeries ?? []"
        />
        <div v-else class="ot-workspace" role="region" aria-label="Resultados del análisis">
          <p class="ot-hint" role="status">
            {{ analysisState.status === 'error' ? analysisState.error : 'Cargando el análisis de la zona…' }}
          </p>
        </div>
      </template>

      <CompareWorkspace v-if="activeTab === 'compare'" :comparison="comparison" />
    </div>

    <aside class="ot-panel ot-panel--wide" aria-label="Panel de control de OliveTwin">
      <header class="ot-panel__header">
        <h1 class="ot-panel__title">{{ t('app.title') }}</h1>
        <p class="ot-panel__subtitle">{{ t('app.subtitle') }}</p>
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

      <ZoneSelector
        :zones="zones"
        :model-value="vm.selectedZoneId"
        @update:model-value="selectZone"
      />

      <nav class="ot-tabs" aria-label="Vistas del panel">
        <button
          v-for="tab in PANEL_TABS"
          :key="tab.value"
          type="button"
          class="ot-tabs__tab"
          :class="{ 'is-selected': activeTab === tab.value }"
          :aria-pressed="activeTab === tab.value"
          :disabled="isTabDisabled(tab.value)"
          :title="tabTitle(tab.value)"
          @click="selectTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <AnalysisControls
        v-if="activeTab === 'analysis'"
        :workspace="workspace"
        :status="analysisState.status"
        :error="analysisState.error"
        :settings="llmSettings"
        @update-settings="updateLlmSettings"
      />

      <CompareControls
        v-else-if="activeTab === 'compare'"
        :comparison="comparison"
        :settings="llmSettings"
        @update-settings="updateLlmSettings"
      />

      <StoryPanel v-else-if="activeTab === 'story'" @navigate="selectTab" />

      <template v-else>
        <div v-if="isMobile && timeSteps.length >= 2" class="ot-time-slider-inline">
          <TimeSlider
            :steps="timeSteps"
            :model-value="timeIndex"
            @update:model-value="onTimeStepChange"
          />
        </div>

        <LayerPanel
          :zone="selectedZone"
          :selected-layer-id="vm.selectedLayerId"
          :opacity="vm.overlayOpacity"
          :visible="vm.overlayVisible"
          :base-map="baseMap"
          :extra-variables="extraVariables"
          :selected-variable-id="capasVariableId"
          :show-layers="!capasUsesCube"
          @select-layer="onSelectLayer"
          @select-variable="onSelectCapasVariable"
          @update:opacity="setOpacity"
          @update:visible="setOverlayVisible"
          @update:baseMap="onBaseMapChange"
        />

        <LayerLegend :layer="legendSource" />

        <LayerRelevance :variable-id="relevanceId" />
      </template>
    </aside>
  </div>
</template>
