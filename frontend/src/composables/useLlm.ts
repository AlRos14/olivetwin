/**
 * Configuración del modelo de lenguaje y ejecución de informes en streaming.
 */
import { reactive, readonly, watch } from 'vue'
import type { DeepReadonly } from 'vue'

import {
  LlmError,
  loadLlmSettings,
  saveLlmSettings,
  streamChat,
  type ChatMessage,
  type LlmSettings,
} from '../services/llmClient'

export type LlmReportStatus = 'idle' | 'running' | 'done' | 'error'

export interface LlmReportState {
  status: LlmReportStatus
  text: string
  error: string | null
  /** Modelo que generó el texto mostrado. */
  model: string | null
  /** `true` si el usuario detuvo la generación. */
  stopped: boolean
}

/** Configuración reactiva, persistida en el navegador (la clave solo en la sesión). */
export function useLlmSettings(initial: LlmSettings = loadLlmSettings()): LlmSettings {
  const settings = reactive<LlmSettings>({ ...initial })
  watch(settings, (value) => saveLlmSettings({ ...value }), { deep: true })
  return settings
}

export interface UseLlmReportReturn {
  report: DeepReadonly<LlmReportState>
  run(messages: ChatMessage[]): Promise<void>
  stop(): void
  reset(): void
}

export function useLlmReport(settings: LlmSettings, options: { fetchImpl?: typeof fetch } = {}): UseLlmReportReturn {
  const report = reactive<LlmReportState>({ status: 'idle', text: '', error: null, model: null, stopped: false })
  let controller: AbortController | null = null

  function reset(): void {
    controller?.abort()
    controller = null
    report.status = 'idle'
    report.text = ''
    report.error = null
    report.model = null
    report.stopped = false
  }

  async function run(messages: ChatMessage[]): Promise<void> {
    controller?.abort()
    const current = new AbortController()
    controller = current
    report.status = 'running'
    report.text = ''
    report.error = null
    report.stopped = false
    report.model = settings.model
    try {
      const text = await streamChat({
        settings: { ...settings },
        messages,
        signal: current.signal,
        fetchImpl: options.fetchImpl,
        onText: (partial) => {
          if (controller === current) report.text = partial
        },
      })
      if (controller !== current) return
      report.text = text
      report.status = text.trim() ? 'done' : 'error'
      if (!text.trim()) report.error = 'El modelo no devolvió texto.'
    } catch (error) {
      if (controller !== current) return
      if ((error as { name?: string })?.name === 'AbortError') {
        report.stopped = true
        report.status = report.text ? 'done' : 'idle'
        return
      }
      report.status = 'error'
      report.error = error instanceof LlmError ? error.message : 'No se pudo generar la interpretación.'
    } finally {
      if (controller === current) controller = null
    }
  }

  return {
    report: readonly(report),
    run,
    stop() {
      controller?.abort()
    },
    reset,
  }
}
