<script setup lang="ts">
import { computed } from 'vue'
import type { UseZoneComparisonReturn, ZoneCropView } from '../composables/useZoneComparison'
import type { FactorComparison, Side } from '../services/cropComparison'
import { NO_DATA_CSS, paletteGradient } from '../services/palettes'
import LlmReport from './LlmReport.vue'
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
const cropName = computed(() => cmp.value.crop.value?.name ?? '')
const crop = computed(() => cropName.value.toLowerCase())

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)} %`
}

function nameOf(side: Side): string {
  return `zona ${side}`
}

function zoneTitle(side: Side): string {
  return `Zona ${side}`
}

const verdictTitle = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.winner === 'tie') return `La zona A y la zona B tienen una aptitud parecida para el ${crop.value}`
  return `La ${nameOf(r.winner)} es mejor para el ${crop.value}`
})

const onFarmland = computed(() => a.value?.summary.basis === 'farmland' && b.value?.summary.basis === 'farmland')
const where = computed(() => (onFarmland.value ? 'de la superficie agrícola' : 'del recuadro'))

const verdictDetail = computed(() => {
  const r = result.value
  if (!r || !a.value || !b.value) return ''
  const sa = a.value.summary
  const sb = b.value.summary
  const share = `Superficie apta (S1 + S2, aptitud ≥ 0,60) ${where.value}: ${pct(sa.suitableShare)} en la zona A frente a ${pct(sb.suitableShare)} en la zona B.`
  const mean = `Aptitud media: ${fmt(sa.mean)} frente a ${fmt(sb.mean)}.`
  const rule =
    r.decidedBy === 'share'
      ? 'Decide la superficie apta (diferencia de al menos 5 puntos).'
      : r.decidedBy === 'mean'
        ? 'La superficie apta es parecida; decide la aptitud media (diferencia de al menos 0,05).'
        : 'Ni la superficie apta ni la aptitud media difieren lo suficiente para declarar ganador.'
  return `${share} ${mean} ${rule}`
})

/** Frase de cada motivo: qué factor, a quién favorece y con qué valores. */
function reasonText(factor: FactorComparison): string {
  const winner = factor.favors as Side
  const loser: Side = winner === 'A' ? 'B' : 'A'
  const win = winner === 'A' ? factor.a : factor.b
  const lose = loser === 'A' ? factor.a : factor.b
  const parts = [
    `${factor.label}: favorece a la ${nameOf(winner)} (puntuación ${fmt(win?.mean)} frente a ${fmt(lose?.mean)}).`,
  ]
  if (lose && Math.round(lose.limiting * 100) > 0) parts.push(`En la ${nameOf(loser)} es el factor que más limita en el ${pct(lose.limiting)} de la superficie.`)
  return parts.join(' ')
}

/** Valores observados con coma decimal, como el resto de la interfaz. */
function observed(view: FactorComparison['a']): string {
  return view?.observed.join(' · ').replace(/(\d)\.(\d)/g, '$1,$2') || '—'
}

const zones = computed(() =>
  [
    { side: 'A' as const, view: a.value },
    { side: 'B' as const, view: b.value },
  ].filter((entry): entry is { side: Side; view: ZoneCropView } => Boolean(entry.view)),
)

const reportBlocked = computed(() => {
  if (cmp.value.state.status === 'loading') return 'Esperando a que carguen los mapas.'
  if (!result.value) return 'Elige dos zonas distintas y un cultivo.'
  return null
})
</script>

<template>
  <div class="ot-workspace ot-compare" role="region" aria-label="Comparación de zonas">
    <header class="ot-workspace__header">
      <h2 class="ot-workspace__title">Comparar zonas{{ cropName ? ` · ${cropName}` : '' }}</h2>
      <p v-if="a && b" class="ot-workspace__subtitle">Zona A frente a zona B{{ onFarmland ? ' · solo superficie agrícola' : '' }}</p>
    </header>

    <p v-if="comparison.state.status === 'loading'" class="ot-hint" role="status">Cargando los mapas de aptitud…</p>
    <p v-if="comparison.state.status === 'error'" class="ot-analysis__error" role="alert">{{ comparison.state.error }}</p>
    <p v-if="comparison.state.zoneAId && comparison.state.zoneAId === comparison.state.zoneBId" class="ot-hint">
      Elige dos zonas distintas en el panel.
    </p>

    <template v-if="result && a && b">
      <section class="ot-compare__verdict" :class="`is-${result.winner.toLowerCase()}`" aria-label="Veredicto">
        <p class="ot-compare__verdict-title">
          <span v-if="result.winner !== 'tie'" class="ot-compare__badge" :class="`ot-compare__badge--${result.winner.toLowerCase()}`">{{ result.winner }}</span>
          {{ verdictTitle }}
        </p>
        <p class="ot-compare__verdict-detail">{{ verdictDetail }}</p>
        <template v-if="result.reasons.length">
          <h3 class="ot-workspace__h">Por qué</h3>
          <ul class="ot-compare__reasons">
            <li v-for="reason in result.reasons" :key="reason.id">{{ reasonText(reason) }}</li>
          </ul>
        </template>
        <p v-else class="ot-hint">Ningún factor difiere de forma apreciable entre las dos zonas.</p>
      </section>

      <section class="ot-workspace__section">
        <div class="ot-compare__maps">
          <figure v-for="entry in zones" :key="entry.side" class="ot-gallery__item">
            <img
              v-if="entry.view.url"
              :src="entry.view.url"
              :alt="`Mapa de aptitud para el ${crop} en la ${nameOf(entry.side)}`"
              :style="{ aspectRatio: `${entry.view.grid.width} / ${entry.view.grid.height}` }"
            />
            <figcaption>
              <strong>
                <span class="ot-compare__badge" :class="`ot-compare__badge--${entry.side.toLowerCase()}`">{{ entry.side }}</span>
                {{ zoneTitle(entry.side) }} · apta {{ pct(entry.view.summary.suitableShare) }} · media {{ fmt(entry.view.summary.mean) }}
              </strong>
              <span>
                <template v-for="(bin, index) in entry.view.summary.bins" :key="bin.label">{{ index ? ' · ' : '' }}{{ bin.label }}: {{ pct(bin.fraction) }}</template>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="ot-compare__legend">
          <div class="ot-analysis__ramp" :style="{ background: paletteGradient('suitability') }" />
          <div class="ot-analysis__ramp-labels">
            <span>0 · no apto</span>
            <span>1 · óptimo</span>
          </div>
          <p class="ot-nodata"><span class="ot-nodata__swatch" :style="{ background: NO_DATA_CSS }" aria-hidden="true" />Sin dato</p>
        </div>
      </section>

      <section class="ot-workspace__section">
        <h3 class="ot-workspace__h">Factores</h3>
        <div class="ot-ranges__scroll">
          <table class="ot-analysis__table ot-compare__table">
            <caption class="ot-sr-only">Puntuación de cada factor en las dos zonas</caption>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Óptimo</th>
                <th scope="col">Zona A</th>
                <th scope="col">Zona B</th>
                <th scope="col">Favorece a</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="factor in result.factors" :key="factor.id">
                <th scope="row">{{ factor.label }}</th>
                <td>{{ factor.classes?.optimal ?? '—' }}</td>
                <td>
                  <strong>{{ fmt(factor.a?.mean) }}</strong>
                  <span class="ot-hint">{{ observed(factor.a) }}</span>
                </td>
                <td>
                  <strong>{{ fmt(factor.b?.mean) }}</strong>
                  <span class="ot-hint">{{ observed(factor.b) }}</span>
                </td>
                <td>{{ factor.favors === 'tie' ? 'Similar' : zoneTitle(factor.favors) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="ot-hint">
          Puntuación media del factor {{ where }} (1 = no limita). Debajo, el valor observado de la variable en esas mismas celdas.
        </p>
      </section>
    </template>

    <LlmReport
      v-if="result"
      :title="`Interpretación de la comparación para el ${crop}`"
      :report="comparison.report"
      :disabled-reason="reportBlocked"
      @run="comparison.runReport()"
      @stop="comparison.stopReport()"
    />
  </div>
</template>
