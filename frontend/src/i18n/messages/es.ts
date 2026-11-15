/** Catálogo de la interfaz en español. Misma forma que `en.ts` (comprobado por tipos). */
import type { Messages } from '../index'
import { core } from './es/core'
import { layers } from './es/layers'
import { analysis } from './es/analysis'

export const es: Messages = { ...core, ...layers, ...analysis }
