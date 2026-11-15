/**
 * Carga y validación en runtime de los manifiestos de datos OliveTwin.
 *
 * Contrato v1.2.0 y docs/c0-interfaces.md §2:
 *   - `loadManifest` descarga `${BASE_URL}data/<mode>/manifest.json`;
 *   - comprueba la coherencia de modo (`datasetMode` solicitado) y de `status`
 *     ANTES de Ajv, para devolver un error específico y legible en lugar del
 *     genérico del `if/then` del esquema;
 *   - valida con Ajv (draft 2020-12) contra `contracts/manifest.schema.json`;
 *   - comprueba después las rutas `image` seguras y la semántica mínima de
 *     geometría e ids (`manifestSemantics.ts`);
 *   - devuelve `{ manifest, status: 'ready' | 'empty' }` sin recurrir nunca al
 *     otro modo (un modo real vacío es `empty`, no un error).
 *
 * Los errores son `ManifestLoadError` con mensaje ya traducido al idioma activo
 * (catálogo `errors.*`) y un `code` estable para que la UI pueda decidir qué
 * mostrar.
 */
import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

import manifestSchema from '../../../contracts/manifest.schema.json'
import type { DataMode, OliveTwinManifest } from '../types/manifest'
import { t } from '../i18n'
import { isSafeAssetPath, resolveAssetUrl } from './assetUrl'
import { manifestSemanticErrors } from './manifestSemantics'

export type ManifestErrorCode =
  | 'http'
  | 'network'
  | 'invalid-json'
  | 'schema'
  | 'mode-mismatch'
  | 'status-mismatch'
  | 'unsafe-path'
  | 'semantic'

/** Error tipado de carga de manifiestos, con mensaje listo para la UI. */
export class ManifestLoadError extends Error {
  readonly code: ManifestErrorCode
  readonly httpStatus?: number

  constructor(
    code: ManifestErrorCode,
    message: string,
    options: { cause?: unknown; httpStatus?: number } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = 'ManifestLoadError'
    this.code = code
    this.httpStatus = options.httpStatus
  }
}

export interface LoadManifestOptions {
  /** Señal para cancelar la petición (cambio rápido de modo). */
  signal?: AbortSignal
  /** Permite inyectar un `fetch` simulado en tests; por defecto el global. */
  fetchImpl?: typeof fetch
  /** Prefijo público; por defecto `import.meta.env.BASE_URL`. */
  base?: string
}

