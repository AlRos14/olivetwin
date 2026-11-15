/** Codificador de PNG gris de 8 bits SOLO para tests (datos sintéticos). */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate')
  const writer = stream.writable.getWriter()
  void writer.write(data as unknown as BufferSource).then(() => writer.close())
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** PNG gris de 8 bits con un filtro distinto por fila (0…4) para ejercitar el decodificador. */
export async function encodeGray(width: number, height: number, pixels: Uint8Array, colorType = 0): Promise<Uint8Array> {
  const raw = new Uint8Array((width + 1) * height)
  for (let row = 0; row < height; row += 1) {
    const filter = row % 5
    raw[row * (width + 1)] = filter
    for (let col = 0; col < width; col += 1) {
      const x = pixels[row * width + col]
      const a = col > 0 ? pixels[row * width + col - 1] : 0
      const b = row > 0 ? pixels[(row - 1) * width + col] : 0
      const c = row > 0 && col > 0 ? pixels[(row - 1) * width + col - 1] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      raw[row * (width + 1) + 1 + col] = (x - predictor) & 0xff
    }
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = colorType
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
