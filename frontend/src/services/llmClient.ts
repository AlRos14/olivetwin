/**
 * Cliente mínimo para modelos de lenguaje con API compatible con OpenAI
 * (`/v1/chat/completions`, con streaming SSE): Ollama, llama.cpp, vLLM, LM
 * Studio o proveedores en la nube.
 *
 * La aplicación es estática, así que el navegador llama directamente al
 * endpoint configurado. La URL, el modelo y la opción de imágenes se guardan
 * en `localStorage`; la clave de API, si hace falta, solo en `sessionStorage`
 * (se borra al cerrar el navegador) y nunca forma parte del repositorio.
 */

export interface LlmSettings {
  baseUrl: string
  model: string
  apiKey: string
  /** Adjuntar las imágenes de la serie (solo modelos con visión). */
  vision: boolean
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'gemma3:4b',
  apiKey: '',
  vision: false,
}

const SETTINGS_KEY = 'olivetwin.llm.settings'
const API_KEY_KEY = 'olivetwin.llm.apiKey'

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window !== 'undefined' ? window[kind] : null
  } catch {
    return null
  }
}

export function loadLlmSettings(
  local: Storage | null = safeStorage('localStorage'),
  session: Storage | null = safeStorage('sessionStorage'),
): LlmSettings {
  const settings = { ...DEFAULT_LLM_SETTINGS }
  try {
    const raw = local?.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LlmSettings>
      if (typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()) settings.baseUrl = parsed.baseUrl.trim()
      if (typeof parsed.model === 'string' && parsed.model.trim()) settings.model = parsed.model.trim()
      if (typeof parsed.vision === 'boolean') settings.vision = parsed.vision
    }
    settings.apiKey = session?.getItem(API_KEY_KEY) ?? ''
  } catch {
    return { ...DEFAULT_LLM_SETTINGS }
  }
  return settings
}

export function saveLlmSettings(
  settings: LlmSettings,
  local: Storage | null = safeStorage('localStorage'),
  session: Storage | null = safeStorage('sessionStorage'),
): void {
  try {
    local?.setItem(
      SETTINGS_KEY,
      JSON.stringify({ baseUrl: settings.baseUrl, model: settings.model, vision: settings.vision }),
    )
    if (settings.apiKey) session?.setItem(API_KEY_KEY, settings.apiKey)
    else session?.removeItem(API_KEY_KEY)
  } catch {
    // Almacenamiento no disponible (modo privado): la configuración dura lo que la página.
  }
}

export type LlmErrorCode = 'network' | 'http' | 'format'

export class LlmError extends Error {
  readonly code: LlmErrorCode
  readonly status?: number

  constructor(code: LlmErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.status = status
  }
}

export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatPart[]
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function headers(settings: LlmSettings): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey) result.Authorization = `Bearer ${settings.apiKey}`
  return result
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string })?.name === 'AbortError'
}

function networkError(settings: LlmSettings): LlmError {
  return new LlmError(
    'network',
    `No se pudo conectar con el modelo en ${settings.baseUrl}. Comprueba que el servidor (p. ej. Ollama) está en marcha y admite peticiones desde esta página.`,
  )
}

/** Separa las líneas `data:` completas de un buffer SSE y devuelve el resto sin terminar. */
export function extractSseData(buffer: string): { payloads: string[]; rest: string } {
  const lines = buffer.split(/\r?\n/)
  const rest = lines.pop() ?? ''
  const payloads: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) payloads.push(trimmed.slice(5).trim())
  }
  return { payloads, rest }
}

function deltaOf(payload: string): string {
  const parsed = JSON.parse(payload) as {
    choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[]
    error?: { message?: string }
  }
  if (parsed.error) throw new LlmError('http', `El modelo devolvió un error: ${parsed.error.message ?? 'sin detalle'}`)
  const choice = parsed.choices?.[0]
  return choice?.delta?.content ?? choice?.message?.content ?? ''
}

export interface StreamChatOptions {
  settings: LlmSettings
  messages: ChatMessage[]
  signal?: AbortSignal
  /** Recibe el texto acumulado tras cada fragmento. */
  onText?: (text: string) => void
  temperature?: number
  /** Límite de la respuesta, para que un modelo local no se alargue sin fin. */
  maxTokens?: number
  fetchImpl?: typeof fetch
}

/** Envía la conversación y devuelve el texto completo; `onText` recibe el progreso. */
export async function streamChat(options: StreamChatOptions): Promise<string> {
  const { settings, messages, signal, onText } = options
  const fetchFn = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchFn(endpoint(settings.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: headers(settings),
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 900,
      }),
      signal,
    })
  } catch (error) {
    if (isAbort(error)) throw error
    throw networkError(settings)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).slice(0, 300)
    } catch {
      detail = ''
    }
    throw new LlmError('http', `El modelo respondió con HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status)
  }

  let text = ''
  if (!response.body) {
    const raw = await response.text()
    for (const payload of extractSseData(`${raw}\n`).payloads) {
      if (payload === '[DONE]') break
      text += deltaOf(payload)
    }
    onText?.(text)
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  try {
    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const { payloads, rest } = extractSseData(buffer)
      buffer = rest
      for (const payload of payloads) {
        if (payload === '[DONE]') {
          done = true
          break
        }
        let delta: string
        try {
          delta = deltaOf(payload)
        } catch (error) {
          if (error instanceof LlmError) throw error
          throw new LlmError('format', 'La respuesta del modelo no tiene el formato esperado (API compatible con OpenAI).')
        }
        if (delta) {
          text += delta
          onText?.(text)
        }
      }
    }
  } catch (error) {
    if (isAbort(error) || error instanceof LlmError) throw error
    throw networkError(settings)
  } finally {
    reader.releaseLock()
  }
  return text
}

/** Lista los modelos del endpoint (`GET /models`), útil para probar la conexión. */
export async function listModels(settings: LlmSettings, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  let response: Response
  try {
    response = await fetchImpl(endpoint(settings.baseUrl, '/models'), { headers: headers(settings) })
  } catch {
    throw networkError(settings)
  }
  if (!response.ok) throw new LlmError('http', `El endpoint respondió con HTTP ${response.status}`, response.status)
  const body = (await response.json()) as { data?: { id?: string }[] }
  return (body.data ?? []).map((entry) => entry.id ?? '').filter(Boolean)
}
