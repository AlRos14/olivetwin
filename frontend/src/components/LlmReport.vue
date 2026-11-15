<script setup lang="ts">
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import type { LlmReportState } from '../composables/useLlm'
import { parseMarkdown } from '../services/markdownLite'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Interpretación generada por un modelo de lenguaje. La respuesta se pinta
 * como texto estructurado (nunca como HTML) a medida que llega.
 */
const props = defineProps<{
  title: string
  report: DeepReadonly<LlmReportState>
  /** Motivo por el que no se puede generar todavía (p. ej. datos cargando). */
  disabledReason?: string | null
}>()

const emit = defineEmits<{ run: []; stop: [] }>()

const blocks = computed(() => parseMarkdown(props.report.text))
const running = computed(() => props.report.status === 'running')
</script>

<template>
  <section class="ot-llm" :aria-label="title" :aria-busy="running">
    <header class="ot-llm__header">
      <h3 class="ot-llm__title">{{ title }}</h3>
      <div class="ot-llm__actions">
        <button v-if="running" type="button" class="ot-button" @click="emit('stop')">{{ t('analysis.llm.stop') }}</button>
        <button
          v-else
          type="button"
          class="ot-button ot-llm__run"
          :disabled="Boolean(disabledReason)"
          :title="disabledReason ?? undefined"
          @click="emit('run')"
        >
          {{ report.status === 'done' ? t('analysis.llm.rerun') : t('analysis.llm.run') }}
        </button>
      </div>
    </header>

    <p v-if="report.status === 'idle'" class="ot-hint">
      {{ t('analysis.llm.idle') }}
    </p>
    <p v-if="running && !report.text" class="ot-hint" role="status">{{ t('analysis.llm.generating') }}</p>
    <p v-if="report.status === 'error'" class="ot-analysis__error" role="alert">{{ report.error }}</p>

    <div v-if="report.text" class="ot-llm__body" aria-live="polite">
      <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
        <component :is="`h${block.level + 2}`" v-if="block.kind === 'heading'" class="ot-llm__heading">
          <template v-for="(token, tokenIndex) in block.inline" :key="tokenIndex">
            <strong v-if="token.kind === 'strong'">{{ token.text }}</strong>
            <em v-else-if="token.kind === 'em'">{{ token.text }}</em>
            <code v-else-if="token.kind === 'code'">{{ token.text }}</code>
            <template v-else>{{ token.text }}</template>
          </template>
        </component>
        <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.kind === 'list'" class="ot-llm__list">
          <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
            <template v-for="(token, tokenIndex) in item" :key="tokenIndex">
              <strong v-if="token.kind === 'strong'">{{ token.text }}</strong>
              <em v-else-if="token.kind === 'em'">{{ token.text }}</em>
              <code v-else-if="token.kind === 'code'">{{ token.text }}</code>
              <template v-else>{{ token.text }}</template>
            </template>
          </li>
        </component>
        <p v-else class="ot-llm__paragraph">
          <template v-for="(token, tokenIndex) in block.inline" :key="tokenIndex">
            <strong v-if="token.kind === 'strong'">{{ token.text }}</strong>
            <em v-else-if="token.kind === 'em'">{{ token.text }}</em>
            <code v-else-if="token.kind === 'code'">{{ token.text }}</code>
            <template v-else>{{ token.text }}</template>
          </template>
        </p>
      </template>
      <p v-if="report.model" class="ot-llm__meta">
        {{ t('analysis.llm.generatedBy', { model: report.model }) }}<template v-if="report.stopped">{{ t('analysis.llm.stopped') }}</template><template v-if="running">{{ t('analysis.llm.writing') }}</template>
      </p>
    </div>
  </section>
</template>
