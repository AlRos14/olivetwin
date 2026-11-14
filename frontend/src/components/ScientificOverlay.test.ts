import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as L from 'leaflet'
import type { ActiveOverlay, BBox } from '../types/manifest'
import ScientificOverlay from './ScientificOverlay.vue'

const BBOX: BBox = [-3.86, 37.69, -3.61, 37.9]
const URL = 'data/sample/zones/jaen-demo/ndvi.png'

function overlay(overrides: Partial<ActiveOverlay> = {}): ActiveOverlay {
  return {
    zoneId: 'jaen-demo',
    layerId: 'ndvi',
    url: URL,
    bbox: BBOX,
    opacity: 0.7,
    visible: true,
    status: 'synthetic',
    ...overrides,
  }
}

const wrappers: VueWrapper[] = []
const maps: L.Map[] = []

function createMap(): L.Map {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const map = L.map(container, {
    center: [37.8, -3.7],
    zoom: 10,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  })
  maps.push(map)
  return map
}

function mountOverlay(map: L.Map, activeOverlay: ActiveOverlay | null) {
  const wrapper = mount(ScientificOverlay, { props: { map, overlay: activeOverlay } })
  wrappers.push(wrapper)
  return wrapper
}

function images(map: L.Map): L.ImageOverlay[] {
  const result: L.ImageOverlay[] = []
  map.eachLayer((layer) => {
    if (layer instanceof L.ImageOverlay) result.push(layer)
  })
  return result
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
  for (const map of maps) map.remove()
  maps.length = 0
  document.body.innerHTML = ''
})

