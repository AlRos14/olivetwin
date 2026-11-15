<script setup lang="ts">
import { computed } from 'vue'
import { variableRelevance } from './variableRelevance'
import '../styles/ui.css'

/** Recuadro «Relevancia» de Capas: qué es la capa visible y para qué sirve en el cultivo. */
const props = defineProps<{
  /** Id de la variable visible (en el vocabulario del cubo de análisis). */
  variableId: string | null
}>()

const info = computed(() => variableRelevance(props.variableId))
</script>

<template>
  <section v-if="info" class="ot-card ot-relevance" aria-label="Relevancia">
    <h2 class="ot-section-title">Relevancia</h2>
    <p class="ot-relevance__text"><strong>Qué es.</strong> {{ info.what }}</p>
    <p class="ot-relevance__text"><strong>Para el cultivo.</strong> {{ info.crop }}</p>
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
