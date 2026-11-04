import { describe, expect, it } from 'vitest'
import { defaultState, editableBlade, fieldOfView, PRESETS } from './model'
import { makeBlade } from './blade'
import { metricTapeLayout } from './tape'

describe('metric image overlay', () => {
  it('uses the same physical ruler coordinates at display and capture resolutions', () => {
    const state = defaultState(), display = metricTapeLayout(state, 800, 533), capture = metricTapeLayout(state, 2400, 1599, 3)
    expect(capture.ticks.map(t => t.mm)).toEqual(display.ticks.map(t => t.mm))
    for (let i = 0; i < display.ticks.length; i++) expect(capture.ticks[i].x).toBeCloseTo(display.ticks[i].x * 3)
    expect(capture.height).toBe(display.height * 3)
    expect(capture.y).toBeCloseTo(display.y * 3)
    expect(display.y).toBeGreaterThan(0)
    expect(display.y + display.height).toBeLessThan(533)
  })
  it('places the ruler above the blade at the old physical tape datum', () => {
    for (const definition of [PRESETS['Shinogi-zukuri'], editableBlade(PRESETS['Slender tachi'])]) {
      const state = defaultState()
      state.blade.definition = definition
      const geometry = makeBlade(definition), tape = metricTapeLayout(state, 1200, 800)
      const oldNearEdge = geometry.boundingBox!.max.y * 1000 + 3
      expect(tape.y + tape.height).toBeCloseTo(800 * (0.5 - oldNearEdge / fieldOfView(state.camera).height), 3)
      expect(tape.y + tape.height).toBeLessThan(400)
      geometry.dispose()
    }
  })
  it('tracks table translation on both axes without depending on exposure', () => {
    const state = defaultState(), first = metricTapeLayout(state, 1200, 800)
    state.camera.exposure = -6
    expect(metricTapeLayout(state, 1200, 800)).toEqual(first)
    state.blade.y += 10
    const shifted = metricTapeLayout(state, 1200, 800)
    expect(shifted.y - first.y).toBeCloseTo(-10 * 800 / fieldOfView(state.camera).height)
    expect(shifted.ticks).toEqual(first.ticks)
    const mark = first.ticks.find(t => t.label)!
    state.blade.x += 10
    const moved = metricTapeLayout(state, 1200, 800).ticks.find(t => t.mm === mark.mm)!
    expect(moved.x - mark.x).toBeCloseTo(10 * 1200 / fieldOfView(state.camera).width)
  })
  it('keeps the overlay and its caption inside the image when the datum is outside the frame', () => {
    const state = defaultState()
    for (const y of [-400, 400]) {
      state.blade.y = y
      const tape = metricTapeLayout(state, 1200, 800)
      expect(tape.y).toBeGreaterThanOrEqual(26)
      expect(tape.y + tape.height).toBeLessThanOrEqual(788)
    }
  })
})
