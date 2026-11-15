<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatMonth } from '../services/dateFormat'
import { unitLabel } from '../services/seriesAnalysis'
import { numberFormatter } from '../i18n/format'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Serie temporal de una variable del cubo de análisis (SVG sin dependencias).
 *
 * - Banda p10–p90 y media de la zona (estadísticas precalculadas por el pipeline).
 * - Series opcionales de los puntos A y B (modo gemelos).
 * - Barras opcionales de precipitación diaria en un eje secundario, para
 *   contextualizar subidas de humedad: coincidencia temporal no implica causa.
 * - Pulsar un punto de la media emite `select` con el índice del paso.
 */
interface StatPoint {
  mean: number | null
  p10: number | null
  p90: number | null
}

const props = withDefaults(
  defineProps<{
    title: string
    unit: string
    decimals?: number
    dates: (string | null)[]
    stats?: StatPoint[]
    seriesA?: (number | null)[] | null
    seriesB?: (number | null)[] | null
    activeIndex?: number | null
    bars?: { date: string; value: number | null }[] | null
    barsUnit?: string
    fallbackRange?: [number, number]
  }>(),
  {
    decimals: 2,
    stats: () => [],
    seriesA: null,
    seriesB: null,
    activeIndex: null,
    bars: null,
    barsUnit: 'mm',
    fallbackRange: () => [0, 1],
  },
)

const emit = defineEmits<{ select: [index: number] }>()

const W = 340
const H = 190
const M = { left: 44, right: 12, top: 12, bottom: 26 }
const plotW = W - M.left - M.right
const plotH = H - M.top - M.bottom
const DAY = 86_400_000

function toTime(date: string | null): number | null {
  if (!date) return null
  const value = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date)
  return Number.isNaN(value) ? null : value
}

const times = computed(() => props.dates.map(toTime))

const domainX = computed<[number, number] | null>(() => {
  const valid = times.value.filter((time): time is number => time !== null)
  if (valid.length === 0) return null
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const pad = Math.max(3 * DAY, (max - min) * 0.04)
  return [min - pad, max + pad]
})

const domainY = computed<[number, number]>(() => {
  const values: number[] = []
  for (const point of props.stats) {
    for (const value of [point.mean, point.p10, point.p90]) if (value !== null) values.push(value)
  }
  for (const series of [props.seriesA, props.seriesB]) {
    for (const value of series ?? []) if (value !== null) values.push(value)
  }
  if (values.length === 0) return props.fallbackRange
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max === min) {
    const delta = Math.abs(max) * 0.1 || 0.1
    min -= delta
    max += delta
  }
  const pad = (max - min) * 0.08
  return [min - pad, max + pad]
})

function x(time: number): number {
  const domain = domainX.value
  if (!domain) return M.left
  return M.left + ((time - domain[0]) / (domain[1] - domain[0])) * plotW
}

function y(value: number): number {
  const [min, max] = domainY.value
  return M.top + plotH - ((value - min) / (max - min)) * plotH
}

