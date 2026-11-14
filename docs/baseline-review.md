# Revisión independiente del baseline Fase A (nodo A05)

Revisor: A05 (independiente; no implementó A01-A04). Rama revisada: `bootstrap/phase-a` @ `91f0b9b` (merge A04), PR #1 de `AlRos14/olivetwin`. Fecha: 2026-11-14.

## Veredicto global: PASS con limitaciones

No hay hallazgos bloqueantes. Las limitaciones son: la PR sigue abierta (la integración es acto de GA), `main` no está protegida (limitación conocida y documentada con honestidad) y los owners humanos de WP-04/WP-07 están pendientes de asignar.

## Comandos y evidencia

Worktree limpio (`git worktree add -b phase-a/a05-review ... bootstrap/phase-a`).

| Comando | Resultado |
|---|---|
| `npm ci --prefix frontend` | OK, 0 vulnerabilidades |
| `npm run validate:data --prefix frontend` | `Resultado: OK — 10 comprobaciones superadas (0 fallos)`: schema compila, 2 manifiestos válidos, 3 fixtures válidos aceptados, 4 inválidos rechazados (`layer-legend-object`, `missing-schema-version`, `unknown-dataset-mode`, `zones-null`) |
| `npm run build --prefix frontend` | OK (`vue-tsc -b && vite build`), 12 módulos, `dist/` generado |
| Manifiesto inválido: `sed 's/"real"/"unknown"/'` sobre `frontend/public/data/real/manifest.json` (revertido con `git checkout`, no commiteado) | `✗ frontend/public/data/real/manifest.json no cumple el contrato`, `Resultado: FALLO — 1 de 10`, exit code 1. El paso CI `Validar manifiestos de datos` fallaría. |
| `gh pr checks 1` | `ci pass 13s` (run 43606418655). PR `OPEN`, `MERGEABLE`, sin reviews ni comentarios |
| `gh api repos/AlRos14/olivetwin` | `private: true`, default `main`, el usuario autenticado es admin |
| `gh api .../branches/main --jq .protected` | `false` |
| `gh api .../collaborators` | solo `AlRos14` |

## Compatibilidad con el contrato WP-04/WP-07 (§4 del plan)

