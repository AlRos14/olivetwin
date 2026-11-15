<script setup lang="ts">
import { formatDate as formatIsoDate } from '../services/dateFormat'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { UseAnalysisWorkspaceReturn } from '../composables/useAnalysisWorkspace'
import type { ZoneSeries } from '../types/analysis'
import { NO_DATA_CSS, paletteGradient, type PaletteName } from '../services/palettes'
import { rainBefore } from '../services/seriesAnalysis'
import SeriesChart from './SeriesChart.vue'
import DistributionChart from './DistributionChart.vue'
import HistogramChart from './HistogramChart.vue'
import CropReferenceCard from './CropReferenceCard.vue'
import CropRangesTable from './CropRangesTable.vue'
import LlmReport from './LlmReport.vue'
import { variableLabel } from './variableLabels'
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

function formatDate(date: string | null | undefined): string {
  return formatIsoDate(date, date || '—')
}

function formatValue(value: number | null | undefined, digits = decimals.value): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(value)
}

function formatSigned(value: number | null | undefined, digits = decimals.value): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)} %`
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
  if (!variable.value) return 'Elige una variable.'
  if (ws.value.state.seriesStatus === 'loading') return 'Esperando a que carguen las imágenes.'
  if (ws.value.candidates.value.length === 0) return 'No hay fechas en el intervalo.'
  if (!ws.value.rangeStats.value) return 'Esperando a que carguen las fechas del intervalo.'
  return null
})

const cropReportBlocked = computed(() => {
  if (!ws.value.crop.value) return 'Elige un cultivo.'
  if (ws.value.state.cropStatus !== 'ready') return 'Esperando a que carguen los mapas de aptitud.'
  return null
})

// --- Ampliación con lectura del dato bajo el cursor ---------------------------
interface Zoomed {
  title: string
  url: string
  values: Float32Array
  unit: string
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
  readout.value = Number.isNaN(value) ? 'Sin dato en esta celda' : `${formatValue(value, item.digits)} ${item.unit}`
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
    title: `Cambio de ${variableLabel(target).toLowerCase()} · ${formatDate(change.fromDate)} → ${formatDate(change.toDate)}`,
    url: change.url,
    values: change.values,
    unit: target.unit,
    digits: decimals.value,
    palette: 'change',
    range: change.range,
  })
}

function zoomRaster(title: string, url: string | null, values: Float32Array): void {
  if (!url) return
  open({ title, url, values, unit: '(0 = no apto, 1 = óptimo)', digits: 2, palette: 'suitability', range: [0, 1] })
}
</script>

<template>
  <div class="ot-workspace" role="region" aria-label="Resultados del análisis">
    <template v-if="workspace.state.mode === 'series'">
      <header class="ot-workspace__header">
        <h2 class="ot-workspace__title">{{ variable ? variableLabel(variable) : 'Análisis' }}</h2>
        <p v-if="variable && isSingle" class="ot-workspace__subtitle">
          {{ zoneName }}<template v-if="rangeSteps[0]?.date"> · {{ formatDate(rangeSteps[0].date) }}</template>
        </p>
        <p v-else-if="variable && rangeSteps.length" class="ot-workspace__subtitle">
          {{ zoneName }} · {{ formatDate(rangeSteps[0].date) }} – {{ formatDate(rangeSteps[rangeSteps.length - 1].date) }}
        </p>
      </header>

      <p v-if="workspace.state.seriesStatus === 'loading'" class="ot-hint" role="status">Cargando imágenes…</p>
      <p v-if="workspace.state.seriesStatus === 'error'" class="ot-analysis__error" role="alert">{{ workspace.state.seriesError }}</p>

      <div v-if="variable" class="ot-workspace__legend">
        <div class="ot-analysis__ramp" :style="{ background: paletteGradient(variable.palette) }" />
        <div class="ot-analysis__ramp-labels">
          <span>{{ formatValue(variable.displayRange[0]) }}</span>
          <span class="ot-hint">{{ variable.unit }}</span>
          <span>{{ formatValue(variable.displayRange[1]) }}</span>
        </div>
        <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />Sin dato</p>
      </div>

      <div v-if="workspace.frames.value.length" class="ot-gallery" :class="{ 'ot-gallery--single': isSingle }">
        <figure v-for="(frame, position) in workspace.frames.value" :key="frame.index" class="ot-gallery__item">
          <button
            type="button"
            class="ot-gallery__button"
            :aria-label="frame.date ? `Ampliar ${formatDate(frame.date)}` : 'Ampliar la imagen'"
            @click="zoomFrame(position)"
          >
            <img
              v-if="frame.url"
              :src="frame.url"
              :alt="`${variable ? variableLabel(variable) : ''}${frame.date ? ` el ${formatDate(frame.date)}` : ''}`"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <figcaption>
            <strong v-if="frame.date">{{ frameTitle(frame.date) }}</strong>
            <span>media {{ formatValue(frame.mean) }}</span>
          </figcaption>
        </figure>
      </div>

      <section v-if="workspace.change.value" class="ot-workspace__section">
        <h3 class="ot-workspace__h">
          Cambio {{ formatDate(workspace.change.value.fromDate) }} → {{ formatDate(workspace.change.value.toDate) }}
        </h3>
        <div class="ot-workspace__change">
          <button type="button" class="ot-gallery__button" aria-label="Ampliar el mapa de cambio" @click="zoomChange">
            <img
              v-if="workspace.change.value.url"
              :src="workspace.change.value.url"
              alt="Mapa de cambio entre la primera y la última fecha"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <div class="ot-workspace__change-info">
            <div class="ot-analysis__ramp" :style="{ background: paletteGradient('change') }" />
            <div class="ot-analysis__ramp-labels">
              <span>{{ formatSigned(workspace.change.value.range[0]) }}</span>
              <span class="ot-hint">{{ variable?.unit }}</span>
              <span>{{ formatSigned(workspace.change.value.range[1]) }}</span>
            </div>
            <p v-if="commonFraction !== null" class="ot-hint">En la zona común ({{ pct(commonFraction) }} de la superficie):</p>
            <dl class="ot-kv">
              <dt>Cambio medio</dt>
              <dd>{{ formatSigned(workspace.change.value.summary.meanDelta) }} {{ variable?.unit }}</dd>
              <dt>Suben</dt>
              <dd>{{ pct(workspace.change.value.summary.increased) }}</dd>
              <dt>Bajan</dt>
              <dd>{{ pct(workspace.change.value.summary.decreased) }}</dd>
              <dt>Estables (±{{ formatValue(workspace.change.value.summary.threshold) }})</dt>
              <dd>{{ pct(workspace.change.value.summary.stable) }}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section v-if="variable && spatial && (singleStep || (commonFraction && !isSingle))" class="ot-workspace__section ot-workspace__charts">
        <div>
          <h3 class="ot-workspace__h">Reparto en la zona{{ isSingle ? '' : ' (media del intervalo)' }}</h3>
          <HistogramChart :bins="spatial.histogram" :unit="variable.unit" :palette="variable.palette" :decimals="decimals" />
        </div>
        <div>
          <h3 class="ot-workspace__h">Por partes de la zona</h3>
          <dl class="ot-kv">
            <template v-for="area in spatial.byArea" :key="area.label">
              <dt>{{ area.label.charAt(0).toUpperCase() + area.label.slice(1) }}</dt>
              <dd>{{ formatValue(area.mean) }} {{ variable.unit }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section v-if="variable && singleStep" class="ot-workspace__section">
        <h3 class="ot-workspace__h">Valores</h3>
        <table class="ot-analysis__table ot-values">
          <caption class="ot-sr-only">Estadísticas de la zona</caption>
          <thead>
            <tr>
              <th scope="col">Media</th>
              <th scope="col">Mediana</th>
              <th scope="col">p10–p90</th>
              <th scope="col">Mín–máx</th>
              <th scope="col">Con dato</th>
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
        <p class="ot-hint">Unidad: {{ variable.unit }}.</p>
      </section>

      <p v-if="commonFraction !== null && variable && !isSingle" class="ot-hint ot-workspace__common">
        Medias, gráficas y valores sobre la zona con dato en todas las fechas del intervalo: {{ pct(commonFraction) }} de la superficie.
      </p>
      <p v-if="commonFraction === 0 && !isSingle" class="ot-analysis__error" role="status">
        Ninguna celda tiene dato en todas las fechas del intervalo: acorta el intervalo para comparar.
      </p>

      <section v-if="variable && rangeSteps.length >= 2 && commonFraction" class="ot-workspace__section ot-workspace__charts">
        <div>
          <h3 class="ot-workspace__h">Evolución de la media en la zona</h3>
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
          <h3 class="ot-workspace__h">Distribución por fecha</h3>
          <DistributionChart
            :dates="rangeSteps.map((step) => step.date)"
            :stats="rangeSteps.map((step) => step.stats)"
            :unit="variable.unit"
            :decimals="decimals"
          />
        </div>
      </section>

      <section v-if="variable && tableRows.length && !isSingle" class="ot-workspace__section">
        <h3 class="ot-workspace__h">Valores</h3>
        <table class="ot-analysis__table ot-values">
          <caption class="ot-sr-only">Estadísticas de la zona por fecha</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Media</th>
              <th scope="col">Δ</th>
              <th scope="col">Mediana</th>
              <th scope="col">p10–p90</th>
              <th scope="col">Con dato</th>
              <th scope="col">Lluvia 7 d</th>
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
          Unidad: {{ variable.unit }}. «Con dato»: superficie observada ese día. En negrita, las fechas que se muestran como imagen.
        </p>
      </section>

      <CropReferenceCard
        v-if="variable && workspace.crop.value && workspace.requirementView.value"
        :crop-name="workspace.crop.value.name"
        :variable-name="variableLabel(variable)"
        :view="workspace.requirementView.value"
      />

      <LlmReport
        :title="workspace.crop.value ? `Interpretación para ${workspace.crop.value.name.toLowerCase()}` : 'Interpretación'"
        :report="workspace.variableReport"
        :disabled-reason="variableReportBlocked"
        @run="workspace.runVariableReport()"
        @stop="workspace.stopVariableReport()"
      />
    </template>

    <template v-else>
      <header class="ot-workspace__header">
        <h2 class="ot-workspace__title">Aptitud para {{ workspace.crop.value?.name.toLowerCase() ?? 'el cultivo' }}</h2>
        <p v-if="workspace.crop.value" class="ot-workspace__subtitle">
          {{ zoneName }} · <em>{{ workspace.crop.value.scientificName }}</em> · {{ workspace.crop.value.assumptions }}
        </p>
      </header>

      <p v-if="workspace.state.cropStatus === 'loading'" class="ot-hint" role="status">Cargando mapas de aptitud…</p>
      <p v-if="workspace.state.cropStatus === 'error'" class="ot-analysis__error" role="alert">{{ workspace.state.cropError }}</p>

      <template v-if="workspace.cropView.value && workspace.state.cropStatus === 'ready'">
        <section class="ot-workspace__section ot-crop">
          <button
            type="button"
            class="ot-gallery__button ot-crop__map"
            aria-label="Ampliar el mapa de aptitud"
            @click="zoomRaster(`Aptitud para ${workspace.cropView.value.crop.name.toLowerCase()}`, workspace.cropView.value.url, workspace.cropView.value.values)"
          >
            <img
              v-if="workspace.cropView.value.url"
              :src="workspace.cropView.value.url"
              :alt="`Mapa de aptitud para ${workspace.cropView.value.crop.name}`"
              :style="{ aspectRatio: aspect }"
            />
          </button>
          <div class="ot-crop__info">
            <div class="ot-analysis__ramp" :style="{ background: paletteGradient('suitability') }" />
            <div class="ot-analysis__ramp-labels">
              <span>0 · no apto</span>
              <span>1 · óptimo</span>
            </div>
            <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />Sin dato</p>
            <p class="ot-crop__score">
              Aptitud media <strong>{{ formatValue(workspace.cropView.value.crop.suitability.stats.mean, 2) }}</strong>
            </p>
            <h3 class="ot-workspace__h">Superficie por tramos</h3>
            <ul class="ot-bars">
              <li v-for="bin in workspace.cropView.value.bins" :key="bin.label">
                <span class="ot-bars__label">{{ bin.label }}</span>
                <span class="ot-bars__track"><span class="ot-bars__fill" :style="{ width: `${bin.fraction * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(bin.fraction) }}</span>
              </li>
            </ul>
            <h3 class="ot-workspace__h">Qué limita</h3>
            <ul class="ot-bars">
              <li v-for="share in workspace.cropView.value.limiting" :key="share.id">
                <span class="ot-bars__label">{{ share.label }}</span>
                <span class="ot-bars__track"><span class="ot-bars__fill ot-bars__fill--limit" :style="{ width: `${share.fraction * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(share.fraction) }}</span>
              </li>
              <li>
                <span class="ot-bars__label">Sin limitación</span>
                <span class="ot-bars__track"><span class="ot-bars__fill" :style="{ width: `${workspace.cropView.value.unlimited * 100}%` }" /></span>
                <span class="ot-bars__value">{{ pct(workspace.cropView.value.unlimited) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="ot-workspace__section">
          <h3 class="ot-workspace__h">Factores</h3>
          <div class="ot-gallery ot-gallery--factors">
            <figure v-for="factor in workspace.cropView.value.factors" :key="factor.id" class="ot-gallery__item">
              <button
                type="button"
                class="ot-gallery__button"
                :aria-label="`Ampliar ${factor.label}`"
                @click="zoomRaster(`${factor.label} · ${workspace.cropView.value.crop.name}`, factor.url, factor.values)"
              >
                <img v-if="factor.url" :src="factor.url" :alt="`Puntuación de ${factor.label}`" :style="{ aspectRatio: aspect }" />
              </button>
              <figcaption>
                <strong>{{ factor.label }} · {{ formatValue(factor.stats.mean, 2) }}</strong>
                <span>{{ factor.requirement }}</span>
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
          <h3 class="ot-workspace__h">Aptitud media por partes de la zona</h3>
          <dl class="ot-kv ot-kv--columns">
            <template v-for="area in workspace.cropView.value.byArea" :key="area.label">
              <dt>{{ area.label }}</dt>
              <dd>{{ formatValue(area.mean, 2) }}</dd>
            </template>
          </dl>
        </section>
      </template>

      <LlmReport
        :title="`Interpretación de la aptitud para ${workspace.crop.value?.name.toLowerCase() ?? 'el cultivo'}`"
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
          <button ref="closeButton" type="button" class="ot-button" @click="close">Cerrar</button>
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
          <span>{{ readout ?? 'Pasa el cursor por la imagen para leer el dato' }}</span>
          <span>{{ formatValue(zoomed.range[1], zoomed.digits) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
