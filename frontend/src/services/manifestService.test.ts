import { describe, expect, it } from 'vitest'

import {
  isAbortError,
  loadManifest,
  ManifestLoadError,
} from './manifestService'
import {
  makeLayer,
  makeManifest,
  makeZone,
  sampleManifest,
} from './__fixtures__/manifestFixtures'

interface FetchCall {
  input: RequestInfo | URL
  init?: RequestInit
}

function jsonResponse(body: unknown, status = 200): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response
}

function recordingFetch(response: Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    return response
  }) as typeof fetch
  return { fetchImpl, calls }
}

async function expectLoadError(
  promise: Promise<unknown>,
  code: ManifestLoadError['code'],
): Promise<ManifestLoadError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestLoadError)
    const loadError = error as ManifestLoadError
    expect(loadError.code).toBe(code)
    return loadError
  }
  throw new Error('Se esperaba un ManifestLoadError y la carga se resolvió')
}

describe('loadManifest', () => {
  it('construye la URL del modo con la base indicada, sin caché y con signal', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(sampleManifest()))
    const controller = new AbortController()

    await loadManifest('sample', {
      base: '/olivetwin/',
      fetchImpl,
      signal: controller.signal,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toBe('/olivetwin/data/sample/manifest.json')
    expect(calls[0]?.init?.cache).toBe('no-cache')
    expect(calls[0]?.init?.signal).toBe(controller.signal)
  })

  it('usa la raíz de BASE_URL cuando no se indica base', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(makeManifest('real')))
    await loadManifest('real', { fetchImpl })
    expect(calls[0]?.input).toBe('/data/real/manifest.json')
  })

  it('devuelve ready con las zonas de un manifiesto sample válido', async () => {
    const manifest = sampleManifest()
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const result = await loadManifest('sample', { fetchImpl })

    expect(result.status).toBe('ready')
    expect(result.manifest.zones.map((zone) => zone.id)).toEqual([
      'jaen-demo',
      'toledo-demo',
    ])
  })

  it('devuelve empty (no error) para un manifiesto real sin zonas', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse(makeManifest('real', [])))

    const result = await loadManifest('real', { fetchImpl })

    expect(result.status).toBe('empty')
    expect(result.manifest.datasetMode).toBe('real')
    expect(result.manifest.zones).toEqual([])
  })

  it('informa de un 404 con mensaje en español', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse('no encontrado', 404))

    const error = await expectLoadError(loadManifest('real', { fetchImpl }), 'http')

    expect(error.httpStatus).toBe(404)
    expect(error.message).toContain('No se encontró el manifiesto')
    expect(error.message).toContain('«real»')
  })

  it('informa de otros códigos HTTP sin intentar parsear el cuerpo', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse('boom', 500))

    const error = await expectLoadError(loadManifest('sample', { fetchImpl }), 'http')

    expect(error.httpStatus).toBe(500)
    expect(error.message).toContain('HTTP 500')
  })

  it('rechaza un JSON mal formado', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse('{ "zones": [ }', 200))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'invalid-json',
    )

    expect(error.message).toContain('no es un JSON válido')
  })

  it('rechaza un manifiesto que no cumple el esquema e incluye el primer error', async () => {
    const invalid = makeManifest('sample')
    delete (invalid as Partial<typeof invalid>).schemaVersion
    const { fetchImpl } = recordingFetch(jsonResponse(invalid))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'schema',
    )

    expect(error.message).toContain('no cumple el contrato')
    expect(error.message).toContain('schemaVersion')
  })

  it('rechaza que el datasetMode no coincida con el modo solicitado', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse(makeManifest('sample')))

    const error = await expectLoadError(loadManifest('real', { fetchImpl }), 'mode-mismatch')

    expect(error.message).toContain('declara el modo «sample»')
    expect(error.message).toContain('se esperaba «real»')
  })

  it('deja al esquema un datasetMode fuera del enum en lugar de anticipar mode-mismatch', async () => {
    const manifest = makeManifest('sample')
    ;(manifest as { datasetMode: string }).datasetMode = 'otro'
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'schema',
    )

    expect(error.message).toContain('no cumple el contrato')
    expect(error.message).toContain('datasetMode')
  })

  it('trata como esquema un manifiesto sin lista de zonas sin lanzar TypeError', async () => {
    const manifest = makeManifest('sample') as unknown as Record<string, unknown>
    manifest.zones = null
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'schema',
    )

    expect(error.message).toContain('no cumple el contrato')
    expect(error.message).toContain('zones')
  })

  it('rechaza una capa processed_real dentro de un manifiesto sample', async () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [
        makeLayer('ndvi', { status: 'processed_real' }),
      ]),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'status-mismatch',
    )

    expect(error.message).toContain('«processed_real»')
    expect(error.message).toContain('«synthetic»')
  })

  it('rechaza una capa synthetic dentro de un manifiesto real', async () => {
    const manifest = makeManifest('real', [
      makeZone('jaen-demo', [makeLayer('ndvi', { status: 'synthetic' })]),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('real', { fetchImpl }),
      'status-mismatch',
    )

    expect(error.message).toContain('«synthetic»')
    expect(error.message).toContain('«processed_real»')
  })

  it.each([
    '/data/sample/ndvi.png',
    '../ndvi.png',
    'data\\ndvi.png',
    'data/sample/%2e%2e/%2e%2e/x.png',
  ])(
    'rechaza la ruta de imagen insegura %j (esquema o runtime)',
    async (image) => {
      const manifest = makeManifest('sample', [
        makeZone('jaen-demo', [makeLayer('ndvi', { image })]),
      ])
      const { fetchImpl } = recordingFetch(jsonResponse(manifest))

      const thrown: unknown = await loadManifest('sample', { fetchImpl }).catch(
        (error: unknown) => error,
      )

      expect(thrown).toBeInstanceOf(ManifestLoadError)
      expect(['schema', 'unsafe-path']).toContain(
        (thrown as ManifestLoadError).code,
      )
    },
  )

  it('la comprobación runtime rechaza rutas que el esquema deja pasar (solo espacios)', async () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer('ndvi', { image: '   ' })]),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'unsafe-path',
    )

    expect(error.message).toContain('ruta de imagen no permitida')
  })

  it('rechaza en runtime un zone.bbox invertido con error semantic', async () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()], {
        bbox: [-3.61, 37.69, -3.86, 37.9],
      }),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'semantic',
    )

    expect(error.message).toContain('no es coherente')
    expect(error.message).toContain('west')
  })

  it('rechaza en runtime un layer.bbox fuera de zone.bbox', async () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [
        makeLayer('ndvi', { bbox: [-4.5, 37.69, -3.61, 37.9] }),
      ]),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'semantic',
    )

    expect(error.message).toContain('fuera de la zona')
  })

  it('rechaza en runtime ids de zona duplicados', async () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()]),
      makeZone('jaen-demo', [makeLayer()]),
    ])
    const { fetchImpl } = recordingFetch(jsonResponse(manifest))

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'semantic',
    )

    expect(error.message).toContain('duplicado')
  })

  it('envuelve un fallo de red en un error tipado', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch

    const error = await expectLoadError(
      loadManifest('sample', { fetchImpl }),
      'network',
    )

    expect(error.message).toContain('Comprueba la conexión')
  })

  it('propaga AbortError sin convertirlo en error de datos', async () => {
    const fetchImpl = (async () => {
      throw new DOMException('La operación fue abortada', 'AbortError')
    }) as typeof fetch

    const thrown: unknown = await loadManifest('sample', { fetchImpl }).catch(
      (error: unknown) => error,
    )

    expect(isAbortError(thrown)).toBe(true)
    expect(thrown).not.toBeInstanceOf(ManifestLoadError)
  })
})
