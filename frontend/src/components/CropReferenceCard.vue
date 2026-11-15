<script setup lang="ts">
import { computed } from 'vue'
import type { RequirementView } from '../composables/useAnalysisWorkspace'
import '../styles/analysis.css'

/**
 * Valores de referencia de la variable para el cultivo elegido. Salen tal cual
 * del cubo (requisitos citados por el pipeline), no de la IA, así que son
 * siempre los mismos para el mismo cultivo y variable.
 */
const props = defineProps<{
  cropName: string
  variableName: string
  view: RequirementView
}>()

function pct(value: number): string {
  return `${Math.round(value * 100)} %`
}

const requirement = computed(() => props.view.requirement)
const rows = computed(() => {
  const classes = requirement.value?.classes
  if (!classes) return []
  const shares = props.view.shares
  return [
    { key: 'optimal', label: 'Óptimo', range: classes.optimal, share: shares ? pct(shares.optimal) : null },
    { key: 'acceptable', label: 'Aceptable', range: classes.acceptable, share: shares ? pct(shares.acceptable) : null },
    { key: 'unsuitable', label: 'No apto', range: classes.unsuitable, share: shares ? pct(shares.unsuitable) : null },
  ]
})
</script>

<template>
  <section class="ot-workspace__section ot-reference" aria-label="Valores de referencia del cultivo">
    <h3 class="ot-workspace__h">Valores de referencia para el {{ cropName.toLowerCase() }}</h3>

    <template v-if="requirement">
      <p class="ot-reference__label">{{ requirement.label }}</p>
      <table v-if="rows.length" class="ot-analysis__table ot-reference__table">
        <caption class="ot-sr-only">Tramos de {{ requirement.label }} para el {{ cropName }}</caption>
        <thead>
          <tr>
            <th scope="col">Tramo</th>
            <th scope="col">Valores</th>
            <th v-if="view.shares" scope="col">Superficie de la zona</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :class="`ot-reference__row--${row.key}`">
            <th scope="row">{{ row.label }}</th>
            <td>{{ row.range }}</td>
            <td v-if="view.shares">{{ row.share }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="ot-reference__text">{{ requirement.requirement }}</p>
      <p v-if="requirement.kind === 'other'" class="ot-hint">
        No entra en el mapa de aptitud{{ requirement.reason ? `: ${requirement.reason}` : '.' }}
      </p>
      <details class="ot-hint ot-reference__source">
        <summary>Fuente</summary>
        <p>
          {{ view.source }}
          <a v-if="requirement.reference?.url" :href="requirement.reference.url" target="_blank" rel="noopener noreferrer">Ver tabla</a>
        </p>
      </details>
    </template>

    <p v-else class="ot-reference__text">
      Sin valor de referencia verificado: «{{ variableName }}» es un indicador del estado del terreno o del cultivo, no
      un requisito agronómico publicado para el {{ cropName.toLowerCase() }}.
    </p>
  </section>
</template>
