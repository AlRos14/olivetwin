/**
 * Constructores de manifiestos SOLO para tests unitarios.
 *
 * No se importan desde la aplicación: Vite no los incluye en el bundle. Los
 * datos son ficticios y están etiquetados como tales; ningún fixture simula
 * una observación real de NASA.
 */
import type {
  BBox,
  DataMode,
  LayerId,
  LayerStatus,
  OliveTwinManifest,
  Provenance,
  StudyLayer,
  StudyZone,
} from '../../types/manifest'

export const TEST_BBOX: BBox = [-3.86, 37.69, -3.61, 37.9]

const SYNTHETIC_PROVENANCE: Provenance = {
  provider: 'Generador sintético',
  product: 'Capa ilustrativa — no satelital',
  acquisitionDate: null,
  sceneId: null,
  processingVersion: 'sample-v1',
  referenceUrl: null,
  note: 'Datos inventados para probar la interfaz',
}

/**
 * Procedencia de fixture para probar `processed_real`.
 *
 * El esquema exige `acquisitionDate`, `sceneId` y `referenceUrl` no nulos.
 * La fecha y la URL son deliberadamente ficticias y no resolubles (`example.invalid`,
 * reservado por la RFC 2606): este objeto NO representa una observación real ni
 * un producto de NASA y solo existe para los tests unitarios locales.
 */
const PROCESSED_FIXTURE_PROVENANCE: Provenance = {
  provider: 'Fixture de pruebas (no satelital)',
  product: 'Capa de prueba; no es una observación real',
  acquisitionDate: '2000-01-01',
  sceneId: 'TEST-SCENE-0001',
  processingVersion: 'test-v1',
  referenceUrl: 'https://example.invalid/olivetwin/test-fixture',
  note: 'Fixture local de tests; fecha y URL ficticias, no procede de NASA',
}

/** Capa válida con valores por defecto sintéticos. */
export function makeLayer(
  id: LayerId = 'ndvi',
  overrides: Partial<StudyLayer> = {},
): StudyLayer {
  const status: LayerStatus = overrides.status ?? 'synthetic'
  const zoneDir = id === 'ndvi' ? 'jaen-demo/ndvi.png' : 'jaen-demo/moisture.png'
  // La ruta por defecto respeta el prefijo `data/<datasetMode>/` del validador:
  // una capa processed_real no debe apuntar a assets de muestra.
  const modeDir = status === 'processed_real' ? 'real' : 'sample'
  return {
    id,
    title: id === 'ndvi' ? 'Vegetación (NDVI)' : 'Humedad superficial',
    kind: 'image-overlay',
    variable: id === 'ndvi' ? 'NDVI' : 'Humedad superficial',
    image: `data/${modeDir}/zones/${zoneDir}`,
    bbox: TEST_BBOX,
    imageCrs: 'EPSG:3857',
    unit: id === 'ndvi' ? 'index' : '%',
    range: id === 'ndvi' ? [-1, 1] : [0, 100],
    legend: [
      { value: 0, color: '#dfc27d', label: 'Bajo' },
      { value: 0.5, color: '#80cdc1', label: 'Medio' },
      { value: 1, color: '#01665e', label: 'Alto' },
    ],
    status,
    provenance: status === 'synthetic' ? SYNTHETIC_PROVENANCE : PROCESSED_FIXTURE_PROVENANCE,
    qualityNote: 'NO apto para decisiones agronómicas',
    ...overrides,
  }
}

/** Zona válida con valores por defecto sintéticos. */
export function makeZone(
  id = 'jaen-demo',
  layers: StudyLayer[] = [makeLayer()],
  overrides: Partial<StudyZone> = {},
): StudyZone {
  return {
    id,
    name: `Zona ${id}`,
    description: 'Ubicación ilustrativa; no es una parcela real',
    bbox: TEST_BBOX,
    layers,
    ...overrides,
  }
}

/** Manifiesto válido estructuralmente. */
export function makeManifest(
  datasetMode: DataMode,
  zones: StudyZone[] = [],
): OliveTwinManifest {
  return {
    schemaVersion: '1.1.0',
    datasetMode,
    appTitle: 'OliveTwin',
    zones,
  }
}

/** Manifiesto de muestra con Jaén y Toledo, cada una con NDVI y humedad. */
export function sampleManifest(): OliveTwinManifest {
  const jaen = makeZone('jaen-demo', [
    makeLayer('ndvi', { image: 'data/sample/zones/jaen-demo/ndvi.png' }),
    makeLayer('soil-moisture', {
      image: 'data/sample/zones/jaen-demo/moisture.png',
    }),
  ])
  const TOLEDO_BBOX: BBox = [-4.12, 39.78, -3.94, 39.94]
  const toledo = makeZone(
    'toledo-demo',
    [
      makeLayer('ndvi', {
        image: 'data/sample/zones/toledo-demo/ndvi.png',
        bbox: TOLEDO_BBOX,
      }),
      makeLayer('soil-moisture', {
        image: 'data/sample/zones/toledo-demo/moisture.png',
        bbox: TOLEDO_BBOX,
      }),
    ],
    { bbox: TOLEDO_BBOX },
  )
  return makeManifest('sample', [jaen, toledo])
}
