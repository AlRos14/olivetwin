<script setup lang="ts">
import { computed } from 'vue'
import type { BaseMap, DataMode, ManifestLoadStatus } from '../types/manifest'
import '../styles/ui.css'

/**
 * Aviso persistente del estado de los datos. En error nunca se anuncia el
 * modo de muestra: el fallo se comunica tal cual y se ofrece reintentar.
 */
const props = defineProps<{
  dataMode: DataMode
  loadStatus: ManifestLoadStatus
  errorMessage: string | null
  hasSyntheticLayer: boolean
  overlayError: string | null
  basemapError: BaseMap | null
}>()

const emit = defineEmits<{
  retry: []
  'switch-basemap': [baseMap: BaseMap]
  'dismiss-overlay-error': []
}>()

const isError = computed(() => props.loadStatus === 'error')

/** El aviso de datos simulados es persistente, salvo cuando hay un error. */
const showSynthetic = computed(
  () =>
    !isError.value &&
    (props.dataMode === 'sample' || props.hasSyntheticLayer),
)

const isEmpty = computed(() => props.loadStatus === 'empty')
const isLoading = computed(() => props.loadStatus === 'loading')

const pnoaFailed = computed(
  () => props.basemapError === 'pnoa' || props.basemapError === 'pnoa-sigpac',
)

const basemapMessage = computed(() =>
  pnoaFailed.value ? 'La Vista Satelital no responde' : 'La Vista General no responde',
)

const basemapAction = computed<BaseMap>(() => (pnoaFailed.value ? 'osm' : 'pnoa'))

const basemapActionLabel = computed(() =>
  pnoaFailed.value ? 'Usar Vista General' : 'Usar Vista Satelital',
)

function onSwitchBasemap(): void {
  if (props.basemapError) emit('switch-basemap', basemapAction.value)
}
</script>

<template>
  <section class="ot-status" aria-label="Estado de los datos">
    <div class="ot-status__live" role="status" aria-live="polite" aria-atomic="true">
      <div v-if="isError" class="ot-status__block ot-status__block--error">
        <p class="ot-status__title">No se han podido cargar los datos</p>
        <p v-if="errorMessage" class="ot-status__detail">{{ errorMessage }}</p>
        <div class="ot-status__actions">
          <button type="button" class="ot-button" @click="emit('retry')">
            Reintentar
          </button>
        </div>
      </div>

      <template v-else>
        <div v-if="showSynthetic" class="ot-status__block ot-status__block--sample">
          <p class="ot-badge">DATOS SIMULADOS</p>
          <p class="ot-status__text">
            Capas científicas inventadas para demostración; el mapa base es real
          </p>
        </div>

        <div v-if="isLoading" class="ot-status__block ot-status__block--loading">
          <p class="ot-status__title">Cargando datos…</p>
        </div>

        <div v-else-if="isEmpty" class="ot-status__block ot-status__block--empty">
          <p class="ot-status__text">
            {{
              dataMode === 'real'
                ? 'Todavía no hay zonas con datos científicos reales'
                : 'No hay zonas disponibles en este modo de datos'
            }}
          </p>
        </div>
      </template>
    </div>

    <div
      v-if="basemapError"
      class="ot-status__block ot-status__block--warning"
      role="alert"
    >
      <p class="ot-status__title">{{ basemapMessage }}</p>
      <p class="ot-status__text">
        Puedes continuar con el otro mapa base mientras se restablece el servicio.
      </p>
      <div class="ot-status__actions">
        <button type="button" class="ot-button" @click="onSwitchBasemap">
          {{ basemapActionLabel }}
        </button>
      </div>
    </div>

    <div
      v-if="overlayError"
      class="ot-status__block ot-status__block--warning"
      role="alert"
    >
      <p class="ot-status__title">La imagen de la capa no está disponible</p>
      <p class="ot-status__text">
        El mapa sigue funcionando; puedes cambiar de capa o volver a intentarlo.
      </p>
      <div class="ot-status__actions">
        <button
          type="button"
          class="ot-button ot-button--quiet ot-button--small"
          aria-label="Cerrar aviso de imagen no disponible"
          @click="emit('dismiss-overlay-error')"
        >
          Cerrar
        </button>
      </div>
    </div>
  </section>
</template>
