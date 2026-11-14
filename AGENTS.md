# AGENTS.md — Reglas para agentes automáticos

Este documento es obligatorio para cualquier agente que trabaje en el
repositorio OliveTwin. Las personas siguen además
[`docs/contributing.md`](docs/contributing.md) y la plantilla de pull request.

Un agente puede implementar, probar, documentar y proponer cambios. **No puede
fusionar, aprobar su propio trabajo, cambiar permisos ni validar por sí mismo
afirmaciones científicas.**

## Antes de escribir

1. Lee, en este orden: `README.md`, este archivo, `docs/contributing.md`,
   `docs/contract-freeze.md` y `contracts/README.md` (si ya existen en tu rama).
2. Inspecciona el estado real: `git status`, rama actual, worktrees y últimos
   commits. No asumas que el árbol está limpio.
3. Revisa los archivos y cambios sin commitear antes de editar. **No
   sobrescribas trabajo ajeno.**
4. Identifica tu work packet, tu issue o PR y tu ámbito de escritura. Si no
   están definidos, detente y pide asignación.
5. Si el repositorio ya contiene trabajo previo, intégralo o respétalo; no
   reinicies el proyecto.

## Aislamiento de trabajo

- Trabaja en un **worktree propio** con su **rama propia**. No trabajes sobre
  `main` ni sobre la rama de otra persona.
- No hagas `git push` directo a `main`, no hagas merge, no cierres PR ajenas y
  no reescribas historial compartido.
- No uses credenciales humanas para simular una aprobación. Si compartes
  credenciales con una persona, GitHub no puede distinguir quién aprobó: deja
  constancia y complementa la revisión por un canal externo o una cuenta de bot
  separada.
- No modifiques la configuración del repositorio (visibilidad, accesos,
  protecciones) salvo instrucción explícita del propietario.

## Ámbitos de escritura

Un solo owner por archivo o subpaquete. Los agentes no editan rutas de un
ámbito ajeno: si necesitan un cambio fuera de su scope, abren una solicitud al
owner y lo anotan en su reporte.

### Mapa de ámbitos WP-04 y WP-07

| Ámbito | WP-04 | WP-07 |
|---|---|---|
| Datos y contrato | `contracts/`, `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/`, `frontend/public/data/`, `scripts/` de generación y validación de datos | — |
| Interfaz y mapa | — | `frontend/src/components/`, estilos, código de Leaflet, controles, leyendas y avisos |
| Integración | `App.vue` solo como punto de composición; los cambios de integración se coordinan entre ambos WPs | Igual: `App.vue` no se usa para introducir lógica de datos ni componentes completos |

- WP-04 **no implementa** la vista del mapa ni componentes de UI.
- WP-07 **no genera datos científicos** ni redefine el JSON Schema.
- `frontend/package.json` y `frontend/package-lock.json` son compartidos:
  añadir dependencias exige coordinación explícita.
- `.github/workflows/`, `contracts/` y los documentos de gobierno requieren
  revisión de integración además del owner.
- Un cambio de contrato se abre como incidencia y afecta solo a los nodos
  dependientes; no se cambia unilateralmente.

### Fase A

En Fase A los nodos A01 (bootstrap), A02 (contrato mínimo), A03 (gobierno) y
A04 (CI) tienen ámbitos separados. A01 no edita `frontend/public/data/`, A02 no
edita `frontend/src/`, y A04 no edita `package.json` sin coordinación con A01.
Los agentes de Fase A tampoco implementan WP-04 ni WP-07.

La Fase A está cerrada. La fase vigente es la **Fase B** (WP-04 ∥ WP-07), regida
por la tabla de ámbitos anterior y por [`docs/c0-interfaces.md`](docs/c0-interfaces.md).
El estado de los nodos y los planes archivados están en
[`docs/work-packets/README.md`](docs/work-packets/README.md).

## Comprobaciones obligatorias

Desde `frontend/`, antes de declarar terminado un cambio:

```bash
npm ci
npm run validate:data
npm run build
```

- `npm ci` debe partir de un `package-lock.json` versionado.
- `npm run validate:data` valida los manifiestos contra el esquema del contrato.
- `npm run build` debe generar `frontend/dist/` sin errores.

Si un comando no existe o no puede ejecutarse en tu rama, **no lo inventes ni
lo omitas en silencio**: registra el bloqueo y su causa. Para cambios solo de
documentación, ejecuta al menos una revisión de enlaces y coherencia, e indica
que no aplican los checks de código.

## Evidencias

El reporte de entrega debe incluir:

- comandos exactos ejecutados y su resultado (éxito o error);
- extractos relevantes de la salida, no solo la afirmación «funciona»;
- lista de archivos modificados;
- enlace o referencia al PR/commit cuando exista;
- captura o descripción verificable si el cambio es de interfaz.

No se acepta «probado» sin evidencia reproducible.

## Datos, ciencia y procedencia

- **No inventes** URLs, usuarios, permisos, cifras, fechas, productos ni
  resultados científicos.
- No afirmes que el radar mide producción directamente, que el NDVI es NISAR o
  que la humedad superficial equivale a riego. Las inferencias requieren datos
  compatibles y validación.
- No presentes datos sintéticos como observaciones de NASA ni como datos
  reales. Mantén `status: synthetic` y los avisos visibles.
- No asignes `processed_real` sin procedencia verificable, fecha, identificador
  de producto o escena, versión de procesamiento y advertencias de calidad.
  Ese estado requiere aprobación científica humana.
- No versiones HDF5, GeoTIFF, NetCDF ni otros binarios científicos grandes.
  Publica solo assets optimizados en `frontend/public/data/`.
- No descargues ni incorpores datos sin licencia y procedencia claras. No
  incluyas secretos, tokens ni credenciales en el repositorio.

## Commits y pull requests

- Commits pequeños y con prefijo convencional: `feat:`, `fix:`, `docs:`,
  `chore:`, `test:`, `ci:`, `refactor:`.
- Una PR debe tener un propósito, enlazar su issue o work packet y respetar la
  plantilla.
- El check requerido se llama **`ci`**. No se fusiona con el check en rojo.
- La revisión debe ser **independiente**: autor y revisor no pueden ser la
  misma persona ni la misma sesión de agente.
- **Un comentario automatizado no es una aprobación humana.** No escribas
  «aprobado» en nombre de una persona ni uses un agente para cumplir el
  requisito de revisión.
- No hagas merge. La fusión la realiza el owner humano tras la revisión.

## Entrega de cada paquete

Al terminar, resume resultados, cambios, comandos, pruebas, fallos, capturas y
cómo se incorporarían datos reales. Usa este formato:

```yaml
work_packet: WP07-03
status: PASS | BLOCKED | FAIL
owner_role: R4
files_changed: []
commands_executed: []
acceptance_results: []
risks_or_limitations: []
requires_contract_change: false
review_requested: true
commit_or_pr: null
```

Si el trabajo queda bloqueado por permisos, dependencias o una decisión
científica, usa `BLOCKED` y describe exactamente qué falta; no lo maquilles
como `PASS`.
