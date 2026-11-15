<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisVariable, CropSuitability } from '../types/analysis'
import type { CropFactorView } from '../composables/useAnalysisWorkspace'
import {
  requirementForVariable,
  requirementSource,
  requirementSourceText,
  type RequirementSource,
} from '../services/cropRequirements'
import { GROUP_LABELS, variableLabel } from './variableLabels'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
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

const cropLabel = computed(() => dataText(props.crop.name))
const cropLower = computed(() => cropLabel.value.toLowerCase())

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
  const unique = new Map<string, { source: RequirementSource; url: string | undefined }>()
  for (const group of groups.value) {
    for (const row of group.rows) {
      const key = row.source ? `${row.source.citation ?? ''}|${row.source.product ?? ''}` : null
      if (row.source && key && !unique.has(key)) {
        unique.set(key, { source: row.source, url: row.requirement?.reference?.url ?? props.crop.source.referenceUrl ?? undefined })
      }
    }
  }
  return [...unique.values()].map(({ source, url }) => ({ text: requirementSourceText(source), url }))
})
</script>

<template>
  <section class="ot-workspace__section" :aria-label="t('analysis.crops.rangesRegion')">
    <h3 class="ot-workspace__h">{{ t('analysis.crops.rangesTitle', { crop: cropLower }) }}</h3>
    <div class="ot-ranges__scroll">
      <table class="ot-analysis__table ot-ranges">
        <caption class="ot-sr-only">{{ t('analysis.crops.rangesCaption', { crop: cropLabel }) }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('analysis.controls.variable') }}</th>
            <th scope="col">{{ t('analysis.crops.optimal') }}</th>
            <th scope="col">{{ t('analysis.crops.acceptable') }}</th>
            <th scope="col">{{ t('analysis.crops.unsuitable') }}</th>
            <th scope="col">{{ t('analysis.crops.areaHeader') }}</th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.label">
          <tr class="ot-ranges__group">
            <th colspan="5" scope="colgroup">{{ group.label }}</th>
          </tr>
          <tr v-for="row in group.rows" :key="row.id" :class="{ 'is-unverified': !row.requirement }">
            <th scope="row">{{ row.name }}</th>
            <template v-if="row.requirement?.classes">
              <td>{{ dataText(row.requirement.classes.optimal) }}</td>
              <td>{{ dataText(row.requirement.classes.acceptable) }}</td>
              <td>{{ dataText(row.requirement.classes.unsuitable) }}</td>
            </template>
            <td v-else-if="row.requirement" colspan="3">{{ dataText(row.requirement.requirement) }}</td>
            <td v-else colspan="3" class="ot-ranges__none">{{ t('analysis.crops.noReference') }}</td>
            <td>
              <template v-if="row.shares">
                {{ pct(row.shares.optimal) }} · {{ pct(row.shares.acceptable) }} · {{ pct(row.shares.unsuitable) }}
              </template>
              <template v-else-if="row.requirement?.kind === 'other'">{{ t('analysis.crops.outsideMap') }}</template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="ot-hint">{{ t('analysis.crops.rangesNote') }}</p>
    <details class="ot-hint ot-reference__source">
      <summary>{{ t('analysis.crops.sources') }}</summary>
      <ul>
        <li v-for="source in sources" :key="source.text">
          {{ source.text }}
          <a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ t('analysis.crops.viewSource') }}</a>
        </li>
      </ul>
    </details>
  </section>
</template>
