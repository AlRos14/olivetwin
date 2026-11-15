/**
 * OliveTwin — lógica reutilizable de validación de manifiestos (WP04-01).
 *
 * Este módulo lo comparten la CLI (`validate-data.mjs`) y los tests vitest
 * (`frontend/src/types/contract.test.ts`). No imprime nada y no termina el
 * proceso: devuelve listas de errores para que cada consumidor decida.
 *
 * Distingue tres capas:
 *   1. Esquema JSON (contracts/manifest.schema.json) — estructura, enums,
 *      patrones y coherencia if/then entre datasetMode y status.
 *   2. Semántica — west < east, south < north, layer.bbox dentro de zone.bbox
 *      (tolerancia 0.01°), min < max en range, leyenda ordenada, ids únicos,
 *      prefijo `data/<datasetMode>/`, fechas de adquisición reales y versión
 *      semver 1.x.
 *   3. Assets — el PNG existe en `frontend/public/` y tiene canal alfa
 *      (IHDR color type 4 o 6, o chunk tRNS).
 *
 * La lectura de ficheros es inyectable (`readAsset`) para poder probar la
 * validación de assets sin tocar el disco.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

/** Major del contrato admitida por esta versión del validador. */
export const SCHEMA_MAJOR = 1
/** Versiones exactas admitidas: 1.1.0 (sin serie temporal), 1.2.0 (timeSteps) y 1.3.0 (zone.analysis). */
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.1.0', '1.2.0', '1.3.0'])
/** Versión mínima cuando el manifiesto usa layer.timeSteps. */
export const TIMESTEPS_SCHEMA_VERSION = '1.2.0'
/** Versiones que admiten layer.timeSteps. */
export const TIMESTEPS_SCHEMA_VERSIONS = Object.freeze(['1.2.0', '1.3.0'])
/** Versión obligatoria cuando alguna zona declara `analysis` (cubo de análisis). */
export const ANALYSIS_SCHEMA_VERSION = '1.3.0'
/** Único CRS de presentación admitido en esta versión. */
export const SUPPORTED_IMAGE_CRS = Object.freeze(['EPSG:3857'])
/** Tolerancia en grados al comprobar que layer.bbox cae dentro de zone.bbox. */
export const BBOX_TOLERANCE_DEG = 0.01
/** Prefijo de toda ruta `image`, relativa a `frontend/public/`. */
export const IMAGE_PATH_ROOT = 'data/'

const SCHEMA_VERSION_PATTERN = /^1\.[0-9]+\.[0-9]+$/
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// Misma regla que el esquema: sin "/" inicial, sin "%", sin "..", sin ":" ni "\".
// El "%" se prohíbe porque el navegador normaliza la codificación porcentual
// ("%2e%2e" equivale a "..") y permitiría salir de public/.
const SAFE_IMAGE_PATH_PATTERN = /^(?!\/)(?!.*%)(?!.*\.\.)(?!.*:)(?!.*\\).+$/
// Fecha sola o fecha-hora con zona (mismo formato que el esquema, que además
// aplica los format `date`/`date-time` de ajv-formats).
const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2})))?$/
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBBox(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((component) => isFiniteNumber(component))
  )
}

function pushError(errors, at, message) {
  errors.push({ path: at, message })
}

function sameBBox(left, right) {
  return (
    isBBox(left) &&
    isBBox(right) &&
    left.every((component, index) => component === right[index])
  )
}

/** `true` si alguna zona declara `analysis` (aunque sea inválido). */
function manifestHasAnalysis(manifest) {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.zones)) {
    return false
  }
  return manifest.zones.some((zone) => isPlainObject(zone) && 'analysis' in zone)
}

/** `true` si alguna capa del manifiesto declara timeSteps (aunque sea inválido). */
function manifestHasTimeSteps(manifest) {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.zones)) {
    return false
  }
  return manifest.zones.some(
    (zone) =>
      isPlainObject(zone) &&
      Array.isArray(zone.layers) &&
      zone.layers.some(
        (layer) => isPlainObject(layer) && Array.isArray(layer.timeSteps),
      ),
  )
}

/**
 * Comprueba una ruta `image` (de capa o de paso): seguridad y prefijo del modo.
 * La regla es idéntica para layer.image y timeSteps[].image.
 */
function pushImagePathErrors(errors, at, image, mode) {
  if (typeof image !== 'string') {
    return
  }
  if (!SAFE_IMAGE_PATH_PATTERN.test(image)) {
    pushError(
      errors,
      at,
      `ruta image insegura: debe ser relativa a public/, sin "/" inicial, "%", "..", ":" ni "\\" (${JSON.stringify(image)})`,
    )
  }
  if (mode === 'sample' || mode === 'real') {
    const expectedPrefix = `${IMAGE_PATH_ROOT}${mode}/`
    if (!image.startsWith(expectedPrefix)) {
      pushError(
        errors,
        at,
        `image debe estar bajo "${expectedPrefix}" para datasetMode="${mode}" (recibido ${JSON.stringify(image)})`,
      )
    }
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year, month) {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1] ?? 0
}

