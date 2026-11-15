import { describe, expect, it } from 'vitest'

import { limitingShares, suitabilityBins } from './cropSuitability'
import { parseInline, parseMarkdown } from './markdownLite'

describe('suitabilityBins', () => {
  it('reparte las celdas con dato en las clases N, S3, S2 y S1 de LUSET', () => {
    const { bins, validFraction } = suitabilityBins(new Float32Array([0.1, 0.5, 0.6, 0.85, 1, Number.NaN]))
    expect(bins.map((bin) => bin.fraction)).toEqual([0.2, 0.2, 0.2, 0.4])
    expect(validFraction).toBeCloseTo(5 / 6)
    expect(bins.map((bin) => bin.label)).toEqual([
      'N · no apta (< 0,40)',
      'S3 · marginal (0,40–0,60)',
      'S2 · moderada (0,60–0,85)',
      'S1 · alta (≥ 0,85)',
    ])
  })
})

describe('limitingShares', () => {
  it('asigna cada celda al factor de menor puntuación y cuenta las que no tienen limitación', () => {
    const result = limitingShares([
      { id: 'clima', label: 'Clima', values: new Float32Array([0.2, 1, 1, Number.NaN]) },
      { id: 'ph', label: 'pH', values: new Float32Array([0.5, 0.4, 1, Number.NaN]) },
    ])
    expect(result.shares).toEqual([
      { id: 'clima', label: 'Clima', fraction: 1 / 3 },
      { id: 'ph', label: 'pH', fraction: 1 / 3 },
    ])
    expect(result.unlimited).toBeCloseTo(1 / 3)
    expect(limitingShares([])).toEqual({ shares: [], unlimited: 0 })
  })
})

describe('markdownLite', () => {
  it('convierte títulos, listas y párrafos sin interpretar HTML', () => {
    const blocks = parseMarkdown('## Resumen\nLa humedad **baja**.\n\n- uno\n- dos\n1. a\n<script>alert(1)</script>')
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, inline: [{ kind: 'text', text: 'Resumen' }] })
    expect(blocks[1]).toMatchObject({ kind: 'paragraph' })
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false })
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true })
    expect(blocks[4]).toEqual({ kind: 'paragraph', inline: [{ kind: 'text', text: '<script>alert(1)</script>' }] })
  })

  it('reconoce negrita, cursiva y código en línea', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'd' },
    ])
  })
})
