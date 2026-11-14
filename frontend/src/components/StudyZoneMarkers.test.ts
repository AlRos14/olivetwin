import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as L from 'leaflet'
import type { BBox, StudyZone } from '../types/manifest'
import StudyZoneMarkers from './StudyZoneMarkers.vue'
import { bboxToLatLngBounds } from './map/geo'

const JAEN_BBOX: BBox = [-3.86, 37.69, -3.61, 37.9]
const TOLEDO_BBOX: BBox = [-4.2, 39.7, -3.9, 39.9]
const USA_BBOX: BBox = [-105.3, 40.0, -105.1, 40.2]

function zone(id: string, name: string, bbox: BBox): StudyZone {
  return { id, name, bbox, layers: [] }
}

const JAEN = zone('jaen-demo', 'Jaén — demostración', JAEN_BBOX)
const TOLEDO = zone('toledo-demo', 'Toledo — demostración', TOLEDO_BBOX)

const wrappers: VueWrapper[] = []
const maps: L.Map[] = []

function createMap(): L.Map {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const map = L.map(container, {
    center: [40, -3],
    zoom: 6,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  })
  maps.push(map)
  return map
}

function mountMarkers(map: L.Map, zones: StudyZone[], selectedZoneId: string | null = null) {
  const wrapper = mount(StudyZoneMarkers, { props: { map, zones, selectedZoneId } })
  wrappers.push(wrapper)
  return wrapper
}

function rectangles(map: L.Map): L.Rectangle[] {
  const result: L.Rectangle[] = []
  map.eachLayer((layer) => {
    if (layer instanceof L.Rectangle) result.push(layer)
  })
  return result
}

function rectangleFor(map: L.Map, bbox: BBox): L.Rectangle | undefined {
  return rectangles(map).find((rectangle) => rectangle.getBounds().equals(bboxToLatLngBounds(bbox)))
}

/** Extrae el texto del tooltip, sea cadena o nodo con contenido de texto. */
function tooltipText(rectangle: L.Rectangle): string {
  const content = rectangle.getTooltip()?.getContent()
  if (typeof content === 'string') return content
  if (content instanceof HTMLElement) return content.textContent ?? ''
  return ''
}

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
  for (const map of maps) map.remove()
  maps.length = 0
  document.body.innerHTML = ''
})

describe('StudyZoneMarkers', () => {
  it('crea un rectángulo por zona con el bbox del contrato y tooltip del nombre', () => {
    const map = createMap()
    mountMarkers(map, [JAEN, TOLEDO])

    const all = rectangles(map)
    expect(all).toHaveLength(2)

    const jaen = rectangleFor(map, JAEN_BBOX)
    expect(jaen).toBeDefined()
    expect(tooltipText(jaen!)).toBe(JAEN.name)
    expect(tooltipText(rectangleFor(map, TOLEDO_BBOX)!)).toBe(TOLEDO.name)
  })

  it('inserta el nombre de la zona como texto y no interpreta HTML', () => {
    const malicious = '<img src=x onerror="window.__xss = true">'
    const map = createMap()
    mountMarkers(map, [zone('xss-demo', malicious, JAEN_BBOX)])

    const rectangle = rectangleFor(map, JAEN_BBOX)!
    const content = rectangle.getTooltip()!.getContent() as HTMLElement
    expect(content.textContent).toBe(malicious)
    expect(content.querySelector('img')).toBeNull()
    expect(content.children).toHaveLength(0)
  })

  it('destaca la zona seleccionada y actualiza el estilo sin recrear rectángulos', async () => {
    const map = createMap()
    const wrapper = mountMarkers(map, [JAEN, TOLEDO], JAEN.id)

    const jaen = rectangleFor(map, JAEN_BBOX)!
    const toledo = rectangleFor(map, TOLEDO_BBOX)!
    expect(jaen.options.weight).toBe(3)
    expect(jaen.options.fillOpacity).toBe(0.24)
    expect(toledo.options.weight).toBe(2)

    await wrapper.setProps({ selectedZoneId: TOLEDO.id })
    await nextTick()

    expect(rectangleFor(map, JAEN_BBOX)).toBe(jaen)
    expect(rectangleFor(map, TOLEDO_BBOX)).toBe(toledo)
    expect(jaen.options.weight).toBe(2)
    expect(toledo.options.weight).toBe(3)
    expect(toledo.options.fillOpacity).toBe(0.24)
  })

  it('emite select-zone con el id de la zona al hacer clic', () => {
    const map = createMap()
    const wrapper = mountMarkers(map, [JAEN, TOLEDO])

    rectangleFor(map, TOLEDO_BBOX)!.fire('click')

    expect(wrapper.emitted('select-zone')).toEqual([[TOLEDO.id]])
  })

  it('al cambiar zones elimina todos los rectángulos anteriores y crea los nuevos', async () => {
    const map = createMap()
    const wrapper = mountMarkers(map, [JAEN, TOLEDO])
    const previous = rectangles(map)
    expect(previous).toHaveLength(2)

    const usa = zone('usa-demo', 'Zona de prueba EE. UU.', USA_BBOX)
    await wrapper.setProps({ zones: [usa] })
    await nextTick()

    for (const rectangle of previous) {
      expect(map.hasLayer(rectangle)).toBe(false)
    }
    const current = rectangles(map)
    expect(current).toHaveLength(1)
    expect(current[0]!.getBounds().equals(bboxToLatLngBounds(USA_BBOX))).toBe(true)
  })

  it('recrea los rectángulos aunque los ids se repitan (sin restos del modo anterior)', async () => {
    const map = createMap()
    const wrapper = mountMarkers(map, [JAEN])
    const previous = rectangleFor(map, JAEN_BBOX)!

    const jaenActualizada = zone('jaen-demo', 'Jaén — otro modo', JAEN_BBOX)
    await wrapper.setProps({ zones: [jaenActualizada] })
    await nextTick()

    expect(map.hasLayer(previous)).toBe(false)
    const current = rectangleFor(map, JAEN_BBOX)!
    expect(current).not.toBe(previous)
    expect(tooltipText(current)).toBe('Jaén — otro modo')
  })

  it('sin zonas no dibuja rectángulos y al desmontar limpia los existentes', async () => {
    const map = createMap()
    const wrapper = mountMarkers(map, [])
    expect(rectangles(map)).toHaveLength(0)

    await wrapper.setProps({ zones: [JAEN, TOLEDO] })
    await nextTick()
    expect(rectangles(map)).toHaveLength(2)

    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(rectangles(map)).toHaveLength(0)
  })
})
