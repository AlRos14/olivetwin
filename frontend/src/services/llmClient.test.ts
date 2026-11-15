import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LLM_SETTINGS,
  extractSseData,
  listModels,
  LlmError,
  loadLlmSettings,
  saveLlmSettings,
  streamChat,
} from './llmClient'
import { buildCropMessages, buildVariableMessages, SYSTEM_PROMPT } from './llmPrompts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('configuración del modelo', () => {
  it('guarda URL/modelo en local y la clave solo en la sesión', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    saveLlmSettings({ baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'secreto', vision: true }, local, session)
    expect(local.getItem('olivetwin.llm.settings')).not.toContain('secreto')
    expect(loadLlmSettings(local, session)).toEqual({ baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'secreto', vision: true })
    saveLlmSettings({ ...DEFAULT_LLM_SETTINGS, apiKey: '' }, local, session)
    expect(session.getItem('olivetwin.llm.apiKey')).toBeNull()
    expect(loadLlmSettings(null, null)).toEqual(DEFAULT_LLM_SETTINGS)
  })
})

describe('streamChat', () => {
  it('extrae las líneas data: completas y conserva el resto', () => {
    expect(extractSseData('data: {"a":1}\n\ndata: [DONE]\ndata: {"b"')).toEqual({
      payloads: ['{"a":1}', '[DONE]'],
      rest: 'data: {"b"',
    })
  })

  it('acumula el texto en streaming con cabeceras y cuerpo compatibles con OpenAI', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" mundo"}}]}\n',
        '\ndata: [DONE]\n\n',
      ])
    }) as typeof fetch
    const seen: string[] = []
    const text = await streamChat({
      settings: { ...DEFAULT_LLM_SETTINGS, baseUrl: 'http://x/v1/', apiKey: 'k' },
      messages: [{ role: 'user', content: 'hola' }],
      onText: (partial) => seen.push(partial),
      fetchImpl,
    })
    expect(text).toBe('Hola mundo')
    expect(seen).toEqual(['Hola', 'Hola mundo'])
    expect(calls[0].url).toBe('http://x/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ model: 'gemma3:4b', stream: true })
  })

  it('traduce errores de red y HTTP a mensajes legibles', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(streamChat({ settings: DEFAULT_LLM_SETTINGS, messages: [], fetchImpl: offline })).rejects.toThrow(/Ollama/)
    const notFound = (async () => new Response('model not found', { status: 404 })) as typeof fetch
    const error = await streamChat({ settings: DEFAULT_LLM_SETTINGS, messages: [], fetchImpl: notFound }).catch((e) => e)
    expect(error).toBeInstanceOf(LlmError)
    expect(error.message).toContain('404')
    expect(error.message).toContain('model not found')
  })

  it('listModels devuelve los ids del endpoint', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gemma3:4b' }, { id: 'otro' }] }), { status: 200 })) as typeof fetch
    expect(await listModels(DEFAULT_LLM_SETTINGS, fetchImpl)).toEqual(['gemma3:4b', 'otro'])
  })
})

describe('prompts', () => {
  const crop = {
    name: 'Olivo',
    scientificName: 'Olea europaea L.',
    assumptions: 'Secano.',
    sourceLabel: 'FAO ECOCROP — requisitos',
    suitabilityMean: 0.62,
    bins: [{ label: '0,00–0,25', min: 0, max: 0.25, fraction: 0.1 }],
    factors: [{ label: 'pH', requirement: 'Óptimo 6,5–8,0', mean: 0.9 }],
    limiting: [{ id: 'ph', label: 'pH', fraction: 0.4 }],
    unlimited: 0.2,
    byArea: [{ label: 'cuadrante norte', mean: 0.7 }],
  }

  it('el sistema fija las cautelas científicas y el formato', () => {
    expect(SYSTEM_PROMPT).toContain('no mide la cosecha')
    expect(SYSTEM_PROMPT).toContain('PROVISIONAL')
    expect(SYSTEM_PROMPT).toContain('No inventes cifras')
  })

  it('la serie incluye estadísticas, tendencia, clima, cultivo e imágenes si se piden', () => {
    const messages = buildVariableMessages(
      {
        zone: { name: 'Jaén' },
        variable: { title: 'Humedad', unit: 'm³/m³', description: 'd', caveat: 'c', product: 'SME2', maturity: 'PROVISIONAL', palette: 'moisture' },
        range: { from: '2026-06-20', to: '2026-07-02', shown: 2, available: 2 },
        points: [{ date: '2026-06-20', mean: 0.25, median: 0.24, p10: 0.2, p90: 0.3, validFraction: 0.5, rainPrev7d: 3 }],
        trend: { slopePer30Days: -0.02, r2: 0.8 },
        change: { meanDelta: -0.05, increased: 0.1, decreased: 0.7, stable: 0.2, comparable: 0.9, threshold: 0.0175, from: 'a', to: 'b' },
        climate: { precipitationTotal: 12, rainyDays: 2, tMaxMean: 33, tMinMean: 18, et0Total: 80, days: 13 },
        zoneContext: [{ title: 'Pendiente', unit: '°', mean: 8, p10: 2, p90: 15 }],
        crop,
        decimals: 3,
      },
      ['data:image/png;base64,AAA'],
    )
    expect(messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    const content = messages[1].content as { type: string; text?: string }[]
    expect(content[0].type).toBe('text')
    expect(content[0].text).toContain('Jaén')
    expect(content[0].text).toContain('2026-06-20: 0.25')
    expect(content[0].text).toContain('-0.02')
    expect(content[0].text).toContain('lluvia total 12 mm')
    expect(content[0].text).toContain('## Conclusión para el olivo')
    expect(content[0].text).toContain('## Reparto en la zona')
    expect(content[0].text).toContain('es el factor limitante en el 40 % de la superficie')
    expect(content[0].text).toContain('1 = el factor no limita')
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } })
  })

  it('la aptitud pide causas, impacto y remedios, y sin imagen envía solo texto', () => {
    const messages = buildCropMessages({ zone: { name: 'Toledo' }, crop, zoneContext: [] })
    expect(typeof messages[1].content).toBe('string')
    expect(messages[1].content).toContain('## Por qué: variables responsables')
    expect(messages[1].content).toContain('## Impacto en el olivo')
    expect(messages[1].content).toContain('## Cómo remediarlo')
    expect(messages[1].content).toContain('cuadrante norte 0.7')
  })
})
