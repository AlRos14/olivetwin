#!/usr/bin/env node
/**
 * OliveTwin — generador determinista de datos de muestra (WP04-02, rol R3).
 *
 * Produce los assets sintéticos de la «demo de la demo»:
 *   - frontend/public/data/sample/zones/<zona>/ndvi.png
 *   - frontend/public/data/sample/zones/<zona>/moisture.png
 *   - frontend/public/data/sample/manifest.json
 * y garantiza (sin sobrescribir contenido real) `frontend/public/data/real/`.
 *
 * Reglas de diseño:
 *   - Sin red, sin datos NASA y sin fechas inventadas: `status: "synthetic"`
 *     y procedencia que declara explícitamente el origen ficticio.
 *   - Reproducible byte a byte: PRNG mulberry32 con semilla fija y `pngjs`
 *     (misma versión fijada en el lockfile).
 *   - Cada PNG cubre exactamente su `layer.bbox` en una cuadrícula Web
 *     Mercator (EPSG:3857): las filas se reparten equiespaciadas en
 *     y = ln(tan(π/4 + φ/2)), con el norte arriba. Los píxeles sin dato
 *     llevan alpha 0.
 *   - Rutas resueltas desde `import.meta.url`, nunca desde el directorio de
 *     trabajo, de modo que funcione igual con
 *     `npm run generate:sample --prefix frontend` o desde la raíz.
 *
 * Uso:
 *   npm run generate:sample --prefix frontend
 *   node scripts/generate-sample-data.mjs
 */
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const frontendDir = path.join(repoRoot, 'frontend')

// pngjs vive en frontend/node_modules (dependencia fijada en C0). Se resuelve
// desde el package.json del frontend para no depender del cwd ni de la raíz.
const requireFromFrontend = createRequire(path.join(frontendDir, 'package.json'))
const { PNG } = requireFromFrontend('pngjs')

export const DEFAULT_DATA_DIR = path.join(frontendDir, 'public', 'data')
export const SCHEMA_VERSION = '1.1.0'
export const IMAGE_WIDTH = 384
export const PROCESSING_VERSION = 'sample-v1'

/** Paleta NDVI: marrón (suelo) → verde (vegetación densa). */
export const NDVI_STOPS = [
  { value: 0, color: '#8c510a', label: 'Sin vegetación' },
  { value: 0.25, color: '#dfc27d', label: 'Vegetación baja' },
  { value: 0.5, color: '#f6e8c3', label: 'Vegetación media' },
  { value: 0.75, color: '#80cdc1', label: 'Vegetación alta' },
  { value: 1, color: '#01665e', label: 'Vegetación muy alta' },
]

/** Paleta de humedad: amarillo (seco) → azul (húmedo). */
export const MOISTURE_STOPS = [
  { value: 0, color: '#ffffcc', label: 'Muy seco' },
  { value: 0.125, color: '#a1dab4', label: 'Seco' },
  { value: 0.25, color: '#41b6c4', label: 'Intermedio' },
  { value: 0.375, color: '#225ea8', label: 'Húmedo' },
  { value: 0.5, color: '#253494', label: 'Muy húmedo' },
]

/**
 * Zonas de muestra. Las coordenadas son ilustrativas (provincias de Jaén y
 * Toledo) y NO describen parcelas reales. `layerBbox` es una caja algo menor
 * que `bbox`, como permite el contrato, para ejercitar el caso de cobertura
 * parcial dentro de la zona de estudio.
 */
export const ZONE_SPECS = [
  {
    id: 'jaen-demo',
    name: 'Jaén — demostración',
    description:
      'Ubicación ilustrativa en la provincia de Jaén; no es una parcela real ni una observación satelital.',
    bbox: [-3.86, 37.69, -3.61, 37.9],
    layerBbox: [-3.85, 37.7, -3.62, 37.89],
    seed: 0x0a1e2026,
  },
  {
    id: 'toledo-demo',
    name: 'Toledo — demostración',
    description:
      'Ubicación ilustrativa en la provincia de Toledo; no es una parcela real ni una observación satelital.',
    bbox: [-4.2, 39.7, -3.95, 39.9],
    layerBbox: [-4.19, 39.71, -3.96, 39.89],
    seed: 0x0b7e2026,
  },
]

