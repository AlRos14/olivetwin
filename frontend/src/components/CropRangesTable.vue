<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisVariable, CropSuitability } from '../types/analysis'
import type { CropFactorView } from '../composables/useAnalysisWorkspace'
import { requirementForVariable, requirementSource } from '../services/cropRequirements'
import { GROUP_LABELS, variableLabel } from './variableLabels'
import '../styles/analysis.css'

/**
 * Rangos óptimo / aceptable / no apto del cultivo para todas las variables del
 * cubo. Los valores son los requisitos citados que publica el pipeline; las
 * variables sin requisito publicado se indican como tales.
 */
const props = defineProps<{
  crop: CropSuitability
  variables: AnalysisVariable[]
  factors: CropFactorView[]
}>()

function pct(value: number): string {
  return `${Math.round(value * 100)} %`
}

const groups = computed(() => {
  const result: { label: string; rows: ReturnType<typeof rowFor>[] }[] = []
  for (const variable of props.variables) {
    const label = GROUP_LABELS[variable.group] ?? variable.group
    let group = result.find((candidate) => candidate.label === label)
    if (!group) {
      group = { label, rows: [] }
      result.push(group)
    }
    group.rows.push(rowFor(variable))
  }
  return result
})

function rowFor(variable: AnalysisVariable) {
  const requirement = requirementForVariable(props.crop, variable.id)
  const factor = requirement?.kind === 'factor' ? props.factors.find((candidate) => candidate.id === requirement.id) : null
  return {
    id: variable.id,
    name: variableLabel(variable),
    requirement,
    source: requirement ? requirementSource(props.crop, requirement) : null,
    shares: factor?.shares ?? null,
  }
}

const sources = computed(() => {
  const unique = new Map<string, string | undefined>()
  for (const group of groups.value) {
    for (const row of group.rows) {
      if (row.source && !unique.has(row.source)) unique.set(row.source, row.requirement?.reference?.url ?? props.crop.source.referenceUrl ?? undefined)
    }
  }
  return [...unique].map(([citation, url]) => ({ citation, url }))
})
</script>

<template>
  <section class="ot-workspace__section" aria-label="Rangos del cultivo por variable">
    <h3 class="ot-workspace__h">Rangos para el {{ crop.name.toLowerCase() }} por variable</h3>
    <div class="ot-ranges__scroll">
      <table class="ot-analysis__table ot-ranges">
        <caption class="ot-sr-only">Rangos óptimo, aceptable y no apto del {{ crop.name }} para cada variable</caption>
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Óptimo</th>
            <th scope="col">Aceptable</th>
            <th scope="col">No apto</th>
            <th scope="col">Zona (ópt. · acept. · no apto)</th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.label">
          <tr class="ot-ranges__group">
            <th colspan="5" scope="colgroup">{{ group.label }}</th>
          </tr>
          <tr v-for="row in group.rows" :key="row.id" :class="{ 'is-unverified': !row.requirement }">
            <th scope="row">{{ row.name }}</th>
            <template v-if="row.requirement?.classes">
              <td>{{ row.requirement.classes.optimal }}</td>
              <td>{{ row.requirement.classes.acceptable }}</td>
              <td>{{ row.requirement.classes.unsuitable }}</td>
            </template>
            <td v-else-if="row.requirement" colspan="3">{{ row.requirement.requirement }}</td>
            <td v-else colspan="3" class="ot-ranges__none">Sin valor de referencia verificado</td>
            <td>
              <template v-if="row.shares">
                {{ pct(row.shares.optimal) }} · {{ pct(row.shares.acceptable) }} · {{ pct(row.shares.unsuitable) }}
              </template>
              <template v-else-if="row.requirement?.kind === 'other'">Fuera del mapa</template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="ot-hint">El mapa de aptitud combina las variables con rango (la peor puntuación manda).</p>
    <details class="ot-hint ot-reference__source">
      <summary>Fuentes</summary>
      <ul>
        <li v-for="source in sources" :key="source.citation">
          {{ source.citation }}
          <a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">Ver fuente</a>
        </li>
      </ul>
    </details>
  </section>
</template>
