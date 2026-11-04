import { describe, expect, it } from 'vitest'
import { protectHighlights, SHUTTER_SPEEDS, shutterLabel, shutterStep } from './exposure'
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

describe('Auto shutter highlight protection', () => {
  it('protects the brightest blade pixel, including rare glints, while ignoring the background', () => {
    const c = { ...camera(), compensate: true, exposure: -1.5 }
    const frame = [...pixels(0.1, 2000), ...pixels(30, 1), 10000, 10000, 10000, 0]
    const result = protectHighlights(frame, c)
    expect(exposureScale({ ...c, shutter: result.shutter }) * 30).toBeCloseTo(0.9, 10)
    expect(result.status).toContain('90%')
    expect(protectHighlights([...pixels(0.2, 2000), ...pixels(60, 1)], c).shutter).toBeCloseTo(result.shutter / 2, 10)
  })
  it('accounts for aperture, compensation and EV without altering those settings', () => {
    const c = camera(), first = protectHighlights(pixels(2), c).shutter
    expect(protectHighlights(pixels(2), { ...c, aperture: c.aperture * 2 }).shutter).toBeCloseTo(first * 4)
    expect(protectHighlights(pixels(2), { ...c, exposure: 1 }).shutter).toBeCloseTo(first / 2)
    expect(protectHighlights(pixels(2), { ...c, aperture: 11, compensate: true }).shutter).toBeCloseTo(first)
  })
  it('preserves exposure for empty/dark views and reports limits explicitly', () => {
    const c = camera()
    expect(protectHighlights([], c).shutter).toBe(c.shutter)
    expect(protectHighlights(pixels(0), c).status).toContain('dark')
    const limited = protectHighlights(pixels(1e8), c)
    expect(limited.shutter).toBe(LIMITS.shutter[0]); expect(limited.status).toContain('limit')
    expect(() => protectHighlights(pixels(NaN), c)).toThrow('Non-finite')
  })
})

describe('shutter persistence', () => {
  it('restores old camera settings and rejects unsafe shutter values', () => {
    const s = defaultState()
    const { shutter: _, autoExposure: __, ...legacy } = s.camera
    expect(parseSetup({ ...s, camera: legacy }).camera.shutter).toBe(1 / 125)
    for (const shutter of [0, -1, Infinity, 31, 'auto']) {
      expect(() => parseSetup({ ...s, camera: { ...s.camera, shutter } })).toThrow(/Shutter/)
    }
  })
})
