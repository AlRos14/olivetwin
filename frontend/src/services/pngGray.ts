/**
 * Decodificador mínimo de PNG gris de 8 bits (contrato v1.3.0, `png-uint8-linear`).
 *
 * Se decodifica en JS en lugar de pasar por `<canvas>` para que la gestión de
 * color del navegador nunca altere los códigos: cada byte es un dato, no un
 * color. Solo admite lo que publica el pipeline (color type 0, bit depth 8,
 * sin entrelazado); cualquier otra cosa es un error explícito.
 */

export type InflateFn = (data: Uint8Array) => Promise<Uint8Array>

export interface GrayImage {
  width: number
  height: number
  /** Un byte por celda, fila a fila, fila 0 = norte. */
  data: Uint8Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export class PngDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PngDecodeError'
  }
}

/** Inflado zlib con la API estándar `DecompressionStream` (navegador y Node ≥ 18). */
export async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new PngDecodeError('El navegador no admite DecompressionStream')
  }
  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  void writer.write(data as unknown as BufferSource).then(() => writer.close()).catch(() => undefined)
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Deshace los filtros PNG de una imagen con 1 byte por píxel. */
export function unfilterGray8(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width + 1
  if (raw.length < stride * height) {
    throw new PngDecodeError(`IDAT incompleto: ${raw.length} bytes para ${width}x${height}`)
  }
  const out = new Uint8Array(width * height)
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * stride]
    const src = row * stride + 1
    const dst = row * width
    const prev = dst - width
    for (let col = 0; col < width; col += 1) {
      const x = raw[src + col]
      const a = col > 0 ? out[dst + col - 1] : 0
      const b = row > 0 ? out[prev + col] : 0
      const c = row > 0 && col > 0 ? out[prev + col - 1] : 0
      let value: number
      switch (filter) {
        case 0:
          value = x
          break
        case 1:
          value = x + a
          break
        case 2:
          value = x + b
          break
        case 3:
          value = x + ((a + b) >> 1)
          break
        case 4:
          value = x + paeth(a, b, c)
          break
        default:
          throw new PngDecodeError(`Filtro PNG desconocido: ${filter}`)
      }
      out[dst + col] = value & 0xff
    }
  }
  return out
}

export async function decodeGray8Png(
  bytes: Uint8Array,
  inflate: InflateFn = inflateZlib,
): Promise<GrayImage> {
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) {
      throw new PngDecodeError('No es un PNG (firma incorrecta)')
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      const bitDepth = body[8]
      const colorType = body[9]
      const interlace = body[12]
      if (bitDepth !== 8 || colorType !== 0 || interlace !== 0) {
        throw new PngDecodeError(
          `PNG de datos no admitido (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}); se exige gris de 8 bits`,
        )
      }
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (!width || !height || idat.length === 0) {
    throw new PngDecodeError('PNG sin cabecera IHDR o sin datos IDAT')
  }
  const total = idat.reduce((sum, chunk) => sum + chunk.length, 0)
  const joined = new Uint8Array(total)
  let cursor = 0
  for (const chunk of idat) {
    joined.set(chunk, cursor)
    cursor += chunk.length
  }
  const raw = await inflate(joined)
  return { width, height, data: unfilterGray8(raw, width, height) }
}
