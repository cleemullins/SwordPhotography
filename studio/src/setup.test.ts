import { describe, expect, it } from 'vitest'
import { defaultState } from './model'
import { moveSetupPosition, setupDragProjection, setupPointFits, setupPosition, setupProjection } from './setup'

describe('setup diagram coordinates', () => {
  it('fills the diagram for a low rig instead of reserving empty height', () => {
    const state = defaultState()
    state.camera.height = 160
    state.lights.forEach(l => { l.height = 40; l.y /= 2 })
    const p = setupProjection(state)
    expect(p.scale).toBeGreaterThan(1.5)
    expect(p.floor - state.camera.height * p.scale).toBeCloseTo(60)
    expect(p.center).toBe(230); expect(p.floor).toBe(330)
    for (const target of ['camera', 0, 1] as const) expect(setupPointFits(state, target, setupPosition(state, target), p)).toBe(true)
  })

  it('expands at the edge without moving the anchor or adding physical motion', () => {
    const state = defaultState(), p = setupProjection(state)
    const position = { y: 400, height: 1000 }
    const expanded = setupDragProjection(state, 0, position, { ...p, scale: p.scale * 2 })
    expect(expanded.scale).toBeLessThan(p.scale * 2)
    expect(expanded.center).toBe(p.center); expect(expanded.floor).toBe(p.floor)
    expect(setupPointFits(state, 0, position, expanded)).toBe(true)
    expect(moveSetupPosition(0, position, 0, 0, expanded.scale)).toEqual(position)
    expect(moveSetupPosition(0, position, -10 * expanded.scale, 10 * expanded.scale, expanded.scale)).toEqual({ y: 390, height: 990 })
    expect(state).toEqual(defaultState())
    expect(setupDragProjection(state, 0, setupPosition(state, 0), p)).toBe(p)
  })

  it('fits large tubes that extend below the blade plane', () => {
    const state = defaultState()
    state.camera.height = 160; state.diameter = 80
    state.lights.forEach(l => { l.height = 15; l.y = 0 })
    const p = setupProjection(state)
    for (const target of ['camera', 0, 1] as const) expect(setupPointFits(state, target, setupPosition(state, target), p)).toBe(true)
  })

  it('moves light height and lateral offset using a fixed drag scale', () => {
    const state = defaultState()
    const { scale } = setupProjection(state)
    const start = setupPosition(state, 1)
    const result = moveSetupPosition(1, start, 20 * scale, -150 * scale, scale)
    expect(result).toEqual({ y: 130, height: 910 })
    state.lights[1].height = result.height
    expect(setupProjection(state).scale).toBeLessThan(scale)
    // Further movement is still measured from the original pointer-down state.
    expect(moveSetupPosition(1, start, 30 * scale, -180 * scale, scale)).toEqual({ y: 140, height: 940 })
  })

  it('constrains camera motion to the vertical axis', () => {
    expect(moveSetupPosition('camera', { y: 0, height: 480 }, 100, -20, 0.25)).toEqual({ y: 0, height: 560 })
    expect(moveSetupPosition('camera', { y: 0, height: 480 }, 100, 0, 1)).toEqual({ y: 0, height: 480 })
  })

  it('clamps all positions to the existing physical limits', () => {
    expect(moveSetupPosition(0, { y: 0, height: 400 }, -10000, 10000, 0.1)).toEqual({ y: -450, height: 15 })
    expect(moveSetupPosition(1, { y: 0, height: 400 }, 10000, -10000, 0.1)).toEqual({ y: 450, height: 1000 })
    expect(moveSetupPosition('camera', { y: 0, height: 480 }, 0, -10000, 0.1).height).toBe(1800)
    expect(moveSetupPosition('camera', { y: 0, height: 480 }, 0, 10000, 0.1).height).toBe(160)
  })

  it('fits off-center blades, extreme lights, and the camera into the diagram', () => {
    const state = defaultState()
    state.camera.height = 1800
    state.blade.y = 450
    state.lights[0].y = -450
    state.lights[1].y = 450
    state.lights[1].height = 1000
    const p = setupProjection(state)
    for (const target of ['camera', 0, 1] as const) {
      const point = setupPosition(state, target)
      expect(p.center + point.y * p.scale).toBeGreaterThan(23)
      expect(p.center + point.y * p.scale).toBeLessThan(437)
      expect(p.floor - point.height * p.scale).toBeGreaterThan(23)
    }
  })
})
