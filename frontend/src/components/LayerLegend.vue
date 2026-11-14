<script setup lang="ts">
import { computed } from 'vue'
import type { StudyLayer } from '../types/manifest'
import '../styles/ui.css'

/**
 * Leyenda de la capa activa. El gradiente se construye con las paradas
 * declaradas en el manifiesto; los colores permiten interpretar la imagen,
 * no recuperar valores científicos exactos.
 */
const props = defineProps<{
  layer: StudyLayer | null
}>()

const numberFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const formatNumber = (value: number): string => numberFormat.format(value)

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
  if (!props.layer?.range) return 'No declarado'
  return `${formatNumber(extent.value[0])} – ${formatNumber(extent.value[1])}`
})
</script>

<template>
  <section class="ot-card ot-legend" aria-label="Leyenda">
    <h2 class="ot-section-title">Leyenda</h2>

    <template v-if="layer">
      <p class="ot-hint">
        {{ layer.variable ?? layer.title }}
      </p>
      <div
        class="ot-legend__scale"
        :style="{ background: gradient }"
        role="img"
        :aria-label="`Escala de color de ${layer.title}`"
      ></div>
      <p class="ot-legend__meta">
        <span><strong>Unidad:</strong> {{ layer.unit }}</span>
        <span><strong>Rango:</strong> {{ rangeLabel }}</span>
      </p>
      <ul class="ot-legend__stops">
        <li v-for="stop in sortedStops" :key="`${stop.value}-${stop.color}`" class="ot-legend__stop">
          <span
            class="ot-legend__swatch"
            :style="{ backgroundColor: stop.color }"
            aria-hidden="true"
          ></span>
          <span class="ot-legend__stop-label">{{ stop.label }}</span>
          <span class="ot-legend__stop-value">{{ formatNumber(stop.value) }}</span>
        </li>
      </ul>
      <p v-if="layer.status === 'synthetic'" class="ot-legend__note">
        Escala ilustrativa: los colores no representan medidas reales
      </p>
      <p class="ot-hint">
        Los colores orientan la lectura; no permiten recuperar valores exactos.
      </p>
    </template>

    <p v-else class="ot-hint">
      Selecciona una zona y una variable para ver la leyenda.
    </p>
  </section>
</template>
