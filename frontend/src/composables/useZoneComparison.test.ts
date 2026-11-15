import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { setLocale } from '../i18n'

import type { StudyZone } from '../types/manifest'
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from '../services/llmClient'
import { analysisFixture, H, makeFetch, settle, W, zone } from '../services/__fixtures__/analysisCube'
import { encodeGray } from '../services/__fixtures__/pngFixture'
import CompareWorkspace from '../components/CompareWorkspace.vue'
import CompareControls from '../components/CompareControls.vue'
import { useZoneComparison } from './useZoneComparison'

function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(body, { status: 200 })
}

/** Toledo con rásteres de aptitud propios: todo apto (254 = 1,0), frente al fixture de Jaén. */
function toledoBetter() {
  const cube = analysisFixture('toledo', { withCrops: true })
  const crop = cube.crops![0]
  crop.suitability.data = crop.suitability.data.replace('suitability.png', 'suitability-toledo.png')
  crop.factors[0].raster.data = crop.factors[0].raster.data.replace('pendiente.png', 'pendiente-toledo.png')
  return cube
}

async function setup() {
  const cube = await makeFetch({
    jaen: analysisFixture('jaen', { withCrops: true }),
    toledo: toledoBetter(),
  })
  const allApt = await encodeGray(W, H, new Uint8Array(W * H).fill(254))
  const bodies: { messages: { role: string; content: string }[] }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/chat/completions')) {
      bodies.push(JSON.parse(String(init?.body)))
      return sse('## Veredicto\nToledo.')
    }
    if (url.endsWith('-toledo.png')) return new Response(allApt as unknown as BodyInit, { status: 200 })
    return cube.fetchImpl(input, init)
  }) as typeof fetch
  const zones = ref<StudyZone[]>([
    { ...zone('jaen'), name: 'Jaén' },
    { ...zone('toledo'), name: 'Toledo' },
    zone('sin-cubo', false),
  ])
  const settings = reactive<LlmSettings>({ ...DEFAULT_LLM_SETTINGS })
  const comparison = useZoneComparison(zones, settings, { fetchImpl, toDataUrl: (rgba) => `data:${rgba.length}` })
  await settle()
  return { comparison, bodies, settings }
}

describe('useZoneComparison', () => {
  it('elige por defecto las dos primeras zonas con cubo y el primer cultivo común', async () => {
    const { comparison } = await setup()
    expect(comparison.zones.value.map((item) => item.id)).toEqual(['jaen', 'toledo'])
    expect([comparison.state.zoneAId, comparison.state.zoneBId]).toEqual(['jaen', 'toledo'])
    expect(comparison.crops.value).toEqual([{ id: 'olivo', name: 'Olivo' }])
    expect(comparison.state.status).toBe('ready')
    expect(comparison.viewA.value!.url).toBe('data:48')
  })

  it('da el veredicto y los motivos sin pasar por la IA', async () => {
    const { comparison } = await setup()
    const result = comparison.comparison.value!
    // Jaén: 2/3 de las celdas con aptitud ≥ 0,5 (filas con 1,0 y 0,61); Toledo: todas.
    expect(result).toMatchObject({ winner: 'B', decidedBy: 'share' })
    expect(comparison.viewA.value!.summary.suitableShare).toBeCloseTo(2 / 3)
    expect(comparison.viewB.value!.summary.suitableShare).toBeCloseTo(1)
    expect(comparison.viewA.value!.summary.basis).toBe('zone')
    expect(result.reasons.map((reason) => reason.id)).toEqual(['pendiente'])
    expect(comparison.viewB.value!.summary.factors[0].observed[0].title).toContain('Pendiente')
  })

  it('sin comparación si se elige la misma zona en A y B', async () => {
    const { comparison } = await setup()
    comparison.setZoneB('jaen')
    await settle()
    expect(comparison.comparison.value).toBeNull()
    comparison.setZoneB('no-existe')
    expect(comparison.state.zoneBId).toBe('jaen')
  })

  it('la IA recibe el veredicto calculado, los factores y la tarea', async () => {
    const { comparison, bodies } = await setup()
    await comparison.runReport()
    expect(comparison.report.status).toBe('done')
    const content = bodies[0].messages[1].content
    expect(content).toContain('Veredicto calculado: la zona B es más apta para el olivo; decide la superficie apta')
    expect(content).toContain('Zona A: estadísticas sobre')
    expect(content).toContain('- Pendiente (favorece a la zona B)')
    // El informe no nombra las provincias de los recuadros.
    expect(content).not.toMatch(/Jaén|Toledo/)
    expect(content).toContain('sin cambiar el veredicto calculado')
  })

  it('en inglés muestra el veredicto y los motivos en inglés', async () => {
    setLocale('en', { persist: false })
    const { comparison, settings } = await setup()
    const workspace = mount(CompareWorkspace, { props: { comparison } })
    await nextTick()
    const text = workspace.text()
    expect(text).toContain('Compare zones')
    expect(text).toContain('Area B is better for olivo')
    expect(text).toContain('Pendiente: favours Area B')
    expect(workspace.find('[aria-label="Verdict"]').exists()).toBe(true)
    expect(text).not.toContain('La zona B es mejor')

    const controls = mount(CompareControls, { props: { comparison, settings } })
    expect(controls.text()).toContain('Area A')
    expect(controls.text()).toContain('Area B')
    expect(controls.text()).toContain('Crop')
  })

  it('los componentes muestran el veredicto, los motivos y los controles', async () => {
    const { comparison, settings } = await setup()
    const workspace = mount(CompareWorkspace, { props: { comparison } })
    const text = workspace.text()
    expect(text).toContain('La zona B es mejor para el olivo')
    expect(text).toContain('Pendiente: favorece a la zona B')
    expect(text).not.toMatch(/Jaén|Toledo/)
    expect(workspace.findAll('.ot-compare__maps img')).toHaveLength(2)
    expect(workspace.find('.ot-llm__run').exists()).toBe(true)

    const controls = mount(CompareControls, { props: { comparison, settings } })
    const selects = controls.findAll('select')
    expect(selects).toHaveLength(3)
    await selects[1].setValue('jaen')
    await settle()
    expect(controls.text()).toContain('Elige dos zonas distintas')
  })
})
