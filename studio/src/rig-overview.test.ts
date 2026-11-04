import { describe, expect, it } from 'vitest'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { defaultState, editableBlade, fieldOfView } from './model'
import { frameRigCamera, RigOverviewScene } from './rig-overview'

describe('shared-state shaded rig', () => {
  it('fills the initial view while retaining a margin at desktop and narrow aspect ratios', () => {
    const model = new RigOverviewScene(defaultState()), points = model.viewPoints()
    for (const aspect of [0.9, 1.8, 3.2]) {
      const camera = new PerspectiveCamera(40, aspect, 0.01, 50)
      frameRigCamera(camera, points)
      const projected = points.map(point => point.clone().project(camera))
      for (const point of projected) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(0.880001)
        expect(Math.abs(point.y)).toBeLessThanOrEqual(0.880001)
        expect(Math.abs(point.z)).toBeLessThan(1)
      }
      const width = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x))
      const height = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))
      expect(Math.max(width, height) / 2).toBeCloseTo(0.88, 5)
    }
    model.dispose()
  })

  it('moves the table and real blade geometry together while the camera and lights stay fixed', () => {
    const state = defaultState(), model = new RigOverviewScene(state)
    const camera = model.cameraRig.position.clone(), lights = model.tubes.map(t => t.position.clone())
    const coverage = Array.from(model.coverage.geometry.attributes.position.array), geometry = model.blade.geometry
    state.blade.x = 275; state.blade.y = -31
    model.update(state)
    expect(model.table.position.toArray()).toEqual([0.275, -0.031, 0])
    expect(model.blade.getWorldPosition(new Vector3()).toArray()).toEqual([0.275, -0.031, 0])
    expect(model.blade.geometry).toBe(geometry)
    expect(model.cameraRig.position).toEqual(camera)
    expect(model.tubes.map(t => t.position)).toEqual(lights)
    expect(Array.from(model.coverage.geometry.attributes.position.array)).toEqual(coverage)
    model.dispose()
  })

  it('uses the physical tube span, diameter, offsets, power and enabled state', () => {
    const state = defaultState(), model = new RigOverviewScene(state)
    state.lights[0] = { x: 0, y: -240, height: 350, brightness: 70, enabled: true }
    state.diameter = 80
    model.update(state)
    expect(model.tubes[0].position.toArray()).toEqual([0, -0.24, 0.35])
    const size = new Box3().setFromObject(model.tubes[0]).getSize(new Vector3())
    expect(size.x).toBeCloseTo(1.2); expect(size.y).toBeCloseTo(0.08); expect(size.z).toBeCloseTo(0.08)
    expect(model.tubes[0].material.emissiveIntensity).toBe(0.35)
    state.lights[0].enabled = false; model.update(state)
    expect(model.tubes[0].visible).toBe(true)
    expect(model.tubes[0].material.emissiveIntensity).toBe(0)
    model.dispose()
  })

  it('updates the camera and its footprint from the same thin-lens projection', () => {
    const state = defaultState(), model = new RigOverviewScene(state)
    state.camera.height = 800; state.camera.focalLength = 100
    model.update(state)
    expect(model.cameraRig.position.toArray()).toEqual([0, 0, 0.8])
    const positions = model.coverage.geometry.attributes.position, fov = fieldOfView(state.camera)
    expect(positions.getX(0)).toBeCloseTo(-fov.width / 2000)
    expect(positions.getY(0)).toBeCloseTo(-fov.height / 2000)
    expect(positions.getZ(2)).toBeCloseTo(0.8)
    model.dispose()
  })

  it('rebuilds edited blade geometry, supports it on the moving tabletop and disposes resources', () => {
    const state = defaultState(), model = new RigOverviewScene(state)
    let disposed = 0
    model.blade.geometry.addEventListener('dispose', () => disposed++)
    state.blade.definition = editableBlade({ ...state.blade.definition, length: 950, thickness: 9 })
    model.update(state)
    expect(disposed).toBe(1)
    expect(model.blade.geometry.boundingBox!.max.x - model.blade.geometry.boundingBox!.min.x).toBeCloseTo(0.95)
    const top = new Box3().setFromObject(model.table.children[0])
    expect(top.max.z).toBeCloseTo(model.blade.geometry.boundingBox!.min.z)
    model.blade.geometry.addEventListener('dispose', () => disposed++)
    model.dispose()
    expect(disposed).toBe(2)
    expect(model.scene.children).toHaveLength(0)
  })
})
