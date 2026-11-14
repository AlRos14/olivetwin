<script setup lang="ts">
import { computed } from 'vue'
import type { DataMode, StudyLayer } from '../types/manifest'
import '../styles/ui.css'

/**
 * Procedencia y calidad de la capa activa. Una fecha desconocida se declara
 * como «Fecha no disponible»; nunca se inventa ni se deduce del proveedor.
 */
const props = defineProps<{
  layer: StudyLayer | null
  dataMode: DataMode
}>()

const modeLabel = computed(() =>
  props.dataMode === 'sample' ? 'Datos de muestra' : 'Datos reales',
)

const acquisitionLabel = computed(() => {
  const value = props.layer?.provenance.acquisitionDate
  if (!value) return 'Fecha no disponible'
  return formatAcquisitionDate(value)
})

const extraRows = computed<Array<{ label: string; value: string }>>(() => {
  const provenance = props.layer?.provenance
  if (!provenance) return []
  const definitions: ReadonlyArray<[key: string, label: string]> = [
    ['maturity', 'Madurez'],
    ['approvedBy', 'Aprobado por'],
  ]
  const rows: Array<{ label: string; value: string }> = []
  for (const [key, label] of definitions) {
    const raw = provenance[key]
    if (raw === null || raw === undefined || raw === '') continue
    rows.push({ label, value: displayValue(raw) })
  }
  return rows
})

/** Fecha ISO 8601 en formato es-ES, siempre en UTC para no desplazar el día. */
function formatAcquisitionDate(value: string): string {
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
      return 'Fecha no disponible'
    }
    return formatUtcDate(date, false)
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  // Con hora y zona, la fecha se presenta en UTC y se indica explícitamente:
  // formatear en la zona local del navegador podría cambiar el día.
  return `${formatUtcDate(date, true)} UTC`
}

function formatUtcDate(date: Date, withTime: boolean): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
    timeZone: 'UTC',
  }).format(date)
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
</script>

<template>
  <section class="ot-card ot-provenance" aria-label="Procedencia y calidad">
    <h2 class="ot-section-title">Procedencia y calidad</h2>

    <template v-if="layer">
      <dl class="ot-provenance__list">
        <dt>Proveedor</dt>
        <dd>{{ layer.provenance.provider }}</dd>

        <dt>Producto</dt>
        <dd>{{ layer.provenance.product }}</dd>

        <dt>Fecha</dt>
        <dd>{{ acquisitionLabel }}</dd>

        <template v-if="layer.provenance.sceneId">
          <dt>Escena</dt>
          <dd>{{ layer.provenance.sceneId }}</dd>
        </template>

        <dt>Procesamiento</dt>
        <dd>{{ layer.provenance.processingVersion }}</dd>

        <template v-if="layer.provenance.referenceUrl">
          <dt>Referencia</dt>
          <dd>
            <a
              class="ot-provenance__link"
              :href="layer.provenance.referenceUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir referencia del producto
            </a>
          </dd>
        </template>

        <template v-if="layer.provenance.note">
          <dt>Nota</dt>
          <dd>{{ layer.provenance.note }}</dd>
        </template>

        <template v-for="row in extraRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>

      <p class="ot-provenance__quality">
        <span class="ot-provenance__quality-label">Calidad:</span>
        {{ layer.qualityNote }}
      </p>

      <p class="ot-provenance__mode">Modo de datos: {{ modeLabel }}</p>
    </template>

    <p v-else class="ot-hint">
      Selecciona una capa para consultar su procedencia y sus limitaciones.
    </p>
  </section>
</template>
