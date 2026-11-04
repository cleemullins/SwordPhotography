import { BufferGeometry, Float32BufferAttribute, DataTexture, RGBAFormat, RepeatWrapping, Vector3, LinearFilter } from 'three'
import type { BladeDefinition, HadaType } from './model'
import { bladePolish, hadaSurface } from './hada'

export const HADA_NORMAL_SCALE = 1 / 32
const TILE_WIDTH = 4096, TILE_HEIGHT = 514

export function bladeSection(d: BladeDefinition, u: number) {
  const tipStart = 1 - d.tipLength / d.length
  if (d.profile) {
    const p = d.profile
    const body = Math.min(1, u / tipStart), tip = Math.max(0, (u - tipStart) / (1 - tipStart))
    const width = (d.width + (p.tipWidth - d.width) * body) * (1 - tip) * (1 + p.fukura * tip)
    const kasane = (p.baseKasane + (p.tipKasane - p.baseKasane) * body) * (1 - tip)
    const curve = u <= p.curvePosition ? 1 - ((u - p.curvePosition) / p.curvePosition) ** 2
      : 1 - ((u - p.curvePosition) / (1 - p.curvePosition)) ** 2
    // The edge is on -Y: positive sori bends toward it, away from the mune.
    const spine = d.width / 2 + d.curvature * (1 - curve)
    return { x: (u - 0.5) * d.length / 1000, y: (spine - width / 2) / 1000,
      width: width / 1000, thickness: kasane * d.thickness / p.baseKasane / 1000 }
  }
  const tip = u > tipStart ? Math.sqrt(Math.max(0.0004, (1 - u) / (1 - tipStart))) : 1
  return {
    x: (u - 0.5) * d.length / 1000,
    y: 4 * d.curvature * (u - 0.5) ** 2 / 1000,
    width: d.width * (1 - d.taper * u) * tip / 1000,
    thickness: d.thickness * (1 - 0.35 * u) * tip / 1000,
  }
}

export function bladeCrossSections(d: BladeDefinition): number[][][] {
  const spine = d.profile ? d.profile.baseKasane / d.thickness / 2 : 0.38
  const steps = d.profile ? 32 : 1
  const bevel = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return [-0.5 + (d.ridge + 0.5) * t, t / 2 + (d.profile?.niku ?? 0) * 4 * t * (1 - t)]
  })
  return [bevel, [[d.ridge, 0.5], [0.5, spine]], [[0.5, spine], [0.5, -spine]],
    [[0.5, -spine], [d.ridge, -0.5]], bevel.toReversed().map(([v, z]) => [v, -z])]
}

