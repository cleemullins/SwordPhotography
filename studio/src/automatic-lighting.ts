import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { bladeSection, makeBlade } from './blade'
import { clamp, fieldOfView, LIMITS, TUBE_LENGTH } from './model'
import type { LightSettings, StudioState } from './model'

export interface ReflectionTarget {
  point: Vector3
  normal: Vector3
  direction: Vector3
}

type Placement = { lights: StudioState['lights']; targets: [ReflectionTarget, ReflectionTarget]; warning: ''; coverage: number }
  | { lights: null; targets: null; warning: string }

function clipAxis(origin: number, direction: number, min: number, max: number, interval: [number, number]) {
  if (Math.abs(direction) < 1e-10) return origin >= min && origin <= max
  const a = (min - origin) / direction, b = (max - origin) / direction
  interval[0] = Math.max(interval[0], Math.min(a, b))
  interval[1] = Math.min(interval[1], Math.max(a, b))
  return interval[0] <= interval[1]
}

// Segment intersection with a finite, X-aligned tube, including its end caps.
export function tubeBlocksSegment(light: LightSettings, radius: number, from: Vector3, to: Vector3) {
  const delta = to.clone().sub(from)
  const y = from.y - light.y, z = from.z - light.height
  const a = delta.y ** 2 + delta.z ** 2, c = y * y + z * z - radius * radius
  const interval: [number, number] = [0, 1]
  if (!clipAxis(from.x, delta.x, light.x - TUBE_LENGTH / 2, light.x + TUBE_LENGTH / 2, interval)) return false
  if (a < 1e-10) return c <= 0
  const b = 2 * (y * delta.y + z * delta.z), discriminant = b * b - 4 * a * c
  if (discriminant < 0) return false
  const root = Math.sqrt(discriminant)
  return Math.max(interval[0], (-b - root) / (2 * a)) <= Math.min(interval[1], (-b + root) / (2 * a))
}

function candidates(s: StudioState, target: ReflectionTarget, index: 0 | 1) {
  const { point, direction } = target
  const radius = s.diameter / 2
  const interval: [number, number] = [s.diameter + 10, Infinity]
  if (direction.z <= 0 ||
    !clipAxis(point.x, direction.x, s.lights[index].x - TUBE_LENGTH / 2, s.lights[index].x + TUBE_LENGTH / 2, interval) ||
    !clipAxis(point.y, direction.y, ...LIMITS.y, interval) ||
    !clipAxis(point.z, direction.z, Math.max(LIMITS.lightHeight[0], radius + s.blade.definition.thickness / 2 + 5), LIMITS.lightHeight[1], interval)) return []
  const preferred = clamp((s.camera.height * 0.8 - point.z) / direction.z, ...interval)
  const distances = [...new Set([preferred,
    ...[40, 60, 90, 120, 180, 250, 400, 700, 1000].map(height => clamp((height - point.z) / direction.z, ...interval)),
    ...[0, 0.2, 0.4, 0.6, 0.8, 1].map(f => interval[0] + f * (interval[1] - interval[0]))])]
  const sideways = new Vector3(0, direction.z, -direction.y).normalize()
  return distances.flatMap(distance => [-0.9, 0.9, 0].map(edge => {
    const center = point.clone().addScaledVector(direction, distance)
      .addScaledVector(sideways, edge * radius)
    return { ...s.lights[index], y: clamp(center.y, ...LIMITS.y), height: clamp(center.z, ...LIMITS.lightHeight) }
  })).filter(light => {
    const emissionX = point.x + direction.x * (light.height - point.z) / direction.z
    return Math.abs(emissionX - light.x) <= TUBE_LENGTH / 2
  })
}

// A finite strip convolved with a microfacet lobe: sensitivity, not peak brightness.
export function grainContrastScore(light: LightSettings, target: ReflectionTarget, diameter: number, roughness: number) {
  return grainResponse(light, target, diameter, roughness).contrast
}

