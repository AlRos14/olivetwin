# frontend — OliveTwin

Aplicación estática del proyecto OliveTwin (NASA Space Apps Challenge 2026,
*Dancing with the SARs*), construida con **Vue 3 + Vite + TypeScript**.

Esta carpeta contiene únicamente el esqueleto de Fase A: compila y arranca, pero
todavía **no** incluye mapa, capas ni datos científicos. Esas piezas se
implementan en fases posteriores (WP-04 para contratos/loader y WP-07 para la UI
con Leaflet).

## Arranque local

Requisitos: Node 22 LTS (ver `.nvmrc` en la raíz del repositorio; Vite exige
`^20.19.0 || >=22.12.0`).

```bash
cd frontend
npm ci
npm run dev      # servidor de desarrollo
npm run build    # comprobación de tipos + build de producción en dist/
npm run preview  # sirve localmente el contenido de dist/
```

## Scripts

| Script | Descripción |
|---|---|
| `dev` | Servidor de desarrollo de Vite. |
| `build` | `vue-tsc -b` + `vite build`; genera `dist/` (ignorado por Git). |
| `preview` | Sirve el build de producción. |
| `validate:data` | Validación de los manifiestos de `public/data/`. El script (`scripts/validate-data.mjs`) y los manifiestos pertenecen a otros work packets (A02/A04); en Fase A puede no existir todavía. |

## Estructura

```text
frontend/
├── index.html
├── public/          # assets estáticos; public/data/ lo gestiona A02
├── src/             # App.vue, main.ts, style.css (mínimos)
├── package.json
├── package-lock.json
├── tsconfig*.json
└── vite.config.ts
```

## Límites de esta fase

- Sin Vue Router, Pinia, librerías de estilos ni Leaflet (alcance de WP-07).
- Sin datos reales ni sintéticos versionados.
- La configuración de despliegue (base, GitHub Pages) se decide en Fase B.
