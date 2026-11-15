<script setup lang="ts">
import { computed, useId } from 'vue'
import type { BaseMap, LayerId, StudyLayer, StudyZone } from '../types/manifest'
import type { ExtraVariableOption } from './layerOptions'
import { layerLabel } from './variableLabels'
import { t, type MessageKey } from '../i18n'
import '../styles/ui.css'

/**
 * Panel de capa: mapa base, variable de la zona activa, visibilidad y
 * opacidad (0–1; el slider muestra 0–100 %).
 *
 * Un único desplegable «Variable» reúne las capas que declara la zona en el
 * manifiesto y, si existen, las variables del cubo de análisis (v1.3.0),
 * agrupadas. No renderiza controles que no puedan aplicarse (sin zona o sin
 * variable seleccionada).
 */
const props = withDefaults(
  defineProps<{
    zone: StudyZone | null
    selectedLayerId: string | null
    opacity: number
    visible: boolean
    baseMap: BaseMap
    /** v1.3.0: variables del cubo de análisis que también se pueden pintar. */
    extraVariables?: ExtraVariableOption[]
    /** Variable del cubo activa; `null` si la activa es una capa del manifiesto. */
    selectedVariableId?: string | null
    /** Ofrecer las capas del manifiesto (se ocultan cuando la zona tiene cubo de análisis). */
    showLayers?: boolean
  }>(),
  { extraVariables: () => [], selectedVariableId: null, showLayers: true },
)

const emit = defineEmits<{
  'select-layer': [id: LayerId]
  /** `null` vuelve a la capa del manifiesto. */
  'select-variable': [id: string | null]
  'update:opacity': [opacity: number]
  'update:visible': [visible: boolean]
  'update:baseMap': [baseMap: BaseMap]
}>()

const uid = useId()
const basemapName = `ot-basemap-${uid}`
const variableId = `ot-variable-${uid}`
const opacityId = `ot-opacity-${uid}`
const visibleId = `ot-visible-${uid}`


const basemaps: ReadonlyArray<{ value: BaseMap; labelKey: MessageKey }> = [
  { value: 'pnoa', labelKey: 'layers.panel.satelliteView' },
  { value: 'pnoa-sigpac', labelKey: 'layers.panel.parcelsView' },
  { value: 'osm', labelKey: 'layers.panel.generalView' },
]

const layers = computed<StudyLayer[]>(() => (props.showLayers ? (props.zone?.layers ?? []) : []))
const selectedLayer = computed<StudyLayer | null>(
  () => layers.value.find((layer) => layer.id === props.selectedLayerId) ?? null,
)
const selectedExtra = computed(
  () => props.extraVariables.find((variable) => variable.id === props.selectedVariableId) ?? null,
)
const hasSelection = computed(() => Boolean(selectedExtra.value ?? selectedLayer.value))
const hasOptions = computed(() => layers.value.length > 0 || props.extraVariables.length > 0)

/** Valor del desplegable: `layer:<id>` (manifiesto) o `cube:<id>` (cubo de análisis). */
const selectedValue = computed(() => {
  if (selectedExtra.value) return `cube:${selectedExtra.value.id}`
  if (selectedLayer.value) return `layer:${selectedLayer.value.id}`
  return ''
})


const extraGroups = computed(() => {
  const groups: { label: string; variables: ExtraVariableOption[] }[] = []
  for (const variable of props.extraVariables) {
    let group = groups.find((candidate) => candidate.label === variable.groupLabel)
    if (!group) {
      group = { label: variable.groupLabel, variables: [] }
      groups.push(group)
    }
    group.variables.push(variable)
  }
  return groups
})

const percent = computed(() => Math.round(clamp(props.opacity) * 100))

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function onBaseMapChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value as BaseMap
  if (!basemaps.some((option) => option.value === value)) return
  if (value !== props.baseMap) emit('update:baseMap', value)
}

function onVariableChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value.startsWith('cube:')) {
    emit('select-variable', value.slice(5))
    return
  }
  if (value.startsWith('layer:')) {
    const layer = layers.value.find((candidate) => candidate.id === value.slice(6))
    if (layer) emit('select-layer', layer.id)
  }
}

function onOpacityInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  const clamped = Math.min(100, Math.max(0, Math.round(raw)))
  emit('update:opacity', clamped / 100)
}

function onVisibleChange(event: Event): void {
  emit('update:visible', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="ot-card ot-layer-panel" :aria-label="t('layers.panel.label')">
    <fieldset class="ot-fieldset">
      <legend class="ot-label">{{ t('layers.panel.baseMap') }}</legend>
      <div class="ot-options">
        <label
          v-for="basemap in basemaps"
          :key="basemap.value"
          class="ot-option"
        >
          <input
            class="ot-option__input"
            type="radio"
            :name="basemapName"
            :value="basemap.value"
            :checked="baseMap === basemap.value"
            @change="onBaseMapChange"
          />
          <span class="ot-option__body">
            <span class="ot-option__label">{{ t(basemap.labelKey) }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <template v-if="zone">
      <div class="ot-field">
        <label class="ot-label" :for="variableId">{{ t('layers.panel.variable') }}</label>
        <select v-if="hasOptions" :id="variableId" class="ot-select" :value="selectedValue" @change="onVariableChange">
          <option value="" disabled>{{ t('layers.panel.chooseVariable') }}</option>
          <option v-for="layer in layers" :key="layer.id" :value="`layer:${layer.id}`">
            {{ layerLabel(layer) }}
          </option>
          <optgroup v-for="group in extraGroups" :key="group.label" :label="group.label">
            <option v-for="variable in group.variables" :key="variable.id" :value="`cube:${variable.id}`">
              {{ variable.title }}
            </option>
          </optgroup>
        </select>
        <p v-else class="ot-hint">
          {{ t('layers.panel.noLayers') }}
        </p>
      </div>

      <template v-if="hasSelection">
        <div class="ot-field">
          <span class="ot-label">{{ t('layers.panel.visibility') }}</span>
          <label class="ot-check" :for="visibleId">
            <input
              :id="visibleId"
              type="checkbox"
              :checked="visible"
              @change="onVisibleChange"
            />
            {{ t('layers.panel.showLayer') }}
          </label>
        </div>

        <div class="ot-field">
          <label class="ot-label" :for="opacityId">{{ t('layers.panel.opacity') }}</label>
          <div class="ot-range-row">
            <input
              :id="opacityId"
              class="ot-range"
              type="range"
              min="0"
              max="100"
              step="1"
              :value="percent"
              :aria-valuetext="`${percent} %`"
              @input="onOpacityInput"
            />
            <output :for="opacityId">{{ percent }} %</output>
          </div>
        </div>
      </template>
      <p v-else-if="hasOptions" class="ot-hint">
        {{ t('layers.panel.selectVariableHint') }}
      </p>
    </template>

    <p v-else class="ot-hint">{{ t('layers.panel.selectZone') }}</p>
  </section>
</template>
