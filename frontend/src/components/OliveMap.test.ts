import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as L from 'leaflet'
import type { ActiveOverlay, BBox, StudyZone } from '../types/manifest'
import OliveMap from './OliveMap.vue'
import ScientificOverlay from './ScientificOverlay.vue'
import { CANARIAS_VIEW_BOUNDS, SPAIN_VIEW_BOUNDS, bboxToLatLngBounds } from './map/geo'

const JAEN_BBOX: BBox = [-3.86, 37.69, -3.61, 37.9]
const TOLEDO_BBOX: BBox = [-4.2, 39.7, -3.9, 39.9]

const ZONES: StudyZone[] = [
  { id: 'jaen-demo', name: 'Jaén — demostración', bbox: JAEN_BBOX, layers: [] },
  { id: 'toledo-demo', name: 'Toledo — demostración', bbox: TOLEDO_BBOX, layers: [] },
]

const OVERLAY: ActiveOverlay = {
  zoneId: 'jaen-demo',
  layerId: 'ndvi',
  url: 'data/sample/zones/jaen-demo/ndvi.png',
  bbox: JAEN_BBOX,
  opacity: 0.7,
  visible: true,
  status: 'synthetic',
}

// Leaflet necesita un contenedor con tamaño; jsdom devuelve 0 por defecto y
// `fitBounds` produciría zooms inválidos. Este stub afecta solo al archivo.
const originalWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 800 })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalWidth)
  if (originalHeight) Object.defineProperty(Element.prototype, 'clientHeight', originalHeight)
})

let wrappers: VueWrapper[] = []

function mountOliveMap(): VueWrapper {
  const wrapper = mount(OliveMap, {
    props: {
      baseMap: 'pnoa',
      zones: ZONES,
      selectedZoneId: null,
      overlay: OVERLAY,
    },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function exposedMap(wrapper: VueWrapper): L.Map {
  const exposed = wrapper.vm as unknown as { map: L.Map | { value: L.Map } }
  return exposed.map instanceof L.Map ? exposed.map : exposed.map.value
}

function allLayers(map: L.Map): L.Layer[] {
  const layers: L.Layer[] = []
  map.eachLayer((layer) => layers.push(layer))
  return layers
}

function tileLayers(map: L.Map): L.TileLayer[] {
  return allLayers(map).filter((layer): layer is L.TileLayer => layer instanceof L.TileLayer)
}

function imageLayers(map: L.Map): L.ImageOverlay[] {
  return allLayers(map).filter((layer): layer is L.ImageOverlay => layer instanceof L.ImageOverlay)
}

describe('OliveMap — vista y mapa base', () => {
  it('arranca con la vista Península + Baleares y la capa PNOA', async () => {
    const fitSpy = vi.spyOn(L.Map.prototype, 'fitBounds')
    const wrapper = mountOliveMap()
    await nextTick()

    expect(fitSpy).toHaveBeenCalled()
    const firstBounds = fitSpy.mock.calls[0]![0] as L.LatLngBounds
    expect(firstBounds.equals(bboxToLatLngBounds(SPAIN_VIEW_BOUNDS))).toBe(true)

    const map = exposedMap(wrapper)
    const tiles = tileLayers(map)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]!.options.attribution).toContain('PNOA')
    expect(tiles[0]!.options.maxZoom).toBe(19)
    // Sin tms:true: `{-y}` ya aporta la semántica TMS requerida por el IGN.
    expect(tiles[0]!.options.tms).not.toBe(true)
  })

  it('cambia PNOA por OSM sin recrear el mapa ni perder el overlay', async () => {
    const wrapper = mountOliveMap()
    await nextTick()

    const map = exposedMap(wrapper)
    const overlayLayer = imageLayers(map)[0]
    expect(overlayLayer).toBeDefined()

    await wrapper.setProps({ baseMap: 'osm' })
    await nextTick()

    expect(exposedMap(wrapper)).toBe(map)
    const tiles = tileLayers(map)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]!.options.attribution).toContain('OpenStreetMap')
    expect(tiles[0]!.options.attribution).toContain('openstreetmap.org/copyright')

    const overlays = imageLayers(map)
    expect(overlays).toHaveLength(1)
    expect(overlays[0]).toBe(overlayLayer)
    expect(map.hasLayer(overlayLayer!)).toBe(true)
  })

  it('emite basemap-error al acumular errores de tesela, una vez por activación', async () => {
    const wrapper = mountOliveMap()
    await nextTick()
    const map = exposedMap(wrapper)

    let tiles = tileLayers(map)
    expect(tiles).toHaveLength(1)
    for (let index = 0; index < 5; index += 1) {
      tiles[0]!.fire('tileerror')
    }
    expect(wrapper.emitted('basemap-error')).toBeUndefined()

    tiles[0]!.fire('tileerror')
    expect(wrapper.emitted('basemap-error')).toEqual([['pnoa']])

    tiles[0]!.fire('tileerror')
    tiles[0]!.fire('tileerror')
    expect(wrapper.emitted('basemap-error')).toHaveLength(1)

    await wrapper.setProps({ baseMap: 'osm' })
    await nextTick()
    tiles = tileLayers(map)
    expect(tiles).toHaveLength(1)
    for (let index = 0; index < 6; index += 1) {
      tiles[0]!.fire('tileerror')
    }
    expect(wrapper.emitted('basemap-error')).toEqual([['pnoa'], ['osm']])
  })
})

