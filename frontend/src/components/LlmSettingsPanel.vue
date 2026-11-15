<script setup lang="ts">
import { ref, useId } from 'vue'
import { DEFAULT_LLM_SETTINGS, listModels, LlmError, type LlmSettings } from '../services/llmClient'
import { t } from '../i18n'
import '../styles/analysis.css'

/**
 * Configuración del modelo de lenguaje: cualquier endpoint compatible con la
 * API de OpenAI (por defecto, Ollama local). La clave solo se guarda en la
 * sesión del navegador.
 */
const props = defineProps<{
  settings: LlmSettings
  fetchImpl?: typeof fetch
}>()

const emit = defineEmits<{ update: [patch: Partial<LlmSettings>] }>()

const uid = useId()
const testing = ref(false)
const result = ref<{ ok: boolean; message: string } | null>(null)

function onText(field: 'baseUrl' | 'model' | 'apiKey', event: Event): void {
  emit('update', { [field]: (event.target as HTMLInputElement).value.trim() })
  result.value = null
}

function onVision(event: Event): void {
  emit('update', { vision: (event.target as HTMLInputElement).checked })
}

function restoreDefaults(): void {
  emit('update', { baseUrl: DEFAULT_LLM_SETTINGS.baseUrl, model: DEFAULT_LLM_SETTINGS.model, vision: DEFAULT_LLM_SETTINGS.vision })
  result.value = null
}

async function testConnection(): Promise<void> {
  testing.value = true
  result.value = null
  try {
    const models = await listModels(props.settings, props.fetchImpl)
    const available = models.includes(props.settings.model)
    result.value = {
      ok: available,
      message: available
        ? t('analysis.llm.connected', { model: props.settings.model })
        : t('analysis.llm.connectedMissing', {
            model: props.settings.model,
            list: models.join(', ') || t('analysis.llm.none'),
          }),
    }
  } catch (error) {
    result.value = {
      ok: false,
      message: error instanceof LlmError ? error.message : t('analysis.llm.testFailed'),
    }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <details class="ot-llm-settings">
    <summary>{{ t('analysis.llm.settingsSummary', { model: settings.model }) }}</summary>
    <div class="ot-field">
      <label class="ot-label" :for="`${uid}-url`">{{ t('analysis.llm.endpoint') }}</label>
      <input :id="`${uid}-url`" class="ot-input" type="url" :value="settings.baseUrl" @change="onText('baseUrl', $event)" />
    </div>
    <div class="ot-field">
      <label class="ot-label" :for="`${uid}-model`">{{ t('analysis.llm.model') }}</label>
      <input :id="`${uid}-model`" class="ot-input" type="text" :value="settings.model" @change="onText('model', $event)" />
    </div>
    <div class="ot-field">
      <label class="ot-label" :for="`${uid}-key`">{{ t('analysis.llm.apiKey') }}</label>
      <input
        :id="`${uid}-key`"
        class="ot-input"
        type="password"
        autocomplete="off"
        :value="settings.apiKey"
        :placeholder="t('analysis.llm.apiKeyPlaceholder')"
        @change="onText('apiKey', $event)"
      />
    </div>
    <label class="ot-check">
      <input type="checkbox" :checked="settings.vision" @change="onVision" />
      {{ t('analysis.llm.vision') }}
    </label>
    <div class="ot-llm-settings__actions">
      <button type="button" class="ot-button" :disabled="testing" @click="testConnection">
        {{ testing ? t('analysis.llm.testing') : t('analysis.llm.test') }}
      </button>
      <button type="button" class="ot-button ot-button--quiet" @click="restoreDefaults">{{ t('analysis.llm.defaults') }}</button>
    </div>
    <p v-if="result" :class="result.ok ? 'ot-hint' : 'ot-analysis__error'" role="status">{{ result.message }}</p>
  </details>
</template>
