import { describe, expect, it } from 'vitest'

import { layerLabel, variableLabel } from './variableLabels'

describe('nombres cortos', () => {
  it('usa etiquetas cortas por id y, si no hay, quita la fuente entre paréntesis', () => {
    expect(variableLabel({ id: 'soil-moisture-all', title: 'Humedad superficial (NISAR SME2, todas las estimaciones)' })).toBe('Humedad del suelo')
    expect(variableLabel({ id: 'radar-hv', title: 'Retrodispersión radar HV (NISAR GCOV)' })).toBe('Radar HV')
    expect(variableLabel({ id: 'nueva', title: 'Variable nueva (Fuente X)' })).toBe('Variable nueva')
    expect(layerLabel({ id: 'soil-moisture', title: 'Humedad superficial (NISAR SME2)' })).toBe('Humedad del suelo')
  })
})
