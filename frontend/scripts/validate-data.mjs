#!/usr/bin/env node
/**
 * OliveTwin — validador del contrato mínimo de manifiestos (A04).
 *
 * Comprueba tres cosas:
 *   1. Los dos manifiestos publicados en `frontend/public/data/{sample,real}/`
 *      validan contra `contracts/manifest.schema.json` y su `datasetMode`
 *      coincide con la carpeta en la que viven.
 *   2. Todos los fixtures de `frontend/scripts/fixtures/valid/` validan.
 *   3. Todos los fixtures de `frontend/scripts/fixtures/invalid/` NO validan
 *      (es decir, el esquema detecta el error que el fixture representa).
 *
 * Las rutas se resuelven desde la ubicación de este archivo (`import.meta.url`),
 * nunca desde el directorio de trabajo, para que funcione igual con
 * `npm run validate:data --prefix frontend` o al invocarlo desde la raíz.
 *
 * Solo usa dependencias ya declaradas (ajv 8 con soporte draft 2020-12 y
 * ajv-formats). Sale con código 1 si cualquier comprobación falla.
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(frontendDir, '..')

const schemaPath = path.join(repoRoot, 'contracts', 'manifest.schema.json')
const dataDir = path.join(frontendDir, 'public', 'data')
const fixturesDir = path.join(scriptDir, 'fixtures')

// Cada manifiesto publicado tiene un modo obligatorio: el de su carpeta.
const MANIFESTS = [
  { mode: 'sample', file: path.join(dataDir, 'sample', 'manifest.json') },
  { mode: 'real', file: path.join(dataDir, 'real', 'manifest.json') },
]

let failures = 0
let checks = 0

function pass(message, note) {
  checks += 1
  console.log(`  \u2713 ${message}`)
  if (note) {
    console.log(`      motivo: ${note}`)
  }
}

function fail(message, details = []) {
  checks += 1
  failures += 1
  console.error(`  \u2717 ${message}`)
  for (const detail of details) {
    console.error(`      - ${detail}`)
  }
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

/** Formatea los errores de Ajv en líneas cortas y legibles en español. */
function formatAjvErrors(errors) {
  return (errors ?? []).map((error) => {
    const location = error.instancePath === '' ? '(raíz)' : error.instancePath
    return `${location}: ${error.message}${error.keyword ? ` [${error.keyword}]` : ''}`
  })
}

async function readJsonFile(file) {
  try {
    const raw = await readFile(file, 'utf8')
    return { ok: true, data: JSON.parse(raw) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function listJsonFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dir, entry.name))
      .sort()
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/** Valida un manifiesto con el schema y devuelve `true` si es válido. */
function schemaAccepts(validate, data) {
  return validate(data) === true
}

async function main() {
  console.log('OliveTwin — validación del contrato de manifiestos v1.1.0')
  console.log(`  Esquema: ${relative(schemaPath)}`)

  // --- 1. Cargar el schema y compilarlo --------------------------------
  console.log('\n[1/3] Esquema del contrato')
  const loadedSchema = await readJsonFile(schemaPath)
  if (!loadedSchema.ok) {
    fail(`No se pudo cargar el esquema: ${relative(schemaPath)}`, [loadedSchema.error])
    return
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)

  let validate
  try {
    validate = ajv.compile(loadedSchema.data)
    pass(`El esquema compila (${relative(schemaPath)})`)
  } catch (error) {
    fail('El esquema no compila con Ajv (draft 2020-12)', [
      error instanceof Error ? error.message : String(error),
    ])
    return
  }

  // --- 2. Manifiestos publicados --------------------------------------
  console.log('\n[2/3] Manifiestos publicados')
  for (const { mode, file } of MANIFESTS) {
    const loaded = await readJsonFile(file)
    if (!loaded.ok) {
      fail(`No se pudo leer ${relative(file)}`, [loaded.error])
      continue
    }

    const errors = []
    if (!schemaAccepts(validate, loaded.data)) {
      errors.push(...formatAjvErrors(validate.errors))
    }
    if (loaded.data?.datasetMode !== mode) {
      errors.push(
        `datasetMode es ${JSON.stringify(loaded.data?.datasetMode)} pero la carpeta exige "${mode}"`,
      )
    }

    if (errors.length === 0) {
      pass(`${relative(file)} válido (datasetMode="${mode}")`)
    } else {
      fail(`${relative(file)} no cumple el contrato`, errors)
    }
  }

  // --- 3. Fixtures de auto-test ---------------------------------------
  const validFixtures = await listJsonFiles(path.join(fixturesDir, 'valid'))
  const invalidFixtures = await listJsonFiles(path.join(fixturesDir, 'invalid'))

  console.log('\n[3/3] Fixtures de auto-test')
  if (validFixtures.length === 0) {
    fail('No hay fixtures válidos en frontend/scripts/fixtures/valid/')
  }
  if (invalidFixtures.length === 0) {
    fail('No hay fixtures inválidos en frontend/scripts/fixtures/invalid/')
  }

  for (const file of validFixtures) {
    const loaded = await readJsonFile(file)
    if (!loaded.ok) {
      fail(`${relative(file)}: JSON mal formado (un fixture válido debe parsear)`, [loaded.error])
      continue
    }
    if (schemaAccepts(validate, loaded.data)) {
      pass(`${relative(file)} aceptado, como se esperaba`)
    } else {
      fail(
        `${relative(file)} debería ser válido y el esquema lo rechaza`,
        formatAjvErrors(validate.errors),
      )
    }
  }

  for (const file of invalidFixtures) {
    const loaded = await readJsonFile(file)
    if (!loaded.ok) {
      // Un JSON roto también "fallaría", pero por el motivo equivocado:
      // el fixture debe ejercitar el esquema, no el parser.
      fail(`${relative(file)}: JSON mal formado; el fixture debe probar el esquema`, [loaded.error])
      continue
    }
    if (!schemaAccepts(validate, loaded.data)) {
      pass(`${relative(file)} rechazado, como se esperaba`, formatAjvErrors(validate.errors)[0])
    } else {
      fail(`${relative(file)} debería ser rechazado y el esquema lo acepta`)
    }
  }

  // --- Resumen ---------------------------------------------------------
  if (failures > 0) {
    console.error(`\nResultado: FALLO — ${failures} de ${checks} comprobaciones han fallado.`)
    process.exitCode = 1
  } else {
    console.log(`\nResultado: OK — ${checks} comprobaciones superadas (0 fallos).`)
  }
}

main().catch((error) => {
  console.error('\nError inesperado durante la validación:')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
