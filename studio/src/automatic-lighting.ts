import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { bladeSection, makeBlade } from './blade'
import { bladePolish, hamonBoundary } from './hada'
import { clamp, exposureScale, fieldOfView, LIMITS, TUBE_LENGTH, TUBE_RADIANCE, withCenteredTubes } from './model'
import type { LightSettings, StudioState } from './model'

export interface ReflectionTarget {
  point: Vector3
  normal: Vector3
  direction: Vector3
}
interface SurfaceTarget extends ReflectionTarget { roughness: number }

type Placement = { lights: StudioState['lights']; targets: [ReflectionTarget, ReflectionTarget]; warning: ''; coverage: number; uniformity: number }
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
  const floor = Math.max(LIMITS.lightHeight[0], radius + s.blade.definition.thickness / 2 + 5)
  const ceiling = Math.min(LIMITS.lightHeight[1], s.camera.height - radius)
  const interval: [number, number] = [s.diameter + 10, Infinity]
  if (ceiling <= floor || direction.z <= 0 ||
    !clipAxis(point.x, direction.x, s.lights[index].x - TUBE_LENGTH / 2, s.lights[index].x + TUBE_LENGTH / 2, interval) ||
    !clipAxis(point.y, direction.y, ...LIMITS.y, interval) ||
    !clipAxis(point.z, direction.z, floor, ceiling, interval)) return []
  const preferred = clamp((s.camera.height * 0.8 - point.z) / direction.z, ...interval)
  const distances = [...new Set([preferred,
    ...[40, 60, 75, 90, 105, 120, 135, 150, 165, 180, 210, 250, 320, 400, 550, 700, 1000].map(height => clamp((height - point.z) / direction.z, ...interval))])]
  const sideways = new Vector3(0, direction.z, -direction.y).normalize()
  return distances.flatMap(distance => [-0.9, 0.9, 0].map(edge => {
    const center = point.clone().addScaledVector(direction, distance)
      .addScaledVector(sideways, edge * radius)
    return { ...s.lights[index], brightness: s.lights[index].enabled ? 100 : s.lights[index].brightness,
      y: clamp(center.y, ...LIMITS.y), height: clamp(center.z, floor, ceiling) }
  })).filter(light => {
    const emissionX = point.x + direction.x * (light.height - point.z) / direction.z
    return Math.abs(emissionX - light.x) <= TUBE_LENGTH / 2 && light.height - radius > s.blade.definition.thickness / 2 + 5
  })
}

// The projected GGX marginal falls faster than a Cauchy lobe outside the tube.
export function grainContrastScore(light: LightSettings, target: ReflectionTarget, diameter: number, roughness: number) {
  return grainResponse(light, target, diameter, roughness).contrast
}

function grainResponse(light: LightSettings, target: ReflectionTarget, diameter: number, roughness: number, grain = true) {
  const y = light.y - target.point.y, z = light.height - target.point.z
  const distance = Math.hypot(y, z)
  const gain = light.enabled ? light.brightness / 100 : 0
  if (gain === 0 || distance <= diameter / 2 || target.direction.z <= 0) return { contrast: 0, brightness: 0, peak: 0, normalDifference: 0, polishDifference: 0 }
  const halfWidth = Math.asin(diameter / 2 / distance)
  const angle = Math.atan2(y, z) - Math.atan2(target.direction.y, target.direction.z)
  const response = (offset: number, polish: number) => {
    const scale = Math.max(0.0005, 2 * polish * polish)
    const along = Math.atan2(target.direction.x, Math.hypot(target.direction.y, target.direction.z))
    const start = Math.atan2(light.x - TUBE_LENGTH / 2 - target.point.x, distance)
    const end = Math.atan2(light.x + TUBE_LENGTH / 2 - target.point.x, distance)
    const integral = (angle: number) => angle / Math.sqrt(angle * angle + scale * scale)
    const longitudinal = (integral(end - along) - integral(start - along)) / 2
    return gain * longitudinal * (integral(offset + halfWidth) - integral(offset - halfWidth)) / 2
  }
  const polish = roughness * (grain ? 0.72 : 1), mean = response(angle, polish)
  const normalDifference = response(angle + 0.002, polish) - response(angle - 0.002, polish)
  const smooth = roughness * (grain ? 0.48 : 1)
  const sharp = response(angle, smooth), broad = response(angle, roughness)
  const polishDifference = sharp - broad
  // Coverage must include the sharper grains, not just the average polish lobe.
  const normalSpread = grain ? 0.02 : 0.002
  const brightness = Math.min(mean, response(angle - normalSpread, smooth), response(angle + normalSpread, smooth))
  return { contrast: (Math.abs(normalDifference) + 0.35 * Math.abs(polishDifference)) * Math.min(1, mean / 0.2),
    brightness, peak: Math.max(mean, sharp, broad), normalDifference, polishDifference }
}

