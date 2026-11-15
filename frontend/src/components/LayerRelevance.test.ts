import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LayerRelevance from './LayerRelevance.vue'
import { variableRelevance } from './variableRelevance'

const CUBE_IDS = [
  'soil-moisture-all', 'soil-moisture', 'radar-hh', 'radar-hv', 'radar-hv-hh', 'insar-coherence', 'ndvi', 'ndmi',
  'elevation', 'slope', 'soil-clay', 'soil-sand', 'soil-soc', 'soil-ph',
  'climate-precip-annual', 'climate-tmean-annual', 'climate-tmin-coldest', 'climate-tabsmin',
]

describe('LayerRelevance', () => {
  it('explica qué es la capa y para qué sirve en el cultivo', () => {
    const wrapper = mount(LayerRelevance, { props: { variableId: 'ndvi' } })
    expect(wrapper.get('h2').text()).toBe('Relevancia')
    expect(wrapper.text()).toContain('Qué es.')
    expect(wrapper.text()).toContain('Para el cultivo.')
    expect(wrapper.text()).toContain('verdor')
  })

  it('no se muestra sin variable o si no hay texto para ella', () => {
    expect(mount(LayerRelevance, { props: { variableId: null } }).find('section').exists()).toBe(false)
    expect(mount(LayerRelevance, { props: { variableId: 'desconocida' } }).find('section').exists()).toBe(false)
  })

  it('todas las variables del cubo publicado tienen texto', () => {
    for (const id of CUBE_IDS) expect(variableRelevance(id), id).not.toBeNull()
  })
})
