<script setup lang="ts">
import { computed } from 'vue'
import type { RequirementView } from '../composables/useAnalysisWorkspace'
import { requirementSourceText } from '../services/cropRequirements'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
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

const cropLabel = computed(() => dataText(props.cropName))
const cropLower = computed(() => cropLabel.value.toLowerCase())
const requirement = computed(() => props.view.requirement)
const requirementLabel = computed(() => (requirement.value ? dataText(requirement.value.label) : ''))
const requirementText = computed(() => (requirement.value ? dataText(requirement.value.requirement) : ''))
const sourceText = computed(() => (props.view.source ? requirementSourceText(props.view.source) : ''))

const rows = computed(() => {
  const classes = requirement.value?.classes
  if (!classes) return []
  const shares = props.view.shares
  return [
    { key: 'optimal', label: t('analysis.crops.optimal'), range: dataText(classes.optimal), share: shares ? pct(shares.optimal) : null },
    { key: 'acceptable', label: t('analysis.crops.acceptable'), range: dataText(classes.acceptable), share: shares ? pct(shares.acceptable) : null },
    { key: 'unsuitable', label: t('analysis.crops.unsuitable'), range: dataText(classes.unsuitable), share: shares ? pct(shares.unsuitable) : null },
  ]
})
</script>

<template>
  <section class="ot-workspace__section ot-reference" :aria-label="t('analysis.crops.referenceRegion')">
    <h3 class="ot-workspace__h">{{ t('analysis.crops.referenceTitle', { crop: cropLower }) }}</h3>

    <template v-if="requirement">
      <p class="ot-reference__label">{{ requirementLabel }}</p>
      <table v-if="rows.length" class="ot-analysis__table ot-reference__table">
        <caption class="ot-sr-only">{{ t('analysis.crops.referenceCaption', { label: requirementLabel, crop: cropLabel }) }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('analysis.crops.classHeader') }}</th>
            <th scope="col">{{ t('analysis.crops.valuesHeader') }}</th>
            <th v-if="view.shares" scope="col">{{ t('analysis.crops.shareHeader') }}</th>
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
      <p v-else class="ot-reference__text">{{ requirementText }}</p>
      <p v-if="requirement.kind === 'other'" class="ot-hint">
        {{ t('analysis.crops.notInMap', { reason: requirement.reason ? dataText(requirement.reason) : '' }) }}
      </p>
      <details v-if="view.source" class="ot-hint ot-reference__source">
        <summary>{{ t('analysis.crops.source') }}</summary>
        <p>
          {{ sourceText }}
          <a v-if="requirement.reference?.url" :href="requirement.reference.url" target="_blank" rel="noopener noreferrer">{{ t('analysis.crops.viewTable') }}</a>
        </p>
      </details>
    </template>

    <p v-else class="ot-reference__text">
      {{ t('analysis.crops.noRequirement', { variable: dataText(variableName), crop: cropLower }) }}
    </p>
  </section>
</template>
