/**
 * Paletas de color del cubo de análisis y renderizado de valores a RGBA.
 *
 * Los colores solo orientan la lectura: el valor exacto de cada celda se
 * consulta con un clic en el mapa, que lee el dato y no el color.
 */
import type { AnalysisPalette } from '../types/analysis'

export type PaletteName = AnalysisPalette | 'change' | 'suitability'

/** Paradas [posición 0…1, color hex]. */
export const PALETTES: Record<PaletteName, [number, string][]> = {
  // Igual que la leyenda SME2 publicada: marrón seco → azul húmedo.
  moisture: [
    [0, '#a6611a'],
    [0.2, '#e9c46a'],
    [0.4, '#d9f0a3'],
    [0.6, '#41b6c4'],
    [0.8, '#2c7fb8'],
    [1, '#253494'],
  ],
  vegetation: [
    [0, '#8c510a'],
    [0.25, '#d8b365'],
    [0.5, '#f6e8c3'],
    [0.75, '#7fbc41'],
    [1, '#1b7837'],
  ],
  radar: [
    [0, '#000004'],
    [0.25, '#3b0f70'],
    [0.5, '#8c2981'],
    [0.75, '#de4968'],
    [1, '#fcfdbf'],
  ],
  terrain: [
    [0, '#f7fcf5'],
    [0.3, '#c7e9c0'],
    [0.55, '#e6c27a'],
    [0.8, '#b0703a'],
    [1, '#5c3317'],
  ],
  soil: [
    [0, '#fff7ec'],
    [0.33, '#fdd49e'],
    [0.66, '#ef6548'],
    [1, '#7f0000'],
  ],
  heat: [
    [0, '#313695'],
    [0.5, '#ffffbf'],
    [1, '#a50026'],
  ],
  // Divergente centrada en 0: rojo = disminuye, azul = aumenta.
  change: [
    [0, '#b2182b'],
    [0.25, '#ef8a62'],
    [0.5, '#f7f7f7'],
    [0.75, '#67a9cf'],
    [1, '#2166ac'],
  ],
  // Índice relativo: violeta = menos favorable en la zona, verde = más.
  suitability: [
    [0, '#762a83'],
    [0.25, '#c2a5cf'],
    [0.5, '#f7f7f7'],
    [0.75, '#a6dba0'],
    [1, '#1b7837'],
  ],
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const RGB_CACHE = new Map<PaletteName, [number, [number, number, number]][]>()

function rgbStops(name: PaletteName): [number, [number, number, number]][] {
  let stops = RGB_CACHE.get(name)
  if (!stops) {
    stops = PALETTES[name].map(([position, hex]) => [position, hexToRgb(hex)])
    RGB_CACHE.set(name, stops)
  }
  return stops
}

/** Color RGB de una posición 0…1 de la paleta (se recorta a los extremos). */
export function paletteColor(name: PaletteName, t: number): [number, number, number] {
  const stops = rgbStops(name)
  const position = Math.min(1, Math.max(0, t))
  for (let index = 1; index < stops.length; index += 1) {
    const [p1, c1] = stops[index]
    if (position <= p1) {
      const [p0, c0] = stops[index - 1]
      const f = p1 === p0 ? 0 : (position - p0) / (p1 - p0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ]
    }
  }
  return stops[stops.length - 1][1]
}

/** Gradiente CSS de la paleta para la leyenda. */
export function paletteGradient(name: PaletteName): string {
  return `linear-gradient(to right, ${PALETTES[name].map(([p, c]) => `${c} ${(p * 100).toFixed(0)}%`).join(', ')})`
}

/** Trama «sin dato»: franjas diagonales grises (mismas que `NO_DATA_CSS` en la leyenda). */
const NO_DATA_DARK: [number, number, number, number] = [148, 156, 150, 210]
const NO_DATA_LIGHT: [number, number, number, number] = [226, 230, 226, 190]
export const NO_DATA_CSS = 'repeating-linear-gradient(135deg, #949c96 0 3px, #e2e6e2 3px 6px)'

export interface RenderOptions {
  /** Ancho de la rejilla: necesario para dibujar la trama «sin dato». */
  width?: number
  /** Pinta las celdas sin dato con una trama neutra en lugar de dejarlas transparentes. */
  hatchNoData?: boolean
}

/** Valores → RGBA; NaN → transparente o trama «sin dato». */
export function renderRgba(
  values: Float32Array,
  range: [number, number],
  palette: PaletteName,
  options: RenderOptions = {},
): Uint8ClampedArray {
  const [min, max] = range
  const span = max - min || 1
  const out = new Uint8ClampedArray(values.length * 4)
  const hatchWidth = options.hatchNoData && options.width ? options.width : 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (Number.isNaN(value)) {
      if (hatchWidth) {
        const col = index % hatchWidth
        const row = Math.floor(index / hatchWidth)
        out.set((col + row) % 4 < 2 ? NO_DATA_DARK : NO_DATA_LIGHT, index * 4)
      }
      continue
    }
    const [r, g, b] = paletteColor(palette, (value - min) / span)
    const o = index * 4
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = 255
  }
  return out
}

/** RGBA → `data:image/png` mediante un canvas (solo navegador). */
export function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.createImageData(width, height)
  image.data.set(rgba)
  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