export interface LoadManifestResult {
  manifest: OliveTwinManifest
  /** `empty` cuando el manifiesto válido no declara zonas (`zones: []`). */
  status: 'ready' | 'empty'
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateManifest = ajv.compile<OliveTwinManifest>(manifestSchema)

/** `true` si el error proviene de una petición abortada (no debe mostrarse). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function formatFirstSchemaError(errors: ErrorObject[] | null | undefined): string {
  const first = errors?.[0]
  if (!first) {
    return t('errors.validatorDetail')
  }
  const location = first.instancePath === '' ? t('errors.rootPath') : first.instancePath
  return `${location}: ${first.message ?? t('errors.invalidValue')}`
}

function expectedStatusFor(mode: DataMode): 'synthetic' | 'processed_real' {
  return mode === 'sample' ? 'synthetic' : 'processed_real'
}

/** Nombre del modo tal y como se muestra en los mensajes. */
function modeName(mode: DataMode): string {
  return mode === 'sample' ? t('errors.modeSample') : t('errors.modeReal')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Comprobaciones de coherencia de modo sobre el JSON todavía sin validar.
 *
 * Se ejecutan ANTES de Ajv para que un manifiesto con capas cruzadas reciba el
 * error específico `mode-mismatch`/`status-mismatch` (legible para la UI) en
 * lugar del genérico `schema` del `if/then`. No sustituyen al esquema: solo
 * inspeccionan valores que ya tienen la forma esperada y dejan al validador
 * cualquier estructura ausente o un enum desconocido.
 */
function assertModeAndStatusCoherence(raw: unknown, mode: DataMode): void {
  if (!isRecord(raw)) {
    return
  }

  const datasetMode = raw.datasetMode
  if (
    (datasetMode === 'sample' || datasetMode === 'real') &&
    datasetMode !== mode
  ) {
    throw new ManifestLoadError(
      'mode-mismatch',
      t('errors.modeMismatch', { mode, declared: datasetMode }),
    )
  }

  if (!Array.isArray(raw.zones)) {
    return
  }

  const expectedStatus = expectedStatusFor(mode)
  for (const zone of raw.zones) {
    if (!isRecord(zone) || !Array.isArray(zone.layers)) {
      continue
    }
    for (const layer of zone.layers) {
      if (!isRecord(layer)) {
        continue
      }
      const status = layer.status
      // Un estado fuera del enum lo reporta Ajv como error de esquema.
      if (status !== 'synthetic' && status !== 'processed_real') {
        continue
      }
      if (status === expectedStatus) {
        continue
      }
      throw new ManifestLoadError(
        'status-mismatch',
        t('errors.statusMismatch', {
          mode,
          modeName: modeName(mode),
          layerId: String(layer.id),
          zoneId: String(zone.id),
          status,
          expected: expectedStatus,
        }),
      )
    }
  }
}

/**
 * Comprobaciones semánticas mínimas que el JSON Schema no cubre. Se ejecutan
 * una vez validada la estructura para impedir mezclar datos sample y real
 * aunque el id de zona o de capa coincida, y para descartar rutas inseguras.
 */
function assertManifestCoherence(manifest: OliveTwinManifest, mode: DataMode): void {
  if (manifest.datasetMode !== mode) {
    throw new ManifestLoadError(
      'mode-mismatch',
      t('errors.modeMismatch', { mode, declared: manifest.datasetMode }),
    )
  }

  const expectedStatus = expectedStatusFor(mode)
  for (const zone of manifest.zones) {
    for (const layer of zone.layers) {
      if (layer.status !== expectedStatus) {
        throw new ManifestLoadError(
          'status-mismatch',
          t('errors.statusMismatch', {
            mode,
            modeName: modeName(mode),
            layerId: layer.id,
            zoneId: zone.id,
            status: layer.status,
            expected: expectedStatus,
          }),
        )
      }
      if (!isSafeAssetPath(layer.image)) {
        throw new ManifestLoadError(
          'unsafe-path',
          t('errors.unsafeImage', {
            mode,
            layerId: layer.id,
            zoneId: zone.id,
            image: layer.image,
          }),
        )
      }
      if (Array.isArray(layer.timeSteps)) {
        layer.timeSteps.forEach((step, stepIndex) => {
          if (!isSafeAssetPath(step.image)) {
            throw new ManifestLoadError(
              'unsafe-path',
              t('errors.unsafeTimeStepImage', {
                mode,
                step: stepIndex,
                layerId: layer.id,
                zoneId: zone.id,
                image: step.image,
              }),
            )
          }
        })
      }
    }
  }

  // Geometría e identidad: el esquema no puede expresar west < east ni la
  // contención de layer.bbox con tolerancia, y un manifiesto manipulado no
  // debe llegar al mapa.
  const semanticIssues = manifestSemanticErrors(manifest)
  if (semanticIssues.length > 0) {
    throw new ManifestLoadError(
      'semantic',
      t('errors.semantic', { mode, issue: semanticIssues[0] }),
    )
  }
}

/**
 * Descarga, valida y devuelve el manifiesto del modo solicitado.
 *
 * No hace fallback: un 404, un JSON roto o un esquema inválido producen un
 * `ManifestLoadError`; `zones: []` produce `status: 'empty'`.
 */
export async function loadManifest(
  mode: DataMode,
  options: LoadManifestOptions = {},
): Promise<LoadManifestResult> {
  const doFetch: typeof fetch =
    options.fetchImpl ??
    ((input, init) => globalThis.fetch(input, init))
  const url = resolveAssetUrl(`data/${mode}/manifest.json`, options.base)

  let response: Response
  try {
    response = await doFetch(url, { signal: options.signal, cache: 'no-cache' })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new ManifestLoadError(
      'network',
      t('errors.network', { mode }),
      { cause: error },
    )
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? t('errors.httpNotFound', { mode })
        : t('errors.httpStatus', { mode, status: response.status })
    throw new ManifestLoadError('http', message, { httpStatus: response.status })
  }

  let raw: unknown
  try {
    const text = await response.text()
    raw = JSON.parse(text)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new ManifestLoadError(
      'invalid-json',
      t('errors.invalidJson', { mode }),
      { cause: error },
    )
  }

  // Antes de Ajv: un modo o estado incoherente merece un error específico.
  // La estructura restante (campos obligatorios, tipos, patrones) sigue
  // delegada en el esquema.
  assertModeAndStatusCoherence(raw, mode)

  if (!validateManifest(raw)) {
    throw new ManifestLoadError(
      'schema',
      t('errors.contract', { mode, detail: formatFirstSchemaError(validateManifest.errors) }),
    )
  }

  const manifest = raw as OliveTwinManifest
  assertManifestCoherence(manifest, mode)

  return {
    manifest,
    status: manifest.zones.length === 0 ? 'empty' : 'ready',
  }
}
