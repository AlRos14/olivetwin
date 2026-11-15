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


const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'series', label: 'Análisis de una variable' },
  { value: 'crop', label: 'Aptitud por cultivo' },
]

function formatDate(date: string | null): string {
  return formatIsoDate(date, date || 'Sin fecha')
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
  if (available === 0) return 'No hay fechas en el intervalo elegido.'
  const spacing = spacingDays !== null ? ` (una cada ~${Math.round(spacingDays)} días)` : ''
  if (requested > available) return `Solo hay ${available} ${available === 1 ? 'fecha' : 'fechas'} en el intervalo: se muestran todas${spacing}.`
  return `Se muestran ${indices.length} de ${available} fechas disponibles${spacing}.`
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
  <section class="ot-card ot-analysis" aria-label="Controles del análisis">
    <p v-if="status === 'idle'" class="ot-hint">Esta zona no tiene cubo de análisis publicado.</p>
    <p v-else-if="status === 'loading'" class="ot-hint" role="status">Cargando el análisis de la zona…</p>
    <p v-else-if="status === 'error'" class="ot-analysis__error" role="alert">{{ error }}</p>

    <template v-else>
      <div class="ot-analysis__views ot-analysis__views--two" role="radiogroup" aria-label="Tipo de análisis">
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
          <label class="ot-label" :for="`${uid}-variable`">Variable</label>
          <select :id="`${uid}-variable`" class="ot-select" :value="workspace.state.variableId ?? ''" @change="onVariable">
            <optgroup v-for="group in groups" :key="group.group" :label="group.label">
              <option v-for="option in group.variables" :key="option.id" :value="option.id">
                {{ variableLabel(option) }}
              </option>
            </optgroup>
          </select>
        </div>

        <p v-if="workspace.isSingle.value" class="ot-hint">
          Una sola imagen<template v-if="steps[0]?.date"> ({{ formatDate(steps[0].date) }})</template>: se analiza su reparto en la zona.
        </p>

        <div v-if="!workspace.isSingle.value" class="ot-analysis__pair">
          <div class="ot-field">
            <label class="ot-label" :for="`${uid}-from`">Desde</label>
            <select :id="`${uid}-from`" class="ot-select" :value="workspace.state.fromIndex" @change="onFrom">
              <option v-for="(step, index) in steps" :key="step.data" :value="index">{{ formatDate(step.date) }}</option>
            </select>
          </div>
          <div class="ot-field">
            <label class="ot-label" :for="`${uid}-to`">Hasta</label>
            <select :id="`${uid}-to`" class="ot-select" :value="workspace.state.toIndex" @change="onTo">
              <option v-for="(step, index) in steps" :key="step.data" :value="index">{{ formatDate(step.date) }}</option>
            </select>
          </div>
        </div>

        <div v-if="!workspace.isSingle.value" class="ot-field">
          <label class="ot-label" :for="`${uid}-samples`">
            Imágenes: {{ Math.min(workspace.state.sampleCount, maxSamples) }}
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
          <label class="ot-label" :for="`${uid}-crop`">Cultivo para la conclusión</label>
          <select :id="`${uid}-crop`" class="ot-select" :value="workspace.state.cropId" @change="onCrop">
            <option value="">Análisis general</option>
            <option v-for="crop in workspace.crops.value" :key="crop.id" :value="crop.id">{{ crop.name }}</option>
          </select>
        </div>
      </template>

      <div v-else class="ot-field">
        <label class="ot-label" :for="`${uid}-crop-map`">Cultivo</label>
        <select :id="`${uid}-crop-map`" class="ot-select" :value="workspace.state.cropId" @change="onCrop">
          <option v-for="crop in workspace.crops.value" :key="crop.id" :value="crop.id">{{ crop.name }}</option>
        </select>
      </div>

      <LlmSettingsPanel :settings="settings" @update="emit('update-settings', $event)" />
    </template>
  </section>
</template>
