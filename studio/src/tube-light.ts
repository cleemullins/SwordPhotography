import { Color, RectAreaLight, Vector3 } from 'three/webgpu'
import { TUBE_LENGTH, TUBE_RADIANCE } from './model'
import type { LightSettings } from './model'

export const TUBE_SEGMENTS = 48
const RADIANCE = new Color(1, 0.93, 0.84)

class CircularAreaLight extends RectAreaLight {
  isCircular = true
}

export function createTubeEmitters() {
  return [...Array.from({ length: TUBE_SEGMENTS }, () => new RectAreaLight(RADIANCE, TUBE_RADIANCE)),
    new CircularAreaLight(RADIANCE, TUBE_RADIANCE), new CircularAreaLight(RADIANCE, TUBE_RADIANCE)]
}

export function updateTubeEmitters(emitters: RectAreaLight[], tube: LightSettings, diameter: number) {
  const radius = diameter / 2000, length = TUBE_LENGTH / 1000
  const halfAngle = Math.PI / TUBE_SEGMENTS
  // Analytic panels match the cylinder's facets, displaced 2 um to avoid self-occlusion.
  const apothem = radius * Math.cos(halfAngle) + 0.000002
  for (let i = 0; i < TUBE_SEGMENTS; i++) {
    const angle = (i + 0.5) * 2 * halfAngle
    const normal = new Vector3(0, Math.sin(angle), Math.cos(angle))
    const light = emitters[i]
    light.position.set(tube.x / 1000, tube.y / 1000, tube.height / 1000).addScaledVector(normal, apothem)
    light.width = 2 * radius * Math.sin(halfAngle); light.height = length
    light.up.set(1, 0, 0)
    light.lookAt(light.position.clone().add(normal))
    light.updateMatrixWorld()
  }
  for (let i = 0; i < 2; i++) {
    const direction = i === 0 ? -1 : 1, light = emitters[TUBE_SEGMENTS + i]
    light.position.set(tube.x / 1000 + direction * (length / 2 + 0.000002), tube.y / 1000, tube.height / 1000)
    light.width = light.height = 2 * radius
    light.up.set(0, 0, 1)
    light.lookAt(light.position.clone().add(new Vector3(direction, 0, 0)))
    light.updateMatrixWorld()
  }
}
