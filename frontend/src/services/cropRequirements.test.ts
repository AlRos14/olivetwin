import { describe, expect, it } from 'vitest'
import type { CropSuitability } from '../types/analysis'
import {
  classShares,
  factorOwnVariables,
  observedValues,
  observedText,
  requirementForVariable,
  requirementSource,
  requirementSourceText,
} from './cropRequirements'

const raster = { data: 'x.png', scale: 1, offset: 0, stats: { mean: null, median: null, p10: null, p90: null, validFraction: 0 } }

const crop = {
  id: 'olivo',
  name: 'Olivo',
  scientificName: 'Olea europaea L.',
  assumptions: 'Secano.',
  method: 'Mínimo.',
  source: { product: 'Ficha ECOCROP «Olea europaea»' },
  suitability: raster,
  factors: [
    {
      id: 'temperatura',
      label: 'Temperatura media mensual',
      variables: ['climate-tmean-annual', 'elevation'],
      requirement: 'Óptima 20–34 °C',
      classes: { optimal: '20–34 °C', acceptable: '5–20 y 34–40 °C', unsuitable: '< 5 o > 40 °C' },
      raster,
    },
    { id: 'altitud', label: 'Altitud', variables: ['elevation'], requirement: '≤ 1200 m', raster },
  ],
  otherRequirements: [
    {
      id: 'fertilidad',
      label: 'Fertilidad',
      variables: ['soil-soc'],
      requirement: 'Moderada',
      reason: 'solo cualitativa',
      reference: { citation: 'FAO' },
    },
  ],
} as unknown as CropSuitability

describe('cropRequirements', () => {
  it('la elevación solo es propia del factor cuando es su única variable', () => {
    expect(factorOwnVariables(['climate-tmean-annual', 'elevation'])).toEqual(['climate-tmean-annual'])
    expect(factorOwnVariables(['elevation'])).toEqual(['elevation'])
  })

  it('localiza el factor, el requisito citado fuera del mapa o ninguno', () => {
    expect(requirementForVariable(crop, 'climate-tmean-annual')).toMatchObject({ kind: 'factor', id: 'temperatura' })
    expect(requirementForVariable(crop, 'elevation')).toMatchObject({ kind: 'factor', id: 'altitud', classes: null })
    const other = requirementForVariable(crop, 'soil-soc')!
    expect(other).toMatchObject({ kind: 'other', reason: 'solo cualitativa' })
    expect(requirementSource(crop, other)).toEqual({ citation: 'FAO', product: null })
    expect(requirementSourceText(requirementSource(crop, other))).toBe('FAO')
    const ecocrop = requirementSource(crop, requirementForVariable(crop, 'elevation')!)
    expect(ecocrop).toEqual({ citation: null, product: 'Ficha ECOCROP «Olea europaea»' })
    expect(requirementSourceText(ecocrop)).toBe('FAO ECOCROP — Ficha ECOCROP «Olea europaea»')
    expect(requirementForVariable(crop, 'ndvi')).toBeNull()
  })

  it('describe el valor observado sin formatear y lo compone en el idioma activo', () => {
    const variable = {
      id: 'climate-tmean-annual',
      title: 'Temperatura media',
      unit: '°C',
      scale: 0.1,
      decimals: 1,
      temporal: false,
      steps: [{ stats: { mean: 17.2, p10: 13.4, p90: 21.1 } }],
    } as never
    const values = observedValues([variable], ['climate-tmean-annual'])
    expect(values[0]).toMatchObject({ title: 'Temperatura media', mean: 17.2, p10: 13.4, p90: 21.1, decimals: 1 })
    expect(observedText(values[0])).toBe('Temperatura media: media 17,2 °C (p10–p90 13,4–21,1)')
  })

  it('reparte la zona en óptimo, aceptable y no apto según la puntuación', () => {
    const shares = classShares(new Float32Array([1, 1, 0.5, 0, Number.NaN]))
    expect(shares).toEqual({ optimal: 0.5, acceptable: 0.25, unsuitable: 0.25, valid: 0.8 })
    expect(classShares(new Float32Array([Number.NaN])).valid).toBe(0)
  })
})
