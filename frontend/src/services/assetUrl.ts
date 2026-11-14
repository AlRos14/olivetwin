/**
 * Resolución de rutas de assets publicados en `frontend/public/`.
 *
 * Contrato v1.1.0 (docs/contract-freeze.md): las rutas `image` son relativas a
 * `public/`, sin "/" inicial, sin "..", sin ":" (URLs absolutas o unidades de
 * disco) y sin barras invertidas. La URL final se construye con
 * `import.meta.env.BASE_URL` para que la aplicación funcione igual en la raíz
 * del dominio o bajo una subruta (por ejemplo `/olivetwin/`).
 */

/** Error lanzado cuando una ruta de asset no cumple el contrato de seguridad. */
export class AssetUrlError extends Error {
  readonly path: string

  constructor(path: string, reason: string) {
    super(`Ruta de asset no permitida: «${path}» (${reason}).`)
    this.name = 'AssetUrlError'
    this.path = path
  }
}

/**
 * Indica si una ruta puede publicarse tal cual bajo `public/`.
 *
 * Se rechazan las rutas vacías o solo con espacios, las absolutas (`/...`),
 * las que contienen `..`, `:` o `\`. Es la misma regla que aplica el patrón
 * `image` del JSON Schema, comprobada también en runtime por si el manifiesto
 * llegase manipulado.
 */
export function isSafeAssetPath(path: string): boolean {
  if (typeof path !== 'string') {
    return false
  }
  if (path.trim() === '') {
    return false
  }
  if (path.startsWith('/')) {
    return false
  }
  if (path.includes('..')) {
    return false
  }
  if (path.includes(':')) {
    return false
  }
  if (path.includes('\\')) {
    return false
  }
  return true
}

/** Lanza `AssetUrlError` si la ruta no es segura; no devuelve nada si lo es. */
export function assertSafeAssetPath(path: string): void {
  if (!isSafeAssetPath(path)) {
    throw new AssetUrlError(
      path,
      'debe ser una ruta relativa a public/, sin "/" inicial, "..", ":" ni "\\"',
    )
  }
}

/**
 * Convierte una ruta relativa a `public/` en una URL utilizable por el navegador.
 *
 * @param path Ruta del contrato, por ejemplo `data/sample/manifest.json`.
 * @param base Prefijo público; por defecto `import.meta.env.BASE_URL` (`/` o
 *   `/olivetwin/`). Se admite con o sin barra final y nunca se duplica la barra.
 */
export function resolveAssetUrl(
  path: string,
  base: string = import.meta.env.BASE_URL,
): string {
  assertSafeAssetPath(path)
  const normalizedBase = base.replace(/\/+$/, '') + '/'
  return `${normalizedBase}${path}`
}