function grainResponse(light: LightSettings, target: ReflectionTarget, diameter: number, roughness: number) {
  const y = light.y - target.point.y, z = light.height - target.point.z
  const distance = Math.hypot(y, z)
  const gain = light.enabled ? light.brightness / 100 : 0
  if (gain === 0 || distance <= diameter / 2 || target.direction.z <= 0) return { contrast: 0, brightness: 0, normalDifference: 0, polishDifference: 0 }
  const halfWidth = Math.asin(diameter / 2 / distance)
  const angle = Math.atan2(y, z) - Math.atan2(target.direction.y, target.direction.z)
  const response = (offset: number, polish: number) => {
    const scale = Math.max(0.0005, 2 * polish * polish)
    const along = Math.atan2(target.direction.x, Math.hypot(target.direction.y, target.direction.z))
    const start = Math.atan2(light.x - TUBE_LENGTH / 2 - target.point.x, distance)
    const end = Math.atan2(light.x + TUBE_LENGTH / 2 - target.point.x, distance)
    const longitudinal = (Math.atan((end - along) / scale) - Math.atan((start - along) / scale)) / Math.PI
    return gain * longitudinal * (Math.atan((offset + halfWidth) / scale) - Math.atan((offset - halfWidth) / scale)) / Math.PI
  }
  const polish = roughness * 0.72, mean = response(angle, polish)
  const normalDifference = response(angle + 0.002, polish) - response(angle - 0.002, polish)
  const polishDifference = response(angle, roughness * 0.56) - response(angle, roughness * 0.96)
  // Coverage must include the sharper grains, not just the average polish lobe.
  const brightness = Math.min(mean, response(angle - 0.002, roughness * 0.56), response(angle + 0.002, roughness * 0.56))
  return { contrast: (Math.abs(normalDifference) + 0.35 * Math.abs(polishDifference)) * Math.min(1, mean / 0.2),
    brightness, normalDifference, polishDifference }
}

function clearPaths(s: StudioState, lights: StudioState['lights'], pairs: [ReflectionTarget, ReflectionTarget][], camera: Vector3) {
  const radius = s.diameter / 2
  if (Math.abs(lights[0].x - lights[1].x) < TUBE_LENGTH &&
    Math.hypot(lights[0].y - lights[1].y, lights[0].height - lights[1].height) < s.diameter + 5) return false
  for (const light of lights) {
    const pupilRadius = s.camera.focalLength / s.camera.aperture / 2
    if (Math.abs(light.x) < TUBE_LENGTH / 2 + pupilRadius &&
      Math.hypot(light.y, light.height - camera.z) < radius + pupilRadius + 5) return false
    if (pairs.some(targets => targets.some(t => tubeBlocksSegment(light, radius, camera, t.point)))) return false
  }
  return pairs.every(targets => targets.every(target => lights.every((light, i) => {
    if (!light.enabled || light.brightness === 0) return true
    const emissionX = target.point.x + target.direction.x * (light.height - target.point.z) / target.direction.z
    const emission = new Vector3(clamp(emissionX, light.x - TUBE_LENGTH / 2, light.x + TUBE_LENGTH / 2), light.y, light.height)
    return !tubeBlocksSegment(lights[1 - i], radius, target.point, emission)
  })))
}