function makeProfileBlade(d: BladeDefinition, segments: number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  const tipStart = 1 - d.tipLength / d.length
  const bodySegments = Math.max(2, Math.round(segments * tipStart))
  const ranges = [Array.from({ length: bodySegments + 1 }, (_, i) => i / bodySegments * tipStart),
    Array.from({ length: 65 }, (_, i) => tipStart + (1 - tipStart) * i / 64)]
  const peak = d.profile!.curvePosition
  const peakRange = ranges[peak < tipStart ? 0 : 1]
  if (!peakRange.includes(peak)) { peakRange.push(peak); peakRange.sort((a, b) => a - b) }
  const middleRange = ranges[0.5 < tipStart ? 0 : 1]
  if (!middleRange.includes(0.5)) { middleRange.push(0.5); middleRange.sort((a, b) => a - b) }
  const point = (index: number) => new Vector3().fromArray(positions, index * 3)
  const triangle = (a: number, b: number, c: number) => {
    if (point(b).sub(point(a)).cross(point(c).sub(point(a))).lengthSq() > 1e-24) indices.push(a, b, c)
  }
  for (const cross of bladeCrossSections(d)) for (const range of ranges) {
    const start = positions.length / 3, columns = cross.length
    for (const u of range) {
      const s = bladeSection(d, u)
      for (const [v, z] of cross) {
        positions.push(s.x, s.y + v * s.width, z * s.thickness)
        uvs.push(u, v + 0.5)
      }
    }
    for (let i = 0; i < range.length - 1; i++) for (let j = 0; j < columns - 1; j++) {
      const a = start + i * columns + j
      triangle(a, a + columns, a + 1)
      triangle(a + 1, a + columns, a + columns + 1)
    }
  }
  const s = bladeSection(d, 0), start = positions.length / 3
  positions.push(s.x, s.y, 0); uvs.push(0, 0.5)
  const outline = bladeCrossSections(d).flatMap(cross => cross.slice(0, -1))
  for (const [v, z] of outline) {
    positions.push(s.x, s.y + v * s.width, z * s.thickness); uvs.push(0, v + 0.5)
  }
  for (let i = 0; i < outline.length; i++) triangle(start, start + 1 + (i + 1) % outline.length, start + 1 + i)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

export function makeBlade(d: BladeDefinition, segments = 360): BufferGeometry {
  if (d.profile) return makeProfileBlade(d, segments)
  segments += segments % 2
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  const cross = [[-0.5, 0], [d.ridge, 0.5], [0.5, 0.38], [0.5, -0.38], [d.ridge, -0.5], [-0.5, 0]]
  for (let strip = 0; strip < cross.length - 1; strip++) {
    const start = positions.length / 3
    for (let i = 0; i <= segments; i++) {
      const u = i / segments, s = bladeSection(d, u)
      for (const [v, z] of [cross[strip], cross[strip + 1]]) {
        positions.push(s.x, s.y + v * s.width, z * s.thickness)
        uvs.push(u, v + 0.5)
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  // Separate end caps preserve the bevel and spine normals.
  for (const u of [0, 1]) {
    const s = bladeSection(d, u), start = positions.length / 3
    positions.push(s.x, s.y, 0); uvs.push(u, 0.5)
    for (const [v, z] of cross) {
      positions.push(s.x, s.y + v * s.width, z * s.thickness); uvs.push(u, v + 0.5)
    }
    for (let j = 0; j < cross.length - 1; j++) {
      if (u === 0) indices.push(start, start + j + 2, start + j + 1)
      else indices.push(start, start + j + 1, start + j + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function makeRenderBlade(d: BladeDefinition) {
  const geometry = makeBlade(d)
  const sourcePosition = geometry.getAttribute('position'), sourceNormal = geometry.getAttribute('normal'), sourceUv = geometry.getAttribute('uv')
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
  const vertices = new Map<number, number>(), sourceIndex = geometry.getIndex()!
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const triangle = [sourceIndex.getX(i), sourceIndex.getX(i + 1), sourceIndex.getX(i + 2)]
    const tile = triangle.reduce((sum, id) => sum + sourceUv.getX(id), 0) / 3 < 0.5 ? 0 : 1
    for (const id of triangle) {
      const key = id * 2 + tile
      let vertex = vertices.get(key)
      if (vertex === undefined) {
        vertex = positions.length / 3; vertices.set(key, vertex)
        positions.push(sourcePosition.getX(id), sourcePosition.getY(id), sourcePosition.getZ(id))
        normals.push(sourceNormal.getX(id), sourceNormal.getY(id), sourceNormal.getZ(id))
        uvs.push((1.5 + (sourceUv.getX(id) * 2 - tile) * (TILE_WIDTH - 3)) / TILE_WIDTH,
          (tile * TILE_HEIGHT + 1.5 + sourceUv.getY(id) * (TILE_HEIGHT - 3)) / (TILE_HEIGHT * 2))
      }
      indices.push(vertex)
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

export function makePolishTexture(hada: HadaType = 'none', detail = true, length = 700, bladeWidth = 33, definition?: BladeDefinition) {
  return makeSurfaceTextures(hada, detail, length, bladeWidth, definition, false).polish
}

export function makeBladeTextures(hada: HadaType, detail: boolean, definition: BladeDefinition) {
  const surface = makeSurfaceTextures(hada, detail, definition.length, definition.width, definition, hada !== 'none', true)
  // Two overlapping, padded strips preserve 8K longitudinal detail in the tracer's 4K atlas.
  for (const texture of [surface.polish, surface.normals, surface.reflectance]) {
    if (!texture) continue
    const source = texture.image.data as Uint8Array, width = texture.image.width
    const data = new Uint8Array(TILE_WIDTH * TILE_HEIGHT * 2 * 4)
    for (let tile = 0; tile < 2; tile++) for (let y = 0; y < TILE_HEIGHT; y++) {
      const sourceY = Math.max(0, Math.min(TILE_HEIGHT - 3, y - 1))
      const start = (sourceY * width + tile * (TILE_WIDTH - 3)) * 4
      const destination = (tile * TILE_HEIGHT + y) * TILE_WIDTH * 4
      const end = start + (TILE_WIDTH - 2) * 4
      data.set(source.subarray(start, start + 4), destination)
      data.set(source.subarray(start, end), destination + 4)
      data.set(source.subarray(end - 4, end), destination + (TILE_WIDTH - 1) * 4)
    }
    texture.image = { data, width: TILE_WIDTH, height: TILE_HEIGHT * 2 }
    texture.needsUpdate = true
  }
  return surface
}

function makeSurfaceTextures(hada: HadaType, detail: boolean, length: number, bladeWidth: number, definition: BladeDefinition | undefined, withNormals: boolean, packed = false) {
  const width = packed ? (TILE_WIDTH - 3) * 2 + 1 : hada === 'none' ? 1024 : 4096
  const height = packed ? TILE_HEIGHT - 2 : hada === 'none' ? 128 : 256
  const xDivisor = packed ? width - 1 : width, yDivisor = packed ? height - 1 : height
  const data = new Uint8Array(width * height * 4)
  const reflectance = withNormals ? new Uint8Array(width * height * 4) : null
  const widths = Array.from({ length: width }, (_, i) => Math.max(0.01, definition ? bladeSection(definition, i / xDivisor).width * 1000 : bladeWidth))
  const heights = withNormals ? new Float32Array(width * height) : null
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const u = i / xDivisor, v = j / yDivisor
    let roughness = bladePolish(u, v, detail)
    if (hada !== 'none') {
      const surface = hadaSurface(hada, u * length, (v - 0.5) * widths[i], Math.max(length / width, widths[i] / height))
      roughness *= surface.roughness
      if (heights) heights[j * width + i] = surface.height
      if (reflectance) {
        const k = (j * width + i) * 4, value = Math.round(surface.reflectance * 255)
        reflectance[k] = reflectance[k + 1] = reflectance[k + 2] = value; reflectance[k + 3] = 255
      }
    }
    const k = (j * width + i) * 4
    data[k] = data[k + 1] = data[k + 2] = Math.round(roughness * 255)
    data[k + 3] = 255
  }
  const texture = new DataTexture(data, width, height, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.minFilter = texture.magFilter = LinearFilter
  texture.needsUpdate = true
  const reflectanceTexture = reflectance ? new DataTexture(reflectance, width, height, RGBAFormat) : null
  if (reflectanceTexture) { reflectanceTexture.minFilter = reflectanceTexture.magFilter = LinearFilter; reflectanceTexture.needsUpdate = true }
  return { polish: texture, normals: heights ? normalTexture(heights, width, height, widths, length) : null, reflectance: reflectanceTexture }
}

function normalTexture(heights: Float32Array, width: number, height: number, widths: number[], length: number) {
  const data = new Uint8Array(width * height * 4)
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const left = Math.max(0, i - 1), right = Math.min(width - 1, i + 1)
    const bottom = Math.max(0, j - 1), top = Math.min(height - 1, j + 1)
    // Amplify before 8-bit atlas storage; material.normalScale reverses this after sampling.
    const dx = (heights[j * width + right] - heights[j * width + left]) / ((right - left) * length / (width - 1)) / HADA_NORMAL_SCALE
    const dy = (heights[top * width + i] - heights[bottom * width + i]) / ((top - bottom) * widths[i] / (height - 1)) / HADA_NORMAL_SCALE
    const inverseLength = 1 / Math.hypot(dx, dy, 1), k = (j * width + i) * 4
    data[k] = Math.round((-dx * inverseLength * 0.5 + 0.5) * 255); data[k + 1] = Math.round((-dy * inverseLength * 0.5 + 0.5) * 255)
    const nx = data[k] / 255 * 2 - 1, ny = data[k + 1] / 255 * 2 - 1
    data[k + 2] = Math.round((Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5 + 0.5) * 255); data[k + 3] = 255
  }
  const texture = new DataTexture(data, width, height, RGBAFormat)
  texture.minFilter = texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
