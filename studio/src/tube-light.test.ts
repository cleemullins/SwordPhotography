import { describe, expect, it } from 'vitest'
import { CylinderGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three/webgpu'
import { createTubeEmitters, updateTubeEmitters, TUBE_SEGMENTS } from './tube-light'
import { defaultState, TUBE_LENGTH } from './model'

describe('importance-sampled finite tubes', () => {
  it('covers the full GVM-sized cylinder with outward-facing, energy-matched panels and caps', () => {
    const emitters = createTubeEmitters(), tube = { ...defaultState().lights[0], x: 100, y: 250, height: 800 }
    updateTubeEmitters(emitters, tube, 30)
    expect(emitters).toHaveLength(TUBE_SEGMENTS + 2)
    let area = 0
    for (const light of emitters.slice(0, TUBE_SEGMENTS)) {
      expect(light.height * 1000).toBe(TUBE_LENGTH)
      const outward = light.position.clone().sub(new Vector3(0.1, 0.25, 0.8)).normalize()
      expect(new Vector3(0, 0, -1).applyQuaternion(light.quaternion).dot(outward)).toBeCloseTo(1, 12)
      expect(new Vector3(0, 1, 0).applyQuaternion(light.quaternion).x).toBeCloseTo(1, 12)
      expect(light.position.x).toBe(0.1)
      expect(light.intensity).toBe(6)
      area += light.width * light.height
    }
    const ideal = Math.PI * 0.03 * TUBE_LENGTH / 1000
    expect(area / ideal).toBeGreaterThan(0.999)
    expect(area).toBeLessThan(ideal)
    for (const light of emitters.slice(TUBE_SEGMENTS)) {
      expect('isCircular' in light && light.isCircular).toBe(true)
      expect(light.width).toBe(0.03)
      expect(Math.abs(light.position.x - 0.1)).toBeCloseTo(TUBE_LENGTH / 2000 + 0.000002, 12)
    }
  })
  it('keeps directly sampled front panels outside the physical occluding tube', () => {
    const emitters = createTubeEmitters(), state = defaultState(), tube = { ...state.lights[0], x: 0, y: 250, height: 800 }
    updateTubeEmitters(emitters, tube, 30)
    const geometry = new CylinderGeometry(0.015, 0.015, TUBE_LENGTH / 1000, TUBE_SEGMENTS)
    const material = new MeshBasicMaterial(), body = new Mesh(geometry, material)
    body.rotation.z = Math.PI / 2; body.position.set(0, 0.25, 0.8); body.updateMatrixWorld()
    let checked = 0
    for (const light of emitters.slice(0, TUBE_SEGMENTS)) {
      const outward = new Vector3(0, 0, -1).applyQuaternion(light.quaternion)
      if (outward.dot(light.position.clone().negate()) <= 0) continue
      const hit = new Raycaster(new Vector3(), light.position.clone().normalize()).intersectObject(body)[0]
      expect(hit).toBeDefined()
      expect(hit.distance).toBeGreaterThan(light.position.length())
      checked++
    }
    expect(checked).toBeGreaterThan(20)
    geometry.dispose(); material.dispose()
  })
  it('updates source dimensions and positions without changing radiance or panel count', () => {
    const emitters = createTubeEmitters(), tube = defaultState().lights[1]
    updateTubeEmitters(emitters, tube, 20)
    const original = emitters[0].width
    updateTubeEmitters(emitters, { ...tube, x: 321, height: 300 }, 40)
    expect(emitters[0].width).toBe(original * 2)
    expect(emitters[0].position.x).toBe(0.321)
    expect(emitters.every(light => light.intensity === 6)).toBe(true)
  })
})
