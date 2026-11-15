<script setup lang="ts">
import { computed } from 'vue'
import type { BaseMap, DataMode, ManifestLoadStatus } from '../types/manifest'
import { t } from '../i18n'
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
  pnoaFailed.value ? t('status.basemapSatelliteDown') : t('status.basemapGeneralDown'),
)

const basemapAction = computed<BaseMap>(() => (pnoaFailed.value ? 'osm' : 'pnoa'))

const basemapActionLabel = computed(() =>
  pnoaFailed.value ? t('status.useGeneralView') : t('status.useSatelliteView'),
)

const emptyMessage = computed(() =>
  props.dataMode === 'real' ? t('status.emptyReal') : t('status.emptySample'),
)

function onSwitchBasemap(): void {
  if (props.basemapError) emit('switch-basemap', basemapAction.value)
}
</script>

<template>
  <section class="ot-status" :aria-label="t('status.label')">
    <div class="ot-status__live" role="status" aria-live="polite" aria-atomic="true">
      <div v-if="isError" class="ot-status__block ot-status__block--error">
        <p class="ot-status__title">{{ t('status.errorTitle') }}</p>
        <p v-if="errorMessage" class="ot-status__detail">{{ errorMessage }}</p>
        <div class="ot-status__actions">
          <button type="button" class="ot-button" @click="emit('retry')">
            {{ t('status.retry') }}
          </button>
        </div>
      </div>

      <template v-else>
        <div v-if="showSynthetic" class="ot-status__block ot-status__block--sample">
          <p class="ot-badge">{{ t('status.syntheticBadge') }}</p>
          <p class="ot-status__text">
            {{ t('status.syntheticText') }}
          </p>
        </div>

        <div v-if="isLoading" class="ot-status__block ot-status__block--loading">
          <p class="ot-status__title">{{ t('status.loading') }}</p>
        </div>

        <div v-else-if="isEmpty" class="ot-status__block ot-status__block--empty">
          <p class="ot-status__text">
            {{ emptyMessage }}
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
        {{ t('status.basemapHint') }}
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
      <p class="ot-status__title">{{ t('status.overlayTitle') }}</p>
      <p class="ot-status__text">
        {{ t('status.overlayHint') }}
      </p>
      <div class="ot-status__actions">
        <button
          type="button"
          class="ot-button ot-button--quiet ot-button--small"
          :aria-label="t('status.closeOverlayAria')"
          @click="emit('dismiss-overlay-error')"
        >
          {{ t('status.close') }}
        </button>
      </div>
    </div>
  </section>
</template>
