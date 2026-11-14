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
/** Versiones exactas admitidas: 1.1.0 (sin serie temporal) y 1.2.0 (con o sin timeSteps). */
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.1.0', '1.2.0'])
/** Versión obligatoria cuando el manifiesto usa layer.timeSteps. */
export const TIMESTEPS_SCHEMA_VERSION = '1.2.0'
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
    if (usesTimeSteps && manifest.schemaVersion !== TIMESTEPS_SCHEMA_VERSION) {
      pushError(
        errors,
        '/schemaVersion',
        `layer.timeSteps exige schemaVersion "${TIMESTEPS_SCHEMA_VERSION}" (recibido ${JSON.stringify(manifest.schemaVersion)})`,
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