describe('OliveMap — encuadre y controles', () => {
  it('hace fitBounds de la zona seleccionada y vuelve a España al deseleccionar', async () => {
    const wrapper = mountOliveMap()
    await nextTick()
    const map = exposedMap(wrapper)
    const fitSpy = vi.spyOn(map, 'fitBounds')

    await wrapper.setProps({ selectedZoneId: 'jaen-demo' })
    await nextTick()
    expect(fitSpy).toHaveBeenCalledTimes(1)
    const zoneBounds = fitSpy.mock.calls[0]![0] as L.LatLngBounds
    expect(zoneBounds.equals(bboxToLatLngBounds(JAEN_BBOX))).toBe(true)
    const zoneOptions = fitSpy.mock.calls[0]![1] as L.FitBoundsOptions
    expect(zoneOptions.padding).toEqual([28, 28])

    await wrapper.setProps({ selectedZoneId: null })
    await nextTick()
    expect(fitSpy).toHaveBeenCalledTimes(2)
    const spainBounds = fitSpy.mock.calls[1]![0] as L.LatLngBounds
    expect(spainBounds.equals(bboxToLatLngBounds(SPAIN_VIEW_BOUNDS))).toBe(true)
  })

  it('no fuerza encuadre si el id seleccionado no existe', async () => {
    const wrapper = mountOliveMap()
    await nextTick()
    const map = exposedMap(wrapper)
    const fitSpy = vi.spyOn(map, 'fitBounds')

    await wrapper.setProps({ selectedZoneId: 'no-existe' })
    await nextTick()
    expect(fitSpy).not.toHaveBeenCalled()
  })

  it('incluye controles propios «España» y «Canarias» que encuadran cada ámbito', async () => {
    const wrapper = mountOliveMap()
    await nextTick()
    const map = exposedMap(wrapper)
    const fitSpy = vi.spyOn(map, 'fitBounds')

    const buttons = wrapper.findAll('button')
    const labels = buttons.map((button) => button.text())
    expect(labels).toContain('España')
    expect(labels).toContain('Canarias')

    const canarias = buttons.find((button) => button.text() === 'Canarias')!
    await canarias.trigger('click')
    const canariasBounds = fitSpy.mock.calls.at(-1)![0] as L.LatLngBounds
    expect(canariasBounds.equals(bboxToLatLngBounds(CANARIAS_VIEW_BOUNDS))).toBe(true)

    const spain = buttons.find((button) => button.text() === 'España')!
    await spain.trigger('click')
    const spainBounds = fitSpy.mock.calls.at(-1)![0] as L.LatLngBounds
    expect(spainBounds.equals(bboxToLatLngBounds(SPAIN_VIEW_BOUNDS))).toBe(true)
  })

  it('reemite image-error del overlay científico', async () => {
    const wrapper = mountOliveMap()
    await nextTick()

    wrapper.findComponent(ScientificOverlay).vm.$emit('image-error', OVERLAY.url)
    await nextTick()

    expect(wrapper.emitted('image-error')).toEqual([[OVERLAY.url]])
  })

  it('elimina el mapa de Leaflet al desmontar', async () => {
    const removeSpy = vi.spyOn(L.Map.prototype, 'remove')
    const wrapper = mountOliveMap()
    await nextTick()

    wrapper.unmount()
    wrappers = wrappers.filter((candidate) => candidate !== wrapper)
    expect(removeSpy).toHaveBeenCalled()
  })
})
