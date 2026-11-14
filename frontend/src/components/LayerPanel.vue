<script setup lang="ts">
import { computed, useId } from 'vue'
import type { BaseMap, LayerId, StudyLayer, StudyZone } from '../types/manifest'
import '../styles/ui.css'

/**
 * Panel de capa: mapa base, variable disponible en la zona activa,
 * visibilidad y opacidad (0–1; el slider muestra 0–100 %).
 *
 * No muestra capas que la zona no declare y no renderiza controles que no
 * puedan aplicarse (sin zona o sin capa seleccionada).
 */
const props = defineProps<{
  zone: StudyZone | null
  selectedLayerId: string | null
  opacity: number
  visible: boolean
  baseMap: BaseMap
}>()

const emit = defineEmits<{
  'select-layer': [id: LayerId]
  'update:opacity': [opacity: number]
  'update:visible': [visible: boolean]
  'update:baseMap': [baseMap: BaseMap]
}>()

const uid = useId()
const basemapName = `ot-basemap-${uid}`
const layerName = `ot-layer-${uid}`
const opacityId = `ot-opacity-${uid}`
const visibleId = `ot-visible-${uid}`
const layersTitleId = `ot-layers-${uid}`

const basemaps: ReadonlyArray<{ value: BaseMap; label: string; hint: string }> = [
  { value: 'pnoa', label: 'Ortofoto PNOA', hint: 'Imagen oficial del IGN/CNIG' },
  { value: 'osm', label: 'OpenStreetMap', hint: 'Mapa de calles y localidades' },
]

const layers = computed<StudyLayer[]>(() => props.zone?.layers ?? [])
const selectedLayer = computed<StudyLayer | null>(
  () => layers.value.find((layer) => layer.id === props.selectedLayerId) ?? null,
)

const percent = computed(() => Math.round(clamp(props.opacity) * 100))

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function onBaseMapChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (value !== 'pnoa' && value !== 'osm') return
  if (value !== props.baseMap) emit('update:baseMap', value)
}

function onLayerChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  const layer = layers.value.find((candidate) => candidate.id === value)
  if (layer) emit('select-layer', layer.id)
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
  <section class="ot-card ot-layer-panel" aria-label="Mapa y capa">
    <fieldset class="ot-fieldset">
      <legend class="ot-label">Mapa base</legend>
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
            <span class="ot-option__label">{{ basemap.label }}</span>
            <span class="ot-option__hint">{{ basemap.hint }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <template v-if="zone">
      <div class="ot-field">
        <p :id="layersTitleId" class="ot-label">Variable</p>
        <div
          v-if="layers.length > 0"
          class="ot-options"
          role="radiogroup"
          :aria-labelledby="layersTitleId"
        >
          <label v-for="layer in layers" :key="layer.id" class="ot-option">
            <input
              class="ot-option__input"
              type="radio"
              :name="layerName"
              :value="layer.id"
              :checked="selectedLayerId === layer.id"
              @change="onLayerChange"
            />
            <span class="ot-option__body">
              <span class="ot-option__label">{{ layer.title }}</span>
              <span v-if="layer.variable" class="ot-option__hint">
                {{ layer.variable }}
              </span>
            </span>
          </label>
        </div>
        <p v-else class="ot-hint">
          Esta zona no tiene capas científicas disponibles.
        </p>
      </div>

      <template v-if="selectedLayer">
        <div class="ot-field">
          <span class="ot-label">Visibilidad</span>
          <label class="ot-check" :for="visibleId">
            <input
              :id="visibleId"
              type="checkbox"
              :checked="visible"
              @change="onVisibleChange"
            />
            Mostrar capa en el mapa
          </label>
        </div>

        <div class="ot-field">
          <label class="ot-label" :for="opacityId">Opacidad</label>
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
      <p v-else-if="layers.length > 0" class="ot-hint">
        Selecciona una variable para ajustar la visibilidad y la opacidad.
      </p>
    </template>

    <p v-else class="ot-hint">Selecciona una zona de estudio</p>
  </section>
</template>