/** Definición de las dos capas P0. `file` es el nombre publicado en disco. */
export const LAYER_SPECS = [
  {
    id: 'ndvi',
    file: 'ndvi.png',
    title: 'Vegetación (NDVI)',
    variable: 'NDVI',
    unit: 'index',
    range: [0, 1],
    palette: NDVI_STOPS,
    product: 'NDVI ilustrativo — no satelital',
  },
  {
    id: 'soil-moisture',
    file: 'moisture.png',
    title: 'Humedad superficial',
    variable: 'Humedad superficial',
    unit: 'm³/m³',
    range: [0, 0.5],
    palette: MOISTURE_STOPS,
    product: 'Humedad ilustrativa — no satelital',
  },
]

/**
 * Máscaras de no-data (alpha 0) por zona y capa, en coordenadas normalizadas
 * u = oeste→este, v = norte→sur. Cada PNG muestra al menos una región
 * transparente visible que simula un hueco de cobertura.
 */
const NO_DATA_MASKS = {
  'jaen-demo': {
    ndvi: (u, v) => u > 0.78 && v < 0.2,
    'soil-moisture': (_u, v) => v > 0.87,
  },
  'toledo-demo': {
    ndvi: (u, v) => u < 0.2 && v > 0.78,
    'soil-moisture': (u) => u > 0.88,
  },
}

// ---------------------------------------------------------------------------
// Utilidades deterministas
// ---------------------------------------------------------------------------

/** PRNG mulberry32: rápido, determinista y suficiente para ruido ilustrativo. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clamp01(value) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** y de Web Mercator normalizada (sin radio terrestre). */
export function mercatorY(latDeg) {
  const latRad = (latDeg * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2))
}

/** Latitud (grados) a partir de la y de Web Mercator. */
export function latitudeFromMercatorY(y) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI)
}

/**
 * Cuadrícula geográfica de la imagen: ancho fijo y alto calculado para que
 * los píxeles sean cuadrados en EPSG:3857. Devuelve las latitudes de cada
 * fila (norte arriba) equiespaciadas en Mercator.
 */
export function computeGrid({ bbox, width = IMAGE_WIDTH }) {
  const [west, south, east, north] = bbox
  const yNorth = mercatorY(north)
  const ySouth = mercatorY(south)
  const xSpan = ((east - west) * Math.PI) / 180
  const ySpan = yNorth - ySouth
  const height = Math.max(1, Math.round((width * ySpan) / xSpan))
  const rowLatitudes = []
  for (let row = 0; row < height; row += 1) {
    // Centro del píxel: cada fila ocupa 1/height del intervalo Mercator.
    const y = yNorth - ((row + 0.5) / height) * ySpan
    rowLatitudes.push(latitudeFromMercatorY(y))
  }
  return { width, height, rowLatitudes, yNorth, ySouth }
}