export function automaticLightPlacement(s: StudioState): Placement {
  if (!s.lights.some(light => light.enabled && light.brightness > 0)) return {
    lights: null, targets: null,
    warning: 'Automatic placement needs at least one enabled tube with nonzero brightness. Previous positions are retained.',
  }
  const d = s.blade.definition, coverage = fieldOfView(s.camera)
  const camera = new Vector3(0, 0, s.camera.height)
  const failure: Placement = {
    lights: null, targets: null,
    warning: 'Automatic placement cannot find a clear fixed rig across the blade within the rig limits. Previous positions are retained. Reframe across the blade, raise the camera, or use manual positioning.',
  }
  const geometry = makeBlade(d), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material)
  mesh.position.y = s.blade.y / 1000
  const raycaster = new Raycaster()
  const tipStart = 1 - d.tipLength / d.length
  const sections = [...Array.from({ length: 17 }, (_, i) => 0.01 + i / 16 * (tipStart - 0.02)),
    ...[0.15, 0.5, 0.85].map(f => tipStart + f * (1 - tipStart))]
  try {
    const pairs: [ReflectionTarget, ReflectionTarget][] = []
    for (const u of sections) {
      // Simulate the table bringing each section under the same stationary camera.
      mesh.position.x = (0.5 - u) * d.length / 1000
      mesh.updateMatrixWorld()
      const section = bladeSection(d, u)
      const targets = [(-0.5 + d.ridge) / 2, (d.ridge + 0.5) / 2].map(v => {
        raycaster.set(new Vector3(section.x + mesh.position.x, section.y + v * section.width + mesh.position.y, s.camera.height / 1000),
          new Vector3(0, 0, -1))
        const hit = raycaster.intersectObject(mesh)[0]
        if (!hit?.normal) return null
        const point = hit.point.clone().multiplyScalar(1000), normal = hit.normal.clone().normalize()
        const depth = camera.z - point.z
        if (depth <= 0 || Math.abs(point.x) > coverage.width * depth / camera.z / 2 ||
          Math.abs(point.y) > coverage.height * depth / camera.z / 2) return null
        const view = camera.clone().sub(point).normalize()
        if (normal.dot(view) <= 0) return null
        raycaster.set(camera.clone().multiplyScalar(0.001), view.clone().negate())
        const visible = raycaster.intersectObject(mesh)[0]
        if (!visible || visible.point.distanceTo(hit.point) > 0.00001) return null
        // Reflect the surface-to-camera direction about the rendered shading normal.
        const direction = normal.clone().multiplyScalar(2 * normal.dot(view)).sub(view).normalize()
        return { point, normal, direction }
      })
      if (!targets[0] || !targets[1]) return failure
      pairs.push([targets[0], targets[1]])
    }
    const ranked = ([0, 1] as const).map(index => {
      const seen = new Set<string>()
      const all = pairs.flat().flatMap(target => candidates(s, target, index).map(light => ({ light, target })))
        .filter(({ light }) => {
          const key = `${light.y.toFixed(5)},${light.height.toFixed(5)}`
          if (seen.has(key)) return false
          seen.add(key)
          return !pairs.some(pair => pair.some(target => tubeBlocksSegment(light, s.diameter / 2, camera, target.point)))
        }).map(candidate => {
          const responses = pairs.flat().map(target => grainResponse(candidate.light, target, s.diameter, s.blade.roughness))
          const score = responses.reduce((sum, r, i) => sum +
            (i % 2 === 0 ? d.ridge + 0.5 : 0.5 - d.ridge) * (Math.min(1, r.brightness / 0.2) + r.contrast), 0)
          return { ...candidate, responses, score }
        }).sort((a, b) => b.score - a.score)
      const shortlist = new Set(all.slice(0, 48))
      // Retain candidates serving difficult sections, not only the already-bright body.
      for (let i = 0; i < pairs.length * 2; i++) {
        const sorted = [...all].sort((a, b) =>
          Math.min(1, b.responses[i].brightness / 0.2) + b.responses[i].contrast -
          Math.min(1, a.responses[i].brightness / 0.2) - a.responses[i].contrast)
        sorted.slice(0, 4).forEach(candidate => shortlist.add(candidate))
      }
      return [...shortlist]
    })
    let best: Placement = failure, bestScore = -Infinity
    for (const left of ranked[0]) {
      for (const right of ranked[1]) {
        let minimum = 1, total = 0, contrast = 0
        for (let i = 0; i < pairs.length; i++) {
          let coverage = 0
          for (let facet = 0; facet < 2; facet++) {
            const a = left.responses[i * 2 + facet], b = right.responses[i * 2 + facet]
            const weight = facet === 0 ? d.ridge + 0.5 : 0.5 - d.ridge
            coverage += weight * Math.min(1, (a.brightness + b.brightness) / 0.2)
            contrast += weight * (Math.abs(a.normalDifference + b.normalDifference) + 0.35 * Math.abs(a.polishDifference + b.polishDifference))
          }
          minimum = Math.min(minimum, coverage); total += coverage
        }
        const score = minimum * 4 + total / pairs.length * 2 + contrast / pairs.length
        if (score <= bestScore) continue
        if (!clearPaths(s, [left.light, right.light], pairs, camera)) continue
        best = { lights: [left.light, right.light], targets: [left.target, right.target], warning: '',
          coverage: minimum }
        bestScore = score
      }
    }
    return best
  } finally {
    geometry.dispose()
    material.dispose()
  }
}

export function positionAutomaticLights(state: StudioState) {
  if (!state.automaticLightPosition) return { state, warning: '' }
  const result = automaticLightPlacement(state)
  return { state: result.lights ? { ...state, lights: result.lights } : state, warning: result.warning }
}
