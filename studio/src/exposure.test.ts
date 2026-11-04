import { describe, expect, it } from 'vitest'
import { meterBlade, SHUTTER_SPEEDS, shutterLabel, shutterStep } from './exposure'
import { defaultState, exposureScale, LIMITS, parseSetup } from './model'

const pixels = (value: number, count = 200) => Array.from({ length: count }, () => [value, value, value, 1]).flat()
const camera = () => ({ ...defaultState().camera, autoExposure: true, compensate: false, exposure: 0 })

describe('quick shutter control', () => {
  it('covers the complete shutter range in ordered photographic steps', () => {
    expect(SHUTTER_SPEEDS[0]).toBe(LIMITS.shutter[0])
    expect(SHUTTER_SPEEDS.at(-1)).toBe(LIMITS.shutter[1])
    SHUTTER_SPEEDS.forEach((speed, i) => {
      expect(shutterStep(speed)).toBe(i)
      if (i) expect(speed).toBeGreaterThan(SHUTTER_SPEEDS[i - 1])
    })
    expect(SHUTTER_SPEEDS[shutterStep(1 / 125) + 3]).toBe(1 / 60)
    expect(SHUTTER_SPEEDS[shutterStep(1 / 147)]).toBe(1 / 160)
  })
  it('labels fast and fractional-second exposures without rounding 0.8 seconds to one second', () => {
    expect(shutterLabel(1 / 8000)).toBe('1/8000 s')
    expect(shutterLabel(1 / 125)).toBe('1/125 s')
    expect(shutterLabel(0.8)).toBe('0.8 s')
    expect(shutterLabel(30)).toBe('30 s')
  })
})

describe('blade-only exposure meter', () => {
  it('ignores background and protects the highlight percentile', () => {
    const c = camera()
    const blade = [...pixels(1), ...pixels(8, 5)]
    const background = Array.from({ length: 1000 }, () => [1000, 1000, 1000, 0]).flat()
    expect(meterBlade([...blade, ...background], c)).toEqual(meterBlade(blade, c))
    for (let i = 0; i < 15; i++) c.shutter = meterBlade(blade, c).shutter
    expect(8 * exposureScale(c)).toBeCloseTo(0.95, 3)
  })
  it('converges without changing aperture and adapts to light intensity', () => {
    const c = camera(), aperture = c.aperture
    for (let i = 0; i < 15; i++) c.shutter = meterBlade(pixels(2), c).shutter
    expect(2 * exposureScale(c)).toBeCloseTo(0.45, 3)
    const first = c.shutter
    for (let i = 0; i < 15; i++) c.shutter = meterBlade(pixels(4), c).shutter
    expect(c.shutter).toBeCloseTo(first / 2)
    expect(c.aperture).toBe(aperture)
  })
  it('respects one-stop changes, limits, missing blades and darkness', () => {
    const c = camera()
    expect(meterBlade(pixels(0), c).shutter).toBe(c.shutter)
    expect(meterBlade([], c).status).toContain('Not enough blade')
    expect(meterBlade(pixels(0), c).status).toContain('dark')
    expect(meterBlade(pixels(1e6), c).shutter).toBe(c.shutter / 2)
    c.shutter = 1 / 8000
    expect(meterBlade(pixels(1e6), c).status).toContain('shutter limit')
    expect(meterBlade(pixels(1e6), c).shutter).toBe(1 / 8000)
    c.shutter = 30
    expect(meterBlade(pixels(1e-7), c).status).toContain('shutter limit')
    expect(() => meterBlade(pixels(NaN), c)).toThrow(/Non-finite/)
  })
  it('restores old camera settings and rejects unsafe shutter values', () => {
    const s = defaultState()
    const { shutter: _, autoExposure: __, ...legacy } = s.camera
    expect(parseSetup({ ...s, camera: legacy }).camera.shutter).toBe(1 / 125)
    for (const shutter of [0, -1, Infinity, 31, 'auto']) {
      expect(() => parseSetup({ ...s, camera: { ...s.camera, shutter } })).toThrow(/Shutter/)
    }
  })
})
