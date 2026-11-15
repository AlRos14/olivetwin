<script setup lang="ts">
import { computed } from 'vue'
import type { UseZoneComparisonReturn, ZoneCropView } from '../composables/useZoneComparison'
import type { FactorComparison, Side } from '../services/cropComparison'
import { NO_DATA_CSS, paletteGradient } from '../services/palettes'
import { suitabilityBinLabel } from '../services/cropSuitability'
import { observedText } from '../services/cropRequirements'
import LlmReport from './LlmReport.vue'
import { numberFormatter } from '../i18n/format'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Área principal de la pestaña Comparar: veredicto calculado (qué zona tiene más
 * aptitud para el cultivo y por qué), mapas de aptitud y tabla de factores. Las
 * zonas se nombran solo «Zona A» y «Zona B»: cada una es el recuadro elegido, no
 * su provincia entera.
 */
const props = defineProps<{ comparison: UseZoneComparisonReturn }>()

const cmp = computed(() => props.comparison)
const a = computed(() => cmp.value.viewA.value)
const b = computed(() => cmp.value.viewB.value)
const result = computed(() => cmp.value.comparison.value)
const cropName = computed(() => dataText(cmp.value.crop.value?.name ?? ''))
const crop = computed(() => cropName.value.toLowerCase())

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return numberFormatter({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)} %`
}

function areaName(side: Side): string {
  return side === 'A' ? t('analysis.compare.areaA') : t('analysis.compare.areaB')
}

function zoneTitle(side: Side): string {
  return areaName(side)
}

const verdictTitle = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.winner === 'tie') return t('analysis.compare.verdictTie', { crop: crop.value })
  return t('analysis.compare.verdictWinner', { area: areaName(r.winner), crop: crop.value })
})

const onFarmland = computed(() => a.value?.summary.basis === 'farmland' && b.value?.summary.basis === 'farmland')
const where = computed(() => (onFarmland.value ? t('analysis.compare.whereFarmland') : t('analysis.compare.whereZone')))

const verdictDetail = computed(() => {
  const r = result.value
  if (!r || !a.value || !b.value) return ''
  const sa = a.value.summary
  const sb = b.value.summary
  const share = t('analysis.compare.detailShare', {
    where: where.value,
    a: pct(sa.suitableShare),
    b: pct(sb.suitableShare),
  })
  const mean = t('analysis.compare.detailMean', { a: fmt(sa.mean), b: fmt(sb.mean) })
  const rule =
    r.decidedBy === 'share'
      ? t('analysis.compare.decideShare')
      : r.decidedBy === 'mean'
        ? t('analysis.compare.decideMean')
        : t('analysis.compare.decideNone')
  return `${share} ${mean} ${rule}`
})

/** Frase de cada motivo: qué factor, a quién favorece y con qué valores. */
function reasonText(factor: FactorComparison): string {
  const winner = factor.favors as Side
  const loser: Side = winner === 'A' ? 'B' : 'A'
  const win = winner === 'A' ? factor.a : factor.b
  const lose = loser === 'A' ? factor.a : factor.b
  const parts = [
    t('analysis.compare.reason', {
      factor: dataText(factor.label),
      area: areaName(winner),
      a: fmt(win?.mean),
      b: fmt(lose?.mean),
    }),
  ]
  if (lose && Math.round(lose.limiting * 100) > 0) {
    parts.push(t('analysis.compare.reasonLimiting', { area: areaName(loser), pct: pct(lose.limiting) }))
  }
  return parts.join(' ')
}

/** Valores observados con el separador decimal del idioma activo. */
function observed(view: FactorComparison['a']): string {
  return view?.observed.length ? view.observed.map(observedText).join(' · ') : '—'
}

const zones = computed(() =>
  [
    { side: 'A' as const, view: a.value },
    { side: 'B' as const, view: b.value },
  ].filter((entry): entry is { side: Side; view: ZoneCropView } => Boolean(entry.view)),
)

const reportBlocked = computed(() => {
  if (cmp.value.state.status === 'loading') return t('analysis.compare.blockedLoading')
  if (!result.value) return t('analysis.compare.blockedChoose')
  return null
})
</script>

<template>
  <div class="ot-workspace ot-compare" role="region" :aria-label="t('analysis.compare.region')">
    <header class="ot-workspace__header">
      <h2 class="ot-workspace__title">{{ t('analysis.compare.title') }}{{ cropName ? ` · ${cropName}` : '' }}</h2>
      <p v-if="a && b" class="ot-workspace__subtitle">{{ t('analysis.compare.subtitle') }}{{ onFarmland ? t('analysis.compare.farmlandOnly') : '' }}</p>
    </header>

    <p v-if="comparison.state.status === 'loading'" class="ot-hint" role="status">{{ t('analysis.compare.loading') }}</p>
    <p v-if="comparison.state.status === 'error'" class="ot-analysis__error" role="alert">{{ comparison.state.error }}</p>
    <p v-if="comparison.state.zoneAId && comparison.state.zoneAId === comparison.state.zoneBId" class="ot-hint">
      {{ t('analysis.compare.sameZoneHint') }}
    </p>

    <template v-if="result && a && b">
      <section class="ot-compare__verdict" :class="`is-${result.winner.toLowerCase()}`" :aria-label="t('analysis.compare.verdict')">
        <p class="ot-compare__verdict-title">
          <span v-if="result.winner !== 'tie'" class="ot-compare__badge" :class="`ot-compare__badge--${result.winner.toLowerCase()}`">{{ result.winner }}</span>
          {{ verdictTitle }}
        </p>
        <p class="ot-compare__verdict-detail">{{ verdictDetail }}</p>
        <template v-if="result.reasons.length">
          <h3 class="ot-workspace__h">{{ t('analysis.compare.why') }}</h3>
          <ul class="ot-compare__reasons">
            <li v-for="reason in result.reasons" :key="reason.id">{{ reasonText(reason) }}</li>
          </ul>
        </template>
        <p v-else class="ot-hint">{{ t('analysis.compare.noDifference') }}</p>
      </section>

      <section class="ot-workspace__section">
        <div class="ot-compare__maps">
          <figure v-for="entry in zones" :key="entry.side" class="ot-gallery__item">
            <img
              v-if="entry.view.url"
              :src="entry.view.url"
              :alt="t('analysis.compare.mapAlt', { crop: crop, area: areaName(entry.side) })"
              :style="{ aspectRatio: `${entry.view.grid.width} / ${entry.view.grid.height}` }"
            />
            <figcaption>
              <strong>
                <span class="ot-compare__badge" :class="`ot-compare__badge--${entry.side.toLowerCase()}`">{{ entry.side }}</span>
                {{ t('analysis.compare.mapSummary', { area: zoneTitle(entry.side), suitable: pct(entry.view.summary.suitableShare), mean: fmt(entry.view.summary.mean) }) }}
              </strong>
              <span>
                <template v-for="(bin, index) in entry.view.summary.bins" :key="bin.id">{{ index ? ' · ' : '' }}{{ suitabilityBinLabel(bin.id) }}: {{ pct(bin.fraction) }}</template>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="ot-compare__legend">
          <div class="ot-analysis__ramp" :style="{ background: paletteGradient('suitability') }" />
          <div class="ot-analysis__ramp-labels">
            <span>{{ t('analysis.cropView.rampLow') }}</span>
            <span>{{ t('analysis.cropView.rampHigh') }}</span>
          </div>
          <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />{{ t('analysis.results.noData') }}</p>
        </div>
      </section>

      <section class="ot-workspace__section">
        <h3 class="ot-workspace__h">{{ t('analysis.cropView.factors') }}</h3>
        <div class="ot-ranges__scroll">
          <table class="ot-analysis__table ot-compare__table">
            <caption class="ot-sr-only">{{ t('analysis.compare.tableCaption') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('analysis.compare.factorHeader') }}</th>
                <th scope="col">{{ t('analysis.crops.optimal') }}</th>
                <th scope="col">{{ t('analysis.compare.areaA') }}</th>
                <th scope="col">{{ t('analysis.compare.areaB') }}</th>
                <th scope="col">{{ t('analysis.compare.favoursHeader') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="factor in result.factors" :key="factor.id">
                <th scope="row">{{ dataText(factor.label) }}</th>
                <td>{{ factor.classes ? dataText(factor.classes.optimal) : '—' }}</td>
                <td>
                  <strong>{{ fmt(factor.a?.mean) }}</strong>
                  <span class="ot-hint">{{ observed(factor.a) }}</span>
                </td>
                <td>
                  <strong>{{ fmt(factor.b?.mean) }}</strong>
                  <span class="ot-hint">{{ observed(factor.b) }}</span>
                </td>
                <td>{{ factor.favors === 'tie' ? t('analysis.compare.similar') : zoneTitle(factor.favors) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="ot-hint">
          {{ t('analysis.compare.scoreNote', { where: where }) }}
        </p>
      </section>
    </template>

    <LlmReport
      v-if="result"
      :title="t('analysis.compare.interpretationTitle', { crop: crop })"
      :report="comparison.report"
      :disabled-reason="reportBlocked"
      @run="comparison.runReport()"
      @stop="comparison.stopReport()"
    />
  </div>
</template>
