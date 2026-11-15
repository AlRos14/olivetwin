import { describe, expect, it } from 'vitest'

import { decodeGray8Png, PngDecodeError, unfilterGray8 } from './pngGray'
import { encodeGray } from './__fixtures__/pngFixture'

describe('decodeGray8Png', () => {
  it('recupera exactamente los códigos con los cinco filtros PNG', async () => {
    const width = 7
    const height = 10
    const pixels = new Uint8Array(width * height).map((_, i) => (i * 37 + (i % 3) * 91) % 256)
    pixels[5] = 255
    const image = await decodeGray8Png(await encodeGray(width, height, pixels))
    expect(image.width).toBe(width)
    expect(image.height).toBe(height)
    expect(Array.from(image.data)).toEqual(Array.from(pixels))
  })

  it('rechaza PNG que no son gris de 8 bits', async () => {
    const png = await encodeGray(2, 2, new Uint8Array(4), 6)
    await expect(decodeGray8Png(png)).rejects.toBeInstanceOf(PngDecodeError)
  })

  it('rechaza una firma que no es PNG', async () => {
    await expect(decodeGray8Png(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow(/firma/)
  })

  it('detecta IDAT incompleto', () => {
    expect(() => unfilterGray8(new Uint8Array(3), 4, 2)).toThrow(/incompleto/)
  })
})
