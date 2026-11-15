/** Cubo de análisis sintético SOLO para tests (no son datos reales). */
import { nextTick } from 'vue'

import type { ZoneAnalysis } from '../../types/analysis'
import type { StudyZone } from '../../types/manifest'
import { encodeGray } from './pngFixture'

export const W = 4
export const H = 3

export function analysisFixture(zoneId: string, options: { withCrops?: boolean } = {}): ZoneAnalysis {
  const prov = {
    provider: 'Fixture sintético',
    product: 'Rejilla sintética',
    processingVersion: 't',
    license: 'Apache-2.0 (fixture)',
  }
  const stats = { mean: 0.2, median: 0.2, p10: 0.1, p90: 0.3, min: 0, max: 0.4, validFraction: 1 }
  const base = `data/sample/zones/${zoneId}/analysis`
  return {
    schemaVersion: '1.3.0',
    zoneId,
    generatedAt: '2026-11-15T00:00:00Z',
    pipeline: { name: 'test', version: '0' },
    grid: { crs: 'EPSG:3857', bbox: [-4, 37, -3, 38], width: W, height: H, cellSizeM: 250, encoding: 'png-uint8-linear', nodata: 255 },
    variables: [
      {
        id: 'soil-moisture', title: 'Humedad', group: 'nisar', unit: 'm³/m³', scale: 0.01, offset: 0,
        displayRange: [0, 0.5], palette: 'moisture', temporal: true, description: 'd', caveat: 'c',
        status: 'synthetic', provenance: prov,
        steps: [
          { date: '2026-06-20T05:00:00Z', data: `${base}/soil-moisture/a.png`, stats },
          { date: '2026-07-02T05:00:00Z', data: `${base}/soil-moisture/b.png`, stats },
        ],
      },
      {
        id: 'slope', title: 'Pendiente', group: 'terrain', unit: '°', scale: 1, offset: 0,
        displayRange: [0, 30], palette: 'terrain', temporal: false, description: 'd', caveat: 'c',
        status: 'synthetic', provenance: prov,
        steps: [{ date: null, data: `${base}/slope/static.png`, stats }],
      },
    ],
    zoneSeries: [
      {
        id: 'precipitation', title: 'Lluvia', unit: 'mm', chart: 'bar', provenance: prov,
        points: [{ date: '2026-06-18', value: 4 }, { date: '2026-06-30', value: 0 }, { date: '2026-07-01', value: 6 }],
      },
      {
        id: 'temperature-max', title: 'Máxima', unit: '°C', chart: 'line', provenance: prov,
        points: [{ date: '2026-06-20', value: 30 }, { date: '2026-07-02', value: 34 }],
      },
    ],
    ...(options.withCrops
      ? {
          crops: [
            {
              id: 'olivo', name: 'Olivo', scientificName: 'Olea europaea L.', assumptions: 'Secano.',
              method: 'Mínimo de los factores.', source: prov,
              suitability: { data: `${base}/crops/olivo/suitability.png`, scale: 1 / 254, offset: 0, stats },
              factors: [
                {
                  id: 'pendiente', label: 'Pendiente', variables: ['slope'], requirement: 'Óptimo < 10°',
                  classes: { optimal: '< 10°', acceptable: '10–20°', unsuitable: '> 20°' },
                  reference: { citation: 'Referencia de prueba' },
                  raster: { data: `${base}/crops/olivo/pendiente.png`, scale: 1 / 254, offset: 0, stats },
                },
                {
                  id: 'humedad', label: 'Humedad', variables: ['soil-moisture'], requirement: 'Fixture',
                  raster: { data: `${base}/crops/olivo/humedad.png`, scale: 1 / 254, offset: 0, stats },
                },
              ],
            },
          ],
        }
      : {}),
    suitability: {
      title: 'Índice',
      note: 'Exploratorio',
      criteria: [
        { variable: 'soil-moisture', aggregate: 'mean', direction: 'higher-better', weight: 1, rationale: 'h' },
        { variable: 'slope', aggregate: 'static', direction: 'lower-better', weight: 1, rationale: 'h' },
      ],
    },
  }
}

// Celda (fila 0 = norte): humedad crece hacia el este; la pendiente, hacia el sur.
const moistureA = new Uint8Array(W * H).map((_, i) => 10 + (i % W) * 5)
const moistureB = new Uint8Array(W * H).map((_, i) => 20 + (i % W) * 5)
moistureB[0] = 255
const slope = new Uint8Array(W * H).map((_, i) => Math.floor(i / W) * 10)

export async function makeFetch(overrides: Record<string, unknown> = {}) {
  const files: Record<string, Uint8Array | object> = {
    'soil-moisture/a.png': await encodeGray(W, H, moistureA),
    'soil-moisture/b.png': await encodeGray(W, H, moistureB),
    'slope/static.png': await encodeGray(W, H, slope),
    // Aptitud: 254 = 1,0. Fila 0 (norte) apta; la pendiente limita hacia el sur.
    'crops/olivo/suitability.png': await encodeGray(W, H, new Uint8Array(W * H).map((_, i) => 254 - Math.floor(i / W) * 100)),
    'crops/olivo/pendiente.png': await encodeGray(W, H, new Uint8Array(W * H).map((_, i) => 254 - Math.floor(i / W) * 100)),
    'crops/olivo/humedad.png': await encodeGray(W, H, new Uint8Array(W * H).fill(254)),
  }
  const requested: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('analysis.json')) {
      const zoneId = /zones\/([^/]+)\//.exec(url)?.[1] ?? 'x'
      const body = overrides[zoneId] ?? analysisFixture(zoneId)
      return new Response(JSON.stringify(body), { status: 200 })
    }
    const key = Object.keys(files).find((suffix) => url.endsWith(suffix))
    if (!key) return new Response('nope', { status: 404 })
    return new Response(files[key] as unknown as BodyInit, { status: 200 })
  }) as typeof fetch
  return { fetchImpl, requested }
}

export function zone(id: string, withAnalysis = true): StudyZone {
  return {
    id,
    name: id,
    bbox: [-4, 37, -3, 38],
    layers: [],
    ...(withAnalysis ? { analysis: `data/sample/zones/${id}/analysis/analysis.json` } : {}),
  }
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
