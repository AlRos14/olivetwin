import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TimeSlider from './TimeSlider.vue'
import type { TimeStep } from '../types/manifest'

const BBOX: TimeStep['bbox'] = [-3.86, 37.69, -3.61, 37.9]

const STEPS: TimeStep[] = [
  { date: '2026-01-15', image: 'data/sample/step-1.png', bbox: BBOX },
  { date: '2026-02-14', label: '14 feb', image: 'data/sample/step-2.png', bbox: BBOX },
  {
    date: '2026-03-16T10:30:00Z',
    image: 'data/sample/step-3.png',
    bbox: BBOX,
  },
]

function mountSlider(modelValue: number | null = 0, steps: TimeStep[] = STEPS) {
  return mount(TimeSlider, { props: { steps, modelValue } })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TimeSlider', () => {
  it('no se renderiza con menos de dos pasos', () => {
    expect(mountSlider(0, []).find('.ot-time-slider').exists()).toBe(false)
    expect(mountSlider(0, [STEPS[0]!]).find('.ot-time-slider').exists()).toBe(false)
  })

  it('muestra etiqueta, paso actual y fecha MM/DD/YYYY en UTC', () => {
    const wrapper = mountSlider(0)
    const range = wrapper.get('input[type="range"]')

    expect(wrapper.text()).toContain('Fecha de adquisición')
    expect(wrapper.text()).toContain('Paso 1 de 3 · 01/15/2026')
    expect(range.attributes('min')).toBe('0')
    expect(range.attributes('max')).toBe('2')
    expect(range.attributes('step')).toBe('1')
    expect(range.attributes('aria-valuetext')).toBe('01/15/2026')
    expect(wrapper.get('label').attributes('for')).toBe(range.attributes('id'))
  })

  it('muestra todas las marcas en MM/DD/YYYY aunque haya label', () => {
    const wrapper = mountSlider(1)
    const marks = wrapper.findAll('.ot-time-slider__mark')

    expect(marks).toHaveLength(3)
    expect(marks.map((mark) => mark.text())).toEqual([
      '01/15/2026',
      '02/14/2026',
      '03/16/2026',
    ])
    expect(marks[1]!.classes()).toContain('ot-time-slider__mark--active')
  })

  it('formatea fechas con hora en UTC e indica la zona', () => {
    const wrapper = mountSlider(2)
    expect(wrapper.text()).toContain('Paso 3 de 3 · 03/16/2026 10:30 UTC')
    expect(wrapper.get('input[type="range"]').attributes('aria-valuetext')).toContain('UTC')
  })

  it('usa label solo cuando la fecha no es válida', () => {
    const wrapper = mountSlider(0, [
      { date: 'no-es-fecha', label: 'Etiqueta', image: 'a.png', bbox: BBOX },
      STEPS[0]!,
    ])
    expect(wrapper.findAll('.ot-time-slider__mark')[0]!.text()).toBe('Etiqueta')
  })

  it('trata un índice nulo o fuera de rango sin romper el slider', () => {
    const nullValue = mountSlider(null)
    expect(nullValue.text()).toContain('Paso 1 de 3')

    const outOfRange = mountSlider(9)
    expect(outOfRange.text()).toContain('Paso 3 de 3')
    expect(outOfRange.get('input[type="range"]').attributes('max')).toBe('2')
  })

  it('emite update:modelValue al mover el slider', async () => {
    const wrapper = mountSlider(0)
    await wrapper.get('input[type="range"]').setValue('2')
    expect(wrapper.emitted('update:modelValue')).toEqual([[2]])
  })

  it('deshabilita Anterior y Siguiente en los extremos', async () => {
    const first = mountSlider(0)
    const buttons = first.findAll('button')
    expect(buttons[0]!.attributes('disabled')).toBeDefined()
    expect(buttons[2]!.attributes('disabled')).toBeUndefined()

    await buttons[2]!.trigger('click')
    expect(first.emitted('update:modelValue')).toEqual([[1]])

    const last = mountSlider(2)
    const lastButtons = last.findAll('button')
    expect(lastButtons[0]!.attributes('disabled')).toBeUndefined()
    expect(lastButtons[2]!.attributes('disabled')).toBeDefined()

    await lastButtons[0]!.trigger('click')
    expect(last.emitted('update:modelValue')).toEqual([[1]])
  })

  it('reproduce un paso cada 1500 ms y se detiene en el último', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(0)
    const play = wrapper.get('.ot-time-slider__play')

    expect(play.attributes('aria-pressed')).toBe('false')
    await play.trigger('click')
    expect(play.attributes('aria-pressed')).toBe('true')
    expect(play.text()).toBe('Pausar')
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])

    vi.advanceTimersByTime(1500)
    expect(wrapper.emitted('update:modelValue')).toEqual([[0], [1]])

    vi.advanceTimersByTime(1500)
    expect(wrapper.emitted('update:modelValue')).toEqual([[0], [1], [2]])
    await nextTick()

    expect(play.attributes('aria-pressed')).toBe('false')
    expect(play.text()).toBe('Reproducir')
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3)
  })

  it('al reproducir desde el último paso empieza por el primero', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(2)
    const play = wrapper.get('.ot-time-slider__play')

    await play.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])
    expect(play.attributes('aria-pressed')).toBe('true')

    vi.advanceTimersByTime(1500)
    expect(wrapper.emitted('update:modelValue')).toEqual([[0], [1]])
  })

  it('«Pausar» detiene la reproducción y limpia el temporizador', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(0)
    const play = wrapper.get('.ot-time-slider__play')

    await play.trigger('click')
    await play.trigger('click')

    expect(play.attributes('aria-pressed')).toBe('false')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])
  })

  it('mover el slider manualmente cancela la reproducción', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(0)
    const play = wrapper.get('.ot-time-slider__play')

    await play.trigger('click')
    vi.advanceTimersByTime(1500)
    await wrapper.get('input[type="range"]').setValue('2')
    await nextTick()

    expect(play.attributes('aria-pressed')).toBe('false')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('update:modelValue')).toEqual([[0], [1], [2]])
  })

  it('cambiar steps cancela la reproducción', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(0)

    await wrapper.get('.ot-time-slider__play').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    await wrapper.setProps({ steps: STEPS.slice(0, 2) })
    expect(vi.getTimerCount()).toBe(0)
    expect(wrapper.get('.ot-time-slider__play').attributes('aria-pressed')).toBe('false')
  })

  it('al desmontar cancela el temporizador', async () => {
    vi.useFakeTimers()
    const wrapper = mountSlider(0)

    await wrapper.get('.ot-time-slider__play').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
