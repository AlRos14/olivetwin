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
 * (orden de `bbox`, contención con tolerancia y unicidad de ids de zona) en vez
 * de importar `validate-lib.mjs`: ese módulo arrastra `node:fs`/`node:path` y
 * no debe entrar en el bundle del navegador. Si se cambia una regla semántica,
 * hay que actualizar los dos sitios y sus tests.
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
    })
  })

  return errors
}
