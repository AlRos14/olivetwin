/**
 * English UI catalog — SOURCE OF TRUTH for message keys, split by owner:
 *   en/core.ts     → app shell, language, tabs, shared words, units, status
 *   en/layers.ts   → `layers.*` (Layers tab, map, time slider, legend, story)
 *   en/analysis.ts → `analysis.*` (Analysis/Compare tabs, charts, crops, AI)
 * Add every key in English first; the matching `es/*.ts` must mirror it.
 * Leaves: strings with `{param}` placeholders, or `(p) => string` functions.
 */
import { core } from './en/core'
import { layers } from './en/layers'
import { analysis } from './en/analysis'

export const en = { ...core, ...layers, ...analysis }
