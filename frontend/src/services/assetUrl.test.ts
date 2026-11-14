import { describe, expect, it } from 'vitest'

import {
  AssetUrlError,
  isSafeAssetPath,
  resolveAssetUrl,
} from './assetUrl'

describe('resolveAssetUrl', () => {
  it.each(['/', '/olivetwin/'])(
    'concatena la ruta con la base %s sin duplicar barras',
    (base) => {
      expect(resolveAssetUrl('data/sample/manifest.json', base)).toBe(
        `${base}data/sample/manifest.json`,
      )
    },
  )

  it('añade la barra final si la base no la lleva', () => {
    expect(resolveAssetUrl('data/real/manifest.json', '/olivetwin')).toBe(
      '/olivetwin/data/real/manifest.json',
    )
  })

  it('usa import.meta.env.BASE_URL por defecto', () => {
    expect(resolveAssetUrl('data/sample/zones/jaen-demo/ndvi.png')).toBe(
      '/data/sample/zones/jaen-demo/ndvi.png',
    )
  })

  it.each([
    '',
    '   ',
    '/data/sample/ndvi.png',
    '../data/sample/ndvi.png',
    'data/../../secret.png',
    'https://example.com/ndvi.png',
    'C:\\datos\\ndvi.png',
    'data\\sample\\ndvi.png',
  ])('rechaza la ruta insegura %j', (path) => {
    expect(() => resolveAssetUrl(path, '/')).toThrow(AssetUrlError)
    expect(() => resolveAssetUrl(path, '/olivetwin/')).toThrow(
      'Ruta de asset no permitida',
    )
  })
})

describe('isSafeAssetPath', () => {
  it('acepta rutas relativas a public/ del contrato', () => {
    expect(isSafeAssetPath('data/sample/manifest.json')).toBe(true)
    expect(isSafeAssetPath('data/real/zones/jaen/soil-moisture.png')).toBe(true)
  })

  it('rechaza rutas con segmentos ascendentes aunque no empiecen por ..', () => {
    expect(isSafeAssetPath('data/sample/../../x.png')).toBe(false)
  })
})
