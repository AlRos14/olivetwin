<script setup lang="ts">
import { computed } from 'vue'
import { variableRelevance } from './variableRelevance'
import { t } from '../i18n'
import '../styles/ui.css'

/** Recuadro «Relevancia» de Capas: qué es la capa visible y para qué sirve en el cultivo. */
const props = defineProps<{
  /** Id de la variable visible (en el vocabulario del cubo de análisis). */
  variableId: string | null
}>()

const info = computed(() => variableRelevance(props.variableId))
</script>

<template>
  <section v-if="info" class="ot-card ot-relevance" :aria-label="t('layers.relevance.label')">
    <h2 class="ot-section-title">{{ t('layers.relevance.title') }}</h2>
    <p class="ot-relevance__text"><strong>{{ t('layers.relevance.what') }}</strong> {{ info.what }}</p>
    <p class="ot-relevance__text"><strong>{{ t('layers.relevance.crop') }}</strong> {{ info.crop }}</p>
  </section>
</template>

<style scoped>
.ot-relevance {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ot-relevance .ot-section-title {
  margin: 0;
}

.ot-relevance__text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
}
</style>
