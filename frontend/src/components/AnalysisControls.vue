<script setup lang="ts">
import { computed, useId } from 'vue'
import type { AnalysisVariable } from '../types/analysis'
import type { AnalysisStatus } from '../composables/useZoneAnalysis'
import type { UseAnalysisWorkspaceReturn, WorkspaceMode } from '../composables/useAnalysisWorkspace'
import type { LlmSettings } from '../services/llmClient'
import { MAX_SAMPLES } from '../services/seriesAnalysis'
import { formatDate as formatIsoDate } from '../services/dateFormat'
import LlmSettingsPanel from './LlmSettingsPanel.vue'
import { GROUP_LABELS, variableLabel } from './variableLabels'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
import '../styles/analysis.css'

/** Controles de la pestaña Análisis (panel derecho). */
const props = defineProps<{
  workspace: UseAnalysisWorkspaceReturn
  status: AnalysisStatus
  error: string | null
  settings: LlmSettings
}>()

const emit = defineEmits<{ 'update-settings': [patch: Partial<LlmSettings>] }>()

const uid = useId()


const MODES = computed<{ value: WorkspaceMode; label: string }[]>(() => [
  { value: 'series', label: t('analysis.modes.series') },
  { value: 'crop', label: t('analysis.modes.crop') },
])

function formatDate(date: string | null): string {
  return formatIsoDate(date, date || t('analysis.controls.noDate'))
}

const ws = computed(() => props.workspace)

const groups = computed(() => {
  const result: { group: string; label: string; variables: AnalysisVariable[] }[] = []
  for (const variable of ws.value.variables.value) {
    let entry = result.find((candidate) => candidate.group === variable.group)
    if (!entry) {
      entry = { group: variable.group, label: GROUP_LABELS[variable.group] ?? variable.group, variables: [] }
      result.push(entry)
    }
    entry.variables.push(variable)
  }
  return result
})

const steps = computed(() => ws.value.variable.value?.steps ?? [])
const maxSamples = computed(() => Math.max(1, Math.min(MAX_SAMPLES, ws.value.sampling.value.available)))
const samplingNote = computed(() => {
  const { available, requested, indices, spacingDays } = ws.value.sampling.value
  if (available === 0) return t('analysis.controls.samplingNone')
  const spacing = spacingDays !== null ? t('analysis.controls.spacing', { days: Math.round(spacingDays) }) : ''
  if (requested > available) return t('analysis.controls.samplingAll', { count: available, spacing })
  return t('analysis.controls.samplingSome', { shown: indices.length, available, spacing })
})

function onVariable(event: Event): void {
  ws.value.selectVariable((event.target as HTMLSelectElement).value)
}

function onFrom(event: Event): void {
  ws.value.setRange(Number((event.target as HTMLSelectElement).value), ws.value.state.toIndex)
}

function onTo(event: Event): void {
  ws.value.setRange(ws.value.state.fromIndex, Number((event.target as HTMLSelectElement).value))
}

function onSamples(event: Event): void {
  ws.value.setSampleCount(Number((event.target as HTMLInputElement).value))
}

function onCrop(event: Event): void {
  ws.value.setCrop((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <section class="ot-card ot-analysis" :aria-label="t('analysis.controls.region')">
    <p v-if="status === 'idle'" class="ot-hint">{{ t('analysis.controls.noCube') }}</p>
    <p v-else-if="status === 'loading'" class="ot-hint" role="status">{{ t('analysis.controls.loading') }}</p>
    <p v-else-if="status === 'error'" class="ot-analysis__error" role="alert">{{ error }}</p>

    <template v-else>
      <div class="ot-analysis__views ot-analysis__views--two" role="radiogroup" :aria-label="t('analysis.controls.type')">
        <button
          v-for="mode in MODES"
          :key="mode.value"
          type="button"
          role="radio"
          class="ot-analysis__view"
          :class="{ 'is-selected': workspace.state.mode === mode.value }"
          :aria-checked="workspace.state.mode === mode.value"
          :disabled="mode.value === 'crop' && workspace.crops.value.length === 0"
          @click="workspace.setMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>

      <template v-if="workspace.state.mode === 'series'">
        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-variable`">{{ t('analysis.controls.variable') }}</label>
          <select :id="`${uid}-variable`" class="ot-select" :value="workspace.state.variableId ?? ''" @change="onVariable">
            <optgroup v-for="group in groups" :key="group.group" :label="group.label">
              <option v-for="option in group.variables" :key="option.id" :value="option.id">
                {{ variableLabel(option) }}
              </option>
            </optgroup>
          </select>
        </div>

        <p v-if="workspace.isSingle.value" class="ot-hint">
          {{ steps[0]?.date ? t('analysis.controls.singleImageDated', { date: formatDate(steps[0].date) }) : t('analysis.controls.singleImage') }}
        </p>

        <div v-if="!workspace.isSingle.value" class="ot-analysis__pair">
          <div class="ot-field">
            <label class="ot-label" :for="`${uid}-from`">{{ t('analysis.controls.from') }}</label>
            <select :id="`${uid}-from`" class="ot-select" :value="workspace.state.fromIndex" @change="onFrom">
              <option v-for="(step, index) in steps" :key="step.data" :value="index">{{ formatDate(step.date) }}</option>
            </select>
          </div>
          <div class="ot-field">
            <label class="ot-label" :for="`${uid}-to`">{{ t('analysis.controls.to') }}</label>
            <select :id="`${uid}-to`" class="ot-select" :value="workspace.state.toIndex" @change="onTo">
              <option v-for="(step, index) in steps" :key="step.data" :value="index">{{ formatDate(step.date) }}</option>
            </select>
          </div>
        </div>

        <div v-if="!workspace.isSingle.value" class="ot-field">
          <label class="ot-label" :for="`${uid}-samples`">
            {{ t('analysis.controls.images', { count: Math.min(workspace.state.sampleCount, maxSamples) }) }}
          </label>
          <input
            :id="`${uid}-samples`"
            type="range"
            min="1"
            :max="maxSamples"
            step="1"
            :value="Math.min(workspace.state.sampleCount, maxSamples)"
            :disabled="maxSamples <= 1"
            @input="onSamples"
          />
          <p class="ot-hint" role="status">{{ samplingNote }}</p>
        </div>

        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-crop`">{{ t('analysis.controls.cropConclusion') }}</label>
          <select :id="`${uid}-crop`" class="ot-select" :value="workspace.state.cropId" @change="onCrop">
            <option value="">{{ t('analysis.controls.general') }}</option>
            <option v-for="crop in workspace.crops.value" :key="crop.id" :value="crop.id">{{ dataText(crop.name) }}</option>
          </select>
        </div>
      </template>

      <div v-else class="ot-field">
        <label class="ot-label" :for="`${uid}-crop-map`">{{ t('analysis.controls.crop') }}</label>
        <select :id="`${uid}-crop-map`" class="ot-select" :value="workspace.state.cropId" @change="onCrop">
          <option v-for="crop in workspace.crops.value" :key="crop.id" :value="crop.id">{{ dataText(crop.name) }}</option>
        </select>
      </div>

      <LlmSettingsPanel :settings="settings" @update="emit('update-settings', $event)" />
    </template>
  </section>
</template>