/**
 * Comprueba que `value` es una fecha ISO 8601 real (calendario gregoriano),
 * no solo una cadena con la forma correcta.
 *
 * Acepta fecha sola (`2026-10-19`) o fecha-hora con zona
 * (`2026-10-19T11:19:03Z`, formato del pipeline NISAR). Rechaza fechas
 * imposibles como `2026-13-45` o `2026-02-30`, que `Date.parse` normalizaría
 * en silencio; por eso se validan los componentes además de `Date.parse`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidAcquisitionDate(value) {
  if (typeof value !== 'string') {
    return false
  }
  const match = ISO_DATE_TIME_PATTERN.exec(value)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) {
    return false
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return false
  }

  if (match[4] !== undefined) {
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = match[6] === undefined ? 0 : Number(match[6])
    if (hour > 23 || minute > 59 || second > 59) {
      return false
    }
    if (match[8] !== undefined) {
      const offsetHour = Number(match[8])
      const offsetMinute = Number(match[9])
      if (offsetHour > 23 || offsetMinute > 59) {
        return false
      }
    }
  }

  // Comprobación redundante de Date.parse: refuerza el formato completo.
  return !Number.isNaN(Date.parse(value.replace(' ', 'T')))
}

/** Convierte los errores de Ajv en `{path, message}` estables para la UI/CLI. */
export function formatAjvErrors(errors) {
  return (errors ?? []).map((error) => ({
    path: error.instancePath === '' ? '(raíz)' : error.instancePath,
    message: `${error.message}${error.keyword ? ` [${error.keyword}]` : ''}`,
  }))
}

