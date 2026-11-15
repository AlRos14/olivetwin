/**
 * Comprobaciones semánticas mínimas del manifiesto en runtime (WP-04).
 *
 * El JSON Schema solo valida estructura, enums y patrones. Las reglas
 * geométricas y de identidad que no caben en el esquema se comprueban dos
 * veces:
 *
 *   1. En CI (`frontend/scripts/validate-lib.mjs`, función `semanticErrors`),
 *      que es la fuente de verdad completa para publicar datos.
 *   2. En runtime, con este módulo, para que un manifiesto manipulado o servido
 *      por error no pinte zonas imposibles en el navegador.
 *
 * Se replica deliberadamente el subconjunto mínimo acordado en la revisión
 * (orden de `bbox`, contención con tolerancia, unicidad de ids de zona y, desde
 * v1.2.0, orden/bbox/último paso de `timeSteps`) en vez de importar
 * `validate-lib.mjs`: ese módulo arrastra `node:fs`/`node:path` y no debe entrar
 * en el bundle del navegador. Si se cambia una regla semántica, hay que
 * actualizar los dos sitios y sus tests.
 *
 * Los mensajes se construyen con el catálogo i18n (`errors.semantics.*`) en el
 * idioma activo en el momento de la validación.
 */
import type { BBox, OliveTwinManifest } from '../types/manifest'
import { t } from '../i18n'

/** Tolerancia en grados, alineada con `BBOX_TOLERANCE_DEG` de validate-lib.mjs. */
export const RUNTIME_BBOX_TOLERANCE_DEG = 0.01

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBBox(value: unknown): value is BBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((component) => isFiniteNumber(component))
  )
}

function sameBBox(left: BBox, right: BBox): boolean {
  return left.every((component, index) => component === right[index])
}

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2})))?$/

/**
 * Fecha ISO 8601 real (fecha sola o fecha-hora con zona), misma regla que
 * `isValidAcquisitionDate` de validate-lib.mjs. El esquema ya aplica
 * `format: date`/`date-time`; aquí se repite para no comparar fechas inválidas
 * al comprobar el orden de los pasos.
 */
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_TIME_PATTERN.test(value)) {
    return false
  }
  return !Number.isNaN(Date.parse(value.replace(' ', 'T')))
}

/** Sujeto de un mensaje: «la zona «id» (índice 0)» y equivalentes. */
function zoneSubject(zoneId: string, index: number): string {
  return t('errors.semantics.zoneSubject', { id: zoneId, index })
}

function layerSubject(layerId: string, index: number, zone: string): string {
  return t('errors.semantics.layerSubject', { id: layerId, index, zone })
}

function stepSubject(index: number, date: string, layer: string): string {
  return t('errors.semantics.stepSubject', { index, date, layer })
}

/** Problemas de bbox comunes a zona, capa y paso temporal. */
function bboxIssues(subject: string, bbox: BBox, outer: BBox | null): string[] {
  const issues: string[] = []
  const [west, south, east, north] = bbox

  if (!(west < east)) {
    issues.push(t('errors.semantics.invalidWest', { subject, west, east }))
  }
  if (!(south < north)) {
    issues.push(t('errors.semantics.invalidSouth', { subject, south, north }))
  }

  if (!outer) return issues

  const [outerWest, outerSouth, outerEast, outerNorth] = outer
  const tolerance = RUNTIME_BBOX_TOLERANCE_DEG
  if (west < outerWest - tolerance) {
    issues.push(
      t('errors.semantics.outsideWest', { subject, value: west, limit: outerWest, tolerance }),
    )
  }
  if (south < outerSouth - tolerance) {
    issues.push(
      t('errors.semantics.outsideSouth', { subject, value: south, limit: outerSouth, tolerance }),
    )
  }
  if (east > outerEast + tolerance) {
    issues.push(
      t('errors.semantics.outsideEast', { subject, value: east, limit: outerEast, tolerance }),
    )
  }
  if (north > outerNorth + tolerance) {
    issues.push(
      t('errors.semantics.outsideNorth', { subject, value: north, limit: outerNorth, tolerance }),
    )
  }

  return issues
}

/**
 * Devuelve una lista de problemas legibles (vacía si todo es coherente). El
 * primer mensaje es el que `manifestService` muestra en la UI.
 */
export function manifestSemanticErrors(manifest: OliveTwinManifest): string[] {
  const errors: string[] = []
  const zoneIds = new Set<string>()

  manifest.zones.forEach((zone, zoneIndex) => {
    const subject = zoneSubject(String(zone.id), zoneIndex)

    if (zoneIds.has(zone.id)) {
      errors.push(t('errors.semantics.duplicateZone', { id: zone.id }))
    }
    zoneIds.add(zone.id)

    const zoneBbox = zone.bbox
    if (!isBBox(zoneBbox)) {
      errors.push(t('errors.semantics.noBbox', { subject }))
      return
    }

    errors.push(...bboxIssues(subject, zoneBbox, null))

    zone.layers.forEach((layer, layerIndex) => {
      const layerLabel = layerSubject(String(layer.id), layerIndex, subject)
      const layerBbox = layer.bbox

      if (!isBBox(layerBbox)) {
        errors.push(t('errors.semantics.noBbox', { subject: layerLabel }))
        return
      }

      errors.push(...bboxIssues(layerLabel, layerBbox, zoneBbox))

      if (Array.isArray(layer.timeSteps)) {
        let previousTimestamp: number | undefined
        let previousDate: string | undefined

        layer.timeSteps.forEach((step, stepIndex) => {
          const stepLabel = stepSubject(stepIndex, String(step.date), layerLabel)

          if (!isValidIsoDate(step.date)) {
            errors.push(t('errors.semantics.invalidDate', { subject: stepLabel }))
          } else {
            const timestamp = Date.parse(step.date.replace(' ', 'T'))
            if (previousTimestamp !== undefined) {
              if (timestamp === previousTimestamp) {
                errors.push(
                  t('errors.semantics.duplicateDate', {
                    subject: stepLabel,
                    previous: String(previousDate),
                  }),
                )
              } else if (!(timestamp > previousTimestamp)) {
                errors.push(
                  t('errors.semantics.unordered', {
                    subject: stepLabel,
                    previous: String(previousDate),
                  }),
                )
              }
            }
            previousTimestamp = timestamp
            previousDate = step.date
          }

          const stepBbox = step.bbox
          if (!isBBox(stepBbox)) {
            errors.push(t('errors.semantics.noBbox', { subject: stepLabel }))
            return
          }
          errors.push(...bboxIssues(stepLabel, stepBbox, zoneBbox))
        })

        const lastStep = layer.timeSteps[layer.timeSteps.length - 1]
        if (lastStep && lastStep.image !== layer.image) {
          errors.push(
            t('errors.semantics.imageMismatch', {
              subject: layerLabel,
              image: String(lastStep.image),
            }),
          )
        }
        if (lastStep && isBBox(lastStep.bbox) && !sameBBox(lastStep.bbox, layerBbox)) {
          errors.push(t('errors.semantics.bboxMismatch', { subject: layerLabel }))
        }
      }
    })
  })

  return errors
}