export function hexToRgb(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) {
    throw new Error(`Color hexadecimal no válido: ${hex}`)
  }
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export function rgbToHex([r, g, b]) {
  const toHex = (channel) => channel.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Color interpolado en sRGB entre las paradas ordenadas de la leyenda. */
export function colorAtValue(stops, value) {
  const min = stops[0].value
  const max = stops[stops.length - 1].value
  if (max <= min) {
    throw new Error('La leyenda necesita valores crecientes')
  }
  const t = clamp01((value - min) / (max - min))
  const scaled = t * (stops.length - 1)
  const index = Math.min(Math.floor(scaled), stops.length - 2)
  const fraction = scaled - index
  const from = hexToRgb(stops[index].color)
  const to = hexToRgb(stops[index + 1].color)
  return [
    Math.round(from[0] + (to[0] - from[0]) * fraction),
    Math.round(from[1] + (to[1] - from[1]) * fraction),
    Math.round(from[2] + (to[2] - from[2]) * fraction),
  ]
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

function buildLattice(rand, cols, rows) {
  const values = new Float64Array((cols + 1) * (rows + 1))
  for (let i = 0; i < values.length; i += 1) {
    values[i] = rand()
  }
  return { cols, rows, values }
}

function sampleLattice(lattice, u, v) {
  const { cols, rows, values } = lattice
  const x = clamp01(u) * cols
  const y = clamp01(v) * rows
  const x0 = Math.min(Math.floor(x), cols - 1)
  const y0 = Math.min(Math.floor(y), rows - 1)
  const tx = smoothstep(x - x0)
  const ty = smoothstep(y - y0)
  const at = (row, col) => values[row * (cols + 1) + col]
  const top = at(y0, x0) * (1 - tx) + at(y0, x0 + 1) * tx
  const bottom = at(y0 + 1, x0) * (1 - tx) + at(y0 + 1, x0 + 1) * tx
  return top * (1 - ty) + bottom * ty
}

function buildParcels(rand, cols, rows) {
  const values = new Float64Array(cols * rows)
  for (let i = 0; i < values.length; i += 1) {
    values[i] = rand()
  }
  return { cols, rows, values }
}

function sampleParcels(parcels, u, v) {
  const { cols, rows, values } = parcels
  const x = Math.min(Math.floor(clamp01(u) * cols), cols - 1)
  const y = Math.min(Math.floor(clamp01(v) * rows), rows - 1)
  return values[y * cols + x]
}

const FIELD_STYLES = {
  ndvi: {
    seedSalt: 0x51ed270b,
    octaves: [
      [3, 3, 0.5],
      [9, 7, 0.32],
      [24, 20, 0.18],
    ],
    parcels: [7, 6],
    weights: { noise: 0.5, parcels: 0.28, gradient: 0.22 },
    gradient: (u, v) => 0.55 * (1 - v) + 0.45 * u,
    contrast: 2,
    offset: 0.05,
    span: 0.9,
    fine: 0.045,
  },
  'soil-moisture': {
    seedSalt: 0x2f9e44c3,
    octaves: [
      [4, 4, 0.55],
      [11, 9, 0.3],
      [28, 24, 0.15],
    ],
    parcels: [6, 5],
    weights: { noise: 0.55, parcels: 0.2, gradient: 0.25 },
    gradient: (u, v) => 0.6 * (1 - v) + 0.4 * (1 - u),
    contrast: 1.6,
    offset: 0.04,
    span: 0.9,
    fine: 0.03,
  },
}

/**
 * Genera la imagen RGBA de una capa. Es una función pura respecto de sus
 * argumentos: mismos seed/bbox/ancho ⇒ mismos bytes.
 */
export function renderLayer({ zoneId, layerId, bbox, width = IMAGE_WIDTH }) {
  const zone = ZONE_SPECS.find((item) => item.id === zoneId)
  const layer = LAYER_SPECS.find((item) => item.id === layerId)
  if (!zone) throw new Error(`Zona desconocida: ${zoneId}`)
  if (!layer) throw new Error(`Capa desconocida: ${layerId}`)

  const style = FIELD_STYLES[layerId]
  const rand = mulberry32((zone.seed ^ style.seedSalt) >>> 0)
  const octaves = style.octaves.map(([cols, rows, weight]) => ({
    weight,
    lattice: buildLattice(rand, cols, rows),
  }))
  const parcels = buildParcels(rand, style.parcels[0], style.parcels[1])
  const mask = NO_DATA_MASKS[zoneId][layerId]

  const { width: w, height: h, rowLatitudes } = computeGrid({ bbox, width })
  const data = Buffer.alloc(w * h * 4)
  const [rangeMin, rangeMax] = layer.range

  for (let row = 0; row < h; row += 1) {
    // v = 0 en el norte; cada fila es un centro de píxel equiespaciado en Mercator.
    const v = (row + 0.5) / h
    for (let col = 0; col < w; col += 1) {
      const offset = (row * w + col) * 4
      const u = (col + 0.5) / w

      if (mask(u, v)) {
        // Sin dato: transparente y sin color residual.
        data[offset] = 0
        data[offset + 1] = 0
        data[offset + 2] = 0
        data[offset + 3] = 0
        continue
      }

      let noise = 0
      for (const { lattice, weight } of octaves) {
        noise += sampleLattice(lattice, u, v) * weight
      }
      const parcel = sampleParcels(parcels, u, v)
      const gradient = style.gradient(u, v)
      const mix =
        noise * style.weights.noise +
        parcel * style.weights.parcels +
        gradient * style.weights.gradient
      // Contraste alrededor de 0,5 para que se vean los extremos de la paleta
      // (suelo desnudo/muy verde, seco/húmedo) sin inventar una escala nueva.
      const contrasted = clamp01(0.5 + (mix - 0.5) * style.contrast)
      const jitter = (rand() - 0.5) * style.fine
      const t = clamp01(style.offset + style.span * contrasted + jitter)
      const value = rangeMin + t * (rangeMax - rangeMin)
      const [r, g, b] = colorAtValue(layer.palette, value)

      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }
  }

  const png = new PNG({ width: w, height: h, colorType: 6, inputColorType: 6 })
  png.data = data
  const buffer = PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    deflateLevel: 9,
  })

  return {
    buffer,
    width: w,
    height: h,
    rowLatitudes,
    noDataPixels: countNoData(data),
  }
}

function countNoData(data) {
  let count = 0
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] === 0) count += 1
  }
  return count
}

// ---------------------------------------------------------------------------
// Manifiestos
// ---------------------------------------------------------------------------