/** Compila el JSON Schema draft 2020-12 con Ajv en modo estricto. */
export function compileSchema(schema) {
  if (!isPlainObject(schema)) {
    throw new TypeError('compileSchema requiere un objeto JSON Schema')
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

/**
 * Validación semántica que el JSON Schema no puede expresar (o que conviene
 * repetir con un mensaje legible en español).
 *
 * @param {unknown} manifest
 * @param {{ expectedMode?: 'sample' | 'real' }} [options]
 * @returns {{ path: string, message: string }[]}
 */
export function semanticErrors(manifest, { expectedMode } = {}) {
  /** @type {{ path: string, message: string }[]} */
  const errors = []
  if (!isPlainObject(manifest)) {
    return errors
  }

  const mode = manifest.datasetMode
  const usesTimeSteps = manifestHasTimeSteps(manifest)
  const usesAnalysis = manifestHasAnalysis(manifest)

  if (
    typeof manifest.schemaVersion === 'string' &&
    !SCHEMA_VERSION_PATTERN.test(manifest.schemaVersion)
  ) {
    pushError(
      errors,
      '/schemaVersion',
      `schemaVersion debe ser una versión semver de la major ${SCHEMA_MAJOR} (recibido ${JSON.stringify(manifest.schemaVersion)})`,
    )
  } else if (typeof manifest.schemaVersion === 'string') {
    if (usesAnalysis && manifest.schemaVersion !== ANALYSIS_SCHEMA_VERSION) {
      pushError(
        errors,
        '/schemaVersion',
        `zone.analysis exige schemaVersion "${ANALYSIS_SCHEMA_VERSION}" (recibido ${JSON.stringify(manifest.schemaVersion)})`,
      )
    } else if (
      usesTimeSteps &&
      !TIMESTEPS_SCHEMA_VERSIONS.includes(manifest.schemaVersion)
    ) {
      pushError(
        errors,
        '/schemaVersion',
        `layer.timeSteps exige schemaVersion ${TIMESTEPS_SCHEMA_VERSIONS.map((version) => `"${version}"`).join(' o ')} (recibido ${JSON.stringify(manifest.schemaVersion)})`,
      )
    } else if (
      !usesTimeSteps &&
      !SUPPORTED_SCHEMA_VERSIONS.includes(manifest.schemaVersion)
    ) {
      pushError(
        errors,
        '/schemaVersion',
        `schemaVersion debe ser ${SUPPORTED_SCHEMA_VERSIONS.map((version) => `"${version}"`).join(' o ')} (recibido ${JSON.stringify(manifest.schemaVersion)})`,
      )
    }
  }

  if (expectedMode && mode !== expectedMode) {
    pushError(
      errors,
      '/datasetMode',
      `datasetMode es ${JSON.stringify(mode)} pero el contexto exige "${expectedMode}"`,
    )
  }

  if (!Array.isArray(manifest.zones)) {
    return errors
  }

  /** @type {Set<string>} */
  const zoneIds = new Set()

  manifest.zones.forEach((zone, zoneIndex) => {
    const zonePath = `/zones/${zoneIndex}`
    if (!isPlainObject(zone)) {
      return
    }

    if (typeof zone.id === 'string') {
      if (zoneIds.has(zone.id)) {
        pushError(errors, `${zonePath}/id`, `id de zona duplicado: "${zone.id}"`)
      }
      zoneIds.add(zone.id)
      if (!KEBAB_CASE_PATTERN.test(zone.id)) {
        pushError(
          errors,
          `${zonePath}/id`,
          `id de zona "${zone.id}" no está en kebab-case (minúsculas, dígitos y guiones simples)`,
        )
      }
    }

    const zoneBbox = zone.bbox
    if (isBBox(zoneBbox)) {
      if (!(zoneBbox[0] < zoneBbox[2])) {
        pushError(
          errors,
          `${zonePath}/bbox`,
          `zone.bbox inválido: west (${zoneBbox[0]}) debe ser menor que east (${zoneBbox[2]})`,
        )
      }
      if (!(zoneBbox[1] < zoneBbox[3])) {
        pushError(
          errors,
          `${zonePath}/bbox`,
          `zone.bbox inválido: south (${zoneBbox[1]}) debe ser menor que north (${zoneBbox[3]})`,
        )
      }
    }

    if (typeof zone.analysis === 'string' && typeof zone.id === 'string') {
      const expectedAnalysis = `${IMAGE_PATH_ROOT}${mode}/zones/${zone.id}/analysis/analysis.json`
      if (zone.analysis !== expectedAnalysis) {
        pushError(
          errors,
          `${zonePath}/analysis`,
          `zone.analysis debe ser ${JSON.stringify(expectedAnalysis)} (recibido ${JSON.stringify(zone.analysis)})`,
        )
      }
    }

    if (!Array.isArray(zone.layers)) {
      return
    }

    /** @type {Set<string>} */
    const layerIds = new Set()

    zone.layers.forEach((layer, layerIndex) => {
      const layerPath = `${zonePath}/layers/${layerIndex}`
      if (!isPlainObject(layer)) {
        return
      }

      if (typeof layer.id === 'string') {
        if (layerIds.has(layer.id)) {
          pushError(
            errors,
            `${layerPath}/id`,
            `id de capa duplicado en la zona "${zone.id}": "${layer.id}"`,
          )
        }
        layerIds.add(layer.id)
      }

      const layerBbox = layer.bbox
      if (isBBox(layerBbox)) {
        if (!(layerBbox[0] < layerBbox[2])) {
          pushError(
            errors,
            `${layerPath}/bbox`,
            `layer.bbox inválido: west (${layerBbox[0]}) debe ser menor que east (${layerBbox[2]})`,
          )
        }
        if (!(layerBbox[1] < layerBbox[3])) {
          pushError(
            errors,
            `${layerPath}/bbox`,
            `layer.bbox inválido: south (${layerBbox[1]}) debe ser menor que north (${layerBbox[3]})`,
          )
        }

        if (isBBox(zoneBbox)) {
          const [west, south, east, north] = layerBbox
          const [zoneWest, zoneSouth, zoneEast, zoneNorth] = zoneBbox
          if (west < zoneWest - BBOX_TOLERANCE_DEG) {
            pushError(
              errors,
              `${layerPath}/bbox`,
              `layer.bbox queda fuera de zone.bbox: west (${west}) < zone.west - ${BBOX_TOLERANCE_DEG} (${zoneWest})`,
            )
          }
          if (south < zoneSouth - BBOX_TOLERANCE_DEG) {
            pushError(
              errors,
              `${layerPath}/bbox`,
              `layer.bbox queda fuera de zone.bbox: south (${south}) < zone.south - ${BBOX_TOLERANCE_DEG} (${zoneSouth})`,
            )
          }
          if (east > zoneEast + BBOX_TOLERANCE_DEG) {
            pushError(
              errors,
              `${layerPath}/bbox`,
              `layer.bbox queda fuera de zone.bbox: east (${east}) > zone.east + ${BBOX_TOLERANCE_DEG} (${zoneEast})`,
            )
          }
          if (north > zoneNorth + BBOX_TOLERANCE_DEG) {
            pushError(
              errors,
              `${layerPath}/bbox`,
              `layer.bbox queda fuera de zone.bbox: north (${north}) > zone.north + ${BBOX_TOLERANCE_DEG} (${zoneNorth})`,
            )
          }
        }
      }

      if (Array.isArray(layer.range) && layer.range.length === 2) {
        const [min, max] = layer.range
        if (isFiniteNumber(min) && isFiniteNumber(max) && !(min < max)) {
          pushError(
            errors,
            `${layerPath}/range`,
            `range inválido: min (${min}) debe ser estrictamente menor que max (${max})`,
          )
        }
      }

      if (Array.isArray(layer.legend)) {
        let previousValue
        layer.legend.forEach((stop, stopIndex) => {
          if (!isPlainObject(stop) || !isFiniteNumber(stop.value)) {
            return
          }
          if (previousValue !== undefined && !(stop.value > previousValue)) {
            pushError(
              errors,
              `${layerPath}/legend/${stopIndex}/value`,
              `legend debe estar ordenada por value en orden creciente estricto (${stop.value} tras ${previousValue})`,
            )
          }
          previousValue = stop.value
        })
      }

      pushImagePathErrors(errors, `${layerPath}/image`, layer.image, mode)

      if (mode === 'sample' && layer.status !== 'synthetic') {
        pushError(
          errors,
          `${layerPath}/status`,
          `datasetMode="sample" exige status="synthetic" (recibido ${JSON.stringify(layer.status)})`,
        )
      }
      if (mode === 'real' && layer.status !== 'processed_real') {
        pushError(
          errors,
          `${layerPath}/status`,
          `datasetMode="real" exige status="processed_real" (recibido ${JSON.stringify(layer.status)})`,
        )
      }

      if (isPlainObject(layer.provenance)) {
        const acquisitionDate = layer.provenance.acquisitionDate
        if (
          typeof acquisitionDate === 'string' &&
          acquisitionDate.trim() !== '' &&
          !isValidAcquisitionDate(acquisitionDate)
        ) {
          pushError(
            errors,
            `${layerPath}/provenance/acquisitionDate`,
            `acquisitionDate no es una fecha ISO 8601 real (fecha o fecha-hora con zona): ${JSON.stringify(acquisitionDate)}`,
          )
        }
      }

      if (layer.status === 'processed_real') {
        const provenance = layer.provenance
        if (!isPlainObject(provenance)) {
          pushError(
            errors,
            `${layerPath}/provenance`,
            'processed_real exige provenance con acquisitionDate, sceneId y referenceUrl',
          )
        } else {
          const requiredFields = ['acquisitionDate', 'sceneId', 'referenceUrl']
          for (const field of requiredFields) {
            const value = provenance[field]
            if (typeof value !== 'string' || value.trim() === '') {
              pushError(
                errors,
                `${layerPath}/provenance/${field}`,
                `processed_real exige provenance.${field} como cadena no vacía (no null)`,
              )
            }
          }
        }
      }

      if (Array.isArray(layer.timeSteps)) {
        if (layer.timeSteps.length === 0) {
          pushError(
            errors,
            `${layerPath}/timeSteps`,
            'timeSteps debe contener al menos un paso temporal',
          )
        }

        let previousTimestamp
        let previousDate

        layer.timeSteps.forEach((step, stepIndex) => {
          const stepPath = `${layerPath}/timeSteps/${stepIndex}`
          if (!isPlainObject(step)) {
            return
          }

          if (typeof step.date === 'string') {
            if (!isValidAcquisitionDate(step.date)) {
              pushError(
                errors,
                `${stepPath}/date`,
                `date no es una fecha ISO 8601 real (fecha o fecha-hora con zona): ${JSON.stringify(step.date)}`,
              )
            } else {
              const timestamp = Date.parse(step.date.replace(' ', 'T'))
              if (previousTimestamp !== undefined) {
                if (timestamp === previousTimestamp) {
                  pushError(
                    errors,
                    `${stepPath}/date`,
                    `date duplicada: el paso ${stepIndex} repite ${JSON.stringify(step.date)} (${JSON.stringify(previousDate)})`,
                  )
                } else if (!(timestamp > previousTimestamp)) {
                  pushError(
                    errors,
                    `${stepPath}/date`,
                    `timeSteps debe estar en orden estrictamente creciente: ${JSON.stringify(step.date)} es anterior a ${JSON.stringify(previousDate)}`,
                  )
                }
              }
              previousTimestamp = timestamp
              previousDate = step.date
            }
          }

          pushImagePathErrors(errors, `${stepPath}/image`, step.image, mode)

          const stepBbox = step.bbox
          if (isBBox(stepBbox)) {
            if (!(stepBbox[0] < stepBbox[2])) {
              pushError(
                errors,
                `${stepPath}/bbox`,
                `timeStep.bbox inválido: west (${stepBbox[0]}) debe ser menor que east (${stepBbox[2]})`,
              )
            }
            if (!(stepBbox[1] < stepBbox[3])) {
              pushError(
                errors,
                `${stepPath}/bbox`,
                `timeStep.bbox inválido: south (${stepBbox[1]}) debe ser menor que north (${stepBbox[3]})`,
              )
            }

            if (isBBox(zoneBbox)) {
              const [west, south, east, north] = stepBbox
              const [zoneWest, zoneSouth, zoneEast, zoneNorth] = zoneBbox
              if (west < zoneWest - BBOX_TOLERANCE_DEG) {
                pushError(
                  errors,
                  `${stepPath}/bbox`,
                  `timeStep.bbox queda fuera de zone.bbox: west (${west}) < zone.west - ${BBOX_TOLERANCE_DEG} (${zoneWest})`,
                )
              }
              if (south < zoneSouth - BBOX_TOLERANCE_DEG) {
                pushError(
                  errors,
                  `${stepPath}/bbox`,
                  `timeStep.bbox queda fuera de zone.bbox: south (${south}) < zone.south - ${BBOX_TOLERANCE_DEG} (${zoneSouth})`,
                )
              }
              if (east > zoneEast + BBOX_TOLERANCE_DEG) {
                pushError(
                  errors,
                  `${stepPath}/bbox`,
                  `timeStep.bbox queda fuera de zone.bbox: east (${east}) > zone.east + ${BBOX_TOLERANCE_DEG} (${zoneEast})`,
                )
              }
              if (north > zoneNorth + BBOX_TOLERANCE_DEG) {
                pushError(
                  errors,
                  `${stepPath}/bbox`,
                  `timeStep.bbox queda fuera de zone.bbox: north (${north}) > zone.north + ${BBOX_TOLERANCE_DEG} (${zoneNorth})`,
                )
              }
            }
          }

          if (isPlainObject(step.provenance)) {
            const acquisitionDate = step.provenance.acquisitionDate
            if (
              typeof acquisitionDate === 'string' &&
              acquisitionDate.trim() !== '' &&
              !isValidAcquisitionDate(acquisitionDate)
            ) {
              pushError(
                errors,
                `${stepPath}/provenance/acquisitionDate`,
                `acquisitionDate del paso no es una fecha ISO 8601 real (fecha o fecha-hora con zona): ${JSON.stringify(acquisitionDate)}`,
              )
            }
          }

          if (layer.status === 'processed_real') {
            const effectiveProvenance = {
              ...(isPlainObject(layer.provenance) ? layer.provenance : {}),
              ...(isPlainObject(step.provenance) ? step.provenance : {}),
            }
            for (const field of ['acquisitionDate', 'sceneId', 'referenceUrl']) {
              const value = effectiveProvenance[field]
              if (typeof value !== 'string' || value.trim() === '') {
                pushError(
                  errors,
                  `${stepPath}/provenance/${field}`,
                  `processed_real exige que la procedencia efectiva del paso incluya ${field} como cadena no vacía (no null)`,
                )
              }
            }
          }
        })

        const lastStep = layer.timeSteps[layer.timeSteps.length - 1]
        if (isPlainObject(lastStep)) {
          if (
            typeof lastStep.image === 'string' &&
            typeof layer.image === 'string' &&
            lastStep.image !== layer.image
          ) {
            pushError(
              errors,
              `${layerPath}/image`,
              `layer.image debe coincidir con el image del último timeStep (${JSON.stringify(lastStep.image)}); recibido ${JSON.stringify(layer.image)}`,
            )
          }
          if (isBBox(lastStep.bbox) && isBBox(layer.bbox) && !sameBBox(lastStep.bbox, layer.bbox)) {
            pushError(
              errors,
              `${layerPath}/bbox`,
              `layer.bbox debe coincidir con el bbox del último timeStep (${JSON.stringify(lastStep.bbox)}); recibido ${JSON.stringify(layer.bbox)}`,
            )
          }
        }
      }
    })
  })

  return errors
}

function ascii(bytes, start, length) {
  let text = ''
  for (let index = start; index < start + length; index += 1) {
    text += String.fromCharCode(bytes[index])
  }
  return text
}

/**
 * Lee la cabecera de un PNG sin decodificar los píxeles.
 *
 * @param {Uint8Array} bytes
 * @returns {{ signatureOk: boolean, width: number | null, height: number | null, bitDepth: number | null, colorType: number | null, hasTrns: boolean }}
 */
export function readPngHeader(bytes) {
  /** @type {{ signatureOk: boolean, width: number | null, height: number | null, bitDepth: number | null, colorType: number | null, hasTrns: boolean }} */
  const header = {
    signatureOk: false,
    width: null,
    height: null,
    bitDepth: null,
    colorType: null,
    hasTrns: false,
  }

  if (!(bytes instanceof Uint8Array) || bytes.length < 8) {
    return header
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return header
    }
  }
  header.signatureOk = true

  if (bytes.length < 33) {
    return header
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ihdrLength = view.getUint32(8)
  if (ascii(bytes, 12, 4) !== 'IHDR' || ihdrLength !== 13) {
    return header
  }

  header.width = view.getUint32(16)
  header.height = view.getUint32(20)
  header.bitDepth = bytes[24]
  header.colorType = bytes[25]

  // tRNS puede aparecer antes de IDAT; basta con recorrer los chunks.
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = ascii(bytes, offset + 4, 4)
    if (type === 'tRNS') {
      header.hasTrns = true
    }
    if (type === 'IEND' || type === 'IDAT') {
      break
    }
    if (length > bytes.length) {
      break
    }
    offset += 12 + length
  }

  return header
}

/**
 * Un PNG se considera válido para overlay si tiene canal alfa real
 * (RGBA = 6, gris+alfa = 4) o una paleta con transparencia (tRNS).
 *
 * @param {Uint8Array} bytes
 */
export function pngHasAlpha(bytes) {
  const header = readPngHeader(bytes)
  return (
    header.signatureOk &&
    (header.colorType === 6 || header.colorType === 4 || header.hasTrns)
  )
}

function assertSafeRelativeImage(image) {
  return (
    typeof image === 'string' &&
    !image.includes('%') &&
    SAFE_IMAGE_PATH_PATTERN.test(image) &&
    !path.isAbsolute(image) &&
    !image.split('/').includes('..')
  )
}

/**
 * Comprueba que cada `layer.image` exista en `publicDir` y sea PNG con alfa.
 *
 * @param {unknown} manifest
 * @param {{ publicDir?: string | null, readAsset?: (relativePath: string) => Promise<Uint8Array> | Uint8Array }} [options]
 * @returns {Promise<{ path: string, message: string }[]>}
 */
export async function assetErrors(manifest, { publicDir = null, readAsset } = {}) {
  /** @type {{ path: string, message: string }[]} */
  const errors = []
  if (!isPlainObject(manifest) || !Array.isArray(manifest.zones)) {
    return errors
  }

  const reader =
    readAsset ??
    (publicDir
      ? (relativePath) => readFile(path.join(publicDir, relativePath))
      : null)

  if (!reader) {
    throw new TypeError('assetErrors requiere publicDir o readAsset')
  }

  for (let zoneIndex = 0; zoneIndex < manifest.zones.length; zoneIndex += 1) {
    const zone = manifest.zones[zoneIndex]
    if (!isPlainObject(zone) || !Array.isArray(zone.layers)) {
      continue
    }
    for (let layerIndex = 0; layerIndex < zone.layers.length; layerIndex += 1) {
      const layer = zone.layers[layerIndex]
      if (!isPlainObject(layer)) {
        continue
      }

      /** @type {{ path: string, image: string }[]} */
      const images = []
      if (typeof layer.image === 'string') {
        images.push({
          path: `/zones/${zoneIndex}/layers/${layerIndex}/image`,
          image: layer.image,
        })
      }
      if (Array.isArray(layer.timeSteps)) {
        layer.timeSteps.forEach((step, stepIndex) => {
          if (isPlainObject(step) && typeof step.image === 'string') {
            images.push({
              path: `/zones/${zoneIndex}/layers/${layerIndex}/timeSteps/${stepIndex}/image`,
              image: step.image,
            })
          }
        })
      }

      // layer.image coincide con el último paso: se valida una sola vez por ruta.
      const seenImages = new Set()
      for (const { path: imagePath, image } of images) {
        if (seenImages.has(image)) {
          continue
        }
        seenImages.add(image)

        // Una ruta insegura ya la reporta el esquema/semántica: no leer fuera.
        if (!assertSafeRelativeImage(image)) {
          continue
        }

        let bytes
        try {
          bytes = await reader(image)
        } catch {
          pushError(
            errors,
            imagePath,
            `no existe el PNG referenciado en public/: ${image}`,
          )
          continue
        }

        const header = readPngHeader(bytes)
        if (!header.signatureOk) {
          pushError(
            errors,
            imagePath,
            `el asset ${image} no es un PNG válido (firma incorrecta)`,
          )
          continue
        }
        if (!(header.colorType === 6 || header.colorType === 4 || header.hasTrns)) {
          pushError(
            errors,
            imagePath,
            `el PNG ${image} no tiene canal alfa (color type ${header.colorType}); se exige RGBA (6), gris+alfa (4) o tRNS`,
          )
          continue
        }
        if (!header.width || !header.height) {
          pushError(
            errors,
            imagePath,
            `el PNG ${image} declara dimensiones inválidas (${header.width}x${header.height})`,
          )
        }
      }
    }
  }

  return errors
}

/**
 * Crea un validador asíncrono que combina esquema + semántica + assets.
 *
 * @param {{
 *   schema: object,
 *   publicDir?: string | null,
 *   checkAssets?: boolean,
 *   readAsset?: (relativePath: string) => Promise<Uint8Array> | Uint8Array,
 * }} options
 * @returns {(manifest: unknown, options?: { expectedMode?: 'sample' | 'real', checkAssets?: boolean }) => Promise<{ valid: boolean, errors: { path: string, message: string }[] }>}
 */
export function createManifestValidator({
  schema,
  publicDir = null,
  checkAssets = true,
  readAsset,
} = {}) {
  const validateSchema = compileSchema(schema)

  return async function validate(manifest, options = {}) {
    /** @type {{ path: string, message: string }[]} */
    const errors = []
    let schemaOk = false

    try {
      schemaOk = validateSchema(manifest) === true
    } catch (error) {
      pushError(
        errors,
        '(raíz)',
        `el manifiesto no se pudo validar: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    if (!schemaOk) {
      errors.push(...formatAjvErrors(validateSchema.errors))
    }

    errors.push(...semanticErrors(manifest, options))

    const assetsEnabled = options.checkAssets ?? checkAssets
    if (assetsEnabled && schemaOk) {
      errors.push(...(await assetErrors(manifest, { publicDir, readAsset })))
    }

    return { valid: errors.length === 0, errors }
  }
}

// ---------------------------------------------------------------------------
// Cubo de análisis por zona (contrato v1.3.0, contracts/analysis.schema.json)
// ---------------------------------------------------------------------------

/** Tamaño máximo de un PNG de datos del cubo (bytes): evita publicar binarios grandes. */
export const ANALYSIS_MAX_PNG_BYTES = 2 * 1024 * 1024

function isoTime(value) {
  return typeof value === 'string' && isValidAcquisitionDate(value)
    ? Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)
    : null
}

/**
 * Reglas semánticas del cubo que el esquema no expresa.
 *
 * @param {unknown} analysis
 * @param {{ zoneId?: string, mode?: 'sample' | 'real', zoneBbox?: number[] }} [context]
 * @returns {{ path: string, message: string }[]}
 */
export function analysisSemanticErrors(analysis, { zoneId, mode, zoneBbox } = {}) {
  /** @type {{ path: string, message: string }[]} */
  const errors = []
  if (!isPlainObject(analysis)) {
    return errors
  }

  if (zoneId !== undefined && analysis.zoneId !== zoneId) {
    pushError(errors, '/zoneId', `zoneId ${JSON.stringify(analysis.zoneId)} no coincide con la zona del manifiesto ${JSON.stringify(zoneId)}`)
  }

  const grid = analysis.grid
  if (isPlainObject(grid) && isBBox(grid.bbox)) {
    const [west, south, east, north] = grid.bbox
    if (!(west < east) || !(south < north)) {
      pushError(errors, '/grid/bbox', 'grid.bbox inválido: debe cumplir west < east y south < north')
    }
    if (isBBox(zoneBbox)) {
      const tolerance = BBOX_TOLERANCE_DEG
      const outside =
        west < zoneBbox[0] - tolerance ||
        south < zoneBbox[1] - tolerance ||
        east > zoneBbox[2] + tolerance ||
        north > zoneBbox[3] + tolerance
      if (outside) {
        pushError(errors, '/grid/bbox', `grid.bbox ${JSON.stringify(grid.bbox)} se sale de zone.bbox ${JSON.stringify(zoneBbox)} (tolerancia ${tolerance}°)`)
      }
    }
  }

  const dataPrefix =
    typeof analysis.zoneId === 'string' && (mode === 'sample' || mode === 'real')
      ? `${IMAGE_PATH_ROOT}${mode}/zones/${analysis.zoneId}/analysis/`
      : null

  /** @type {Set<string>} */
  const variableIds = new Set()
  if (Array.isArray(analysis.variables)) {
    analysis.variables.forEach((variable, variableIndex) => {
      const variablePath = `/variables/${variableIndex}`
      if (!isPlainObject(variable)) {
        return
      }
      if (typeof variable.id === 'string') {
        if (variableIds.has(variable.id)) {
          pushError(errors, `${variablePath}/id`, `id de variable duplicado: "${variable.id}"`)
        }
        variableIds.add(variable.id)
      }
      if (Array.isArray(variable.displayRange) && variable.displayRange.length === 2) {
        const [min, max] = variable.displayRange
        if (!(min < max)) {
          pushError(errors, `${variablePath}/displayRange`, `displayRange inválido: ${min} debe ser menor que ${max}`)
        }
      }
      if (mode === 'real' && variable.status !== 'processed_real') {
        pushError(errors, `${variablePath}/status`, 'en modo real toda variable debe ser processed_real')
      }
      if (mode === 'sample' && variable.status !== 'synthetic') {
        pushError(errors, `${variablePath}/status`, 'en modo sample toda variable debe ser synthetic')
      }
      if (!Array.isArray(variable.steps)) {
        return
      }
      if (variable.temporal === false && variable.steps.length !== 1) {
        pushError(errors, `${variablePath}/steps`, `una variable estática (temporal: false) debe tener exactamente un paso (tiene ${variable.steps.length})`)
      }
      /** @type {number | null} */
      let previous = null
      /** @type {Set<string>} */
      const seenData = new Set()
      variable.steps.forEach((step, stepIndex) => {
        const stepPath = `${variablePath}/steps/${stepIndex}`
        if (!isPlainObject(step)) {
          return
        }
        if (typeof step.data === 'string') {
          pushImagePathErrors(errors, `${stepPath}/data`, step.data, mode)
          if (dataPrefix && !step.data.startsWith(dataPrefix)) {
            pushError(errors, `${stepPath}/data`, `data debe estar bajo "${dataPrefix}" (recibido ${JSON.stringify(step.data)})`)
          }
          if (seenData.has(step.data)) {
            pushError(errors, `${stepPath}/data`, `PNG repetido en la misma variable: ${step.data}`)
          }
          seenData.add(step.data)
        }
        if (variable.temporal === true) {
          const time = isoTime(step.date)
          if (time === null) {
            pushError(errors, `${stepPath}/date`, `una variable temporal exige fechas ISO 8601 reales en cada paso (recibido ${JSON.stringify(step.date)})`)
          } else {
            if (previous !== null && !(time > previous)) {
              pushError(errors, `${stepPath}/date`, 'los pasos deben estar en orden estrictamente creciente de fecha')
            }
            previous = time
          }
        } else if (step.date !== null && step.date !== undefined && isoTime(step.date) === null) {
          pushError(errors, `${stepPath}/date`, `fecha inválida: ${JSON.stringify(step.date)}`)
        }
        if (isPlainObject(step.stats)) {
          const { p10, median, p90, min, max } = step.stats
          const ordered = [min, p10, median, p90, max].filter((value) => isFiniteNumber(value))
          for (let index = 1; index < ordered.length; index += 1) {
            if (ordered[index] < ordered[index - 1] - 1e-9) {
              pushError(errors, `${stepPath}/stats`, 'stats incoherentes: debe cumplirse min ≤ p10 ≤ median ≤ p90 ≤ max')
              break
            }
          }
        }
      })
    })
  }

  if (Array.isArray(analysis.zoneSeries)) {
    /** @type {Set<string>} */
    const seriesIds = new Set()
    analysis.zoneSeries.forEach((series, seriesIndex) => {
      const seriesPath = `/zoneSeries/${seriesIndex}`
      if (!isPlainObject(series)) {
        return
      }
      if (typeof series.id === 'string') {
        if (seriesIds.has(series.id)) {
          pushError(errors, `${seriesPath}/id`, `id de serie duplicado: "${series.id}"`)
        }
        seriesIds.add(series.id)
      }
      if (!Array.isArray(series.points)) {
        return
      }
      /** @type {number | null} */
      let previous = null
      series.points.forEach((point, pointIndex) => {
        if (!isPlainObject(point)) {
          return
        }
        const time = isoTime(point.date)
        if (time === null) {
          pushError(errors, `${seriesPath}/points/${pointIndex}/date`, `fecha inválida: ${JSON.stringify(point.date)}`)
          return
        }
        if (previous !== null && !(time > previous)) {
          pushError(errors, `${seriesPath}/points/${pointIndex}/date`, 'los puntos deben estar en orden estrictamente creciente de fecha')
        }
        previous = time
      })
    })
  }

  if (Array.isArray(analysis.crops)) {
    /** @type {Set<string>} */
    const cropIds = new Set()
    analysis.crops.forEach((crop, cropIndex) => {
      const cropPath = `/crops/${cropIndex}`
      if (!isPlainObject(crop)) {
        return
      }
      if (typeof crop.id === 'string') {
        if (cropIds.has(crop.id)) {
          pushError(errors, `${cropPath}/id`, `id de cultivo duplicado: "${crop.id}"`)
        }
        cropIds.add(crop.id)
      }
      /** @type {{ at: string, raster: unknown }[]} */
      const rasters = [{ at: `${cropPath}/suitability`, raster: crop.suitability }]
      /** @type {Set<string>} */
      const factorIds = new Set()
      if (Array.isArray(crop.factors)) {
        crop.factors.forEach((factor, factorIndex) => {
          const factorPath = `${cropPath}/factors/${factorIndex}`
          if (!isPlainObject(factor)) {
            return
          }
          if (typeof factor.id === 'string') {
            if (factorIds.has(factor.id)) {
              pushError(errors, `${factorPath}/id`, `id de factor duplicado en "${crop.id}": "${factor.id}"`)
            }
            factorIds.add(factor.id)
          }
          if (Array.isArray(factor.variables)) {
            factor.variables.forEach((variableId, variableIndex) => {
              if (typeof variableId === 'string' && !variableIds.has(variableId)) {
                pushError(errors, `${factorPath}/variables/${variableIndex}`, `el factor usa una variable inexistente en el cubo: "${variableId}"`)
              }
            })
          }
          rasters.push({ at: `${factorPath}/raster`, raster: factor.raster })
        })
      }
      if (Array.isArray(crop.otherRequirements)) {
        crop.otherRequirements.forEach((requirement, requirementIndex) => {
          if (!isPlainObject(requirement) || !Array.isArray(requirement.variables)) return
          requirement.variables.forEach((variableId, variableIndex) => {
            if (typeof variableId === 'string' && !variableIds.has(variableId)) {
              pushError(
                errors,
                `${cropPath}/otherRequirements/${requirementIndex}/variables/${variableIndex}`,
                `el requisito usa una variable inexistente en el cubo: "${variableId}"`,
              )
            }
          })
        })
      }
      for (const { at, raster } of rasters) {
        if (!isPlainObject(raster) || typeof raster.data !== 'string') {
          continue
        }
        pushImagePathErrors(errors, `${at}/data`, raster.data, mode)
        if (dataPrefix && !raster.data.startsWith(dataPrefix)) {
          pushError(errors, `${at}/data`, `data debe estar bajo "${dataPrefix}" (recibido ${JSON.stringify(raster.data)})`)
        }
      }
    })
  }

  if (isPlainObject(analysis.suitability) && Array.isArray(analysis.suitability.criteria)) {
    analysis.suitability.criteria.forEach((criterion, criterionIndex) => {
      if (isPlainObject(criterion) && typeof criterion.variable === 'string' && !variableIds.has(criterion.variable)) {
        pushError(errors, `/suitability/criteria/${criterionIndex}/variable`, `el criterio apunta a una variable inexistente: "${criterion.variable}"`)
      }
    })
  }

  return errors
}

/**
 * Comprueba que cada PNG de datos exista, sea gris de 8 bits sin alfa y tenga
 * exactamente el tamaño de la rejilla.
 *
 * @param {unknown} analysis
 * @param {{ publicDir?: string | null, readAsset?: (relativePath: string) => Promise<Uint8Array> | Uint8Array }} [options]
 * @returns {Promise<{ path: string, message: string }[]>}
 */
export async function analysisAssetErrors(analysis, { publicDir = null, readAsset } = {}) {
  /** @type {{ path: string, message: string }[]} */
  const errors = []
  if (!isPlainObject(analysis) || !Array.isArray(analysis.variables) || !isPlainObject(analysis.grid)) {
    return errors
  }
  const reader =
    readAsset ??
    (publicDir ? (relativePath) => readFile(path.join(publicDir, relativePath)) : null)
  if (!reader) {
    throw new TypeError('analysisAssetErrors requiere publicDir o readAsset')
  }
  const { width, height } = analysis.grid

  /** @type {{ at: string, data: unknown }[]} */
  const assets = []
  analysis.variables.forEach((variable, variableIndex) => {
    if (!isPlainObject(variable) || !Array.isArray(variable.steps)) {
      return
    }
    variable.steps.forEach((step, stepIndex) => {
      if (isPlainObject(step)) {
        assets.push({ at: `/variables/${variableIndex}/steps/${stepIndex}/data`, data: step.data })
      }
    })
  })
  if (Array.isArray(analysis.crops)) {
    analysis.crops.forEach((crop, cropIndex) => {
      if (!isPlainObject(crop)) {
        return
      }
      if (isPlainObject(crop.suitability)) {
        assets.push({ at: `/crops/${cropIndex}/suitability/data`, data: crop.suitability.data })
      }
      if (Array.isArray(crop.factors)) {
        crop.factors.forEach((factor, factorIndex) => {
          if (isPlainObject(factor) && isPlainObject(factor.raster)) {
            assets.push({ at: `/crops/${cropIndex}/factors/${factorIndex}/raster/data`, data: factor.raster.data })
          }
        })
      }
    })
  }

  for (const { at, data } of assets) {
    if (!assertSafeRelativeImage(data)) {
      continue
    }
    let bytes
    try {
      bytes = await reader(data)
    } catch {
      pushError(errors, at, `no existe el PNG de datos referenciado en public/: ${data}`)
      continue
    }
    const header = readPngHeader(bytes)
    if (!header.signatureOk) {
      pushError(errors, at, `el asset ${data} no es un PNG válido (firma incorrecta)`)
      continue
    }
    if (header.colorType !== 0 || header.bitDepth !== 8 || header.hasTrns) {
      pushError(errors, at, `el PNG de datos ${data} debe ser gris de 8 bits sin alfa (color type ${header.colorType}, bit depth ${header.bitDepth})`)
    }
    if (header.width !== width || header.height !== height) {
      pushError(errors, at, `el PNG de datos ${data} mide ${header.width}x${header.height}; la rejilla exige ${width}x${height}`)
    }
    if (bytes.byteLength > ANALYSIS_MAX_PNG_BYTES) {
      pushError(errors, at, `el PNG de datos ${data} supera ${ANALYSIS_MAX_PNG_BYTES} bytes`)
    }
  }
  return errors
}

/**
 * Crea un validador del cubo de análisis (esquema + semántica + assets).
 *
 * @param {{ schema: object, publicDir?: string | null, checkAssets?: boolean, readAsset?: (relativePath: string) => Promise<Uint8Array> | Uint8Array }} options
 */
export function createAnalysisValidator({ schema, publicDir = null, checkAssets = true, readAsset } = {}) {
  const validateSchema = compileSchema(schema)

  return async function validate(analysis, context = {}) {
    /** @type {{ path: string, message: string }[]} */
    const errors = []
    const schemaOk = validateSchema(analysis) === true
    if (!schemaOk) {
      errors.push(...formatAjvErrors(validateSchema.errors))
    }
    errors.push(...analysisSemanticErrors(analysis, context))
    const assetsEnabled = context.checkAssets ?? checkAssets
    if (assetsEnabled && schemaOk) {
      errors.push(...(await analysisAssetErrors(analysis, { publicDir, readAsset })))
    }
    return { valid: errors.length === 0, errors }
  }
}
