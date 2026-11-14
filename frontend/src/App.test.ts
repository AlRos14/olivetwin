import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

import App from './App.vue'
import type {
  ActiveOverlay,
  BBox,
  OliveTwinManifest,
  Provenance,
  StudyLayer,
  StudyZone,
  TimeStep,
} from './types/manifest'
import { makeManifest } from './services/__fixtures__/manifestFixtures'

/**
 * Stub de OliveMap: evita montar Leaflet en jsdom y permite comprobar de forma
 * directa las props que App.vue entrega al mapa. No sustituye a los tests de
 * OliveMap (WP07-01..03), que cubren el comportamiento real del mapa.
 */
const OliveMapStub = defineComponent({
  name: 'OliveMap',
  props: {
    baseMap: { type: String, required: true },
    zones: { type: Array, required: true },
    selectedZoneId: { type: String, default: null },
    overlay: { type: Object, default: null },
  },
  emits: ['select-zone', 'basemap-error', 'image-error'],
  template: '<div class="olive-map-stub" data-test="olive-map"></div>',
})

const JAEN_BBOX: BBox = [-3.9771788, 37.6280039, -3.5855359, 37.8918894]
const TOLEDO_BBOX: BBox = [-4.3547721, 39.5528176, -3.6768813, 39.9870152]
const DATES = [
  '2026-06-20T05:23:26Z',
  '2026-07-02T05:23:25Z',
  '2026-07-14T05:23:25Z',
]

function jsonResponse(body: unknown): Response {
  const text = JSON.stringify(body)
  return {
    ok: true,
    status: 200,
    text: async () => text,
  } as unknown as Response
}

/**
 * Fixture contractual de un manifiesto REAL con dos zonas y tres fechas.
 *
 * Las fechas, escenas y URL son ficticias (`example.invalid`, reservado por la
 * RFC 2606) y solo existen para probar la integración: no representan una
 * observación de NASA ni se publican en `public/data/`.
 */
const PROCESSED_FIXTURE_PROVENANCE: Provenance = {
  provider: 'Fixture de pruebas (no satelital)',
  product: 'NISAR L3 SME2 — fixture local',
  acquisitionDate: DATES[DATES.length - 1],
  sceneId: 'TEST-SCENE-LAST',
  processingVersion: 'test-v1',
  referenceUrl: 'https://example.invalid/olivetwin/test-fixture',
  note: 'Fixture local de tests; no es una observación real',
  maturity: 'PROVISIONAL',
}

function makeTimeSteps(zoneId: string, bbox: BBox): TimeStep[] {
  return DATES.map((date, index) => ({
    date,
    label: date.slice(0, 10),
    image: `data/real/zones/${zoneId}/soil-moisture/${index}.png`,
    bbox,
    provenance: {
      acquisitionDate: date,
      sceneId: `TEST-SCENE-${zoneId}-${index}`,
      processingVersion: 'test-v1',
      referenceUrl: 'https://example.invalid/olivetwin/test-fixture',
    },
  }))
}

function makeRealLayer(zoneId: string, bbox: BBox): StudyLayer {
  const timeSteps = makeTimeSteps(zoneId, bbox)
  const lastStep = timeSteps[timeSteps.length - 1]!
  return {
    id: 'soil-moisture',
    title: 'Humedad superficial (NISAR SME2)',
    kind: 'image-overlay',
    variable: 'soil_moisture',
    image: lastStep.image,
    bbox,
    imageCrs: 'EPSG:3857',
    unit: 'm³/m³',
    range: [0.05, 0.4],
    legend: [
      { value: 0.05, color: '#a6611a', label: 'Más seco' },
      { value: 0.4, color: '#253494', label: 'Más húmedo' },
    ],
    status: 'processed_real',
    provenance: PROCESSED_FIXTURE_PROVENANCE,
    qualityNote: 'Fixture de pruebas; no usar para decisiones agronómicas.',
    timeSteps,
  }
}

