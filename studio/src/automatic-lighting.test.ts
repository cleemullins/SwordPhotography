import { describe, expect, it } from 'vitest'
import { CylinderGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { automaticLightPlacement, grainContrastScore, positionAutomaticLights, tubeBlocksSegment } from './automatic-lighting'
import { defaultState, parseSetup, PRESETS, TUBE_LENGTH } from './model'
import { HISTORICAL_PRESETS } from './historical-presets'

describe('automatic specular light positioning', () => {
  it('prefers a high-contrast reflection edge over the brightest tube center', () => {
    const state = defaultState()
    const target = { point: new Vector3(), normal: new Vector3(0, 0, 1), direction: new Vector3(0, 0, 1) }
    const centered = { ...state.lights[0], x: 0, y: 0, height: 250 }
    const edge = { ...centered, y: state.diameter * 0.45 }
    expect(grainContrastScore(edge, target, state.diameter, state.blade.roughness))
      .toBeGreaterThan(grainContrastScore(centered, target, state.diameter, state.blade.roughness))
  })
  it('weights grain contrast by actual tube power and never counts a disabled source', () => {
    const state = defaultState()
    const target = { point: new Vector3(), normal: new Vector3(0, 0, 1), direction: new Vector3(0, 0, 1) }
    const light = { ...state.lights[0], x: 0, y: state.diameter * 0.45, height: 250 }
    const score = (brightness: number, enabled = true) => grainContrastScore({ ...light, brightness, enabled }, target, state.diameter, state.blade.roughness)
    expect(score(100)).toBeGreaterThan(score(25))
    expect(score(0)).toBe(0)
    expect(score(200, false)).toBe(0)
  })
  it('does not claim full coverage from a nearly dark rig', () => {
    const state = defaultState()
    state.lights[0].brightness = 0.1
    state.lights[1].enabled = false
    const dim = automaticLightPlacement(state)
    if (!dim.lights) throw new Error(dim.warning)
    expect(dim.coverage).toBeLessThan(0.01)
    expect(dim.lights[0].brightness).toBe(0.1)
    expect(dim.lights[1].enabled).toBe(false)
  })
  it('retains the rig and reports why placement is unavailable when both tubes are dark', () => {
    for (const disabled of [true, false]) {
      const state = defaultState()
      state.automaticLightPosition = true
      state.lights.forEach(light => { light.enabled = !disabled; light.brightness = disabled ? 100 : 0 })
      const result = positionAutomaticLights(state)
      expect(result.state).toBe(state)
      expect(result.warning).toContain('at least one enabled tube with nonzero brightness')
    }
  })
  it('optimizes one whole-blade rig independently of the current scan position, including the kissaki', () => {
    const state = defaultState()
    state.blade.definition = structuredClone(HISTORICAL_PRESETS.find(p => p.name === 'Norishige - Juyo 67')!.definition)
    state.blade.y = -13.13; state.camera.height = 440.1; state.camera.focalLength = 85
    const base = automaticLightPlacement(state)
    if (!base.lights) throw new Error(base.warning)
    expect(base.coverage).toBeGreaterThan(0.6)
    for (const x of [-300, 250, 800]) {
      expect(automaticLightPlacement({ ...state, blade: { ...state.blade, x } }).lights).toEqual(base.lights)
    }
  })
  for (const [name, definition] of Object.entries(PRESETS)) for (const height of [160, 480, 1800]) {
    it(`aligns both ${name} facets at camera height ${height}`, () => {
      const state = defaultState()
      state.blade.definition = definition
      state.scan.end = definition.length
      state.camera.height = height
      if (height === 160) state.camera.focalLength = 20
      const result = automaticLightPlacement(state)
      expect(result.warning).toBe('')
      if (!result.lights) throw new Error(result.warning)
      for (const [i, light] of result.lights.entries()) {
        const target = result.targets[i]
        const emission = target.point.clone().addScaledVector(target.direction, (light.height - target.point.z) / target.direction.z)
        const incoming = target.point.clone().sub(emission).normalize()
        expect(light.x).toBe(state.lights[i].x)
        expect(Math.abs(emission.x - light.x)).toBeLessThanOrEqual(TUBE_LENGTH / 2)
        const reflected = incoming.reflect(target.normal)
        const cameraDirection = new Vector3(0, 0, height).sub(target.point).normalize()
        expect(reflected.dot(cameraDirection)).toBeGreaterThan(1 - 1e-10)
        expect(light.y).toBeGreaterThanOrEqual(-450)
        expect(light.y).toBeLessThanOrEqual(450)
        expect(light.x).toBeGreaterThanOrEqual(-800)
        expect(light.x).toBeLessThanOrEqual(800)
        expect(light.height).toBeGreaterThanOrEqual(15)
        expect(light.height).toBeLessThanOrEqual(1000)
        expect(tubeBlocksSegment(light, state.diameter / 2, new Vector3(0, 0, height), target.point)).toBe(false)
        const tube = new Mesh(new CylinderGeometry(state.diameter / 2, state.diameter / 2, TUBE_LENGTH, 48), new MeshBasicMaterial())
        tube.rotation.z = Math.PI / 2
        tube.position.set(light.x, light.y, light.height)
        tube.updateMatrixWorld()
        expect(new Raycaster(target.point, target.direction).intersectObject(tube).length).toBeGreaterThan(0)
        tube.geometry.dispose(); tube.material.dispose()
      }
      expect(parseSetup({ ...state, lights: result.lights }).lights).toEqual(result.lights)
    })
  }

  it('tracks the translated blade and its changed normals without altering light intensity', () => {
    const state = defaultState()
    state.automaticLightPosition = true
    state.lights[0].enabled = false
    state.lights[1].brightness = 23
    const first = positionAutomaticLights(state)
    state.blade.x = 200
    state.blade.y = 15
    const next = positionAutomaticLights(state)
    expect(first.warning).toBe('')
    expect(next.warning).toBe('')
    expect(next.state.lights).not.toEqual(first.state.lights)
    expect(next.state.lights[0].enabled).toBe(false)
    expect(next.state.lights[1].brightness).toBe(23)
    expect(next.state.camera).toEqual(state.camera)
    expect(positionAutomaticLights(next.state)).toEqual(next)
  })

  it('fits thick tubes and preserves clear camera and inter-light paths', () => {
    const state = defaultState()
    state.camera.height = 160
    state.camera.aperture = 1.2
    state.camera.focalLength = 20
    state.diameter = 80
    const result = automaticLightPlacement(state)
    expect(result.warning).toBe('')
    if (!result.lights) throw new Error(result.warning)
    for (const light of result.lights) for (const target of result.targets) {
      expect(tubeBlocksSegment(light, 40, new Vector3(0, 0, 160), target.point)).toBe(false)
    }
    expect(Math.hypot(result.lights[0].y - result.lights[1].y, result.lights[0].height - result.lights[1].height)).toBeGreaterThanOrEqual(85)
  })

  it('reports unavailable solutions without moving lights or disabling the setting', () => {
    const state = defaultState()
    state.automaticLightPosition = true
    state.blade.y = 450
    const result = positionAutomaticLights(state)
    expect(result.warning).toContain('Previous positions are retained')
    expect(result.state).toBe(state)
    state.blade.y = -450
    expect(positionAutomaticLights(state).warning).not.toBe('')
  })

  it('leaves manual scenes untouched and loads old setup files with automatic mode off', () => {
    const state = defaultState()
    expect(positionAutomaticLights(state)).toEqual({ state, warning: '' })
    const { automaticLightPosition: _, ...legacy } = state
    expect(parseSetup(legacy).automaticLightPosition).toBe(false)
    expect(parseSetup({ ...state, automaticLightPosition: true }).automaticLightPosition).toBe(true)
    expect(() => parseSetup({ ...state, automaticLightPosition: 'true' })).toThrow(/Automatic light position/)
  })

  it('handles finite tube ends and axis-parallel shadow rays', () => {
    const light = { ...defaultState().lights[0], x: 0, y: 0, height: 100 }
    expect(tubeBlocksSegment(light, 10, new Vector3(0, 0, 0), new Vector3(0, 0, 200))).toBe(true)
    expect(tubeBlocksSegment(light, 10, new Vector3(700, 0, 0), new Vector3(700, 0, 200))).toBe(false)
    expect(tubeBlocksSegment(light, 10, new Vector3(-700, 0, 100), new Vector3(700, 0, 100))).toBe(true)
    expect(tubeBlocksSegment(light, 10, new Vector3(-700, 20, 100), new Vector3(700, 20, 100))).toBe(false)
  })
})