function path(values: (number | null)[]): string {
  let d = ''
  let pen = false
  values.forEach((value, index) => {
    const time = times.value[index]
    if (value === null || time === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(time).toFixed(1)},${y(value).toFixed(1)} `
    pen = true
  })
  return d.trim()
}

const meanPath = computed(() => path(props.stats.map((point) => point.mean)))
const pathA = computed(() => (props.seriesA ? path(props.seriesA) : ''))
const pathB = computed(() => (props.seriesB ? path(props.seriesB) : ''))

const band = computed(() => {
  const upper: string[] = []
  const lower: string[] = []
  props.stats.forEach((point, index) => {
    const time = times.value[index]
    if (time === null || point.p10 === null || point.p90 === null) return
    upper.push(`${x(time).toFixed(1)},${y(point.p90).toFixed(1)}`)
    lower.unshift(`${x(time).toFixed(1)},${y(point.p10).toFixed(1)}`)
  })
  return upper.length >= 2 ? [...upper, ...lower].join(' ') : ''
})

const meanDots = computed(() =>
  props.stats
    .map((point, index) => ({ index, time: times.value[index], value: point.mean }))
    .filter((dot): dot is { index: number; time: number; value: number } => dot.time !== null && dot.value !== null),
)

const barData = computed(() => {
  const domain = domainX.value
  if (!domain || !props.bars) return { max: 0, items: [] as { x: number; h: number; value: number; date: string }[] }
  const inRange = props.bars
    .map((bar) => ({ ...bar, time: toTime(bar.date) }))
    .filter((bar): bar is { date: string; value: number; time: number } => bar.time !== null && bar.value !== null && bar.time >= domain[0] && bar.time <= domain[1])
  const max = Math.max(0, ...inRange.map((bar) => bar.value))
  const maxH = plotH * 0.35
  return {
    max,
    items: inRange
      .filter((bar) => bar.value > 0)
      .map((bar) => ({ x: x(bar.time), h: max > 0 ? (bar.value / max) * maxH : 0, value: bar.value, date: bar.date })),
  }
})

const barWidth = computed(() => {
  const domain = domainX.value
  if (!domain) return 2
  return Math.max(1.5, (plotW * DAY) / (domain[1] - domain[0]) - 0.6)
})

const numberFormat = computed(() => numberFormatter({ maximumFractionDigits: props.decimals }))

const yTicks = computed(() => {
  const [min, max] = domainY.value
  return [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3)
})

const xTicks = computed(() => {
  const domain = domainX.value
  if (!domain) return []
  const ticks: { x: number; label: string }[] = []
  const start = new Date(domain[0])
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
  while (cursor <= domain[1]) {
    const date = new Date(cursor)
    ticks.push({ x: x(cursor), label: formatMonth(cursor) })
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  return ticks
})

const activeX = computed(() => {
  if (props.activeIndex === null) return null
  const time = times.value[props.activeIndex]
  return time === null || time === undefined ? null : x(time)
})

const summary = computed(() => {
  const last = [...props.stats].reverse().find((point) => point.mean !== null)
  const count = props.dates.filter(Boolean).length
  return t('analysis.charts.seriesSummary', {
    title: props.title,
    count,
    last: last?.mean != null ? numberFormat.value.format(last.mean) : '',
    unit: unitLabel(props.unit),
  })
})
</script>

<template>
  <figure class="ot-chart">
    <svg
      v-if="domainX"
      :viewBox="`0 0 ${W} ${H}`"
      class="ot-chart__svg"
      role="img"
      :aria-label="summary"
    >
      <g class="ot-chart__bars">
        <rect
          v-for="bar in barData.items"
          :key="bar.date"
          :x="bar.x - barWidth / 2"
          :y="M.top + plotH - bar.h"
          :width="barWidth"
          :height="bar.h"
        >
          <title>{{ formatDate(bar.date, bar.date) }}: {{ numberFormat.format(bar.value) }} {{ unitLabel(barsUnit) }}</title>
        </rect>
      </g>
      <g class="ot-chart__grid">
        <line v-for="tick in yTicks" :key="tick" :x1="M.left" :x2="W - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text v-for="tick in yTicks" :key="`l${tick}`" :x="M.left - 4" :y="y(tick) + 3" text-anchor="end">
          {{ numberFormat.format(tick) }}
        </text>
        <text v-for="tick in xTicks" :key="tick.label" :x="tick.x" :y="H - 8" text-anchor="middle">{{ tick.label }}</text>
      </g>
      <line v-if="activeX !== null" class="ot-chart__active" :x1="activeX" :x2="activeX" :y1="M.top" :y2="M.top + plotH" />
      <polygon v-if="band" class="ot-chart__band" :points="band" />
      <path v-if="meanPath" class="ot-chart__mean" :d="meanPath" />
      <path v-if="pathA" class="ot-chart__a" :d="pathA" />
      <path v-if="pathB" class="ot-chart__b" :d="pathB" />
      <circle
        v-for="dot in meanDots"
        :key="dot.index"
        class="ot-chart__dot"
        :class="{ 'is-active': dot.index === activeIndex }"
        :cx="x(dot.time)"
        :cy="y(dot.value)"
        r="4"
        tabindex="0"
        role="button"
        :aria-label="t('analysis.charts.showDate', { date: formatDate(dates[dot.index], '') })"
        @click="emit('select', dot.index)"
        @keydown.enter="emit('select', dot.index)"
      >
        <title>{{ formatDate(dates[dot.index], '') }}: {{ numberFormat.format(dot.value) }} {{ unitLabel(unit) }}</title>
      </circle>
    </svg>
    <figcaption class="ot-chart__caption">
      <span v-if="stats.length" class="ot-chart__key ot-chart__key--mean">{{ t('analysis.charts.zoneMean') }}</span>
      <span v-if="seriesA" class="ot-chart__key ot-chart__key--a">{{ t('analysis.charts.pointA') }}</span>
      <span v-if="seriesB" class="ot-chart__key ot-chart__key--b">{{ t('analysis.charts.pointB') }}</span>
      <span v-if="barData.items.length" class="ot-chart__key ot-chart__key--bars">
        {{ t('analysis.charts.dailyRain', { value: numberFormat.format(barData.max), unit: unitLabel(barsUnit) }) }}
      </span>
      <span class="ot-chart__unit">{{ unitLabel(unit) }}</span>
    </figcaption>
  </figure>
</template>
