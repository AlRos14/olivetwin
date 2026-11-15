<script setup lang="ts">
import { computed, useId } from 'vue'
import type { UseZoneComparisonReturn } from '../composables/useZoneComparison'
import type { LlmSettings } from '../services/llmClient'
import LlmSettingsPanel from './LlmSettingsPanel.vue'
import '../styles/analysis.css'

/** Controles de la pestaña Comparar: zona A, zona B y cultivo. */
const props = defineProps<{
  comparison: UseZoneComparisonReturn
  settings: LlmSettings
}>()

const emit = defineEmits<{ 'update-settings': [patch: Partial<LlmSettings>] }>()

const uid = useId()
const cmp = computed(() => props.comparison)
const sameZone = computed(() => Boolean(cmp.value.state.zoneAId) && cmp.value.state.zoneAId === cmp.value.state.zoneBId)
</script>

<template>
  <section class="ot-card ot-analysis ot-compare-controls" aria-label="Controles de la comparación">
    <p v-if="comparison.zones.value.length < 2" class="ot-hint">Hacen falta dos zonas con análisis publicado para comparar.</p>

    <template v-else>
      <div class="ot-analysis__pair">
        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-a`"><span class="ot-compare__badge ot-compare__badge--a">A</span> Zona A</label>
          <select :id="`${uid}-a`" class="ot-select" :value="comparison.state.zoneAId ?? ''" @change="comparison.setZoneA(($event.target as HTMLSelectElement).value)">
            <option v-for="zone in comparison.zones.value" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
          </select>
        </div>
        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-b`"><span class="ot-compare__badge ot-compare__badge--b">B</span> Zona B</label>
          <select :id="`${uid}-b`" class="ot-select" :value="comparison.state.zoneBId ?? ''" @change="comparison.setZoneB(($event.target as HTMLSelectElement).value)">
            <option v-for="zone in comparison.zones.value" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
          </select>
        </div>
      </div>
      <p v-if="sameZone" class="ot-analysis__error" role="status">Elige dos zonas distintas.</p>

      <div class="ot-field">
        <label class="ot-label" :for="`${uid}-crop`">Cultivo</label>
        <select
          :id="`${uid}-crop`"
          class="ot-select"
          :value="comparison.state.cropId"
          :disabled="comparison.crops.value.length === 0"
          @change="comparison.setCrop(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="crop in comparison.crops.value" :key="crop.id" :value="crop.id">{{ crop.name }}</option>
        </select>
      </div>

      <LlmSettingsPanel :settings="settings" @update="emit('update-settings', $event)" />
    </template>
  </section>
</template>
