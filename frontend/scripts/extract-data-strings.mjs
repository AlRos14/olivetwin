#!/usr/bin/env node
/**
 * OliveTwin — extracción del catálogo inglés de los textos publicados.
 *
 * Los pipelines escriben en español los textos mostrables de `manifest.json` y
 * de los `analysis.json` (títulos, descripciones, avisos, procedencia, leyendas
 * de aptitud…). La interfaz los traduce con `dataText()` buscando la cadena
 * exacta en `public/data/real/i18n/en.json`.
 *
 * Este script mantiene ese catálogo sincronizado con los datos:
 *
 *   npm run i18n:data            # resumen: cadenas, traducidas, pendientes y huérfanas
 *   npm run i18n:data -- --write # añade las nuevas (valor null) y elimina las que ya no existen
 *
 * No traduce: tras `--write` hay que rellenar a mano las entradas con `null`.
 * `npm run validate:data` falla mientras quede alguna sin traducir.
 *
 * Exclusiones: claves técnicas (ids, rutas, enums, unidades…), URLs, fechas ISO
 * 8601, rutas `data/…`, números/versiones y marcadores como `--`. Las unidades
 * no se traducen aquí: son SI y la interfaz traduce la unidad `1`.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const publicDir = path.join(frontendDir, 'public')

/** Ruta del catálogo, relativa a `frontend/public/`. */
export const CATALOG_PATH = 'data/real/i18n/en.json'
/** Locales del catálogo: los datos se escriben en español y se traducen al inglés. */
export const CATALOG_SOURCE_LOCALE = 'es'
export const CATALOG_TARGET_LOCALE = 'en'

/**
 * Claves cuyos valores nunca se muestran como texto libre traducible.
 *
 * `unit` queda fuera a propósito: las unidades son SI y no se traducen; la
 * interfaz traduce el valor `1` como «dimensionless».
 */
export const EXCLUDED_STRING_KEYS = Object.freeze([
  // Identidad y enums del contrato.
  'id',
  'image',
  'data',
  'variable',
  'variables',
  'zoneId',
  'sceneId',
  'kind',
  'status',
  'datasetMode',
  'imageCrs',
  'encoding',
  'palette',
  'group',
  'crop',
  'date',
  'mask',
  'unit',
  'schemaVersion',
  'generatedAt',
  'chart',
  // Identificadores y versiones de producto.
  'crid',
  'productVersion',
  'processingBaseline',
  'granuleConceptId',
  'harmonyJobId',
  'nativeCrs',
  'platform',
  'referenceUrl',
  'url',
  'doi',
  'approvedBy',
  'layer',
  // Colores y números.
  'color',
  'crs',
  'nodata',
  'width',
  'height',
  'cellSizeM',
  'temporal',
  'scale',
  'offset',
  'decimals',
  'mean',
  'median',
  'p10',
  'p90',
  'min',
  'max',
  'validFraction',
  'appliedKTMPField',
  'ALTMAX',
])

/**
 * Claves cuyo contenido completo es técnico: no se recorren sus descendientes
 * (`pipeline`, `grid` y las tablas de parámetros de los cultivos).
 */
export const EXCLUDED_SUBTREES = Object.freeze([
  'pipeline',
  'grid',
  'items',
  'usdaClass',
  'usdaClassCells',
  'ratings',
  'faoSheetAltitude',
])

const EXCLUDED_STRING_KEY_SET = new Set(EXCLUDED_STRING_KEYS)
const EXCLUDED_SUBTREE_SET = new Set(EXCLUDED_SUBTREES)

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}.*)?$/
const ISO_DATE_RANGE_PATTERN = /^\d{4}-\d{2}-\d{2}\s*[→–-]\s*\d{4}-\d{2}-\d{2}$/
const URL_PATTERN = /^https?:\/\//i
const NUMERIC_PATTERN = /^[\d.,\s]+$/
const PLACEHOLDER_PATTERN = /^[-–—\s]+$/
// CRID de producto NISAR (p. ej. P05023): identificador técnico, no texto.
const PRODUCT_CRID_PATTERN = /^P\d{5}$/

/**
 * ¿Es `value` (bajo la clave `key`) una cadena mostrable que hay que traducir?
 *
 * @param {string} key Clave del objeto que contiene el valor.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDisplayString(key, value) {
  if (typeof value !== 'string') {
    return false
  }
  if (EXCLUDED_STRING_KEY_SET.has(key)) {
    return false
  }
  const text = value.trim()
  if (text === '') {
    return false
  }
  if (URL_PATTERN.test(text)) {
    return false
  }
  if (ISO_DATE_PATTERN.test(text)) {
    return false
  }
  if (ISO_DATE_RANGE_PATTERN.test(text)) {
    return false
  }
  if (text.startsWith('data/')) {
    return false
  }
  if (NUMERIC_PATTERN.test(text)) {
    return false
  }
  if (PLACEHOLDER_PATTERN.test(text)) {
    return false
  }
  if (PRODUCT_CRID_PATTERN.test(text)) {
    return false
  }
  return true
}

/**
 * Recorre un documento JSON y devuelve las cadenas mostrables en español.
 *
 * @param {unknown} document
 * @returns {Set<string>}
 */
