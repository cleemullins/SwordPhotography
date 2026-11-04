import { describe, expect, it } from 'vitest'
import { defaultState, fieldOfView, parseSetup } from './model'
import { bladeSection } from './blade'
import { cameraForCoverage } from './framing'

describe('centimeter framing control', () => {
  it.each([20, 60, 135])('achieves coverage across the travel range starting at %s mm', focalLength => {
    const state = defaultState()
    state.camera.focalLength = focalLength
    for (const width of [10, 20, 50, 100, 200, 500, 805, 1400, 2500, 3190]) {
      const result = cameraForCoverage(state, width)
      expect(result.warning).toBe('')
      expect(fieldOfView(result.camera).width).toBeCloseTo(width, 7)
      expect(parseSetup({ ...state, camera: result.camera }).camera).toEqual(result.camera)
      expect(result.camera.aperture).toBe(state.camera.aperture)
      expect(result.camera.shutter).toBe(state.camera.shutter)
      expect(result.camera.autoExposure).toBe(state.camera.autoExposure)
      expect(result.camera.height - result.camera.focus).toBeCloseTo(bladeSection(state.blade.definition, 0.5).thickness * 500)
    }
  })
  it('keeps the chosen lens when camera travel suffices', () => {
    const state = defaultState()
    expect(cameraForCoverage(state, 350).camera.focalLength).toBe(60)
    expect(cameraForCoverage(state, 800).camera.focalLength).toBe(60)
  })
  it('adjusts the lens at travel limits and reports unreachable coverage', () => {
    const state = defaultState()
    expect(cameraForCoverage(state, 10).camera.focalLength).toBeGreaterThan(60)
    expect(cameraForCoverage(state, 2500).camera.focalLength).toBeLessThan(60)
    for (const width of [1, 3200]) {
      const result = cameraForCoverage(state, width)
      expect(result.warning).toContain('Coverage limited')
      expect(parseSetup({ ...state, camera: result.camera }).camera).toEqual(result.camera)
    }
    for (const width of [0, -1, NaN, Infinity]) expect(() => cameraForCoverage(state, width)).toThrow(/positive, finite/)
  })
  it('does not mutate scene, blade, lighting, or exposure settings', () => {
    const state = defaultState()
    state.camera.autoExposure = true
    state.blade.x = 100; state.blade.hada = 'mokume'
    const before = structuredClone(state)
    const result = cameraForCoverage(state, 350)
    expect(state).toEqual(before)
    for (const key of ['exposure', 'shutter', 'aperture', 'autoExposure', 'compensate'] as const) {
      expect(result.camera[key]).toBe(state.camera[key])
    }
  })
})
