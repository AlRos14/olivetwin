import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

import App from './App.vue'
import type { ActiveOverlay } from './types/manifest'
import {
  makeManifest,
  sampleManifest,
} from './services/__fixtures__/manifestFixtures'

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

function jsonResponse(body: unknown): Response {
  const text = JSON.stringify(body)
  return {
    ok: true,
    status: 200,
    text: async () => text,
  } as unknown as Response
}

/** Nombres legibles para comprobar la UI; ids y capas siguen siendo los del fixture. */
function sampleWithDisplayNames() {
  const manifest = sampleManifest()
  manifest.zones[0]!.name = 'Jaén — demostración'
  manifest.zones[1]!.name = 'Toledo — demostración'
  return manifest
}

/**
 * `fetch` simulado: el modo real devuelve el manifiesto vacío del contrato
 * (zones: []); el modo muestra, Jaén y Toledo con NDVI y humedad.
 */
function installFetch(): void {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    return url.includes('/data/real/')
      ? jsonResponse(makeManifest('real'))
      : jsonResponse(sampleWithDisplayNames())
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

  await vi.waitFor(() => {
    expect(wrapper.findComponent(OliveMapStub).props('zones')).toHaveLength(2)
  })
  return wrapper
}

function mapOf(wrapper: VueWrapper) {
  return wrapper.findComponent(OliveMapStub)
}

function currentOverlay(wrapper: VueWrapper): ActiveOverlay | null {
  return mapOf(wrapper).props('overlay') as ActiveOverlay | null
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`No se encontró el botón «${label}»`)
  return button
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('App — integración WP-04 + WP-07', () => {
  it('SAMPLE-01/02/03: Jaén → NDVI → humedad → opacidad → real vacío → muestra', async () => {
    installFetch()
    const wrapper = await mountApp()

    // Estructura: mapa a pantalla completa + panel lateral con cabecera.
    expect(wrapper.find('.ot-layout').exists()).toBe(true)
    expect(wrapper.find('.ot-map-area').exists()).toBe(true)
    expect(wrapper.find('.ot-panel').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('OliveTwin')
    expect(wrapper.text()).toContain('NASA Space Apps 2026 · demo de interfaz')

    // Modo muestra inicial: PNOA, zonas del manifiesto y aviso persistente.
    expect(mapOf(wrapper).props('baseMap')).toBe('pnoa')
    expect(currentOverlay(wrapper)).toBeNull()
    expect(wrapper.text()).toContain('DATOS SIMULADOS')
    expect(wrapper.text()).toContain('Jaén — demostración')
    expect(wrapper.text()).toContain('Toledo — demostración')

    // Seleccionar Jaén: primera capa (NDVI) y overlay resuelto con BASE_URL.
    await wrapper.get('select').setValue('jaen-demo')
    await nextTick()

    expect(mapOf(wrapper).props('selectedZoneId')).toBe('jaen-demo')
    expect(currentOverlay(wrapper)).toMatchObject({
      zoneId: 'jaen-demo',
      layerId: 'ndvi',
      url: '/data/sample/zones/jaen-demo/ndvi.png',
      status: 'synthetic',
    })
    expect(wrapper.text()).toContain('Vegetación (NDVI)')
    expect(wrapper.text()).toContain('Leyenda')

    // NDVI → humedad: cambia la imagen del overlay y la leyenda.
    await wrapper.get('input[type="radio"][value="ndvi"]').setValue()
    expect(currentOverlay(wrapper)?.layerId).toBe('ndvi')

    await wrapper.get('input[type="radio"][value="soil-moisture"]').setValue()
    await nextTick()

    expect(currentOverlay(wrapper)).toMatchObject({
      layerId: 'soil-moisture',
      url: '/data/sample/zones/jaen-demo/moisture.png',
    })
    expect(wrapper.text()).toContain('Humedad superficial')

    // Opacidad 0–100 % en la UI; 0–1 en el contrato.
    const slider = wrapper.get('input[type="range"]')
    await slider.setValue('30')
    await nextTick()

    expect(currentOverlay(wrapper)?.opacity).toBeCloseTo(0.3)
    expect(wrapper.text()).toContain('30 %')

    // Modo real vacío: mensaje explícito, sin zonas, sin overlay y sin aviso
    // de datos simulados. El mapa base sigue siendo el mismo.
    await wrapper.get('input[type="radio"][value="real"]').setValue()
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain(
        'Todavía no hay zonas con datos científicos reales',
      )
    })

    expect(mapOf(wrapper).props('zones')).toEqual([])
    expect(mapOf(wrapper).props('selectedZoneId')).toBeNull()
    expect(currentOverlay(wrapper)).toBeNull()
    expect(mapOf(wrapper).props('baseMap')).toBe('pnoa')
    expect(wrapper.get('select').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('DATOS SIMULADOS')

    // Volver a muestra: zonas recuperadas, selección limpia y aviso visible.
    await wrapper.get('input[type="radio"][value="sample"]').setValue()
    await vi.waitFor(() => {
      expect(mapOf(wrapper).props('zones')).toHaveLength(2)
    })

    expect(currentOverlay(wrapper)).toBeNull()
    expect(wrapper.text()).toContain('Jaén — demostración')
    expect(wrapper.text()).toContain('DATOS SIMULADOS')
  })

  it('cambia el mapa base sin perder overlay y gestiona avisos de error', async () => {
    installFetch()
    const wrapper = await mountApp()

    await wrapper.get('select').setValue('jaen-demo')
    await nextTick()
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

    await findButton(wrapper, 'Usar ortofoto PNOA').trigger('click')
    await nextTick()
    expect(mapOf(wrapper).props('baseMap')).toBe('pnoa')
    expect(wrapper.text()).not.toContain('El mapa de OpenStreetMap no responde')

    // Error de imagen: se muestra y se limpia al cambiar de capa.
    mapOf(wrapper).vm.$emit('image-error', overlayBefore!.url)
    await nextTick()
    expect(wrapper.text()).toContain('La imagen de la capa no está disponible')

    await wrapper.get('input[type="radio"][value="soil-moisture"]').setValue()
    await nextTick()
    expect(wrapper.text()).not.toContain('La imagen de la capa no está disponible')
    expect(currentOverlay(wrapper)?.layerId).toBe('soil-moisture')
  })
})