function makeRealZone(id: string, name: string, bbox: BBox): StudyZone {
  return {
    id,
    name,
    bbox,
    layers: [makeRealLayer(id, bbox)],
  }
}

const REAL_MANIFEST: OliveTwinManifest = makeManifest(
  'real',
  [
    makeRealZone('jaen', 'Jaén', JAEN_BBOX),
    makeRealZone('toledo', 'Toledo', TOLEDO_BBOX),
  ],
  { schemaVersion: '1.2.0' },
)

let fetchedUrls: string[] = []

/** `fetch` simulado: la demo solo pide el manifiesto real. */
function installFetch(manifest: unknown = REAL_MANIFEST): void {
  fetchedUrls = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchedUrls.push(url)
    return jsonResponse(manifest)
  }) as typeof fetch

  vi.stubGlobal('fetch', fetchImpl)
}

let wrappers: VueWrapper[] = []

async function mountApp(): Promise<VueWrapper> {
  const wrapper = mount(App, {
    global: { stubs: { OliveMap: OliveMapStub } },
    attachTo: document.body,
  })
  wrappers.push(wrapper)

  await vi.waitFor(
    () => {
      expect(mapOf(wrapper).props('selectedZoneId')).toBe('jaen')
      expect(currentOverlay(wrapper)).not.toBeNull()
    },
    { timeout: 3000 },
  )
  return wrapper
}

function mapOf(wrapper: VueWrapper) {
  return wrapper.findComponent(OliveMapStub)
}

function currentOverlay(wrapper: VueWrapper): ActiveOverlay | null {
  return mapOf(wrapper).props('overlay') as ActiveOverlay | null
}

