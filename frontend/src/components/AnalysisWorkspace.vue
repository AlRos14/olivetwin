<script setup lang="ts">
import { formatDate as formatIsoDate } from '../services/dateFormat'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { UseAnalysisWorkspaceReturn } from '../composables/useAnalysisWorkspace'
import type { ZoneSeries } from '../types/analysis'
import { NO_DATA_CSS, paletteGradient, type PaletteName } from '../services/palettes'
import { areaMeanLabel, rainBefore, unitLabel } from '../services/seriesAnalysis'
import { suitabilityBinLabel } from '../services/cropSuitability'
import SeriesChart from './SeriesChart.vue'
import DistributionChart from './DistributionChart.vue'
import HistogramChart from './HistogramChart.vue'
import CropReferenceCard from './CropReferenceCard.vue'
import CropRangesTable from './CropRangesTable.vue'
import LlmReport from './LlmReport.vue'
import { variableLabel } from './variableLabels'
import { numberFormatter } from '../i18n/format'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Área principal de la pestaña Análisis (sustituye al mapa): imágenes de la
 * variable en las fechas elegidas, cambio entre la primera y la última, leyenda,
 * gráficas, valores, mapas de aptitud por cultivo e interpretación con IA.
 */
const props = defineProps<{
  workspace: UseAnalysisWorkspaceReturn
  zoneName: string
  zoneSeries: ZoneSeries[]
}>()

const ws = computed(() => props.workspace)
const variable = computed(() => ws.value.variable.value)
const isSingle = computed(() => ws.value.isSingle.value)
const spatial = computed(() => ws.value.spatial.value)
const singleStep = computed(() => (isSingle.value ? (ws.value.rangeStats.value?.steps[0] ?? null) : null))
const grid = computed(() => ws.value.grid.value)
const decimals = computed(() => ws.value.decimals.value)

const zoneLabel = computed(() => dataText(props.zoneName))
const cropName = computed(() => dataText(ws.value.crop.value?.name ?? ''))
const cropLower = computed(() => cropName.value.toLowerCase())

function formatDate(date: string | null | undefined): string {
  return formatIsoDate(date, date || '—')
}

function formatValue(value: number | null | undefined, digits = decimals.value): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return numberFormatter({ maximumFractionDigits: digits }).format(value)
}

