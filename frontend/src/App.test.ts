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
import { analysisFixture, makeFetch, settle } from './services/__fixtures__/analysisCube'

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
    analysisOverlay: { type: Object, default: null },
    analysisOpacity: { type: Number, default: 0.8 },
    analysisVisible: { type: Boolean, default: true },
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
  it('arranca en real, autoselecciona Jaén y muestra subtítulo PROVISIONAL y slider', async () => {
    installFetch()
    const wrapper = await mountApp()

    // Solo se solicitó el manifiesto real; no hay selector de modo ni aviso simulado.
    expect(fetchedUrls).toHaveLength(1)
    expect(fetchedUrls[0]).toContain('/data/real/manifest.json')
    expect(wrapper.find('.ot-mode-switch').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('DATOS SIMULADOS')

    // Cabecera: título y subtítulo con la madurez del producto; sin aviso de
    // cabecera ni panel de procedencia (decisión de producto 2026-11-15).
    expect(wrapper.get('h1').text()).toBe('OliveTwin')
    expect(wrapper.text()).toContain(
      'Radar NISAR, vegetación, suelo y clima · datos NISAR PROVISIONALES',
    )
    expect(wrapper.find('.ot-panel__notice').exists()).toBe(false)
    expect(wrapper.find('.ot-provenance').exists()).toBe(false)

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

    // Slider temporal en el paso activo.
    expect(wrapper.find('.ot-time-slider').exists()).toBe(true)
    expect(wrapper.text()).toContain('Paso 3 de 3')
    expect(wrapper.text()).toContain('2026-07-14')
  })

  it('el slider cambia overlay.url y la fecha; cambiar de zona reinicia al último paso', async () => {
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
    expect(wrapper.text()).toContain('2026-06-20')

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
    expect(wrapper.text()).toContain('La Vista General no responde')

    const pnoaButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Usar Vista Satelital')
    if (!pnoaButton) throw new Error('No se encontró el botón «Usar Vista Satelital»')
    await pnoaButton.trigger('click')
    await nextTick()
    expect(mapOf(wrapper).props('baseMap')).toBe('pnoa')
    expect(wrapper.text()).not.toContain('La Vista General no responde')

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

  it('pestañas: Capas por defecto, Análisis/Comparar deshabilitadas sin cubo e Historia con el reto', async () => {
    installFetch()
    const wrapper = await mountApp()
    const tabs = wrapper.findAll('.ot-tabs__tab')
    expect(tabs.map((tab) => tab.text())).toEqual(['Capas', 'Análisis', 'Comparar', 'Historia'])
    expect(tabs[0].classes()).toContain('is-selected')
    expect(tabs[1].attributes('disabled')).toBeDefined()
    expect(tabs[2].attributes('disabled')).toBeDefined()

    await tabs[3].trigger('click')
    expect(wrapper.text()).toContain('Dancing with the SARs')
    expect(wrapper.find('.ot-layer-panel').exists()).toBe(false)
    expect(currentOverlay(wrapper)).not.toBeNull()

    await tabs[0].trigger('click')
    expect(wrapper.find('.ot-layer-panel').exists()).toBe(true)
  })

  it('Capas permite elegir una variable del cubo con su línea temporal y su leyenda', async () => {
    const cube = await makeFetch({ jaen: analysisFixture('jaen') })
    const manifest = makeManifest(
      'real',
      [
        { ...makeRealZone('jaen', 'Jaén', JAEN_BBOX), analysis: 'data/sample/zones/jaen/analysis/analysis.json' },
        makeRealZone('toledo', 'Toledo', TOLEDO_BBOX),
      ],
      { schemaVersion: '1.3.0' },
    )
    fetchedUrls = []
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      fetchedUrls.push(url)
      if (url.endsWith('manifest.json')) return jsonResponse(manifest)
      return cube.fetchImpl(input, init)
    }) as typeof fetch)
    const wrapper = mount(App, { global: { stubs: { OliveMap: OliveMapStub } }, attachTo: document.body })
    wrappers.push(wrapper)
    await vi.waitFor(() => expect(mapOf(wrapper).props('selectedZoneId')).toBe('jaen'), { timeout: 3000 })
    await settle()

    // Con cubo de análisis, Capas ofrece solo sus variables, sin número de fechas, y arranca con la humedad.
    const select = wrapper.get('.ot-layer-panel select')
    const labels = select.findAll('option').map((option) => option.text())
    expect(labels).toEqual(['Elige una variable…', 'Humedad del suelo (fiable)', 'Pendiente'])
    expect((select.element as HTMLSelectElement).value).toBe('cube:soil-moisture')
    expect(currentOverlay(wrapper)).toBeNull()
    expect(wrapper.get('.ot-legend').text()).toContain('m³/m³')
    expect(wrapper.text()).toContain('Paso 2 de 2')
    await timeSlider(wrapper).setValue('0')
    await settle()
    expect(wrapper.text()).toContain('Paso 1 de 2')

    // Una variable estática no tiene línea temporal.
    await select.setValue('cube:slope')
    await settle()
    expect(wrapper.find('.ot-time-slider').exists()).toBe(false)
    expect(wrapper.get('.ot-legend').text()).toContain('Pendiente')
    expect(wrapper.get('.ot-relevance').text()).toContain('Inclinación del terreno')

    // Una zona sin cubo mantiene la capa del manifiesto.
    await wrapper.get('.ot-zone-selector select').setValue('toledo')
    await settle()
    expect(currentOverlay(wrapper)).not.toBeNull()
    expect(wrapper.get('.ot-layer-panel select option[value="layer:soil-moisture"]').text()).toBe('Humedad del suelo')
  })
})
