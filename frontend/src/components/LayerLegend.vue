<script setup lang="ts">
import { computed } from 'vue'
import type { LegendSource } from './layerOptions'
import { displayUnit } from './layerOptions'
import { NO_DATA_CSS } from '../services/palettes'
import { t } from '../i18n'
import { dataText } from '../i18n/dataText'
import { numberFormatter } from '../i18n/format'
import '../styles/ui.css'

/**
 * Leyenda de la capa activa. El gradiente se construye con las paradas
 * declaradas en el manifiesto; los colores permiten interpretar la imagen,
 * no recuperar valores científicos exactos.
 */
const props = defineProps<{
  layer: LegendSource | null
}>()

const sortedStops = computed(() =>
  [...(props.layer?.legend ?? [])].sort((a, b) => a.value - b.value),
)

const extent = computed<[number, number]>(() => {
  if (!props.layer) return [0, 1]
  if (props.layer.range) return props.layer.range
  if (sortedStops.value.length > 0) {
    return [
      sortedStops.value[0].value,
      sortedStops.value[sortedStops.value.length - 1].value,
    ]
  }
  return [0, 1]
})

/** Posición relativa (0–100) de cada parada dentro del rango declarado. */
function stopPosition(value: number): number {
  const [min, max] = extent.value
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 50
  const ratio = (value - min) / (max - min)
  return Math.min(100, Math.max(0, ratio * 100))
}

const gradient = computed(() => {
  const stops = sortedStops.value
  if (stops.length === 0) return 'linear-gradient(to right, #d9d9d9, #d9d9d9)'
  if (stops.length === 1) {
    return `linear-gradient(to right, ${stops[0].color}, ${stops[0].color})`
  }
  const parts = stops.map(
    (stop) => `${stop.color} ${stopPosition(stop.value).toFixed(1)}%`,
  )
  return `linear-gradient(to right, ${parts.join(', ')})`
})

const rangeLabel = computed(() => {
  if (!props.layer?.range) return t('layers.legend.undeclared')
  const format = numberFormatter({ maximumFractionDigits: 2 })
  return `${format.format(extent.value[0])} – ${format.format(extent.value[1])}`
})

/** Título y etiquetas vienen de los datos publicados (en español). */
const title = computed(() => dataText(props.layer?.title))

const unit = computed(() => displayUnit(props.layer?.unit))
</script>

<template>
  <section class="ot-card ot-legend" :aria-label="t('layers.legend.label')">
    <h2 class="ot-section-title">{{ t('layers.legend.title') }}</h2>

    <template v-if="layer">
      <p class="ot-hint">
        {{ title }}
      </p>
      <div
        class="ot-legend__scale"
        :style="{ background: gradient }"
        role="img"
        :aria-label="t('layers.legend.scaleAria', { title })"
      ></div>
      <p class="ot-legend__meta">
        <span><strong>{{ t('layers.legend.unit') }}:</strong> {{ unit }}</span>
        <span><strong>{{ t('layers.legend.range') }}:</strong> {{ rangeLabel }}</span>
      </p>
      <ul class="ot-legend__stops">
        <li v-for="stop in sortedStops" :key="`${stop.value}-${stop.color}`" class="ot-legend__stop">
          <span
            class="ot-legend__swatch"
            :style="{ backgroundColor: stop.color }"
            aria-hidden="true"
          ></span>
          <span class="ot-legend__stop-label">{{ dataText(stop.label) }}</span>
        </li>
        <li v-if="layer.noData" class="ot-legend__stop">
          <span class="ot-legend__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true"></span>
          <span class="ot-legend__stop-label">{{ t('layers.legend.noData') }}</span>
        </li>
      </ul>
      <p v-if="layer.status === 'synthetic'" class="ot-legend__note">
        {{ t('layers.legend.syntheticNote') }}
      </p>
    </template>

    <p v-else class="ot-hint">
      {{ t('layers.legend.empty') }}
    </p>
  </section>
</template>
