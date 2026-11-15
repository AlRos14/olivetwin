import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBanner from './StatusBanner.vue'
import type { BaseMap, DataMode, ManifestLoadStatus } from '../types/manifest'

interface BannerProps {
  dataMode: DataMode
  loadStatus: ManifestLoadStatus
  errorMessage: string | null
  hasSyntheticLayer: boolean
  overlayError: string | null
  basemapError: BaseMap | null
}

const defaults: BannerProps = {
  dataMode: 'sample',
  loadStatus: 'ready',
  errorMessage: null,
  hasSyntheticLayer: false,
  overlayError: null,
  basemapError: null,
}

function mountBanner(overrides: Partial<BannerProps> = {}) {
  return mount(StatusBanner, { props: { ...defaults, ...overrides } })
}

describe('StatusBanner', () => {
  it('es un aviso persistente con role status y aria-live polite', () => {
    const wrapper = mountBanner()
    const live = wrapper.get('[role="status"]')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.attributes('aria-atomic')).toBe('true')
  })

  it('en modo muestra señala DATOS SIMULADOS y aclara que el mapa base es real', () => {
    const wrapper = mountBanner({ dataMode: 'sample' })
    const text = wrapper.text()
    expect(text).toContain('DATOS SIMULADOS')
    expect(text).toContain(
      'Capas científicas inventadas para demostración; el mapa base es real',
    )
  })

  it('en modo real con capa sintética también exige el aviso de simulación', () => {
    const wrapper = mountBanner({
      dataMode: 'real',
      hasSyntheticLayer: true,
    })
    expect(wrapper.text()).toContain('DATOS SIMULADOS')
  })

  it('muestra «Cargando datos…» durante la carga', () => {
    const wrapper = mountBanner({ loadStatus: 'loading' })
    expect(wrapper.text()).toContain('Cargando datos…')
  })

  it('en real vacío informa de que aún no hay datos científicos reales', () => {
    const wrapper = mountBanner({ dataMode: 'real', loadStatus: 'empty' })
    expect(wrapper.text()).toContain('Todavía no hay zonas con datos científicos reales')
    expect(wrapper.text()).not.toContain('DATOS SIMULADOS')
  })

  it('en error muestra el mensaje, NO anuncia datos de muestra y permite reintentar', async () => {
    const wrapper = mountBanner({
      dataMode: 'sample',
      hasSyntheticLayer: true,
      loadStatus: 'error',
      errorMessage: 'No se pudo leer manifest.json',
    })
    const text = wrapper.text()
    expect(text).toContain('No se pudo leer manifest.json')
    expect(text).not.toContain('DATOS SIMULADOS')
    expect(text).not.toContain('Capas científicas inventadas')

    const retry = wrapper.get('button')
    expect(retry.text()).toBe('Reintentar')
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('avisa de la imagen no disponible y emite dismiss-overlay-error', async () => {
    const wrapper = mountBanner({ overlayError: 'https://example.org/ndvi.png' })
    expect(wrapper.text()).toContain('La imagen de la capa no está disponible')

    const close = wrapper.get('button')
    expect(close.text()).toBe('Cerrar')
    await close.trigger('click')
    expect(wrapper.emitted('dismiss-overlay-error')).toHaveLength(1)
  })

  it('anuncia los avisos de mapa base e imagen como alertas accesibles', () => {
    const wrapper = mountBanner({
      basemapError: 'pnoa',
      overlayError: 'data/sample/zones/jaen-demo/ndvi.png',
    })
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(2)
    const texts = alerts.map((alert) => alert.text())
    expect(texts.some((text) => text.includes('La Vista Satelital no responde'))).toBe(true)
    expect(
      texts.some((text) => text.includes('La imagen de la capa no está disponible')),
    ).toBe(true)
  })

  it('con fallo de PNOA ofrece cambiar a OpenStreetMap', async () => {
    const wrapper = mountBanner({ basemapError: 'pnoa' })
    expect(wrapper.text()).toContain('La Vista Satelital no responde')

    const button = wrapper.get('button')
    expect(button.text()).toBe('Usar Vista General')
    await button.trigger('click')
    expect(wrapper.emitted('switch-basemap')).toEqual([['osm']])
  })

  it('con fallo de OSM ofrece volver a PNOA', async () => {
    const wrapper = mountBanner({ basemapError: 'osm' })
    expect(wrapper.text()).toContain('La Vista General no responde')

    const button = wrapper.get('button')
    expect(button.text()).toBe('Usar Vista Satelital')
    await button.trigger('click')
    expect(wrapper.emitted('switch-basemap')).toEqual([['pnoa']])
  })

  it('con fallo de la ortofoto con parcelas también ofrece OpenStreetMap', async () => {
    const wrapper = mountBanner({ basemapError: 'pnoa-sigpac' })
    expect(wrapper.text()).toContain('La Vista Satelital no responde')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('switch-basemap')).toEqual([['osm']])
  })
})