export function extractDisplayStrings(document) {
  /** @type {Set<string>} */
  const found = new Set()

  /** @param {unknown} node @param {string} key */
  const walk = (node, key) => {
    if (EXCLUDED_SUBTREE_SET.has(key)) {
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, key)
      }
      return
    }
    if (node !== null && typeof node === 'object') {
      for (const [childKey, childValue] of Object.entries(node)) {
        walk(childValue, childKey)
      }
      return
    }
    if (isDisplayString(key, node)) {
      found.add(node)
    }
  }

  walk(document, '')
  return found
}

/** Lista recursiva de ficheros `.json` bajo `root` (orden estable). */
export async function listJsonFiles(root) {
  /** @type {string[]} */
  const files = []
  const visit = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(full)
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(full)
      }
    }
  }
  await visit(root)
  return files.sort()
}

/**
 * Cadenas mostrables de todos los `.json` de `dataDir`, sin incluir el propio
 * catálogo (`i18n/en.json`).
 *
 * @param {{ dataDir: string }} options
 * @returns {Promise<string[]>}
 */
export async function extractDataStrings({ dataDir }) {
  const catalogFile = path.join(dataDir, 'i18n', 'en.json')
  /** @type {Set<string>} */
  const found = new Set()
  for (const file of await listJsonFiles(dataDir)) {
    if (path.resolve(file) === path.resolve(catalogFile)) {
      continue
    }
    const raw = await readFile(file, 'utf8')
    for (const text of extractDisplayStrings(JSON.parse(raw))) {
      found.add(text)
    }
  }
  return [...found].sort()
}

/** Orden estable (code points) para que los diffs del catálogo no oscilen. */
export function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Fusiona las cadenas extraídas con el catálogo existente.
 *
 * Conserva las traducciones de las cadenas que siguen existiendo, deja `null`
 * en las nuevas y descarta las que ya no aparecen en los datos.
 *
 * @param {{ texts: string[], entries?: Record<string, string | null> }} options
 * @returns {{ entries: Record<string, string | null>, added: string[], removed: string[] }}
 */
export function mergeCatalog({ texts, entries = {} }) {
  const wanted = [...new Set(texts)].sort(compareStrings)
  /** @type {Record<string, string | null>} */
  const merged = {}
  /** @type {string[]} */
  const added = []
  for (const text of wanted) {
    const existing = entries[text]
    if (typeof existing === 'string' && existing.trim() !== '') {
      merged[text] = existing
    } else {
      merged[text] = null
      added.push(text)
    }
  }
  const removed = Object.keys(entries)
    .filter((text) => !(text in merged))
    .sort(compareStrings)
  return { entries: merged, added, removed }
}

/**
 * Errores de forma y cobertura del catálogo.
 *
 * @param {{ catalog: unknown, texts: string[] }} options
 * @returns {string[]}
 */
export function catalogErrors({ catalog, texts }) {
  /** @type {string[]} */
  const errors = []
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['el catálogo debe ser un objeto JSON con sourceLocale, locale y entries']
  }
  const file = /** @type {Record<string, unknown>} */ (catalog)
  if (file.sourceLocale !== CATALOG_SOURCE_LOCALE) {
    errors.push(`sourceLocale debe ser "${CATALOG_SOURCE_LOCALE}" (recibido ${JSON.stringify(file.sourceLocale)})`)
  }
  if (file.locale !== CATALOG_TARGET_LOCALE) {
    errors.push(`locale debe ser "${CATALOG_TARGET_LOCALE}" (recibido ${JSON.stringify(file.locale)})`)
  }
  const entries = file.entries
  if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
    return [...errors, 'entries debe ser un objeto { "<texto español>": "<inglés>" }']
  }
  /** @type {string[]} */
  const untranslated = []
  for (const text of texts) {
    const value = /** @type {Record<string, unknown>} */ (entries)[text]
    if (typeof value !== 'string' || value.trim() === '') {
      untranslated.push(text)
    }
  }
  if (untranslated.length > 0) {
    const preview = untranslated.slice(0, 20).map((text) => `«${text}»`).join(', ')
    const more = untranslated.length > 20 ? ` y ${untranslated.length - 20} más` : ''
    errors.push(
      `${untranslated.length} cadenas sin traducción en ${CATALOG_PATH}: ${preview}${more}. ` +
        'Ejecute `npm run i18n:data -- --write` y traduzca las entradas nuevas.',
    )
  }
  const invalidEntries = Object.entries(/** @type {Record<string, unknown>} */ (entries)).filter(
    ([, value]) => typeof value !== 'string' || value.trim() === '',
  )
  if (invalidEntries.length > 0) {
    const preview = invalidEntries.slice(0, 10).map(([text]) => `«${text}»`).join(', ')
    const more = invalidEntries.length > 10 ? ` y ${invalidEntries.length - 10} más` : ''
    errors.push(
      `${invalidEntries.length} entradas del catálogo no son cadenas no vacías: ${preview}${more}. ` +
        'Rellene los valores null con su traducción inglesa.',
    )
  }
  return errors
}

