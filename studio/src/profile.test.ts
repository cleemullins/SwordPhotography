import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { bladeAngles, defaultState, editableBlade, parseBladeDefinition, parseSetup, PRESETS } from './model'
import { bladeCrossSections, bladeSection, makeBlade } from './blade'
import { HISTORICAL_PRESETS } from './historical-presets'
import { automaticLightPlacement } from './automatic-lighting'

describe('dimensioned blade profile', () => {
  it('uses exact base/yokote widths and spine thicknesses with a closed point', () => {
    const d = editableBlade(defaultState().blade.definition)
    d.profile.tipWidth = 19; d.profile.baseKasane = 5; d.profile.tipKasane = 3
    const base = bladeSection(d, 0), yokote = bladeSection(d, 1 - d.tipLength / d.length), tip = bladeSection(d, 1)
    expect(base.width * 1000).toBeCloseTo(d.width)
    expect(yokote.width * 1000).toBeCloseTo(19)
    const ratio = d.profile.baseKasane / d.thickness
    expect(base.thickness * ratio * 1000).toBeCloseTo(5)
    expect(yokote.thickness * ratio * 1000).toBeCloseTo(3)
    expect(tip.width).toBe(0); expect(tip.thickness).toBe(0)
  })

  it.each([0.15, 0.35, 0.5, 0.65, 0.85])('places the full specified sori at peak %s', peak => {
    const d = editableBlade(defaultState().blade.definition)
    d.profile.curvePosition = peak; d.curvature = 43
    const spine = (u: number) => { const s = bladeSection(d, u); return (s.y + s.width / 2) * 1000 }
    expect(spine(0)).toBeCloseTo(spine(1))
    expect(spine(0) - spine(peak)).toBeCloseTo(43)
    const mesh = makeBlade(d)
    expect(mesh.boundingBox!.max.x - mesh.boundingBox!.min.x).toBeCloseTo(d.length / 1000)
    const positions = mesh.getAttribute('position'), uv = mesh.getAttribute('uv')
    const muneY = Array.from({ length: positions.count }, (_, i) => i)
      .filter(i => uv.getY(i) === 1).map(i => positions.getY(i) * 1000)
    expect(Math.min(...muneY)).toBeCloseTo(spine(peak), 4)
    expect(Math.max(...muneY) - Math.min(...muneY)).toBeCloseTo(43, 4)
    mesh.dispose()
  })

  it.each([false, true])('puts the sharp edge on the larger-radius side (profile: %s)', modern => {
    const base = { ...defaultState().blade.definition, taper: 0 }
    const d = modern ? editableBlade(base) : base
    const a = bladeSection(d, 0.25), b = bladeSection(d, 0.5)
    // Circumcenter of three symmetric centerline samples at .25, .5, and .75.
    const centerY = (a.x - b.x) ** 2 / (2 * (a.y - b.y)) + (a.y + b.y) / 2
    const edge = bladeCrossSections(d)[0][0]
    expect(edge).toEqual([-0.5, 0])
    expect(Math.abs(centerY - (b.y + edge[0] * b.width)))
      .toBeGreaterThan(Math.abs(centerY - (b.y + b.width / 2)))
  })

  it.each([...Object.values(PRESETS), ...HISTORICAL_PRESETS.map(p => p.definition)])('bows every preset toward its cutting edge ($length mm)', d => {
    const a = bladeSection(d, 0.2), b = bladeSection(d, 0.4), c = bladeSection(d, 0.6)
    const mune = (s: typeof a) => s.y + s.width / 2
    expect(mune(a) - 2 * mune(b) + mune(c)).toBeGreaterThan(0)
  })

  it('changes actual silhouette and smooth normals for fukura and niku', () => {
    const d = editableBlade(defaultState().blade.definition)
    d.profile.fukura = 0
    const thin = bladeSection(d, 0.98).width
    d.profile.fukura = 1
    expect(bladeSection(d, 0.98).width).toBeGreaterThan(thin)
    const before = makeBlade(d)
    d.profile.niku = 0.1
    const after = makeBlade(d)
    expect(Array.from(after.getAttribute('normal').array)).not.toEqual(Array.from(before.getAttribute('normal').array))
    expect(Math.max(...bladeCrossSections(d)[0].map(p => p[1]))).toBe(0.5)
    before.dispose(); after.dispose()
  })

  it('couples angles to measurable base dimensions', () => {
    const d = editableBlade(defaultState().blade.definition)
    d.thickness = 2 * d.width * (d.ridge + 0.5) * Math.tan(10 * Math.PI / 180)
    expect(bladeAngles(d).bevel).toBeCloseTo(10)
    d.profile.baseKasane = d.thickness - 2 * d.width * (0.5 - d.ridge) * Math.tan(3 * Math.PI / 180)
    expect(bladeAngles(d).upper).toBeCloseTo(3)
    expect(bladeAngles(d).included).toBeCloseTo(20)
  })

  it('round-trips modern profiles and preserves legacy geometry without migration', () => {
    const state = defaultState()
    const before = Array.from(makeBlade(state.blade.definition).getAttribute('position').array)
    const restored = parseSetup(JSON.parse(JSON.stringify(state)))
    expect(restored.blade.definition.profile).toBeUndefined()
    expect(Array.from(makeBlade(restored.blade.definition).getAttribute('position').array)).toEqual(before)
    state.blade.definition = editableBlade(state.blade.definition)
    expect(parseSetup(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('rejects inconsistent or nonfinite geometry, unknown kissaki and profile versions', () => {
    const d = editableBlade(defaultState().blade.definition)
    for (const profile of [
      { ...d.profile, tipWidth: d.width + 1 }, { ...d.profile, baseKasane: 20 },
      { ...d.profile, tipKasane: 10 }, { ...d.profile, curvePosition: Infinity },
      { ...d.profile, kissakiType: 'invented' }, { ...d.profile, version: 9 },
    ]) expect(() => parseBladeDefinition({ ...d, profile })).toThrow()
    expect(() => parseBladeDefinition({ ...d, tipLength: d.length })).toThrow()
  })
})

describe('historical presets', () => {
  it('includes ten independently sourced Juyo records with unique identifiers', () => {
    expect(HISTORICAL_PRESETS).toHaveLength(10)
    expect(new Set(HISTORICAL_PRESETS.map(p => p.source)).size).toBe(10)
    expect(HISTORICAL_PRESETS.every(p => p.grade.includes('Juyo Token'))).toBe(true)
  })
  for (const preset of HISTORICAL_PRESETS) it(`preserves published dimensions and usable normals: ${preset.name}`, () => {
    const d = parseBladeDefinition(preset.definition), published = preset.published
    expect(d.length).toBe(published.length)
    expect(d.curvature).toBe(published.curvature)
    expect(d.width).toBe(published.width)
    expect(d.profile!.tipWidth).toBe(published.tipWidth)
    if (published.baseKasane !== undefined) expect(d.profile!.baseKasane).toBe(published.baseKasane)
    if (published.tipKasane !== undefined) expect(d.profile!.tipKasane).toBe(published.tipKasane)
    if (published.tipLength !== undefined) expect(d.tipLength).toBe(published.tipLength)
    if (published.kissakiType !== undefined) expect(d.profile!.kissakiType).toBe(published.kissakiType)
    const geometry = makeBlade(d), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material)
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
    for (const x of positions.array) expect(Number.isFinite(x)).toBe(true)
    const index = geometry.index!
    for (let i = 0; i < index.count; i++) expect(new Vector3().fromBufferAttribute(normals, index.getX(i)).length()).toBeCloseTo(1, 4)
    const section = bladeSection(d, 0.5)
    const hit = new Raycaster(new Vector3(0, section.y, 1), new Vector3(0, 0, -1)).intersectObject(mesh)[0]
    expect(hit).toBeDefined()
    expect(hit.face!.normal.z).toBeGreaterThan(0)
    const state = defaultState()
    state.blade.definition = d
    expect(automaticLightPlacement(state).warning).toBe('')
    geometry.dispose(); material.dispose()
  }, 15_000)
})
