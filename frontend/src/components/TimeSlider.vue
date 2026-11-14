<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { TimeStep } from '../types/manifest'
import '../styles/ui.css'

/**
 * Línea temporal de la capa activa (WP-07, contrato v1.2.0).
 *
 * - Solo se renderiza con dos o más pasos: un único paso no aporta control.
 * - Es controlado por el padre (`modelValue` + `update:modelValue`).
 * - La reproducción avanza un paso cada 1,5 s y se detiene en el último; al
 *   pulsar «Reproducir» estando en el último vuelve a empezar por el primero.
 * - Cualquier interacción manual (slider o botones) o un cambio de `steps`
 *   cancela la reproducción. Al desmontar se limpia el temporizador.
 * - Las fechas se formatean siempre en UTC para no desplazar el día.
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
  activeStep.value ? formatLongDate(activeStep.value) : 'Fecha no disponible',
)

const isPlaying = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
/** Posición interna de la reproducción; no depende del refresco de props. */
let cursor = 0

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const LONG_DATETIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/** ISO 8601 estricto para fechas sin hora; evita que `2026-13-40` se desborde. */
function parseStepDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }
    return date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function hasTimeComponent(value: string): boolean {
  return !/^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Etiqueta de las marcas: `label` del contrato o fecha corta en UTC. */
function markLabel(step: TimeStep): string {
  const label = step.label?.trim()
  if (label) return label
  const date = parseStepDate(step.date)
  return date ? SHORT_DATE_FORMAT.format(date) : 'Fecha no disponible'
}

/** Fecha completa para el estado visible y `aria-valuetext`. */
function formatLongDate(step: TimeStep): string {
  const date = parseStepDate(step.date)
  if (!date) return 'Fecha no disponible'
  if (hasTimeComponent(step.date)) {
    return `${LONG_DATETIME_FORMAT.format(date)} UTC`
  }
  return LONG_DATE_FORMAT.format(date)
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
  <section v-if="steps.length >= 2" class="ot-time-slider" aria-label="Línea temporal de la capa">
    <div class="ot-time-slider__header">
      <label :for="sliderId" class="ot-time-slider__label">Fecha de adquisición</label>
      <p class="ot-time-slider__status" aria-live="polite">
        Paso {{ currentIndex + 1 }} de {{ steps.length }} · {{ activeDateLabel }}
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
        Anterior
      </button>
      <button
        type="button"
        class="ot-button ot-button--small ot-time-slider__play"
        :aria-pressed="isPlaying ? 'true' : 'false'"
        @click="togglePlayback"
      >
        {{ isPlaying ? 'Pausar' : 'Reproducir' }}
      </button>
      <button
        type="button"
        class="ot-button ot-button--quiet ot-button--small"
        :disabled="currentIndex >= lastIndex"
        @click="stepBy(1)"
      >
        Siguiente
      </button>
    </div>
  </section>
</template>