/** Catálogo vacío con la forma esperada. */
export function emptyCatalog() {
  return { sourceLocale: CATALOG_SOURCE_LOCALE, locale: CATALOG_TARGET_LOCALE, entries: {} }
}

/**
 * Serializa el catálogo con las claves ordenadas y UTF-8 legible.
 *
 * @param {{ sourceLocale: string, locale: string, entries: Record<string, string | null> }} catalog
 */
export function serializeCatalog(catalog) {
  /** @type {Record<string, string | null>} */
  const entries = {}
  for (const key of Object.keys(catalog.entries).sort(compareStrings)) {
    entries[key] = catalog.entries[key]
  }
  return `${JSON.stringify({ ...catalog, entries }, null, 2)}\n`
}

async function readCatalog(dataDir) {
  try {
    const raw = await readFile(path.join(dataDir, 'i18n', 'en.json'), 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyCatalog()
    }
    throw error
  }
}

function parseArgs(argv) {
  const options = { write: false, list: false, dataDir: path.join(publicDir, 'data', 'real') }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--write') {
      options.write = true
    } else if (arg === '--list') {
      options.list = true
    } else if (arg === '--data-dir') {
      const next = argv[index + 1]
      if (!next) throw new Error('--data-dir necesita una ruta')
      options.dataDir = path.resolve(next)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Opción desconocida: ${arg}`)
    }
  }
  return options
}

function printHelp() {
  console.log(`Uso: node scripts/extract-data-strings.mjs [opciones]

  --write           Añade al catálogo las cadenas nuevas (valor null) y elimina las obsoletas.
  --list            Imprime todas las cadenas mostrables extraídas.
  --data-dir <dir>  Directorio de datos a recorrer (por defecto public/data/real).
  -h, --help        Muestra esta ayuda.`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const texts = await extractDataStrings({ dataDir: options.dataDir })
  const catalog = await readCatalog(options.dataDir)
  const entries = catalog && typeof catalog.entries === 'object' && catalog.entries !== null ? catalog.entries : {}
  const { entries: merged, added, removed } = mergeCatalog({ texts, entries })
  const translated = texts.filter((text) => typeof entries[text] === 'string' && entries[text].trim() !== '').length
  const untranslated = texts.length - translated

  console.log(`Catálogo de datos: ${path.relative(frontendDir, path.join(options.dataDir, 'i18n', 'en.json'))}`)
  console.log(`  Cadenas mostrables: ${texts.length}`)
  console.log(`  Traducidas: ${translated}`)
  console.log(`  Pendientes: ${untranslated}`)
  console.log(`  Nuevas respecto al catálogo: ${added.length}`)
  console.log(`  Obsoletas en el catálogo: ${removed.length}${removed.length ? ` (${removed.slice(0, 5).map((text) => `«${text}»`).join(', ')}${removed.length > 5 ? '…' : ''})` : ''}`)

  if (options.list) {
    for (const text of texts) {
      console.log(`- ${text}`)
    }
  } else if (added.length > 0) {
    console.log('\nCadenas nuevas:')
    for (const text of added.slice(0, 20)) {
      console.log(`  - ${text}`)
    }
    if (added.length > 20) {
      console.log(`  … y ${added.length - 20} más`)
    }
  }

  if (options.write) {
    const file = path.join(options.dataDir, 'i18n', 'en.json')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      serializeCatalog({
        sourceLocale: CATALOG_SOURCE_LOCALE,
        locale: CATALOG_TARGET_LOCALE,
        entries: merged,
      }),
      'utf8',
    )
    console.log(`\nEscrito ${path.relative(frontendDir, file)} (${Object.keys(merged).length} entradas).`)
    if (added.length > 0) {
      console.log('Rellene las entradas con valor null y vuelva a ejecutar `npm run validate:data`.')
    }
  } else if (added.length > 0 || removed.length > 0) {
    console.log('\nEjecute `npm run i18n:data -- --write` para sincronizar el catálogo.')
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((error) => {
    console.error('\nError al extraer las cadenas de los datos:')
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
