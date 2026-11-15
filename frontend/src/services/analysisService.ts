/**
 * Carga del cubo de análisis de una zona (contrato v1.3.0).
 *
 * - `loadZoneAnalysis` descarga `zone.analysis`, lo valida con Ajv contra
 *   `contracts/analysis.schema.json` y comprueba que pertenece a la zona y que
 *   todas sus rutas son seguras.
 * - `loadVariableStep` descarga un PNG de datos, lo decodifica sin canvas y
 *   devuelve los valores físicos (NaN = sin dato).
 * Los errores son `AnalysisLoadError` con mensaje en el idioma activo para la UI. Nunca
 * se sustituye un dato que falta por otro.
 */
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

import analysisSchema from '../../../contracts/analysis.schema.json'
import type { AnalysisGrid, AnalysisVariable, ZoneAnalysis } from '../types/analysis'
import { isSafeAssetPath, resolveAssetUrl } from './assetUrl'
import { decodeValues } from './analysisMath'
import { decodeGray8Png, type InflateFn } from './pngGray'
import { t } from '../i18n'

export type AnalysisErrorCode = 'http' | 'network' | 'invalid-json' | 'schema' | 'semantic' | 'decode'

export class AnalysisLoadError extends Error {
  readonly code: AnalysisErrorCode

  constructor(code: AnalysisErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AnalysisLoadError'
    this.code = code
  }
}

export interface AnalysisFetchOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  base?: string
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateAnalysis = ajv.compile<ZoneAnalysis>(analysisSchema)

async function fetchOrThrow(url: string, options: AnalysisFetchOptions): Promise<Response> {
  const fetchFn = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchFn(url, { signal: options.signal })
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error
    throw new AnalysisLoadError('network', t('analysis.errors.networkDownload', { url }), { cause: error })
  }
  if (!response.ok) {
    throw new AnalysisLoadError('http', t('analysis.errors.httpDownload', { url, status: response.status }))
  }
  return response
}

export async function loadZoneAnalysis(
  path: string,
  zoneId: string,
  options: AnalysisFetchOptions = {},
): Promise<ZoneAnalysis> {
  if (!isSafeAssetPath(path)) {
    throw new AnalysisLoadError('semantic', t('analysis.errors.unsafeAnalysisPath', { path }))
  }
  const url = resolveAssetUrl(path, options.base)
  const response = await fetchOrThrow(url, options)
  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    throw new AnalysisLoadError('invalid-json', t('analysis.errors.invalidJson', { url }), { cause: error })
  }
  if (!validateAnalysis(raw)) {
    const first = validateAnalysis.errors?.[0]
    const location = first?.instancePath || t('analysis.errors.root')
    throw new AnalysisLoadError(
      'schema',
      t('analysis.errors.contract', {
        location,
        message: first?.message ?? t('analysis.errors.invalidValue'),
      }),
    )
  }
  const analysis = raw as ZoneAnalysis
  if (analysis.zoneId !== zoneId) {
    throw new AnalysisLoadError('semantic', t('analysis.errors.zoneMismatch', { found: analysis.zoneId, expected: zoneId }))
  }
  for (const variable of analysis.variables) {
    for (const step of variable.steps) {
      if (!isSafeAssetPath(step.data)) {
        throw new AnalysisLoadError('semantic', t('analysis.errors.unsafeDataPath', { id: variable.id, path: step.data }))
      }
    }
  }
  for (const crop of analysis.crops ?? []) {
    for (const raster of [crop.suitability, ...crop.factors.map((factor) => factor.raster)]) {
      if (!isSafeAssetPath(raster.data)) {
        throw new AnalysisLoadError('semantic', t('analysis.errors.unsafeCropPath', { id: crop.id, path: raster.data }))
      }
    }
  }
  return analysis
}

/** Ráster de datos del cubo: PNG gris de 8 bits con su codificación lineal. */
export interface EncodedRaster {
  data: string
  scale: number
  offset: number
}

/** Descarga y decodifica cualquier ráster del cubo (paso de variable o aptitud) a valores físicos. */
export async function loadRaster(
  grid: AnalysisGrid,
  raster: EncodedRaster,
  options: AnalysisFetchOptions & { inflate?: InflateFn } = {},
): Promise<Float32Array> {
  if (!isSafeAssetPath(raster.data)) {
    throw new AnalysisLoadError('semantic', t('analysis.errors.unsafeRasterPath', { path: raster.data }))
  }
  const url = resolveAssetUrl(raster.data, options.base)
  const response = await fetchOrThrow(url, options)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let image
  try {
    image = await decodeGray8Png(bytes, options.inflate)
  } catch (error) {
    throw new AnalysisLoadError(
      'decode',
      t('analysis.errors.decodeFailed', { path: raster.data, message: (error as Error).message }),
      { cause: error },
    )
  }
  if (image.width !== grid.width || image.height !== grid.height) {
    throw new AnalysisLoadError(
      'decode',
      t('analysis.errors.gridMismatch', {
        path: raster.data,
        width: image.width,
        height: image.height,
        expectedWidth: grid.width,
        expectedHeight: grid.height,
      }),
    )
  }
  return decodeValues(image.data, raster.scale, raster.offset, grid.nodata)
}

/** Descarga y decodifica un paso de una variable a valores físicos. */
export async function loadVariableStep(
  grid: AnalysisGrid,
  variable: AnalysisVariable,
  stepIndex: number,
  options: AnalysisFetchOptions & { inflate?: InflateFn } = {},
): Promise<Float32Array> {
  const step = variable.steps[stepIndex]
  if (!step) {
    throw new AnalysisLoadError('semantic', t('analysis.errors.noStep', { id: variable.id, index: stepIndex }))
  }
  return loadRaster(grid, { data: step.data, scale: variable.scale, offset: variable.offset }, options)
}

/** Variables que se muestran por defecto, en orden de preferencia (humedad completa primero). */
export const PREFERRED_VARIABLE_IDS = ['soil-moisture-all', 'soil-moisture'] as const

/** Variable por defecto: la primera preferida que exista (y cumpla `accept`), si no la primera que lo cumpla. */
export function preferredVariable(
  variables: AnalysisVariable[],
  accept: (variable: AnalysisVariable) => boolean = () => true,
): AnalysisVariable | null {
  for (const id of PREFERRED_VARIABLE_IDS) {
    const match = variables.find((variable) => variable.id === id && accept(variable))
    if (match) return match
  }
  return variables.find(accept) ?? null
}
