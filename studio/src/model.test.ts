import { describe, expect, it } from 'vitest'
import { Raycaster, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { defaultState, parseSetup, fieldOfView, exposureScale, blurDiameter, PRESETS, sceneWarnings, SENSOR, TUBE_FIXTURE, TUBE_LENGTH } from './model'
import { makeBlade, bladeSection } from './blade'

describe('physical scene definition', () => {
  it('round-trips the complete setup without losing geometry or independent lighting', () => {
    const state = defaultState()
    state.lights[0].enabled = false
    state.lights[1].height = 500
    state.blade.definition.curvature = 24
    expect(parseSetup(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(TUBE_LENGTH).toBe(1200)
  })

  it('uses the supplied Nikon sensor and GVM housing reference without overwriting saved diameters', () => {
    expect(SENSOR).toEqual({ model: 'Nikon Z5II', type: 'BSI-CMOS', width: 35.9, height: 23.9, megapixels: 24.5, pixelWidth: 6048, pixelHeight: 4032 })
    expect(defaultState().diameter).toBe(TUBE_FIXTURE.depth)
    expect(TUBE_FIXTURE.depth).toBe(46)
    expect(parseSetup({ ...defaultState(), diameter: 25 }).diameter).toBe(25)
  })

  it.each([
    ['unsupported version', (s: Record<string, unknown>) => { s.version = 2 }],
    ['missing camera', (s: Record<string, unknown>) => { delete s.camera }],
    ['wrong light count', (s: Record<string, unknown>) => { s.lights = [] }],
  ])('rejects %s', (_, mutate) => {
    const value = JSON.parse(JSON.stringify(defaultState()))
    mutate(value)
    expect(() => parseSetup(value)).toThrow()
  })

  it.each([NaN, Infinity, -1, 136, '60', null])('rejects invalid focal length %s', value => {
    const state = { ...defaultState(), camera: { ...defaultState().camera, focalLength: value } }
    expect(() => parseSetup(state)).toThrow(/Focal length/)
  })

  it('accepts exact required camera endpoints', () => {
    for (const focalLength of [20, 135]) for (const aperture of [1.2, 11]) {
      const state = defaultState()
      state.camera.focalLength = focalLength
      state.camera.aperture = aperture
      expect(parseSetup(state).camera).toEqual(state.camera)
    }
  })

  it('rejects invalid geometry and booleans rather than coercing input', () => {
    const state = defaultState()
    expect(() => parseSetup({ ...state, blade: { ...state.blade, definition: { ...state.blade.definition, thickness: 0 } } })).toThrow(/thickness/)
    expect(() => parseSetup({ ...state, camera: { ...state.camera, compensate: 'false' } })).toThrow(/true or false/)
  })
})

describe('thin-lens optics', () => {
  it('uses the focused image distance and physical sensor dimensions', () => {
    const c = { ...defaultState().camera, height: 600, focus: 600, focalLength: 60 }
    expect(fieldOfView(c).imageDistance).toBeCloseTo(66.6666667)
    expect(fieldOfView(c).width).toBeCloseTo(323.1)
    expect(fieldOfView(c).height).toBeCloseTo(215.1)
  })
  it('narrows coverage with focal length and widens with camera height', () => {
    const c = defaultState().camera
    expect(fieldOfView({ ...c, focalLength: 135 }).width).toBeLessThan(fieldOfView(c).width)
    expect(fieldOfView({ ...c, height: 1000 }).width).toBeGreaterThan(fieldOfView(c).width)
  })
  it('focuses sharply on the chosen plane and respects aperture', () => {
    const c = defaultState().camera
    expect(blurDiameter(c.focus, c)).toBe(0)
    expect(blurDiameter(c.focus + 50, { ...c, aperture: 1.2 })).toBeGreaterThan(blurDiameter(c.focus + 50, { ...c, aperture: 11 }))
  })
  it('separates aperture throughput compensation from exposure', () => {
    const c = { ...defaultState().camera, exposure: 0 }
    expect(exposureScale({ ...c, exposure: 1 })).toBe(2)
    expect(exposureScale({ ...c, aperture: 2.8, compensate: false })).toBeCloseTo(4)
    expect(exposureScale({ ...c, aperture: 2.8, compensate: true })).toBe(1)
  })
})

describe('parameterized blade mesh', () => {
  for (const [name, definition] of Object.entries(PRESETS)) {
    it(`generates finite, correctly scaled ${name} geometry with outward top normals`, () => {
      const geometry = makeBlade(definition)
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
      expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeCloseTo(definition.length / 1000)
      expect(geometry.index!.count).toBeGreaterThan(1000)
      for (const value of positions.array) expect(Number.isFinite(value)).toBe(true)
      for (const value of normals.array) expect(Number.isFinite(value)).toBe(true)
      expect(normals.getZ(10)).toBeGreaterThan(0.9)
      const center = bladeSection(definition, 0.5)
      const mesh = new Mesh(geometry, new MeshBasicMaterial())
      mesh.updateMatrixWorld()
      const hit = new Raycaster(new Vector3(0, center.y, 1), new Vector3(0, 0, -1)).intersectObject(mesh)[0]
      expect(hit).toBeDefined()
      expect(hit.point.z).toBeGreaterThan(0)
      expect(hit.face!.normal.z).toBeGreaterThan(0)
      geometry.dispose(); mesh.material.dispose()
    })
  }
  it('reproduces the same mesh from saved parameters', () => {
    const state = defaultState()
    expect(Array.from(makeBlade(state.blade.definition).getAttribute('position').array)).toEqual(
      Array.from(makeBlade(parseSetup(state).blade.definition).getAttribute('position').array))
  })
  it('reports darkness and possible collisions', () => {
    const state = defaultState()
    state.lights.forEach(l => { l.enabled = false })
    expect(sceneWarnings(state).join()).toMatch(/no ambient/)
    state.diameter = 80; state.lights[0].y = 0; state.lights[0].height = 15
    expect(sceneWarnings(state).join()).toMatch(/intersect/)
  })
})
