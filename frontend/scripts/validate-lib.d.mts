/**
 * Declaraciones de tipos para `validate-lib.mjs` (WP04-01).
 *
 * El módulo es JavaScript ESM porque lo ejecuta Node directamente desde
 * `validate-data.mjs`; este sidecar permite que los tests TypeScript de
 * `frontend/src/types/contract.test.ts` lo importen sin perder el typecheck.
 */

export interface ValidationError {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export type DataMode = 'sample' | 'real'

export interface SemanticOptions {
  expectedMode?: DataMode
}

export interface ValidateOptions extends SemanticOptions {
  checkAssets?: boolean
}

export interface PngHeader {
  signatureOk: boolean
  width: number | null
  height: number | null
  bitDepth: number | null
  colorType: number | null
  hasTrns: boolean
}

export type ReadAsset = (relativePath: string) => Promise<Uint8Array> | Uint8Array

export interface ValidatorOptions {
  schema: object
  publicDir?: string | null
  checkAssets?: boolean
  readAsset?: ReadAsset
}

export interface AssetOptions {
  publicDir?: string | null
  readAsset?: ReadAsset
}

export declare const SCHEMA_MAJOR: number
export declare const SUPPORTED_SCHEMA_VERSIONS: readonly string[]
export declare const TIMESTEPS_SCHEMA_VERSION: string
export declare const TIMESTEPS_SCHEMA_VERSIONS: readonly string[]
export declare const ANALYSIS_SCHEMA_VERSION: string
export declare const ANALYSIS_MAX_PNG_BYTES: number
export declare const SUPPORTED_IMAGE_CRS: readonly string[]
export declare const SI_UNITS: readonly string[]
export declare const BBOX_TOLERANCE_DEG: number
export declare const IMAGE_PATH_ROOT: string

export interface UnitValue {
  path: string
  unit: string
}

export declare function collectUnitValues(document: unknown): UnitValue[]

export declare function siUnitErrors(document: unknown): ValidationError[]

export declare function formatAjvErrors(
  errors: readonly unknown[] | null | undefined,
): ValidationError[]

export declare function compileSchema(schema: object): (data: unknown) => boolean

export declare function semanticErrors(
  manifest: unknown,
  options?: SemanticOptions,
): ValidationError[]

/** Fecha ISO 8601 real (fecha sola o fecha-hora con zona), no solo con forma válida. */
export declare function isValidAcquisitionDate(value: unknown): boolean

export declare function readPngHeader(bytes: Uint8Array): PngHeader

export declare function pngHasAlpha(bytes: Uint8Array): boolean

export declare function assetErrors(
  manifest: unknown,
  options?: AssetOptions,
): Promise<ValidationError[]>

export declare function createManifestValidator(options: ValidatorOptions): (
  manifest: unknown,
  options?: ValidateOptions,
) => Promise<ValidationResult>

export interface AnalysisContext {
  zoneId?: string
  mode?: 'sample' | 'real'
  zoneBbox?: number[]
  checkAssets?: boolean
}

export declare function analysisSemanticErrors(
  analysis: unknown,
  context?: AnalysisContext,
): ValidationError[]

export declare function analysisAssetErrors(
  analysis: unknown,
  options?: AssetOptions,
): Promise<ValidationError[]>

export declare function createAnalysisValidator(options: ValidatorOptions): (
  analysis: unknown,
  context?: AnalysisContext,
) => Promise<ValidationResult>
