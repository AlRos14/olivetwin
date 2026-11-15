<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { TimeStep } from '../types/manifest'
import '../styles/ui.css'
import { formatDate, formatDateTime } from '../services/dateFormat'
import { t } from '../i18n'

/**
 * Línea temporal de la capa activa (WP-07, contrato v1.2.0).
 *
 * - Solo se renderiza con dos o más pasos: un único paso no aporta control.
 * - Es controlado por el padre (`modelValue` + `update:modelValue`).
 * - La reproducción avanza un paso cada 1,5 s y se detiene en el último; al
 *   pulsar «Reproducir» estando en el último vuelve a empezar por el primero.
 * - Cualquier interacción manual (slider o botones) o un cambio de `steps`
 *   cancela la reproducción. Al desmontar se limpia el temporizador.
 * - Fechas en ISO 8601 (UTC) en todos los idiomas; nunca MM/DD/YYYY.
 */
const props = defineProps<{
  steps: TimeStep[]
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [index: number]
}>()

const PLAYBACK_INTERVAL_MS = 1500

const uid = useId()
const sliderId = `ot-time-slider-${uid}`

const lastIndex = computed(() => Math.max(0, props.steps.length - 1))

/** Índice efectivo: tolera `null` o valores fuera de rango sin romper el slider. */
const currentIndex = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return Math.min(lastIndex.value, Math.max(0, Math.round(value)))
})

const activeStep = computed<TimeStep | null>(() => props.steps[currentIndex.value] ?? null)

const activeDateLabel = computed(() =>
  activeStep.value ? formatLongDate(activeStep.value) : t('layers.timeSlider.noDate'),
)

const stepLabel = computed(() =>
  t('layers.timeSlider.step', { current: currentIndex.value + 1, total: props.steps.length }),
)

const isPlaying = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
/** Posición interna de la reproducción; no depende del refresco de props. */
let cursor = 0

/** Etiqueta de las marcas: la fecha en ISO 8601; `label` solo si la fecha no es válida. */
function markLabel(step: TimeStep): string {
  return formatDate(step.date, step.label?.trim() || t('layers.timeSlider.noDate'))
}

/** Fecha completa para el estado visible y `aria-valuetext`. */
function formatLongDate(step: TimeStep): string {
  return formatDateTime(step.date, t('layers.timeSlider.noDate'))
}

function emitIndex(index: number): void {
  if (!Number.isFinite(index)) return
  const bounded = Math.min(lastIndex.value, Math.max(0, Math.round(index)))
  emit('update:modelValue', bounded)
}

function stopPlayback(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  isPlaying.value = false
}

function tick(): void {
  if (cursor >= lastIndex.value) {
    stopPlayback()
    return
  }
  cursor += 1
  emitIndex(cursor)
  if (cursor >= lastIndex.value) stopPlayback()
}

function togglePlayback(): void {
  if (isPlaying.value) {
    stopPlayback()
    return
  }

  // En el último paso, «Reproducir» reinicia la secuencia desde el primero.
  cursor = currentIndex.value >= lastIndex.value ? 0 : currentIndex.value
  emitIndex(cursor)
  isPlaying.value = true
  timer = setInterval(tick, PLAYBACK_INTERVAL_MS)
}

function stepBy(delta: number): void {
  stopPlayback()
  emitIndex(currentIndex.value + delta)
}

function onRangeInput(event: Event): void {
  stopPlayback()
  emitIndex(Number((event.target as HTMLInputElement).value))
}

watch(
  () => props.steps,
  () => stopPlayback(),
  { deep: true },
)

onBeforeUnmount(stopPlayback)
</script>

<template>
  <section v-if="steps.length >= 2" class="ot-time-slider" :aria-label="t('layers.timeSlider.label')">
    <div class="ot-time-slider__header">
      <label :for="sliderId" class="ot-time-slider__label">{{ t('layers.timeSlider.acquisitionDate') }}</label>
      <p class="ot-time-slider__status" aria-live="polite">
        {{ stepLabel }} · {{ activeDateLabel }}
      </p>
    </div>

    <input
      :id="sliderId"
      class="ot-time-slider__range"
      type="range"
      min="0"
      :max="lastIndex"
      step="1"
      :value="currentIndex"
      :aria-valuetext="activeDateLabel"
      @input="onRangeInput"
    />

    <ol class="ot-time-slider__marks" aria-hidden="true">
      <li
        v-for="(step, index) in steps"
        :key="`${step.date}-${index}`"
        class="ot-time-slider__mark"
        :class="{ 'ot-time-slider__mark--active': index === currentIndex }"
      >
        {{ markLabel(step) }}
      </li>
    </ol>

    <div class="ot-time-slider__controls">
      <button
        type="button"
        class="ot-button ot-button--quiet ot-button--small"
        :disabled="currentIndex <= 0"
        @click="stepBy(-1)"
      >
        {{ t('layers.timeSlider.previous') }}
      </button>
      <button
        type="button"
        class="ot-button ot-button--small ot-time-slider__play"
        :aria-pressed="isPlaying ? 'true' : 'false'"
        @click="togglePlayback"
      >
        {{ isPlaying ? t('layers.timeSlider.pause') : t('layers.timeSlider.play') }}
      </button>
      <button
        type="button"
        class="ot-button ot-button--quiet ot-button--small"
        :disabled="currentIndex >= lastIndex"
        @click="stepBy(1)"
      >
        {{ t('layers.timeSlider.next') }}
      </button>
    </div>
  </section>
</template>
