import { describe, expect, it, vi } from 'vitest'

import type { BBox, DataMode } from '../types/manifest'
import {
  makeLayer,
  makeManifest,
  makeTimeStep,
  makeZone,
  sampleManifest,
  TEST_BBOX,
} from '../services/__fixtures__/manifestFixtures'
import { useOliveTwinData } from './useOliveTwinData'

type ModeHandler = () => Response | Promise<Response>

interface FetchCall {
  mode: DataMode
  signal?: AbortSignal
}

function jsonResponse(body: unknown, status = 200): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response
}

function createRouter(handlers: Partial<Record<DataMode, ModeHandler>>) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const mode: DataMode = url.includes('/data/real/') ? 'real' : 'sample'
    calls.push({ mode, signal: init?.signal ?? undefined })
    const handler = handlers[mode]
    if (!handler) {
      return jsonResponse('', 404)
    }
    return handler()
  }) as typeof fetch
  return { fetchImpl, calls }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Deja correr las microtareas pendientes de promesas ya resueltas. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Manifiesto sample v1.2.0 con una capa NDVI de tres pasos. */
function timedSampleManifest() {
  const steps = [
    makeTimeStep('2026-09-01', {
      image: 'data/sample/zones/jaen-demo/ndvi-2026-09-01.png',
    }),
    makeTimeStep('2026-10-01', {
      image: 'data/sample/zones/jaen-demo/ndvi-2026-10-01.png',
    }),
    makeTimeStep('2026-11-01', {
      image: 'data/sample/zones/jaen-demo/ndvi-2026-11-01.png',
    }),
  ]
  const layer = makeLayer('ndvi', {
    image: steps[2].image,
    bbox: steps[2].bbox,
    timeSteps: steps,
  })
  return {
    manifest: makeManifest('sample', [makeZone('jaen-demo', [layer])], {
      schemaVersion: '1.2.0',
    }),
    steps,
  }
}