function clearCameraPaths(s: StudioState, lights: StudioState['lights'], pairs: SurfaceTarget[][], camera: Vector3) {
  const radius = s.diameter / 2
  if (Math.abs(lights[0].x - lights[1].x) < TUBE_LENGTH &&
    Math.hypot(lights[0].y - lights[1].y, lights[0].height - lights[1].height) < s.diameter + 5) return false
  for (const light of lights) {
    const pupilRadius = s.camera.focalLength / s.camera.aperture / 2
    if (Math.abs(light.x) < TUBE_LENGTH / 2 + pupilRadius &&
      Math.hypot(light.y, light.height - camera.z) < radius + pupilRadius + 5) return false
    if (pairs.some(targets => targets.some(t => tubeBlocksSegment(light, radius, camera, t.point)))) return false
  }
  return true
}

function visibleResponses(s: StudioState, light: LightSettings, other: LightSettings, targets: SurfaceTarget[], responses: ReturnType<typeof grainResponse>[]) {
  return responses.map((response, i) => {
    if (response.peak === 0) return response
    const target = targets[i]
    const emissionX = target.point.x + target.direction.x * (light.height - target.point.z) / target.direction.z
    const emission = new Vector3(clamp(emissionX, light.x - TUBE_LENGTH / 2, light.x + TUBE_LENGTH / 2), light.y, light.height)
    if (!tubeBlocksSegment(other, s.diameter / 2, target.point, emission)) return response
    // Occlusion removes this source's contribution here, not the entire candidate rig.
    return { contrast: 0, brightness: 0, peak: 0, normalDifference: 0, polishDifference: 0 }
  })
}

function assessPair(left: ReturnType<typeof grainResponse>[], right: ReturnType<typeof grainResponse>[], sectionsCount: number, leftGain = 1, rightGain = 1) {
  let minimum = Infinity, peak = 0, total = 0, contrast = 0, essentialCoverage = 1
  const radianceCeiling = Math.max(left.some(r => r.peak > 0) ? leftGain : 0, right.some(r => r.peak > 0) ? rightGain : 0)
  // Overlapping projected lobes cannot make passive steel brighter than its brightest emitter.
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.min(radianceCeiling, left[i].peak * leftGain + right[i].peak * rightGain))
  const useful = Math.max(0.02, peak * 0.15)
  const bands = Array<number>(8).fill(0), sections = Array<number>(sectionsCount).fill(0)
  for (let i = 0; i < left.length; i++) {
    const a = left[i], b = right[i], light = Math.min(radianceCeiling, a.brightness * leftGain + b.brightness * rightGain)
    minimum = Math.min(minimum, light)
    const covered = Math.min(1, light / useful)
    // Do not trade away the ha or grain-bearing ji at the kissaki for a brighter body.
    if (i % 8 === 1 || i % 8 === 4) essentialCoverage = Math.min(essentialCoverage, covered)
    total += covered; bands[i % 8] += covered; sections[Math.floor(i / 8)] += covered
    contrast += Math.abs(a.normalDifference * leftGain + b.normalDifference * rightGain) +
      0.35 * Math.abs(a.polishDifference * leftGain + b.polishDifference * rightGain)
  }
  const regionCoverage = Math.min(...bands) / sectionsCount, sectionCoverage = Math.min(...sections) / 8
  const uniformity = minimum / Math.max(0.001, peak)
  const score = 4 * Math.sqrt(essentialCoverage) + 4 * Math.sqrt(regionCoverage) + 4 * Math.sqrt(sectionCoverage) + Math.sqrt(uniformity) +
    2 * total / left.length + 0.15 * contrast / (left.length * Math.max(0.001, peak)) + 0.05 * Math.min(1, peak)
  return { score, coverage: Math.min(regionCoverage, sectionCoverage), uniformity }
}