function timeSlider(wrapper: VueWrapper) {
  return wrapper.get('.ot-time-slider input[type="range"]')
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('App — integración con datos reales y línea temporal', () => {
  it('arranca en real, autoselecciona Jaén y muestra aviso PROVISIONAL y slider', async () => {
    installFetch()
    const wrapper = await mountApp()

    // Solo se solicitó el manifiesto real; no hay selector de modo ni aviso simulado.
    expect(fetchedUrls).toHaveLength(1)
    expect(fetchedUrls[0]).toContain('/data/real/manifest.json')
    expect(wrapper.find('.ot-mode-switch').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('DATOS SIMULADOS')

    // Cabecera: título, subtítulo y aviso persistente del producto PROVISIONAL.
    expect(wrapper.get('h1').text()).toBe('OliveTwin')
    expect(wrapper.text()).toContain(
      'NISAR L3 SME2 · humedad superficial · datos PROVISIONAL',
    )
    expect(wrapper.text()).toContain(
      'Producto NISAR SME2 PROVISIONAL: no totalmente calibrado; humedad superficial ≠ necesidad de riego',
    )

    // Ambas zonas disponibles, con Jaén seleccionada automáticamente.
    const options = wrapper.findAll('.ot-zone-selector option')
    expect(options.map((option) => option.text())).toEqual([
      'Selecciona una zona',
      'Jaén',
      'Toledo',
    ])
    expect(wrapper.get('.ot-zone-selector select').element).toHaveProperty(
      'value',
      'jaen',
    )
    expect(mapOf(wrapper).props('selectedZoneId')).toBe('jaen')

    // Arranca en el último paso, que es el que se muestra al abrir.
    expect(currentOverlay(wrapper)).toMatchObject({
      zoneId: 'jaen',
      layerId: 'soil-moisture',
      url: '/data/real/zones/jaen/soil-moisture/2.png',
      status: 'processed_real',
      timeIndex: 2,
    })

    // Slider temporal y procedencia efectiva del paso activo.
    expect(wrapper.find('.ot-time-slider').exists()).toBe(true)
    expect(wrapper.text()).toContain('Paso 3 de 3')
    expect(wrapper.text()).toContain('2026-07-14')
    const provenance = wrapper.get('.ot-provenance').text()
    expect(provenance).toContain('Datos reales')
    expect(provenance).toContain('TEST-SCENE-jaen-2')
    expect(provenance).toContain('14 de julio de 2026')
  })

  it('el slider cambia overlay.url y la procedencia; cambiar de zona reinicia al último paso', async () => {
    installFetch()
    const wrapper = await mountApp()

    await timeSlider(wrapper).setValue('0')
    await nextTick()

    expect(currentOverlay(wrapper)).toMatchObject({
      zoneId: 'jaen',
      url: '/data/real/zones/jaen/soil-moisture/0.png',
      timeIndex: 0,
    })
    expect(wrapper.text()).toContain('Paso 1 de 3')
    expect(wrapper.text()).toContain('20 de junio de 2026')
    expect(wrapper.get('.ot-provenance').text()).toContain('TEST-SCENE-jaen-0')

    // Cambiar de zona vuelve a seleccionar el último paso de la nueva zona.
    await wrapper.get('.ot-zone-selector select').setValue('toledo')
    await nextTick()

    expect(mapOf(wrapper).props('selectedZoneId')).toBe('toledo')
    expect(currentOverlay(wrapper)).toMatchObject({
      zoneId: 'toledo',
      url: '/data/real/zones/toledo/soil-moisture/2.png',
      timeIndex: 2,
    })
    expect(wrapper.text()).toContain('Paso 3 de 3')
    expect(wrapper.text()).toContain('Toledo')
    expect(wrapper.get('.ot-provenance').text()).toContain('TEST-SCENE-toledo-2')
  })

  it('cambia el mapa base sin perder overlay y gestiona avisos de error', async () => {
    installFetch()
    const wrapper = await mountApp()

    const overlayBefore = currentOverlay(wrapper)
    expect(overlayBefore).not.toBeNull()

    // PNOA → OSM desde el panel: mismo overlay, misma opacidad.
    await wrapper.get('input[type="radio"][value="osm"]').setValue()
    await nextTick()

    expect(mapOf(wrapper).props('baseMap')).toBe('osm')
    expect(currentOverlay(wrapper)).toEqual(overlayBefore)

    // Fallo de teselas: aviso y cambio de mapa base propuesto por StatusBanner.
    mapOf(wrapper).vm.$emit('basemap-error', 'osm')
    await nextTick()
    expect(wrapper.text()).toContain('El mapa de OpenStreetMap no responde')

    const pnoaButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Usar ortofoto PNOA')
    if (!pnoaButton) throw new Error('No se encontró el botón «Usar ortofoto PNOA»')
    await pnoaButton.trigger('click')
    await nextTick()
    expect(mapOf(wrapper).props('baseMap')).toBe('pnoa')
    expect(wrapper.text()).not.toContain('El mapa de OpenStreetMap no responde')

    // Error de imagen: se muestra y se limpia al cambiar de paso temporal.
    mapOf(wrapper).vm.$emit('image-error', overlayBefore!.url)
    await nextTick()
    expect(wrapper.text()).toContain('La imagen de la capa no está disponible')

    await timeSlider(wrapper).setValue('1')
    await nextTick()
    expect(wrapper.text()).not.toContain('La imagen de la capa no está disponible')
    expect(currentOverlay(wrapper)?.timeIndex).toBe(1)
  })

  it('mantiene la opacidad y la capa al cambiar el paso temporal', async () => {
    installFetch()
    const wrapper = await mountApp()

    const opacity = wrapper.get('.ot-layer-panel input.ot-range')
    await opacity.setValue('40')
    await nextTick()
    expect(currentOverlay(wrapper)?.opacity).toBeCloseTo(0.4)

    await timeSlider(wrapper).setValue('1')
    await nextTick()

    expect(currentOverlay(wrapper)?.opacity).toBeCloseTo(0.4)
    expect(currentOverlay(wrapper)?.layerId).toBe('soil-moisture')
    expect(wrapper.text()).toContain('40 %')
  })
})
