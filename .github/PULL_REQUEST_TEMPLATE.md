## Issue / work packet

<!-- Enlaza la Issue (por ejemplo, «Closes #12») e indica el work packet:
     Fase A (A01–A04) o Fase B (WP-04, WP-07). -->

- Issue:
- Work packet:
- Rama:

## Dependencias

<!-- PRs, contratos, decisiones o datos de los que depende este cambio.
     Escribe «Ninguna» si no aplica. -->

## Cambios

<!-- Qué cambia y por qué. Una PR debe tener un solo propósito. -->

## Pruebas

Comandos ejecutados desde `frontend/` y resultado:

```bash
npm ci
npm run validate:data
npm run build
```

- Resultado de `npm ci`:
- Resultado de `npm run validate:data`:
- Resultado de `npm run build`:

<!-- Si algún comando no aplica, explica por qué. No dejes la sección vacía. -->

## Ficheros modificados

<!-- Lista de rutas. Señala cualquier archivo compartido o fuera del ámbito
     habitual y quién lo autorizó. -->

## Procedencia de datos

<!-- Indica: sin datos / sample (synthetic) / processed_real.
     Para processed_real incluye proveedor, producto o escena, fecha y versión
     de procesamiento. Confirma que no se presentan datos sintéticos como NASA. -->

## Riesgos y limitaciones

<!-- Qué puede fallar, qué no se ha podido probar, dependencias pendientes,
     limitaciones de protección de main o de acceso. -->

## Revisión

- Autor:
- Revisor independiente (persona):
- [ ] El revisor no es el autor ni la misma sesión de agente.
- [ ] La revisión humana está registrada (un comentario automático no cuenta).
- [ ] Check `ci` en verde.
- [ ] Cambios en `contracts/` o `.github/workflows/` revisados por integración.

## Capturas (si hay cambios de interfaz)

<!-- Añade capturas o una descripción verificable del antes y el después. -->

## Checklist

- [ ] La PR tiene un solo propósito y enlaza su Issue o work packet.
- [ ] Solo se han modificado archivos de mi ámbito.
- [ ] `main` sigue compilable y la build pasa.
- [ ] Los manifiestos pasan `npm run validate:data`.
- [ ] No se han añadido HDF5, GeoTIFF, NetCDF ni otros binarios grandes.
- [ ] No se han incluido secretos, tokens ni credenciales.
- [ ] Los datos sintéticos están marcados como tales y no se atribuyen a NASA.
- [ ] El contrato v1.1.0 no se ha roto; cualquier ampliación es aditiva o está aprobada.
- [ ] La documentación se ha actualizado si cambia el comportamiento.
- [ ] Se fusionará con squash merge y se borrará la rama.