function formatSigned(value: number | null | undefined, digits = decimals.value): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return numberFormatter({ maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)} %`
}

function capitalize(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label
}

const aspect = computed(() => (grid.value ? `${grid.value.width} / ${grid.value.height}` : '4 / 3'))
/** Ancho de la ampliación que conserva la proporción exacta de la rejilla (la lectura del cursor depende de ello). */
const zoomWidth = computed(() =>
  grid.value ? `min(100%, calc(68vh * ${grid.value.width} / ${grid.value.height}))` : '100%',
)

/** Fechas del intervalo con sus estadísticas sobre la zona común (todas las fechas con dato). */
const rangeSteps = computed(() => ws.value.rangeStats.value?.steps ?? [])
const commonFraction = computed(() => ws.value.rangeStats.value?.commonFraction ?? null)

const precipitation = computed(() => props.zoneSeries.find((series) => series.id === 'precipitation') ?? null)

const tableRows = computed(() => {
  let previous: number | null = null
  return rangeSteps.value.map((step) => {
    const mean = step.stats.mean
    const delta = mean !== null && previous !== null ? mean - previous : null
    previous = mean
    return { ...step, delta, rain: rainBefore(props.zoneSeries, step.date, 7) }
  })
})

const variableReportBlocked = computed(() => {
  if (!variable.value) return t('analysis.workspace.noVariable')
  if (ws.value.state.seriesStatus === 'loading') return t('analysis.workspace.waitingImages')
  if (ws.value.candidates.value.length === 0) return t('analysis.workspace.noDates')
  if (!ws.value.rangeStats.value) return t('analysis.workspace.waitingDates')
  return null
})

const cropReportBlocked = computed(() => {
  if (!ws.value.crop.value) return t('analysis.workspace.noCrop')
  if (ws.value.state.cropStatus !== 'ready') return t('analysis.workspace.waitingSuitability')
  return null
})

// --- Ampliación con lectura del dato bajo el cursor ---------------------------
interface Zoomed {
  title: string
  url: string
  values: Float32Array
  unit: string
  /** Unidad de la puntuación de aptitud (se traduce al pintarla). */
  suitability: boolean
  digits: number
  palette: PaletteName
  range: [number, number]
}

const zoomed = ref<Zoomed | null>(null)
const readout = ref<string | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

function open(item: Zoomed): void {
  zoomed.value = item
  readout.value = null
}

function close(): void {
  zoomed.value = null
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

watch(zoomed, (value) => {
  if (value) {
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => closeButton.value?.focus())
  } else {
    window.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onHover(event: MouseEvent): void {
  const item = zoomed.value
  const target = grid.value
  if (!item || !target) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * target.width)
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * target.height)
  if (col < 0 || row < 0 || col >= target.width || row >= target.height) {
    readout.value = null
    return
  }
  const value = item.values[row * target.width + col]
  const unit = item.suitability ? t('analysis.cropView.suitabilityScoreUnit') : unitLabel(item.unit)
  readout.value = Number.isNaN(value)
    ? t('analysis.results.noDataCell')
    : `${formatValue(value, item.digits)} ${unit}`
}

function frameTitle(date: string): string {
  return date ? formatDate(date) : ''
}

function zoomFrame(position: number): void {
  const frame = ws.value.frames.value[position]
  const target = variable.value
  if (!frame?.url || !target) return
  open({
    title: frame.date ? `${variableLabel(target)} · ${formatDate(frame.date)}` : variableLabel(target),
    url: frame.url,
    values: frame.values,
    unit: target.unit,
    suitability: false,
    digits: decimals.value,
    palette: target.palette,
    range: target.displayRange,
  })
}

function zoomChange(): void {
  const change = ws.value.change.value
  const target = variable.value
  if (!change?.url || !target) return
  open({
    title: t('analysis.results.changeOf', {
      variable: variableLabel(target),
      from: formatDate(change.fromDate),
      to: formatDate(change.toDate),
    }),
    url: change.url,
    values: change.values,
    unit: target.unit,
    suitability: false,
    digits: decimals.value,
    palette: 'change',
    range: change.range,
  })
}

function zoomRaster(title: string, url: string | null, values: Float32Array): void {
  if (!url) return
  open({ title, url, values, unit: '', suitability: true, digits: 2, palette: 'suitability', range: [0, 1] })
}
</script>

<template>
  <div class="ot-workspace" role="region" :aria-label="t('analysis.results.region')">
    <template v-if="workspace.state.mode === 'series'">
      <header class="ot-workspace__header">
        <h2 class="ot-workspace__title">{{ variable ? variableLabel(variable) : t('analysis.title') }}</h2>
        <p v-if="variable && isSingle" class="ot-workspace__subtitle">
          {{ zoneLabel }}<template v-if="rangeSteps[0]?.date"> · {{ formatDate(rangeSteps[0].date) }}</template>
        </p>
        <p v-else-if="variable && rangeSteps.length" class="ot-workspace__subtitle">
          {{ zoneLabel }} · {{ formatDate(rangeSteps[0].date) }} – {{ formatDate(rangeSteps[rangeSteps.length - 1].date) }}
        </p>
      </header>

      <p v-if="workspace.state.seriesStatus === 'loading'" class="ot-hint" role="status">{{ t('analysis.results.loadingImages') }}</p>
      <p v-if="workspace.state.seriesStatus === 'error'" class="ot-analysis__error" role="alert">{{ workspace.state.seriesError }}</p>

      <div v-if="variable" class="ot-workspace__legend">
        <div class="ot-analysis__ramp" :style="{ background: paletteGradient(variable.palette) }" />
        <div class="ot-analysis__ramp-labels">
          <span>{{ formatValue(variable.displayRange[0]) }}</span>
          <span class="ot-hint">{{ unitLabel(variable.unit) }}</span>
          <span>{{ formatValue(variable.displayRange[1]) }}</span>
        </div>
        <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />{{ t('analysis.results.noData') }}</p>
      </div>

      <div v-if="workspace.frames.value.length" class="ot-gallery" :class="{ 'ot-gallery--single': isSingle }">
        <figure v-for="(frame, position) in workspace.frames.value" :key="frame.index" class="ot-gallery__item">
          <button
            type="button"
            class="ot-gallery__button"
            :aria-label="frame.date ? t('analysis.results.zoomDate', { date: formatDate(frame.date) }) : t('analysis.results.zoomImage')"
            @click="zoomFrame(position)"
          >
            <img
              v-if="frame.url"
              :src="frame.url"
              :alt="frame.date
                ? t('analysis.results.imageAlt', { variable: variable ? variableLabel(variable) : '', date: formatDate(frame.date) })
                : t('analysis.results.imageAltNoDate', { variable: variable ? variableLabel(variable) : '' })"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <figcaption>
            <strong v-if="frame.date">{{ frameTitle(frame.date) }}</strong>
            <span>{{ t('analysis.results.mean', { value: formatValue(frame.mean) }) }}</span>
          </figcaption>
        </figure>
      </div>

      <section v-if="workspace.change.value" class="ot-workspace__section">
        <h3 class="ot-workspace__h">
          {{ t('analysis.results.changeTitle', { from: formatDate(workspace.change.value.fromDate), to: formatDate(workspace.change.value.toDate) }) }}
        </h3>
        <div class="ot-workspace__change">
          <button type="button" class="ot-gallery__button" :aria-label="t('analysis.results.zoomChange')" @click="zoomChange">
            <img
              v-if="workspace.change.value.url"
              :src="workspace.change.value.url"
              :alt="t('analysis.results.changeAlt')"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <div class="ot-workspace__change-info">
            <div class="ot-analysis__ramp" :style="{ background: paletteGradient('change') }" />
            <div class="ot-analysis__ramp-labels">
              <span>{{ formatSigned(workspace.change.value.range[0]) }}</span>
              <span class="ot-hint">{{ unitLabel(variable?.unit) }}</span>
              <span>{{ formatSigned(workspace.change.value.range[1]) }}</span>
            </div>
            <p v-if="commonFraction !== null" class="ot-hint">{{ t('analysis.results.commonArea', { pct: pct(commonFraction) }) }}</p>
            <dl class="ot-kv">
              <dt>{{ t('analysis.results.changeMean') }}</dt>
              <dd>{{ formatSigned(workspace.change.value.summary.meanDelta) }} {{ unitLabel(variable?.unit) }}</dd>
              <dt>{{ t('analysis.results.rising') }}</dt>
              <dd>{{ pct(workspace.change.value.summary.increased) }}</dd>
              <dt>{{ t('analysis.results.falling') }}</dt>
              <dd>{{ pct(workspace.change.value.summary.decreased) }}</dd>
              <dt>{{ t('analysis.results.stable', { threshold: formatValue(workspace.change.value.summary.threshold) }) }}</dt>
              <dd>{{ pct(workspace.change.value.summary.stable) }}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section v-if="variable && spatial && (singleStep || (commonFraction && !isSingle))" class="ot-workspace__section ot-workspace__charts">
        <div>
          <h3 class="ot-workspace__h">{{ t('analysis.results.distribution') }}{{ isSingle ? '' : t('analysis.results.rangeMean') }}</h3>
          <HistogramChart :bins="spatial.histogram" :unit="variable.unit" :palette="variable.palette" :decimals="decimals" />
        </div>
        <div>
          <h3 class="ot-workspace__h">{{ t('analysis.results.byArea') }}</h3>
          <dl class="ot-kv">
            <template v-for="area in spatial.byArea" :key="area.id">
              <dt>{{ capitalize(areaMeanLabel(area)) }}</dt>
              <dd>{{ formatValue(area.mean) }} {{ unitLabel(variable.unit) }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section v-if="variable && singleStep" class="ot-workspace__section">
        <h3 class="ot-workspace__h">{{ t('analysis.results.values') }}</h3>
        <table class="ot-analysis__table ot-values">
          <caption class="ot-sr-only">{{ t('analysis.results.zoneStats') }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('analysis.results.meanHeader') }}</th>
              <th scope="col">{{ t('analysis.results.medianHeader') }}</th>
              <th scope="col">p10–p90</th>
              <th scope="col">{{ t('analysis.results.minMaxHeader') }}</th>
              <th scope="col">{{ t('analysis.results.withData') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ formatValue(singleStep.stats.mean) }}</td>
              <td>{{ formatValue(singleStep.stats.median) }}</td>
              <td>{{ formatValue(singleStep.stats.p10) }}–{{ formatValue(singleStep.stats.p90) }}</td>
              <td>{{ formatValue(singleStep.stats.min) }}–{{ formatValue(singleStep.stats.max) }}</td>
              <td>{{ pct(singleStep.coverage) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="ot-hint">{{ t('analysis.results.unit', { unit: unitLabel(variable.unit) }) }}</p>
      </section>

      <p v-if="commonFraction !== null && variable && !isSingle" class="ot-hint ot-workspace__common">
        {{ t('analysis.results.commonNote', { pct: pct(commonFraction) }) }}
      </p>
      <p v-if="commonFraction === 0 && !isSingle" class="ot-analysis__error" role="status">
        {{ t('analysis.results.noCommon') }}
      </p>

      <section v-if="variable && rangeSteps.length >= 2 && commonFraction" class="ot-workspace__section ot-workspace__charts">
        <div>
          <h3 class="ot-workspace__h">{{ t('analysis.results.evolution') }}</h3>
          <SeriesChart
            :title="variableLabel(variable)"
            :unit="variable.unit"
            :decimals="decimals"
            :dates="rangeSteps.map((step) => step.date)"
            :stats="rangeSteps.map((step) => step.stats)"
            :bars="precipitation?.points ?? null"
            :bars-unit="precipitation?.unit ?? 'mm'"
            :fallback-range="variable.displayRange"
          />
        </div>
        <div>
          <h3 class="ot-workspace__h">{{ t('analysis.results.distributionByDate') }}</h3>
          <DistributionChart
            :dates="rangeSteps.map((step) => step.date)"
            :stats="rangeSteps.map((step) => step.stats)"
            :unit="variable.unit"
            :decimals="decimals"
          />
        </div>
      </section>

      <section v-if="variable && tableRows.length && !isSingle" class="ot-workspace__section">
        <h3 class="ot-workspace__h">{{ t('analysis.results.values') }}</h3>
        <table class="ot-analysis__table ot-values">
          <caption class="ot-sr-only">{{ t('analysis.results.zoneStatsByDate') }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('analysis.results.date') }}</th>
              <th scope="col">{{ t('analysis.results.meanHeader') }}</th>
              <th scope="col">Δ</th>
              <th scope="col">{{ t('analysis.results.medianHeader') }}</th>
              <th scope="col">p10–p90</th>
              <th scope="col">{{ t('analysis.results.withData') }}</th>
              <th scope="col">{{ t('analysis.results.rain7d') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.index" :class="{ 'is-sampled': workspace.sampling.value.indices.includes(row.index) }">
              <th scope="row">{{ formatDate(row.date) }}</th>
              <td>{{ formatValue(row.stats.mean) }}</td>
              <td>{{ formatSigned(row.delta) }}</td>
              <td>{{ formatValue(row.stats.median) }}</td>
              <td>{{ formatValue(row.stats.p10) }}–{{ formatValue(row.stats.p90) }}</td>
              <td>{{ pct(row.coverage) }}</td>
              <td>{{ row.rain === null ? '—' : `${formatValue(row.rain, 1)} mm` }}</td>
            </tr>
          </tbody>
        </table>
        <p class="ot-hint">
          {{ t('analysis.results.unit', { unit: unitLabel(variable.unit) }) }} {{ t('analysis.results.valuesNote') }}
        </p>
      </section>

      <CropReferenceCard
        v-if="variable && workspace.crop.value && workspace.requirementView.value"
        :crop-name="workspace.crop.value.name"
        :variable-name="variableLabel(variable)"
        :view="workspace.requirementView.value"
      />

      <LlmReport
        :title="workspace.crop.value ? t('analysis.cropView.interpretationFor', { crop: cropLower }) : t('analysis.cropView.interpretation')"
        :report="workspace.variableReport"
        :disabled-reason="variableReportBlocked"
        @run="workspace.runVariableReport()"
        @stop="workspace.stopVariableReport()"
      />
    </template>

    <template v-else>
      <header class="ot-workspace__header">
        <h2 class="ot-workspace__title">{{ t('analysis.cropView.suitabilityFor', { crop: workspace.crop.value ? cropLower : t('analysis.cropView.theCrop') }) }}</h2>
        <p v-if="workspace.crop.value" class="ot-workspace__subtitle">
          {{ zoneLabel }} · <em>{{ dataText(workspace.crop.value.scientificName) }}</em> · {{ dataText(workspace.crop.value.assumptions) }}
        </p>
      </header>

      <p v-if="workspace.state.cropStatus === 'loading'" class="ot-hint" role="status">{{ t('analysis.cropView.loadingSuitability') }}</p>
      <p v-if="workspace.state.cropStatus === 'error'" class="ot-analysis__error" role="alert">{{ workspace.state.cropError }}</p>

      <template v-if="workspace.cropView.value && workspace.state.cropStatus === 'ready'">
        <section class="ot-workspace__section ot-crop">
          <button
            type="button"
            class="ot-gallery__button ot-crop__map"
            :aria-label="t('analysis.cropView.zoomSuitability')"
            @click="zoomRaster(t('analysis.cropView.zoomTitle', { crop: dataText(workspace.cropView.value.crop.name).toLowerCase() }), workspace.cropView.value.url, workspace.cropView.value.values)"
          >
            <img
              v-if="workspace.cropView.value.url"
              :src="workspace.cropView.value.url"
              :alt="t('analysis.cropView.suitabilityMapAlt', { crop: dataText(workspace.cropView.value.crop.name) })"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <div class="ot-crop__info">
            <div class="ot-analysis__ramp" :style="{ background: paletteGradient('suitability') }" />
            <div class="ot-analysis__ramp-labels">
              <span>{{ t('analysis.cropView.rampLow') }}</span>
              <span>{{ t('analysis.cropView.rampHigh') }}</span>
            </div>
            <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />{{ t('analysis.results.noData') }}</p>
            <p class="ot-crop__score">
              {{ t('analysis.cropView.meanSuitability') }} <strong>{{ formatValue(workspace.cropView.value.crop.suitability.stats.mean, 2) }}</strong>
            </p>
            <h3 class="ot-workspace__h">{{ t('analysis.cropView.surfaceByClass') }}</h3>
            <ul class="ot-bars">
              <li v-for="bin in workspace.cropView.value.bins" :key="bin.id">
                <span class="ot-bars__label">{{ suitabilityBinLabel(bin.id) }}</span>
                <span class="ot-bars__track"><span class="ot-bars__fill" :style="{ width: `${bin.fraction * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(bin.fraction) }}</span>
              </li>
            </ul>
            <h3 class="ot-workspace__h">{{ t('analysis.cropView.whatLimits') }}</h3>
            <ul class="ot-bars">
              <li v-for="share in workspace.cropView.value.limiting" :key="share.id">
                <span class="ot-bars__label">{{ dataText(share.label) }}</span>
                <span class="ot-bars__track"><span class="ot-bars__fill ot-bars__fill--limit" :style="{ width: `${share.fraction * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(share.fraction) }}</span>
              </li>
              <li>
                <span class="ot-bars__label">{{ t('analysis.cropView.noLimitation') }}</span>
                <span class="ot-bars__track"><span class="ot-bars__fill" :style="{ width: `${workspace.cropView.value.unlimited * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(workspace.cropView.value.unlimited) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="ot-workspace__section">
          <h3 class="ot-workspace__h">{{ t('analysis.cropView.factors') }}</h3>
          <div class="ot-gallery ot-gallery--factors">
            <figure v-for="factor in workspace.cropView.value.factors" :key="factor.id" class="ot-gallery__item">
              <button
                type="button"
                class="ot-gallery__button"
                :aria-label="t('analysis.cropView.factorAria', { factor: dataText(factor.label) })"
                @click="zoomRaster(`${dataText(factor.label)} · ${dataText(workspace.cropView.value.crop.name)}`, factor.url, factor.values)"
              >
                <img v-if="factor.url" :src="factor.url" :alt="t('analysis.cropView.factorAlt', { factor: dataText(factor.label) })" :style="{ aspectRatio: aspect }" />
              </button>
              <figcaption>
                <strong>{{ dataText(factor.label) }} · {{ formatValue(factor.stats.mean, 2) }}</strong>
                <span>{{ dataText(factor.requirement) }}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <CropRangesTable
          :crop="workspace.cropView.value.crop"
          :variables="workspace.variables.value"
          :factors="workspace.cropView.value.factors"
        />

        <section v-if="workspace.cropView.value.byArea.length" class="ot-workspace__section">
          <h3 class="ot-workspace__h">{{ t('analysis.cropView.meanSuitabilityByArea') }}</h3>
          <dl class="ot-kv ot-kv--columns">
            <template v-for="area in workspace.cropView.value.byArea" :key="area.id">
              <dt>{{ capitalize(areaMeanLabel(area)) }}</dt>
              <dd>{{ formatValue(area.mean, 2) }}</dd>
            </template>
          </dl>
        </section>
      </template>

      <LlmReport
        :title="t('analysis.cropView.interpretationOfSuitability', { crop: workspace.crop.value ? cropLower : t('analysis.cropView.theCrop') })"
        :report="workspace.cropReport"
        :disabled-reason="cropReportBlocked"
        @run="workspace.runCropReport()"
        @stop="workspace.stopCropReport()"
      />
    </template>

    <div v-if="zoomed" class="ot-lightbox" role="dialog" aria-modal="true" :aria-label="zoomed.title" @click.self="close">
      <div class="ot-lightbox__panel">
        <header class="ot-lightbox__header">
          <h3>{{ zoomed.title }}</h3>
          <button ref="closeButton" type="button" class="ot-button" @click="close">{{ t('analysis.results.lightboxClose') }}</button>
        </header>
        <img
          :src="zoomed.url"
          :alt="zoomed.title"
          class="ot-lightbox__image"
          :style="{ aspectRatio: aspect, width: zoomWidth }"
          @mousemove="onHover"
          @mouseleave="readout = null"
        />
        <div class="ot-analysis__ramp" :style="{ background: paletteGradient(zoomed.palette) }" />
        <div class="ot-analysis__ramp-labels">
          <span>{{ formatValue(zoomed.range[0], zoomed.digits) }}</span>
          <span>{{ readout ?? t('analysis.results.hoverReadout') }}</span>
          <span>{{ formatValue(zoomed.range[1], zoomed.digits) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
