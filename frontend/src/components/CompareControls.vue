<script setup lang="ts">
import { computed, useId } from 'vue'
import type { UseZoneComparisonReturn } from '../composables/useZoneComparison'
import type { LlmSettings } from '../services/llmClient'
import LlmSettingsPanel from './LlmSettingsPanel.vue'
import { dataText } from '../i18n/dataText'
import { t } from '../i18n'
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
  <section class="ot-card ot-analysis ot-compare-controls" :aria-label="t('analysis.compare.controlsRegion')">
    <p v-if="comparison.zones.value.length < 2" class="ot-hint">{{ t('analysis.compare.needTwo') }}</p>

    <template v-else>
      <div class="ot-analysis__pair">
        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-a`"><span class="ot-compare__badge ot-compare__badge--a">A</span> {{ t('analysis.compare.areaA') }}</label>
          <select :id="`${uid}-a`" class="ot-select" :value="comparison.state.zoneAId ?? ''" @change="comparison.setZoneA(($event.target as HTMLSelectElement).value)">
            <option v-for="zone in comparison.zones.value" :key="zone.id" :value="zone.id">{{ dataText(zone.name) }}</option>
          </select>
        </div>
        <div class="ot-field">
          <label class="ot-label" :for="`${uid}-b`"><span class="ot-compare__badge ot-compare__badge--b">B</span> {{ t('analysis.compare.areaB') }}</label>
          <select :id="`${uid}-b`" class="ot-select" :value="comparison.state.zoneBId ?? ''" @change="comparison.setZoneB(($event.target as HTMLSelectElement).value)">
            <option v-for="zone in comparison.zones.value" :key="zone.id" :value="zone.id">{{ dataText(zone.name) }}</option>
          </select>
        </div>
      </div>
      <p v-if="sameZone" class="ot-analysis__error" role="status">{{ t('analysis.compare.sameZoneError') }}</p>

      <div class="ot-field">
        <label class="ot-label" :for="`${uid}-crop`">{{ t('analysis.controls.crop') }}</label>
        <select
          :id="`${uid}-crop`"
          class="ot-select"
          :value="comparison.state.cropId"
          :disabled="comparison.crops.value.length === 0"
          @change="comparison.setCrop(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="crop in comparison.crops.value" :key="crop.id" :value="crop.id">{{ dataText(crop.name) }}</option>
        </select>
      </div>

      <LlmSettingsPanel :settings="settings" @update="emit('update-settings', $event)" />
    </template>
  </section>
</template>
