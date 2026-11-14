<script setup lang="ts">
import { useId } from 'vue'
import type { DataMode } from '../types/manifest'
import '../styles/ui.css'

/**
 * Selector segmentado `Datos de muestra | Datos reales`.
 *
 * Usa radios nativos dentro de un `role="radiogroup"`: el navegador aporta la
 * navegación con flechas y el foco de teclado sin lógica adicional. El estado
 * es controlado por el padre mediante `modelValue`.
 */
const props = defineProps<{
  modelValue: DataMode
}>()

const emit = defineEmits<{
  'update:modelValue': [mode: DataMode]
}>()

const uid = useId()
const labelId = `ot-data-mode-label-${uid}`
const groupName = `ot-data-mode-${uid}`

const options: ReadonlyArray<{ value: DataMode; label: string; hint: string }> = [
  { value: 'sample', label: 'Datos de muestra', hint: 'Capas científicas sintéticas' },
  { value: 'real', label: 'Datos reales', hint: 'Solo datos del pipeline validado' },
]

function onChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (value !== 'sample' && value !== 'real') return
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <section class="ot-card ot-mode-switch" aria-label="Modo de datos">
    <p :id="labelId" class="ot-label">Modo de datos</p>
    <div class="ot-segmented" role="radiogroup" :aria-labelledby="labelId">
      <label
        v-for="option in options"
        :key="option.value"
        class="ot-segmented__option"
        :class="{ 'is-selected': modelValue === option.value }"
      >
        <input
          class="ot-segmented__input"
          type="radio"
          :name="groupName"
          :value="option.value"
          :checked="modelValue === option.value"
          @change="onChange"
        />
        <span class="ot-segmented__text">
          <span class="ot-segmented__label">{{ option.label }}</span>
          <span class="ot-segmented__hint">{{ option.hint }}</span>
        </span>
      </label>
    </div>
  </section>
</template>