function buildLayerEntry(zone, layer) {
  return {
    id: layer.id,
    title: layer.title,
    kind: 'image-overlay',
    variable: layer.variable,
    image: `data/sample/zones/${zone.id}/${layer.file}`,
    bbox: [...zone.layerBbox],
    imageCrs: 'EPSG:3857',
    unit: layer.unit,
    range: [...layer.range],
    legend: layer.palette.map(({ value, color, label }) => ({ value, color, label })),
    status: 'synthetic',
    provenance: {
      provider: 'Generador sintético OliveTwin',
      product: layer.product,
      acquisitionDate: null,
      sceneId: null,
      processingVersion: PROCESSING_VERSION,
      referenceUrl: null,
      note: 'Datos inventados para probar la interfaz',
    },
    qualityNote: 'NO apto para decisiones agronómicas',
  }
}

/** Construye el manifiesto de muestra completo (sin tocar el disco). */
export function buildManifest() {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetMode: 'sample',
    appTitle: 'OliveTwin',
    zones: ZONE_SPECS.map((zone) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      bbox: [...zone.bbox],
      layers: LAYER_SPECS.map((layer) => buildLayerEntry(zone, layer)),
    })),
  }
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/**
 * El modo real debe existir y estar vacío. Nunca se sobrescribe un manifiesto
 * real ya publicado: cuando el equipo científico añada zonas, este generador
 * no debe destruirlas.
 */
async function ensureRealData(realDir) {
  await mkdir(path.join(realDir, 'zones'), { recursive: true })
  const gitkeep = path.join(realDir, 'zones', '.gitkeep')
  if (!(await exists(gitkeep))) {
    await writeFile(gitkeep, '')
  }

  const manifestFile = path.join(realDir, 'manifest.json')
  if (await exists(manifestFile)) {
    return { created: false, file: manifestFile }
  }
  const emptyRealManifest = {
    schemaVersion: SCHEMA_VERSION,
    datasetMode: 'real',
    appTitle: 'OliveTwin',
    zones: [],
  }
  await writeFile(manifestFile, serializeManifest(emptyRealManifest))
  return { created: true, file: manifestFile }
}

/**
 * Genera todos los assets y manifiestos. Devuelve la lista de archivos con su
 * tamaño para que el CLI (y los tests) puedan verificar el resultado.
 */
export async function generateSampleData({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const sampleDir = path.join(dataDir, 'sample')
  const files = []
  const manifest = buildManifest()

  for (const zone of ZONE_SPECS) {
    const zoneDir = path.join(sampleDir, 'zones', zone.id)
    await mkdir(zoneDir, { recursive: true })
    for (const layer of LAYER_SPECS) {
      const rendered = renderLayer({
        zoneId: zone.id,
        layerId: layer.id,
        bbox: zone.layerBbox,
      })
      const file = path.join(zoneDir, layer.file)
      await writeFile(file, rendered.buffer)
      files.push({
        file,
        bytes: rendered.buffer.length,
        width: rendered.width,
        height: rendered.height,
        noDataPixels: rendered.noDataPixels,
      })
    }
  }

  const manifestFile = path.join(sampleDir, 'manifest.json')
  await writeFile(manifestFile, serializeManifest(manifest))
  files.push({ file: manifestFile, bytes: Buffer.byteLength(serializeManifest(manifest)) })

  const real = await ensureRealData(path.join(dataDir, 'real'))
  files.push({ file: real.file, bytes: 0, note: real.created ? 'creado vacío' : 'sin cambios' })

  return { manifest, files }
}

async function main() {
  console.log('OliveTwin — generador de datos de muestra sintéticos')
  console.log(`  Destino: ${path.relative(repoRoot, DEFAULT_DATA_DIR).split(path.sep).join('/')}`)

  const { files } = await generateSampleData()
  let total = 0
  for (const entry of files) {
    const relative = path.relative(repoRoot, entry.file).split(path.sep).join('/')
    if (entry.bytes === 0 && entry.note) {
      console.log(`  · ${relative} (${entry.note})`)
      continue
    }
    total += entry.bytes
    const dimensions = entry.width ? ` ${entry.width}×${entry.height}` : ''
    console.log(`  ✓ ${relative} — ${entry.bytes} bytes${dimensions}`)
  }
  console.log(`  Total PNG + manifiesto: ${total} bytes`)
  console.log('  Aviso: datos inventados para probar la interfaz; no son observaciones de NASA.')
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((error) => {
    console.error('Error al generar los datos de muestra:')
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
}