describe('useOliveTwinData', () => {
  it('SAMPLE-01: carga el modo muestra por defecto sin seleccionar zona', async () => {
    const manifest = sampleManifest()
    const { fetchImpl, calls } = createRouter({
      sample: () => jsonResponse(manifest),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    expect(calls.map((call) => call.mode)).toEqual(['sample'])
    expect(data.vm.dataMode).toBe('sample')
    expect(data.vm.zones.map((zone) => zone.id)).toEqual([
      'jaen-demo',
      'toledo-demo',
    ])
    expect(data.vm.selectedZoneId).toBeNull()
    expect(data.vm.selectedLayerId).toBeNull()
    expect(data.vm.errorMessage).toBeNull()
    expect(data.vm.overlayOpacity).toBe(0.7)
    expect(data.vm.overlayVisible).toBe(true)
    expect(data.overlay.value).toBeNull()
  })

  it('SAMPLE-02: un modo real vacío queda en empty sin conservar zonas sample', async () => {
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
      real: () => jsonResponse(makeManifest('real')),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')
    expect(data.overlay.value).not.toBeNull()

    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))

    expect(data.vm.dataMode).toBe('real')
    expect(data.vm.zones).toEqual([])
    expect(data.vm.selectedZoneId).toBeNull()
    expect(data.vm.selectedLayerId).toBeNull()
    expect(data.vm.errorMessage).toBeNull()
    expect(data.overlay.value).toBeNull()
    expect(data.selectedZone.value).toBeNull()
  })

  it('SAMPLE-03: volver a muestra recupera las zonas y limpia la selección', async () => {
    let sampleRequests = 0
    const { fetchImpl } = createRouter({
      sample: () => {
        sampleRequests += 1
        return jsonResponse(sampleManifest())
      },
      real: () => jsonResponse(makeManifest('real')),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))

    data.setDataMode('sample')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    expect(sampleRequests).toBe(2)
    expect(data.vm.dataMode).toBe('sample')
    expect(data.vm.zones.map((zone) => zone.id)).toEqual([
      'jaen-demo',
      'toledo-demo',
    ])
    expect(data.vm.selectedZoneId).toBeNull()
    expect(data.vm.selectedLayerId).toBeNull()
  })

  it('SAMPLE-04: un manifiesto real inválido produce error sin fallback a muestra', async () => {
    const { fetchImpl, calls } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
      real: () => jsonResponse('{ "zones": [ }', 200),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('error'))

    expect(calls.filter((call) => call.mode === 'sample')).toHaveLength(1)
    expect(data.vm.dataMode).toBe('real')
    expect(data.vm.zones).toEqual([])
    expect(data.vm.selectedZoneId).toBeNull()
    expect(data.vm.selectedLayerId).toBeNull()
    expect(data.vm.errorMessage).toContain('no es un JSON válido')
    expect(data.overlay.value).toBeNull()
  })

  it('SAMPLE-05: un cambio rápido sample→real→sample ignora la respuesta tardía de real', async () => {
    const sampleDeferred = deferred<Response>()
    const realDeferred = deferred<Response>()
    let sampleRequests = 0

    const { fetchImpl, calls } = createRouter({
      sample: () => {
        sampleRequests += 1
        return sampleRequests === 1
          ? jsonResponse(sampleManifest())
          : sampleDeferred.promise
      },
      real: () => realDeferred.promise,
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    data.setDataMode('sample')
    await vi.waitFor(() => expect(calls).toHaveLength(3))

    // La respuesta final (sample) llega primero; real llega después y debe
    // descartarse por pertenecer a una petición ya invalidada.
    sampleDeferred.resolve(jsonResponse(sampleManifest()))
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    realDeferred.resolve(
      jsonResponse(
        makeManifest('real', [
          makeZone('jaen-demo', [
            makeLayer('ndvi', {
              image: 'data/real/zones/jaen-demo/ndvi.png',
              status: 'processed_real',
            }),
          ]),
        ]),
      ),
    )
    await settle()

    expect(data.vm.dataMode).toBe('sample')
    expect(data.vm.loadStatus).toBe('ready')
    expect(data.vm.zones.map((zone) => zone.id)).toEqual([
      'jaen-demo',
      'toledo-demo',
    ])
    expect(data.vm.errorMessage).toBeNull()
  })

  it('SAMPLE-05b: un error tardío de una petición invalidada no rompe el estado final', async () => {
    const realDeferred = deferred<Response>()
    let sampleRequests = 0

    const { fetchImpl } = createRouter({
      sample: () => {
        sampleRequests += 1
        return jsonResponse(sampleManifest())
      },
      real: () => realDeferred.promise,
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    data.setDataMode('sample')
    await vi.waitFor(() => expect(sampleRequests).toBe(2))
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    realDeferred.reject(new Error('fallo tardío simulado'))
    await settle()

    expect(data.vm.dataMode).toBe('sample')
    expect(data.vm.loadStatus).toBe('ready')
    expect(data.vm.errorMessage).toBeNull()
  })

  it('SAMPLE-06: una zona real válida aparece en modo real y no hereda la capa sample', async () => {
    const realBbox: BBox = [-3.7, 37.75, -3.65, 37.8]
    const realZone = makeZone('jaen-demo', [
      makeLayer('soil-moisture', {
        image: 'data/real/zones/jaen-demo/soil-moisture.png',
        bbox: realBbox,
        status: 'processed_real',
      }),
    ])

    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
      real: () => jsonResponse(makeManifest('real', [realZone])),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.selectZone('jaen-demo')
    expect(data.vm.selectedZoneId).toBe('jaen-demo')
    expect(data.vm.selectedLayerId).toBe('soil-moisture')
    expect(data.overlay.value).not.toBeNull()
    expect(data.overlay.value).toMatchObject({
      zoneId: 'jaen-demo',
      layerId: 'soil-moisture',
      url: '/data/real/zones/jaen-demo/soil-moisture.png',
      opacity: 0.7,
      visible: true,
      status: 'processed_real',
    })
    expect(data.overlay.value?.bbox).toEqual(realBbox)

    data.setDataMode('sample')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')

    expect(data.vm.selectedLayerId).toBe('ndvi')
    expect(data.overlay.value?.url).toBe(
      '/data/sample/zones/jaen-demo/ndvi.png',
    )
    expect(data.overlay.value?.status).toBe('synthetic')
    expect(data.overlay.value?.bbox).toEqual(TEST_BBOX)
  })

  it('valida zona y capa contra el manifiesto activo', async () => {
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.selectLayer('ndvi')
    expect(data.vm.selectedLayerId).toBeNull()

    data.selectZone('zona-inexistente')
    expect(data.vm.selectedZoneId).toBeNull()

    data.selectZone('jaen-demo')
    expect(data.vm.selectedLayerId).toBe('ndvi')

    data.selectLayer('capa-inexistente' as never)
    expect(data.vm.selectedLayerId).toBe('ndvi')

    data.selectLayer('soil-moisture')
    expect(data.vm.selectedLayerId).toBe('soil-moisture')
    expect(data.selectedLayer.value?.id).toBe('soil-moisture')

    data.selectLayer(null)
    expect(data.vm.selectedLayerId).toBeNull()
    expect(data.overlay.value).toBeNull()

    data.selectZone('toledo-demo')
    expect(data.vm.selectedZoneId).toBe('toledo-demo')
    expect(data.vm.selectedLayerId).toBe('ndvi')

    data.selectZone(null)
    expect(data.vm.selectedZoneId).toBeNull()
    expect(data.vm.selectedLayerId).toBeNull()
    expect(data.selectedZone.value).toBeNull()
  })

  it('recorta la opacidad a [0, 1] y refleja opacidad/visibilidad en el overlay', async () => {
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')

    data.setOpacity(-0.5)
    expect(data.vm.overlayOpacity).toBe(0)
    expect(data.overlay.value?.opacity).toBe(0)

    data.setOpacity(1.5)
    expect(data.vm.overlayOpacity).toBe(1)

    data.setOpacity(0.25)
    expect(data.vm.overlayOpacity).toBe(0.25)
    expect(data.overlay.value?.opacity).toBe(0.25)

    data.setOpacity(Number.NaN)
    expect(data.vm.overlayOpacity).toBe(0.25)

    data.setOverlayVisible(false)
    expect(data.vm.overlayVisible).toBe(false)
    expect(data.overlay.value?.visible).toBe(false)

    data.setOverlayVisible(true)
    expect(data.overlay.value?.visible).toBe(true)
  })

  it('reload recarga el modo actual y permite recuperarse de un error', async () => {
    let realHandler: ModeHandler = () => jsonResponse('{ roto', 200)
    const { fetchImpl, calls } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
      real: () => realHandler(),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('error'))
    expect(data.vm.errorMessage).not.toBeNull()

    realHandler = () => jsonResponse(makeManifest('real'))
    data.reload()
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))

    expect(calls.filter((call) => call.mode === 'real')).toHaveLength(2)
    expect(data.vm.errorMessage).toBeNull()
    expect(data.vm.dataMode).toBe('real')
  })

  it('respeta initialMode al crear el composable', async () => {
    const { fetchImpl, calls } = createRouter({
      real: () => jsonResponse(makeManifest('real')),
    })

    const data = useOliveTwinData({ initialMode: 'real', fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))

    expect(data.vm.dataMode).toBe('real')
    expect(calls.map((call) => call.mode)).toEqual(['real'])
  })

  it('aborta la petición anterior al cambiar de modo', async () => {
    const { fetchImpl, calls } = createRouter({
      sample: () => jsonResponse(sampleManifest()),
      real: () => jsonResponse(makeManifest('real')),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    expect(calls[0]?.signal?.aborted).toBe(false)

    data.setDataMode('real')
    expect(calls[0]?.signal?.aborted).toBe(true)

    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))
  })

  it('T-04: al seleccionar una capa con timeSteps usa el último paso por defecto', async () => {
    const { manifest, steps } = timedSampleManifest()
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(manifest),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    expect(data.vm.selectedTimeIndex).toBeNull()
    expect(data.activeTimeStep.value).toBeNull()

    data.selectZone('jaen-demo')

    expect(data.vm.selectedLayerId).toBe('ndvi')
    expect(data.vm.selectedTimeIndex).toBe(2)
    expect(data.activeTimeStep.value).toEqual(steps[2])
    expect(data.overlay.value).toMatchObject({
      zoneId: 'jaen-demo',
      layerId: 'ndvi',
      url: '/data/sample/zones/jaen-demo/ndvi-2026-11-01.png',
      bbox: steps[2].bbox,
      timeIndex: 2,
      timeStep: steps[2],
    })
  })

  it('T-04: selectTimeStep cambia URL, bbox y paso activo del overlay', async () => {
    const { manifest, steps } = timedSampleManifest()
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(manifest),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')

    data.selectTimeStep(0)

    expect(data.vm.selectedTimeIndex).toBe(0)
    expect(data.activeTimeStep.value).toEqual(steps[0])
    expect(data.overlay.value?.timeIndex).toBe(0)
    expect(data.overlay.value?.timeStep).toEqual(steps[0])
    expect(data.overlay.value?.url).toBe(
      '/data/sample/zones/jaen-demo/ndvi-2026-09-01.png',
    )
    expect(data.overlay.value?.bbox).toEqual(steps[0].bbox)

    data.selectTimeStep(1)
    expect(data.overlay.value?.timeIndex).toBe(1)
    expect(data.overlay.value?.url).toBe(
      '/data/sample/zones/jaen-demo/ndvi-2026-10-01.png',
    )
  })

  it('T-04: ignora índices fuera de rango, no enteros o capas sin timeSteps', async () => {
    const { manifest } = timedSampleManifest()
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(manifest),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')
    data.selectTimeStep(0)

    data.selectTimeStep(3)
    data.selectTimeStep(-1)
    data.selectTimeStep(0.5)
    data.selectTimeStep(Number.NaN)
    expect(data.vm.selectedTimeIndex).toBe(0)

    data.selectLayer(null)
    expect(data.vm.selectedTimeIndex).toBeNull()
    expect(data.activeTimeStep.value).toBeNull()
    data.selectTimeStep(1)
    expect(data.vm.selectedTimeIndex).toBeNull()
  })

  it('T-04: cambiar de capa, zona o modo reinicia el índice temporal', async () => {
    const { manifest } = timedSampleManifest()
    const staticLayer = makeLayer('soil-moisture', {
      image: 'data/sample/zones/jaen-demo/moisture.png',
    })
    const withSecondLayer = makeManifest(
      'sample',
      [
        makeZone('jaen-demo', [
          manifest.zones[0].layers[0],
          staticLayer,
        ]),
        makeZone('toledo-demo', [makeLayer('ndvi', {
          image: 'data/sample/zones/toledo-demo/ndvi.png',
        })]),
      ],
      { schemaVersion: '1.2.0' },
    )
    const { fetchImpl } = createRouter({
      sample: () => jsonResponse(withSecondLayer),
      real: () => jsonResponse(makeManifest('real')),
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')
    data.selectTimeStep(0)
    expect(data.vm.selectedTimeIndex).toBe(0)

    // La capa de humedad no tiene timeSteps: índice null.
    data.selectLayer('soil-moisture')
    expect(data.vm.selectedTimeIndex).toBeNull()
    expect(data.overlay.value?.timeIndex).toBeNull()
    expect(data.overlay.value?.timeStep).toBeNull()

    // Volver a NDVI selecciona de nuevo el último paso.
    data.selectLayer('ndvi')
    expect(data.vm.selectedTimeIndex).toBe(2)

    // Cambiar de zona (primera capa = NDVI sin timeSteps) reinicia.
    data.selectTimeStep(0)
    data.selectZone('toledo-demo')
    expect(data.vm.selectedTimeIndex).toBeNull()

    // Cambiar de modo limpia también el índice.
    data.selectZone('jaen-demo')
    data.selectTimeStep(1)
    expect(data.vm.selectedTimeIndex).toBe(1)
    data.setDataMode('real')
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('empty'))
    expect(data.vm.selectedTimeIndex).toBeNull()
  })

  it('T-04: una respuesta tardía no reactiva el índice temporal del modo anterior', async () => {
    const { manifest } = timedSampleManifest()
    const realDeferred = deferred<Response>()
    let sampleRequests = 0

    const { fetchImpl } = createRouter({
      sample: () => {
        sampleRequests += 1
        return jsonResponse(manifest)
      },
      real: () => realDeferred.promise,
    })

    const data = useOliveTwinData({ fetchImpl })
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))
    data.selectZone('jaen-demo')
    data.selectTimeStep(0)
    expect(data.vm.selectedTimeIndex).toBe(0)

    data.setDataMode('real')
    data.setDataMode('sample')
    await vi.waitFor(() => expect(sampleRequests).toBe(2))
    await vi.waitFor(() => expect(data.vm.loadStatus).toBe('ready'))

    realDeferred.resolve(
      jsonResponse(
        makeManifest(
          'real',
          [
            makeZone('jaen-demo', [
              makeLayer('ndvi', {
                image: 'data/real/zones/jaen-demo/ndvi.png',
                status: 'processed_real',
              }),
            ]),
          ],
          { schemaVersion: '1.2.0' },
        ),
      ),
    )
    await settle()

    expect(data.vm.dataMode).toBe('sample')
    expect(data.vm.selectedTimeIndex).toBeNull()
    expect(data.overlay.value).toBeNull()
  })
})
