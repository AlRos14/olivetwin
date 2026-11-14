<script setup lang="ts">
import { computed, useId } from 'vue'
import type { StudyZone } from '../types/manifest'
import '../styles/ui.css'

/**
 * Selector de zona de estudio. Sin zonas en el manifiesto activo queda
 * deshabilitado y explica por qué; nunca inventa opciones.
 */
const props = defineProps<{
  zones: StudyZone[]
  modelValue: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
}>()

const uid = useId()
const selectId = `ot-zone-select-${uid}`
const hintId = `ot-zone-hint-${uid}`
const labelId = `ot-zone-label-${uid}`

const isEmpty = computed(() => props.zones.length === 0)
const isDisabled = computed(() => props.disabled === true || isEmpty.value)
const placeholder = computed(() =>
  isEmpty.value ? 'No hay zonas disponibles' : 'Selecciona una zona',
)

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value === '' ? null : value)
}
</script>

<template>
  <section class="ot-card ot-zone-selector" :aria-labelledby="labelId">
    <label class="ot-label" :id="labelId" :for="selectId">Zona de estudio</label>
    <select
      :id="selectId"
      class="ot-select"
      :value="modelValue ?? ''"
      :disabled="isDisabled"
      :aria-describedby="isEmpty ? hintId : undefined"
      @change="onChange"
    >
      <option value="">{{ placeholder }}</option>
      <option v-for="zone in zones" :key="zone.id" :value="zone.id">
        {{ zone.name }}
      </option>
    </select>
    <p v-if="isEmpty" :id="hintId" class="ot-hint">
      No hay zonas disponibles en este modo de datos.
    </p>
  </section>
</template>
