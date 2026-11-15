<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisStats } from '../types/analysis'
import { formatDate } from '../services/dateFormat'
import { unitLabel } from '../services/seriesAnalysis'
import { numberFormatter } from '../i18n/format'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Distribución de la variable en la zona para cada fecha: línea mínimo–máximo,
 * barra p10–p90, marca de la mediana y punto de la media.
 */
const props = withDefaults(
  defineProps<{
    dates: string[]
    stats: AnalysisStats[]
    unit: string
    decimals?: number
  }>(),
  { decimals: 2 },
)

const W = 340
const H = 190
const M = { left: 44, right: 10, top: 10, bottom: 34 }
const plotW = W - M.left - M.right
const plotH = H - M.top - M.bottom

const domain = computed<[number, number]>(() => {
  const values: number[] = []
  for (const stat of props.stats) {
    for (const value of [stat.min, stat.max, stat.p10, stat.p90]) if (value !== null) values.push(value)
  }
  if (values.length === 0) return [0, 1]
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 0.5
    max += 0.5
  }
  const pad = (max - min) * 0.06
  return [min - pad, max + pad]
})

function y(value: number): number {
  const [min, max] = domain.value
  return M.top + plotH - ((value - min) / (max - min)) * plotH
}

const slot = computed(() => plotW / Math.max(1, props.stats.length))

function x(index: number): number {
  return M.left + slot.value * (index + 0.5)
}

const format = computed(() => numberFormatter({ maximumFractionDigits: props.decimals }))
function label(date: string): string {
  return formatDate(date, date)
}

function statText(value: number | null): string {
  return value === null ? t('analysis.charts.noValue') : format.value.format(value)
}

function pointTitle(stat: AnalysisStats, index: number): string {
  return t('analysis.charts.pointTitle', {
    date: label(props.dates[index]),
    mean: statText(stat.mean),
    median: statText(stat.median),
    p10: statText(stat.p10),
    p90: statText(stat.p90),
    unit: unitLabel(props.unit),
  })
}

const ticks = computed(() => {
  const [min, max] = domain.value
  return [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3)
})

const barWidth = computed(() => Math.max(4, Math.min(18, slot.value * 0.45)))
</script>

<template>
  <figure class="ot-chart">
    <svg :viewBox="`0 0 ${W} ${H}`" class="ot-chart__svg" role="img" :aria-label="t('analysis.charts.distributionAria', { unit: unitLabel(unit) })">
      <g class="ot-chart__grid">
        <line v-for="tick in ticks" :key="tick" :x1="M.left" :x2="W - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text v-for="tick in ticks" :key="`t${tick}`" :x="M.left - 4" :y="y(tick) + 3" text-anchor="end">
          {{ format.format(tick) }}
        </text>
        <text
          v-for="(date, index) in dates"
          :key="date"
          :x="x(index)"
          :y="H - 18"
          text-anchor="middle"
          :transform="stats.length > 6 ? `rotate(-35 ${x(index)} ${H - 18})` : undefined"
        >
          {{ label(date) }}
        </text>
      </g>
      <g v-for="(stat, index) in stats" :key="index" class="ot-dist">
        <title>{{ pointTitle(stat, index) }}</title>
        <line v-if="stat.min !== null && stat.max !== null" class="ot-dist__range" :x1="x(index)" :x2="x(index)" :y1="y(stat.min)" :y2="y(stat.max)" />
        <rect
          v-if="stat.p10 !== null && stat.p90 !== null"
          class="ot-dist__box"
          :x="x(index) - barWidth / 2"
          :y="y(stat.p90)"
          :width="barWidth"
          :height="Math.max(1, y(stat.p10) - y(stat.p90))"
        />
        <line
          v-if="stat.median !== null"
          class="ot-dist__median"
          :x1="x(index) - barWidth / 2"
          :x2="x(index) + barWidth / 2"
          :y1="y(stat.median)"
          :y2="y(stat.median)"
        />
        <circle v-if="stat.mean !== null" class="ot-dist__mean" :cx="x(index)" :cy="y(stat.mean)" r="2.6" />
      </g>
    </svg>
    <figcaption class="ot-chart__caption">
      <span>{{ t('analysis.charts.distributionCaption') }}</span>
      <span class="ot-chart__unit">{{ unitLabel(unit) }}</span>
    </figcaption>
  </figure>
</template>
