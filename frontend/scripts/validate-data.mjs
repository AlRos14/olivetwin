#!/usr/bin/env node
/**
 * OliveTwin — validador del contrato de manifiestos v1.1.0 (A04 + WP04-01).
 *
 * Comprueba cuatro capas:
 *   1. El esquema `contracts/manifest.schema.json` compila con Ajv (draft 2020-12).
 *   2. Los dos manifiestos publicados en `frontend/public/data/{sample,real}/`
 *      validan contra el esquema + reglas semánticas + existencia/alfa de PNG, y
 *      su `datasetMode` coincide con la carpeta en la que viven.
 *   3. Todos los fixtures de `frontend/scripts/fixtures/valid/` validan
 *      (esquema + semántica; sin comprobar ficheros, porque son contractuales).
 *   4. Todos los fixtures de `frontend/scripts/fixtures/invalid/` NO validan
 *      (el esquema o la semántica detectan el error que el fixture representa).
 *
 * Las rutas se resuelven desde la ubicación de este archivo (`import.meta.url`),
 * nunca desde el directorio de trabajo, para que funcione igual con
 * `npm run validate:data --prefix frontend` o al invocarlo desde la raíz.
 *
 * Solo usa dependencias ya declaradas (ajv 8 con soporte draft 2020-12,
 * ajv-formats). Sale con código 1 si cualquier comprobación falla.
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createManifestValidator } from './validate-lib.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(frontendDir, '..')

const schemaPath = path.join(repoRoot, 'contracts', 'manifest.schema.json')
const publicDir = path.join(frontendDir, 'public')
const dataDir = path.join(publicDir, 'data')
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

function formatErrors(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`)
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

  let validate
  try {
    validate = createManifestValidator({
      schema: loadedSchema.data,
      publicDir,
      checkAssets: true,
    })
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

    const result = await validate(loaded.data, { expectedMode: mode })

    if (result.valid) {
      pass(`${relative(file)} válido (datasetMode="${mode}", semántica y assets)`)
    } else {
      fail(`${relative(file)} no cumple el contrato`, formatErrors(result.errors))
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
    // Los fixtures son contractuales y no se sirven desde public/: no se exige
    // que sus PNG existan. La semántica de rutas sí se comprueba.
    const result = await validate(loaded.data, { checkAssets: false })
    if (result.valid) {
      pass(`${relative(file)} aceptado, como se esperaba`)
    } else {
      fail(
        `${relative(file)} debería ser válido y el validador lo rechaza`,
        formatErrors(result.errors),
      )
    }
  }

  for (const file of invalidFixtures) {
    const loaded = await readJsonFile(file)
    if (!loaded.ok) {
      // Un JSON roto también "fallaría", pero por el motivo equivocado:
      // el fixture debe ejercitar el validador, no el parser.
      fail(`${relative(file)}: JSON mal formado; el fixture debe probar el validador`, [loaded.error])
      continue
    }
    const result = await validate(loaded.data, { checkAssets: false })
    if (!result.valid) {
      pass(`${relative(file)} rechazado, como se esperaba`, formatErrors(result.errors)[0])
    } else {
      fail(`${relative(file)} debería ser rechazado y el validador lo acepta`)
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
