import { describe, expect, it } from 'vitest'
import { defaultState, parseSetup } from './model'
import { focusOnBlade } from './framing'
import { bladeSection } from './blade'
import { prepareSetup, scanPlan, updateRig } from './scan'
import { tapeMarks } from './tape'

describe('fixed rig and scan planning', () => {
  it('centers legacy tube offsets at the fixed origin without recentering the table or following scans', () => {
    const old = defaultState()
    old.lights[0].x = 220; old.lights[1].x = -130; old.blade.x = 140; old.blade.y = -20
    const centered = prepareSetup(parseSetup(old))
    expect(centered.lights.map(light => light.x)).toEqual([0, 0])
    expect(centered.blade).toEqual(old.blade)
    expect(old.lights.map(light => light.x)).toEqual([220, -130])
    centered.scan.locked = true
    for (const x of [-350, 0, 350]) {
      const attempted = structuredClone(centered)
      attempted.blade.x = x; attempted.lights[0].x = x; attempted.lights[1].x = x
      const next = updateRig(centered, attempted)
      expect(next.lights).toEqual(centered.lights)
      expect(next.blade.x).toBe(x)
      expect(next.blade.y).toBe(-20)
    }
    centered.scan.locked = false
    expect(updateRig(centered, old).lights.map(light => light.x)).toEqual([0, 0])
  })
  it('disables light following, retains Auto shutter choice and derives setup focus without changing exposure', () => {
    const old = defaultState()
    old.camera.focus = 1900; old.camera.autoExposure = true; old.automaticLightPosition = true
    const next = prepareSetup(old)
    expect(next.camera.focus).toBeCloseTo(next.camera.height - bladeSection(next.blade.definition, 0.5).thickness * 500)
    expect(next.camera.autoExposure).toBe(true); expect(next.automaticLightPosition).toBe(false)
    expect(next.camera.aperture).toBe(old.camera.aperture)
    expect(next.camera.shutter).toBe(old.camera.shutter)
    expect(next.lights).toEqual(old.lights)
    expect(old.camera.focus).toBe(1900)
  })
  it('refocuses every setup height and blade section, including outside the blade', () => {
    for (const height of [160, 480, 1800]) for (const x of [-800, -250, 0, 300, 800]) {
      const s = defaultState()
      s.camera.height = height; s.blade.x = x
      const focused = focusOnBlade(s)
      expect(focused.camera.focus).toBeGreaterThanOrEqual(140)
      expect(focused.camera.focus).toBeLessThanOrEqual(height)
      expect(focusOnBlade(focused)).toBe(focused)
    }
  })
  it('locks all physical settings even if a caller attempts to change them', () => {
    const s = prepareSetup(defaultState()); s.scan.locked = true
    const attempted = structuredClone(s)
    attempted.camera.height = 800; attempted.camera.aperture = 1.2; attempted.camera.shutter = 30
    attempted.lights[0].y = 400; attempted.referenceTape = false
    attempted.blade.y = 100; attempted.blade.definition.length = 800; attempted.blade.x = 250
    const next = updateRig(s, attempted)
    expect(next).toEqual({ ...s, referenceTape: false, blade: { ...s.blade, x: 250 } })
    expect(prepareSetup(next).camera).toEqual(s.camera)
    expect(parseSetup(next)).toEqual(next)
    attempted.scan.locked = false
    expect(updateRig(s, attempted).camera.height).toBe(800)
  })
  it('includes the final partial step, reports overlap, and steps correctly while scrubbing', () => {
    const s = defaultState(); s.scan = { start: 0, end: 100, step: 30, locked: true }
    s.blade.x = s.blade.definition.length / 2 - 100
    let p = scanPlan(s)
    expect(p.count).toBe(5); expect(p.at(4)).toBe(100); expect(p.index).toBe(4); expect(p.onFrame).toBe(true)
    expect(p.previous).toBe(90); expect(p.next).toBe(100)
    s.blade.x = s.blade.definition.length / 2 - 35
    p = scanPlan(s); expect(p.previous).toBe(30); expect(p.next).toBe(60); expect(p.onFrame).toBe(false)
    expect(p.overlap).toBeGreaterThan(80)
    s.scan.start = 100; expect(scanPlan(s).overlap).toBeNull()
    s.scan = { start: 0, end: 700, step: 500, locked: false }
    expect(scanPlan(s).gap).toBeGreaterThan(200)
  })
  it('migrates older files and rejects malformed scan and tape data', () => {
    const s = defaultState()
    const { scan, setupName, referenceTape, ...legacy } = s
    expect(parseSetup(legacy)).toEqual(s)
    expect(scan.locked).toBe(false); expect(setupName).toBeTruthy(); expect(referenceTape).toBe(true)
    for (const invalid of [{ start: -1 }, { end: 800 }, { start: 100, end: 50 }, { step: 0 }, { step: Infinity }, { locked: 'yes' }]) {
      expect(() => parseSetup({ ...s, scan: { ...s.scan, ...invalid } })).toThrow()
    }
    expect(() => parseSetup({ ...s, referenceTape: 'yes' })).toThrow()
  })
  it('places metric ticks every millimeter and numbers every centimeter from zero', () => {
    const marks = tapeMarks(742)
    expect(marks).toHaveLength(743)
    expect(marks[0]).toMatchObject({ mm: 0, major: true, label: '0' })
    expect(marks[5]).toMatchObject({ half: true, major: false, label: '' })
    expect(marks[740]).toMatchObject({ major: true, label: '74' })
    expect(marks[742].label).toBe('')
  })
})
