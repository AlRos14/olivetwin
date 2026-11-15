<script setup lang="ts">
import { computed } from 'vue'
import type { HistogramBin } from '../services/analysisMath'
import { paletteColor, type PaletteName } from '../services/palettes'
import { unitLabel } from '../services/seriesAnalysis'
import { numberFormatter } from '../i18n/format'
import { t } from '../i18n'
import '../styles/analysis.css'

/** Reparto de la superficie con dato por tramos de valor (variables de una sola imagen). */
const props = withDefaults(
  defineProps<{
    bins: HistogramBin[]
    unit: string
    palette: PaletteName
    decimals?: number
  }>(),
  { decimals: 2 },
)

const W = 340
const H = 190
const M = { left: 36, right: 10, top: 10, bottom: 30 }
const plotW = W - M.left - M.right
const plotH = H - M.top - M.bottom

const format = computed(() => numberFormatter({ maximumFractionDigits: props.decimals }))
const maxFraction = computed(() => Math.max(0.01, ...props.bins.map((bin) => bin.fraction)))
const slot = computed(() => plotW / Math.max(1, props.bins.length))

const bars = computed(() =>
  props.bins.map((bin, index) => {
    const h = (bin.fraction / maxFraction.value) * plotH
    return {
      x: M.left + slot.value * index + 1,
      y: M.top + plotH - h,
      w: Math.max(1, slot.value - 2),
      h,
      color: `rgb(${paletteColor(props.palette, props.bins.length > 1 ? (index + 0.5) / props.bins.length : 0.5).join(', ')})`,
      title: `${format.value.format(bin.from)}–${format.value.format(bin.to)} ${unitLabel(props.unit)}: ${Math.round(bin.fraction * 100)} %`,
    }
  }),
)

const yTicks = computed(() => [0, 0.5, 1].map((share) => share * maxFraction.value))

/** Marcas del eje X: extremos y valor central del rango. */
const xTicks = computed(() => {
  const bins = props.bins
  if (bins.length === 0) return []
  const min = bins[0].from
  const max = bins[bins.length - 1].to
  return [min, (min + max) / 2, max].map((value, index) => ({
    x: M.left + (plotW * index) / 2,
    label: format.value.format(value),
    anchor: index === 0 ? 'start' : index === 2 ? 'end' : 'middle',
  }))
})
</script>

<template>
  <figure class="ot-chart">
    <svg :viewBox="`0 0 ${W} ${H}`" class="ot-chart__svg" role="img" :aria-label="t('analysis.charts.histogramAria', { unit: unitLabel(unit) })">
      <g class="ot-chart__grid">
        <line v-for="tick in yTicks" :key="tick" :x1="M.left" :x2="W - M.right" :y1="M.top + plotH - (tick / maxFraction) * plotH" :y2="M.top + plotH - (tick / maxFraction) * plotH" />
        <text v-for="tick in yTicks" :key="`l${tick}`" :x="M.left - 4" :y="M.top + plotH - (tick / maxFraction) * plotH + 3" text-anchor="end">
          {{ Math.round(tick * 100) }} %
        </text>
        <text v-for="tick in xTicks" :key="`x${tick.x}`" :x="tick.x" :y="H - 12" :text-anchor="tick.anchor">{{ tick.label }}</text>
      </g>
      <rect v-for="(bar, index) in bars" :key="index" class="ot-histogram__bar" :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h" :fill="bar.color">
        <title>{{ bar.title }}</title>
      </rect>
    </svg>
    <figcaption class="ot-chart__caption">
      <span>{{ t('analysis.charts.histogramCaption') }}</span>
      <span class="ot-chart__unit">{{ unitLabel(unit) }}</span>
    </figcaption>
  </figure>
</template>