export function automaticLightPlacement(input: StudioState): Placement {
  const s = withCenteredTubes(input)
  if (!s.lights.some(light => light.enabled)) return {
    lights: null, targets: null,
    warning: 'Automatic placement needs at least one enabled tube. Previous positions are retained.',
  }
  const d = s.blade.definition, coverage = fieldOfView(s.camera)
  const camera = new Vector3(0, 0, s.camera.height)
  const failure: Placement = {
    lights: null, targets: null,
    warning: 'Automatic placement cannot find a clear fixed rig at or below the camera within the rig limits. Previous positions are retained. Reframe across the blade, raise the camera, or use manual positioning.',
  }
  const geometry = makeBlade(d), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material)
  mesh.position.y = s.blade.y / 1000
  const raycaster = new Raycaster()
  const tipStart = 1 - d.tipLength / d.length
  const sections = [...Array.from({ length: 17 }, (_, i) => 0.01 + i / 16 * (tipStart - 0.02)),
    ...[0.15, 0.5, 0.85].map(f => tipStart + f * (1 - tipStart))]
  try {
    const pairs: SurfaceTarget[][] = []
    for (const u of sections) {
      // Simulate the table bringing each section under the same stationary camera.
      mesh.position.x = (0.5 - u) * d.length / 1000
      mesh.updateMatrixWorld()
      const section = bladeSection(d, u)
      const hamon = hamonBoundary(u), ridge = d.ridge + 0.5
      const targets = [0.025, hamon * 0.6, hamon, hamon + 0.06, (hamon + ridge) / 2,
        ridge - 0.035, ridge + (1 - ridge) * 0.35, 0.97].map(v => {
        raycaster.set(new Vector3(section.x + mesh.position.x, section.y + (v - 0.5) * section.width + mesh.position.y, s.camera.height / 1000),
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
        return { point, normal, direction, roughness: s.blade.roughness * bladePolish(u, v, s.blade.detail) }
      })
      const visibleTargets = targets.filter((t): t is SurfaceTarget => t !== null)
      if (visibleTargets.length !== targets.length) return failure
      pairs.push(visibleTargets)
    }
    const targets = pairs.flat()
    const ranked = ([0, 1] as const).map(index => {
      const seen = new Set<string>()
      const all = targets.flatMap(target => candidates(s, target, index).map(light => ({ light, target })))
        .filter(({ light }) => {
          const key = `${light.y.toFixed(1)},${light.height.toFixed(1)}`
          if (seen.has(key)) return false
          seen.add(key)
          return !pairs.some(pair => pair.some(target => tubeBlocksSegment(light, s.diameter / 2, camera, target.point)))
        }).map(candidate => {
          const responses = targets.map(target => grainResponse(candidate.light, target, s.diameter, target.roughness, s.blade.hada !== 'none'))
          const score = responses.reduce((sum, r) => sum + Math.min(1, r.brightness / 0.2) + r.contrast, 0)
          return { ...candidate, responses, score }
        }).sort((a, b) => b.score - a.score)
      const shortlist = new Set(all.slice(0, 48))
      // Retain candidates serving difficult sections, not only the already-bright body.
      for (let i = 0; i < targets.length; i++) {
        const sorted = [...all].sort((a, b) =>
          Math.min(1, b.responses[i].brightness / 0.2) + b.responses[i].contrast -
          Math.min(1, a.responses[i].brightness / 0.2) - a.responses[i].contrast)
        sorted.slice(0, 1).forEach(candidate => shortlist.add(candidate))
      }
      return [...shortlist]
    })
    type Candidate = (typeof ranked)[number][number]
    const finalists: { left: Candidate; right: Candidate; score: number }[] = []
    for (const left of ranked[0]) {
      for (const right of ranked[1]) {
        const { score } = assessPair(left.responses, right.responses, pairs.length)
        if (finalists.length === 64 && score <= finalists[63].score) continue
        if (!clearCameraPaths(s, [left.light, right.light], pairs, camera)) continue
        finalists.push({ left, right, score }); finalists.sort((a, b) => b.score - a.score)
        if (finalists.length > 64) finalists.pop()
      }
    }
    let best: Placement = failure, bestScore = -Infinity
    const ratios: [number, number][] = [[1, 1]]
    for (const power of [0.75, 0.5, 0.25, 0.1]) ratios.push([1, power], [power, 1])
    for (const { left, right } of finalists) {
      const leftVisible = visibleResponses(s, left.light, right.light, targets, left.responses)
      const rightVisible = visibleResponses(s, right.light, left.light, targets, right.responses)
      for (const [leftGain, rightGain] of ratios) {
        const result = assessPair(leftVisible, rightVisible, pairs.length, leftGain, rightGain)
        if (result.score <= bestScore) continue
        const totalGain = (left.light.enabled ? leftGain : 0) + (right.light.enabled ? rightGain : 0)
        const shortestExposure = exposureScale({ ...s.camera, shutter: LIMITS.shutter[0] })
        const powerScale = Math.min(1, 0.9 / (TUBE_RADIANCE * totalGain * shortestExposure))
        best = { lights: [
          { ...left.light, brightness: left.light.enabled ? 100 * leftGain * powerScale : s.lights[0].brightness },
          { ...right.light, brightness: right.light.enabled ? 100 * rightGain * powerScale : s.lights[1].brightness },
        ], targets: [left.target, right.target], warning: '', coverage: result.coverage, uniformity: result.uniformity }
        bestScore = result.score
      }
    }
    return best
  } finally {
    geometry.dispose()
    material.dispose()
  }
}

export function positionAutomaticLights(input: StudioState) {
  const state = withCenteredTubes(input)
  if (!state.automaticLightPosition) return { state, warning: '' }
  const result = automaticLightPlacement(state)
  return { state: result.lights ? { ...state, lights: result.lights } : state, warning: result.warning }
}
