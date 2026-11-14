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
 */
import type { BBox, OliveTwinManifest } from '../types/manifest'

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

/**
 * Devuelve una lista de problemas legibles en español (vacía si todo es
 * coherente). El primer mensaje es el que `manifestService` muestra en la UI.
 */
export function manifestSemanticErrors(manifest: OliveTwinManifest): string[] {
  const errors: string[] = []
  const zoneIds = new Set<string>()

  manifest.zones.forEach((zone, zoneIndex) => {
    const zoneLabel = `la zona «${String(zone.id)}» (índice ${zoneIndex})`

    if (zoneIds.has(zone.id)) {
      errors.push(`id de zona duplicado: «${zone.id}»`)
    }
    zoneIds.add(zone.id)

    const zoneBbox = zone.bbox
    if (!isBBox(zoneBbox)) {
      errors.push(`${zoneLabel} no declara un bbox de cuatro números`)
      return
    }

    if (!(zoneBbox[0] < zoneBbox[2])) {
      errors.push(
        `${zoneLabel} tiene un bbox inválido: west (${zoneBbox[0]}) debe ser menor que east (${zoneBbox[2]})`,
      )
    }
    if (!(zoneBbox[1] < zoneBbox[3])) {
      errors.push(
        `${zoneLabel} tiene un bbox inválido: south (${zoneBbox[1]}) debe ser menor que north (${zoneBbox[3]})`,
      )
    }

    zone.layers.forEach((layer, layerIndex) => {
      const layerLabel = `la capa «${String(layer.id)}» (índice ${layerIndex}) de ${zoneLabel}`
      const layerBbox = layer.bbox

      if (!isBBox(layerBbox)) {
        errors.push(`${layerLabel} no declara un bbox de cuatro números`)
        return
      }

      if (!(layerBbox[0] < layerBbox[2])) {
        errors.push(
          `${layerLabel} tiene un bbox inválido: west (${layerBbox[0]}) debe ser menor que east (${layerBbox[2]})`,
        )
      }
      if (!(layerBbox[1] < layerBbox[3])) {
        errors.push(
          `${layerLabel} tiene un bbox inválido: south (${layerBbox[1]}) debe ser menor que north (${layerBbox[3]})`,
        )
      }

      const [west, south, east, north] = layerBbox
      const [zoneWest, zoneSouth, zoneEast, zoneNorth] = zoneBbox
      if (west < zoneWest - RUNTIME_BBOX_TOLERANCE_DEG) {
        errors.push(
          `${layerLabel} tiene un bbox fuera de la zona: west (${west}) < ${zoneWest} - ${RUNTIME_BBOX_TOLERANCE_DEG}`,
        )
      }
      if (south < zoneSouth - RUNTIME_BBOX_TOLERANCE_DEG) {
        errors.push(
          `${layerLabel} tiene un bbox fuera de la zona: south (${south}) < ${zoneSouth} - ${RUNTIME_BBOX_TOLERANCE_DEG}`,
        )
      }
      if (east > zoneEast + RUNTIME_BBOX_TOLERANCE_DEG) {
        errors.push(
          `${layerLabel} tiene un bbox fuera de la zona: east (${east}) > ${zoneEast} + ${RUNTIME_BBOX_TOLERANCE_DEG}`,
        )
      }
      if (north > zoneNorth + RUNTIME_BBOX_TOLERANCE_DEG) {
        errors.push(
          `${layerLabel} tiene un bbox fuera de la zona: north (${north}) > ${zoneNorth} + ${RUNTIME_BBOX_TOLERANCE_DEG}`,
        )
      }

      if (Array.isArray(layer.timeSteps)) {
        let previousTimestamp: number | undefined
        let previousDate: string | undefined

        layer.timeSteps.forEach((step, stepIndex) => {
          const stepLabel = `el paso temporal ${stepIndex} (${String(step.date)}) de ${layerLabel}`

          if (!isValidIsoDate(step.date)) {
            errors.push(
              `${stepLabel} no declara una fecha ISO 8601 real (fecha o fecha-hora con zona)`,
            )
          } else {
            const timestamp = Date.parse(step.date.replace(' ', 'T'))
            if (previousTimestamp !== undefined) {
              if (timestamp === previousTimestamp) {
                errors.push(
                  `${stepLabel} repite la fecha de un paso anterior (${String(previousDate)})`,
                )
              } else if (!(timestamp > previousTimestamp)) {
                errors.push(
                  `${stepLabel} rompe el orden estrictamente creciente: es anterior a ${String(previousDate)}`,
                )
              }
            }
            previousTimestamp = timestamp
            previousDate = step.date
          }

          const stepBbox = step.bbox
          if (!isBBox(stepBbox)) {
            errors.push(`${stepLabel} no declara un bbox de cuatro números`)
            return
          }
          if (!(stepBbox[0] < stepBbox[2])) {
            errors.push(
              `${stepLabel} tiene un bbox inválido: west (${stepBbox[0]}) debe ser menor que east (${stepBbox[2]})`,
            )
          }
          if (!(stepBbox[1] < stepBbox[3])) {
            errors.push(
              `${stepLabel} tiene un bbox inválido: south (${stepBbox[1]}) debe ser menor que north (${stepBbox[3]})`,
            )
          }

          const [stepWest, stepSouth, stepEast, stepNorth] = stepBbox
          if (stepWest < zoneWest - RUNTIME_BBOX_TOLERANCE_DEG) {
            errors.push(
              `${stepLabel} tiene un bbox fuera de la zona: west (${stepWest}) < ${zoneWest} - ${RUNTIME_BBOX_TOLERANCE_DEG}`,
            )
          }
          if (stepSouth < zoneSouth - RUNTIME_BBOX_TOLERANCE_DEG) {
            errors.push(
              `${stepLabel} tiene un bbox fuera de la zona: south (${stepSouth}) < ${zoneSouth} - ${RUNTIME_BBOX_TOLERANCE_DEG}`,
            )
          }
          if (stepEast > zoneEast + RUNTIME_BBOX_TOLERANCE_DEG) {
            errors.push(
              `${stepLabel} tiene un bbox fuera de la zona: east (${stepEast}) > ${zoneEast} + ${RUNTIME_BBOX_TOLERANCE_DEG}`,
            )
          }
          if (stepNorth > zoneNorth + RUNTIME_BBOX_TOLERANCE_DEG) {
            errors.push(
              `${stepLabel} tiene un bbox fuera de la zona: north (${stepNorth}) > ${zoneNorth} + ${RUNTIME_BBOX_TOLERANCE_DEG}`,
            )
          }
        })

        const lastStep = layer.timeSteps[layer.timeSteps.length - 1]
        if (lastStep && lastStep.image !== layer.image) {
          errors.push(
            `${layerLabel} tiene un layer.image distinto del último paso temporal (${String(lastStep.image)})`,
          )
        }
        if (lastStep && isBBox(lastStep.bbox) && !sameBBox(lastStep.bbox, layerBbox)) {
          errors.push(
            `${layerLabel} tiene un layer.bbox distinto del último paso temporal`,
          )
        }
      }
    })
  })

  return errors
}