- El ejemplo §4.3 del plan extraído del `.md` es byte a byte equivalente (JSON) a `frontend/scripts/fixtures/valid/sample-plan-4.3.json`, y el validador lo acepta. El schema usa draft 2020-12 (`prefixItems`) y el validador usa `ajv@8.20.0` (fijado) con la clase 2020.
- Manifiestos §4.4 y fase A (`zones: []`) válidos para `sample` y `real`.
- Campos de §4.3 (`variable`, `range`, `legend` como array de `{value,color,label}`, `provenance` con `acquisitionDate/sceneId/referenceUrl/note` nulables, `imageCrs`, `qualityNote`) soportados. `provenance` abierto (`additionalProperties: true`) y el resto cerrado: WP-04 podrá extender de forma aditiva.
- `layer.id` enum `ndvi|soil-moisture`, `status` enum `synthetic|processed_real`, `kind` const `image-overlay`, `image` sin `/` inicial, `..`, `:` ni `\`: coherente con §4.2. La coherencia `datasetMode`/`status` y las reglas de `processed_real` quedan, correctamente, para WP-04 (semántica).
- Nada incompatible con el contrato; ningún bloqueo para WP-04/WP-07.

## Scopes

- A01 (`phase-a/a01`): solo `frontend/` (sin `public/data`), `.gitignore`, `.nvmrc`, `.gitkeep`. OK.
- A02: `contracts/`, `docs/contract-freeze.md`, `frontend/public/data/*/manifest.json`; no toca `frontend/src/`. OK.
- A03: `README.md`, `AGENTS.md`, PR template, `docs/contributing.md`. OK.
- A04: `ci.yml`, `frontend/scripts/validate-data.mjs`, fixtures; `package.json` solo añade `validate:data` y ajv/ajv-formats (dependencias requeridas por el plan, coordinadas). OK. (Los diffs por rama contra `main` aparecen acumulados porque las ramas se apilan; el contenido propio de cada una respeta su scope.)
- `frontend/src/` queda con el template mínimo, sin `types/manifest.ts` ni stubs (el contract-freeze lo reserva a WP-04). Sin Leaflet/Router/Pinia.

## Documentación

- URL del repo (`https://github.com/AlRos14/olivetwin`, privado) es la real, verificada con `gh`. Único colaborador verificado `AlRos14`; el resto de identidades y los owners de WP-04/07 figuran como "pendientes de asignar". No hay `CODEOWNERS` ficticio. No hay URLs ni usuarios inventados.
- README (l.149-156), `docs/contributing.md` (l.134-145) y `AGENTS.md` dicen explícitamente que `main` NO está protegida y que las reglas son por convención. Consistente con `protected: false`. No afirman protección.
- `docs/contributing.md` / `AGENTS.md` cubren: no merge por agentes, un agente/comentario no cuenta como aprobación humana, límites de credenciales compartidas, ramas `wp04/…` etc., squash, sin HDF5. El template de PR incluye WP/Issue, procedencia de datos, riesgos y checklist de contrato.
- `.gitignore`: `node_modules/`, `dist/`, `.env*` (excepto `.env.example`), `*.h5 *.hdf5 *.tif *.tiff *.nc`, con sección de excepciones. Mayor fichero versionado: `package-lock.json` (48 KB). Sin binarios grandes.

## Checklist GA

| # | Punto | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Repo correcto, permisos y `main` verificables | PASS (limitado) | Repo privado real, default `main`, admin verificado; solo 1 colaborador verificado; los otros 5 no se pueden comprobar con los permisos disponibles y se documentan como pendientes |
| 2 | PR única de baseline integrada; sin pisar cambios | PENDIENTE | PR #1 abierta y mergeable; la fusión es acto de GA. Historial lineal desde `0751209` sin conflictos |
| 3 | `frontend` arranca y compila desde instalación limpia | PASS | `npm ci` + `build` OK (`dev` no ejecutado; el script `dev` existe) |
| 4 | `contracts/` y `contract-freeze.md` documentan v1.1.0, modos, bbox y rutas | PASS | Revisados contra §4.2; schema y docs coherentes |
| 5 | Manifiestos sample/real vacíos, parseables y validados | PASS | `validate:data` |
| 6 | CI se ejecuta en PR y falla ante contrato inválido | PASS | `ci` verde en la PR; el trigger es `pull_request`; fallo local demostrado (exit 1). Fallo en el propio CI no ejercitado en GitHub (se probó la misma orden localmente) |
| 7 | AGENTS.md, CONTRIBUTING y template de PR | PASS | Presentes y alineados con el plan |
| 8 | Carpetas NISAR/NDVI/históricos sin binarios grandes | PASS | `pipelines/{nisar,vegetation,historical}/.gitkeep`, `data/references`, `scripts` |
| 9 | Owners WP-04/WP-07 y scopes documentados | PASS parcial | Scopes documentados (`contract-freeze.md` l.104-108, `contributing.md` l.37); owners humanos "pendiente de asignar" (no inventados). Debe aprobarlos el responsable de proyecto antes de lanzar Fase B |
| 10 | Limitaciones de protección de `main` registradas | PASS | Documentado en README, contributing y AGENTS; `protected=false` confirmado |

## Hallazgos

### Bloqueantes
Ninguno.

### Menores / a vigilar
1. Los owners humanos de WP-04 y WP-07 siguen sin asignar (`docs/contract-freeze.md:108`, `contracts/README.md:187`). Requisito de GA: el responsable de proyecto debe designarlos o aceptar la excepción expresamente.
2. `main` sin protección y solo un colaborador verificado: el responsable debe aprobar expresamente esta excepción (plan §7 "Cierre GA"). Activar el check `ci` como requerido cuando el plan de GitHub lo permita.
3. El plan WP04/07 §4.1 sitúa `validate-data.*` en `scripts/` (raíz) como entregable WP-04, mientras que el validador de A04 está en `frontend/scripts/validate-data.mjs` (`ci.yml` y `package.json` apuntan ahí, conforme al plan de Fase A §6). WP-04 debe decidir si lo reubica o lo extiende, y coordinar con CI.
4. `image` del schema prohíbe cualquier `..` incluso dentro de un nombre de fichero (`a..b.png`) o `:`; es más estricto que el plan pero seguro. Sin impacto previsible.
5. `frontend/package.json` solo tiene `engines` `^20.19.0 || >=22.12.0` y `.nvmrc` = `22`; coherente. Sin lockfile de Node exacto (aceptable).
6. El fallo de CI ante contrato inválido se demostró localmente; no se empujó una rama rota a GitHub (la revisión no hace push).

## Decisión GA (responsable de proyecto, 2026-11-14)

**GA: PASS con excepciones aprobadas.** Se fusiona la PR #1 a `main` (squash) y se autoriza la Fase B (WP-04 ∥ WP-07).

Excepciones aprobadas expresamente:

1. **Owners de WP-04/WP-07:** por tratarse de un hackatón de 48 h, la asignación de personas se coordina fuera del repositorio y no se registra ni se verifica en GitHub. Los scopes de archivos y la revisión independiente siguen siendo obligatorios.
2. **Protección de `main`:** el repositorio es privado en cuenta gratuita; si GitHub no permite la protección, rige por convención (PR + check `ci` verde + revisión). No se declara protegida.
3. **Colaboradores:** solo `AlRos14` es colaborador verificado; el acceso del resto del equipo se gestiona aparte.
4. **Ubicación del validador** (`frontend/scripts/validate-data.mjs` frente a `scripts/` del plan WP-04/07 §4.1): se mantiene en `frontend/scripts/`; WP-04 lo amplía allí.

## Actualización 2026-11-14 (post-GA)

El repositorio pasó a **público** (requisito de la competición) y se añadieron los colaboradores. Ya es posible
proteger `main`: PR obligatoria + check `ci` requerido, sin force-push ni borrado, 0 aprobaciones requeridas.
La excepción 2 de la decisión GA queda resuelta.