describe('ScientificOverlay', () => {
  it('crea un ImageOverlay georreferenciado por bbox en el pane de overlays', () => {
    const map = createMap()
    mountOverlay(map, overlay())

    const layers = images(map)
    expect(layers).toHaveLength(1)
    const layer = layers[0]!
    expect(layer.options.opacity).toBe(0.7)
    expect(layer.options.interactive).toBe(false)
    expect(layer.options.className).toBe('olive-scientific-overlay')
    expect(layer.options.pane).toBe('overlayPane')
    expect(layer.getBounds().getWest()).toBe(BBOX[0])
    expect(layer.getBounds().getSouth()).toBe(BBOX[1])
    expect(layer.getBounds().getEast()).toBe(BBOX[2])
    expect(layer.getBounds().getNorth()).toBe(BBOX[3])
  })

  it('actualiza la opacidad con setOpacity sin recrear la imagen', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!

    await wrapper.setProps({ overlay: overlay({ opacity: 0.35 }) })
    await nextTick()

    expect(images(map)).toHaveLength(1)
    expect(images(map)[0]).toBe(layer)
    expect(layer.options.opacity).toBe(0.35)
  })

  it('cambia solo la url con setUrl sin recrear la capa ni perder opacidad/visibilidad', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!
    const nextUrl = 'data/sample/zones/jaen-demo/ndvi-2026-02.png'

    await wrapper.setProps({ overlay: overlay({ url: nextUrl, timeIndex: 1 }) })
    await nextTick()

    expect(images(map)).toHaveLength(1)
    expect(images(map)[0]).toBe(layer)
    expect(map.hasLayer(layer)).toBe(true)
    expect(layer.options.opacity).toBe(0.7)
    expect(layer.getElement()!.getAttribute('src')).toBe(nextUrl)
  })

  it('mantiene visible=false al cambiar la url y reutiliza la capa al mostrarla', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!
    await wrapper.setProps({ overlay: overlay({ visible: false }) })
    await nextTick()
    expect(map.hasLayer(layer)).toBe(false)

    const nextUrl = 'data/sample/zones/jaen-demo/ndvi-2026-02.png'
    await wrapper.setProps({ overlay: overlay({ url: nextUrl, timeIndex: 1, visible: false }) })
    await nextTick()
    expect(map.hasLayer(layer)).toBe(false)

    await wrapper.setProps({ overlay: overlay({ url: nextUrl, timeIndex: 1, visible: true }) })
    await nextTick()
    expect(images(map)).toHaveLength(1)
    expect(images(map)[0]).toBe(layer)
  })

  it('reemplaza la imagen si cambia el bbox, la zona o la capa', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const first = images(map)[0]!

    await wrapper.setProps({ overlay: overlay({ bbox: [-4.2, 39.7, -3.9, 39.9] }) })
    await nextTick()
    const second = images(map)[0]!
    expect(second).not.toBe(first)
    expect(second.getBounds().getWest()).toBe(-4.2)

    await wrapper.setProps({ overlay: overlay({ zoneId: 'toledo-demo' }) })
    await nextTick()
    const third = images(map)[0]!
    expect(third).not.toBe(second)

    await wrapper.setProps({ overlay: overlay({ layerId: 'soil-moisture' }) })
    await nextTick()
    const fourth = images(map)[0]!
    expect(fourth).not.toBe(third)
    expect(images(map)).toHaveLength(1)
  })

  it('reinicia el aviso image-error tras cambiar la url', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const nextUrl = 'data/sample/zones/jaen-demo/ndvi-2026-02.png'

    images(map)[0]!.fire('error')
    expect(wrapper.emitted('image-error')).toEqual([[URL]])

    await wrapper.setProps({ overlay: overlay({ url: nextUrl, timeIndex: 1 }) })
    await nextTick()

    images(map)[0]!.fire('error')
    expect(wrapper.emitted('image-error')).toEqual([[URL], [nextUrl]])
  })

  it('detecta el error nativo del <img> después de setUrl', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const nextUrl = 'data/sample/zones/jaen-demo/ndvi-2026-02.png'

    await wrapper.setProps({ overlay: overlay({ url: nextUrl, timeIndex: 1 }) })
    await nextTick()

    images(map)[0]!.getElement()!.dispatchEvent(new Event('error'))
    expect(wrapper.emitted('image-error')).toEqual([[nextUrl]])
  })

  it('visible=false quita la capa del mapa y visible=true reutiliza la misma instancia', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!

    await wrapper.setProps({ overlay: overlay({ visible: false }) })
    await nextTick()
    expect(map.hasLayer(layer)).toBe(false)
    expect(images(map)).toHaveLength(0)

    await wrapper.setProps({ overlay: overlay({ visible: true, opacity: 0.4 }) })
    await nextTick()
    expect(images(map)).toHaveLength(1)
    expect(images(map)[0]).toBe(layer)
    expect(layer.options.opacity).toBe(0.4)
  })

  it('overlay=null elimina la imagen sin dejar restos', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!

    await wrapper.setProps({ overlay: null })
    await nextTick()

    expect(images(map)).toHaveLength(0)
    expect(map.hasLayer(layer)).toBe(false)
  })

  it('emite image-error una sola vez cuando la imagen no carga', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!

    layer.fire('error')
    expect(wrapper.emitted('image-error')).toEqual([[URL]])

    // El mismo fallo por el evento nativo del <img> no duplica el aviso.
    layer.getElement()!.dispatchEvent(new Event('error'))
    expect(wrapper.emitted('image-error')).toHaveLength(1)
  })

  it('detecta el error nativo del elemento <img>', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const image = images(map)[0]!.getElement()!

    image.dispatchEvent(new Event('error'))
    await nextTick()

    expect(wrapper.emitted('image-error')).toEqual([[URL]])
  })

  it('vuelve a emitir image-error tras ocultar y volver a mostrar la capa', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())
    const layer = images(map)[0]!

    layer.fire('error')
    expect(wrapper.emitted('image-error')).toEqual([[URL]])

    await wrapper.setProps({ overlay: overlay({ visible: false }) })
    await nextTick()
    expect(map.hasLayer(layer)).toBe(false)

    await wrapper.setProps({ overlay: overlay({ visible: true }) })
    await nextTick()
    expect(map.hasLayer(layer)).toBe(true)

    // Un fallo de la nueva visualización debe volver a informarse.
    images(map)[0]!.getElement()!.dispatchEvent(new Event('error'))
    expect(wrapper.emitted('image-error')).toEqual([[URL], [URL]])
  })

  it('no repite el aviso si la capa sigue visible y solo cambia la opacidad', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay())

    images(map)[0]!.fire('error')
    await wrapper.setProps({ overlay: overlay({ opacity: 0.5 }) })
    await nextTick()

    images(map)[0]!.getElement()!.dispatchEvent(new Event('error'))
    expect(wrapper.emitted('image-error')).toHaveLength(1)
  })

  it('mantiene visible=false inicial sin añadir la capa hasta activarla', async () => {
    const map = createMap()
    const wrapper = mountOverlay(map, overlay({ visible: false }))
    expect(images(map)).toHaveLength(0)

    await wrapper.setProps({ overlay: overlay({ visible: true }) })
    await nextTick()
    expect(images(map)).toHaveLength(1)
  })
})
