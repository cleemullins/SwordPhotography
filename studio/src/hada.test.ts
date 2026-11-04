import { describe, expect, it } from 'vitest'
import { defaultState, HADA_TYPES, parseSetup } from './model'
import type { HadaType } from './model'
import { hadaGrain, hadaSurface } from './hada'
import { makePolishTexture, makeBladeTextures, makeRenderBlade, bladeSection, HADA_NORMAL_SCALE } from './blade'

const types = Object.keys(HADA_TYPES) as HadaType[]

describe('hada settings', () => {
  it('defaults legacy setups to no added grain and rejects unknown types', () => {
    const s = defaultState()
    const { hada: _, ...legacy } = s.blade
    expect(parseSetup({ ...s, blade: legacy }).blade.hada).toBe('none')
    for (const hada of [null, 1, 'wood', 'constructor']) {
      expect(() => parseSetup({ ...s, blade: { ...s.blade, hada } })).toThrow('Unknown hada type')
    }
  })
  it.each(types)('round-trips %s separately from blade dimensions and hamon', hada => {
    const s = defaultState()
    s.blade.hada = hada; s.blade.detail = false
    const restored = parseSetup(JSON.parse(JSON.stringify(s)))
    expect(restored).toEqual(s)
    expect(restored.blade.definition).toEqual(defaultState().blade.definition)
  })
})

describe('procedural grain', () => {
  it.each(types)('encodes %s as finite, subtle unit normals rather than painted color', type => {
    const surface = makeBladeTextures(type, false, defaultState().blade.definition)
    const texture = surface.normals
    surface.polish.dispose(); surface.reflectance?.dispose()
    if (type === 'none') { expect(texture).toBeNull(); return }
    const data = texture!.image.data as Uint8Array
    let maxSlope = 0
    for (let i = 0; i < data.length; i += 268) {
      const x = data[i] / 255 * 2 - 1, y = data[i + 1] / 255 * 2 - 1, z = data[i + 2] / 255 * 2 - 1
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 2)
      maxSlope = Math.max(maxSlope, Math.hypot(x, y) * HADA_NORMAL_SCALE / z)
    }
    expect(maxSlope).toBeGreaterThan(0.001)
    expect(maxSlope).toBeLessThan(0.04)
    expect(texture!.colorSpace).toBe('')
    texture!.dispose()
  }, 20_000)
  it('packs full-length detail into 4K atlas tiles without crossing UV seams or changing normals', () => {
    const d = defaultState().blade.definition, mesh = makeRenderBlade(d)
    const uv = mesh.getAttribute('uv'), position = mesh.getAttribute('position'), normal = mesh.getAttribute('normal'), indices = mesh.getIndex()!
    const seam = new Map<number, number[]>()
    for (let i = 0; i < indices.count; i += 3) {
      const ys = [0, 1, 2].map(j => uv.getY(indices.getX(i + j)))
      expect(ys.every(v => v < 0.5) || ys.every(v => v > 0.5)).toBe(true)
    }
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) > 1e-8) continue
      const key = position.getY(i) * 1000 + position.getZ(i)
      const n = [normal.getX(i), normal.getY(i), normal.getZ(i)]
      const previous = seam.get(key)
      if (previous && uv.getY(i) > 0.5) expect(n).toEqual(previous)
      else seam.set(key, n)
    }
    expect(seam.size).toBeGreaterThan(0)
    const surface = makeBladeTextures('itame', false, d)
    for (const texture of [surface.polish, surface.normals!, surface.reflectance!]) {
      expect(texture.image.width).toBe(4096); expect(texture.image.height).toBe(1028)
      const data = texture.image.data as Uint8Array
      for (let y = 1; y < 513; y += 17) {
        const left = (y * 4096 + 4094) * 4, right = ((y + 514) * 4096 + 1) * 4
        expect(Array.from(data.slice(left, left + 4))).toEqual(Array.from(data.slice(right, right + 4)))
      }
      texture.dispose()
    }
    mesh.dispose()
  }, 20_000)
  it('keeps transverse grain scale tied to actual tapered width', () => {
    const d = defaultState().blade.definition
    const texture = makePolishTexture('itame', false, d.length, d.width, d)
    const data = texture.image.data as Uint8Array, x = 3300, y = 180
    const u = x / texture.image.width, v = y / texture.image.height
    const width = bladeSection(d, u).width * 1000
    const surface = hadaSurface('itame', u * d.length, (v - 0.5) * width, Math.max(d.length / texture.image.width, width / texture.image.height))
    expect(data[(y * texture.image.width + x) * 4 + 1]).toBe(Math.round(255 * surface.roughness))
    texture.dispose()
  })
  it('is deterministic, bounded and distinct for every type', () => {
    const signatures = new Set<string>()
    for (const type of types) {
      const samples = Array.from({ length: 400 }, (_, i) => hadaGrain(type, i * 0.43 - 50, (i % 31) * 0.7 - 10))
      for (const sample of samples) { expect(sample).toBeGreaterThanOrEqual(0); expect(sample).toBeLessThanOrEqual(1) }
      expect(samples).toEqual(Array.from({ length: 400 }, (_, i) => hadaGrain(type, i * 0.43 - 50, (i % 31) * 0.7 - 10)))
      signatures.add(JSON.stringify(samples))
    }
    expect(signatures.size).toBe(types.length)
  })
  it('runs masame parallel to the blade length', () => {
    let longitudinal = 0, across = 0
    for (let i = 0; i < 200; i++) {
      const x = i * 0.79, y = (i % 29) * 0.41
      longitudinal += Math.abs(hadaGrain('masame', x + 0.25, y) - hadaGrain('masame', x, y))
      across += Math.abs(hadaGrain('masame', x, y + 0.25) - hadaGrain('masame', x, y))
    }
    expect(longitudinal).toBeLessThan(across * 0.02)
  })
  it('varies successive ayasugi waves instead of stamping identical repeats', () => {
    let difference = 0
    for (let i = 0; i < 100; i++) difference += Math.abs(hadaGrain('ayasugi', i + 18, i / 7) - hadaGrain('ayasugi', i, i / 7))
    expect(difference / 100).toBeGreaterThan(0.03)
  })
  it('keeps microstructure bounded and reduces unresolved normal detail', () => {
    for (const type of ['itame', 'mokume', 'masame', 'ayasugi'] as const) {
      let resolvedDetail = 0
      for (let i = 0; i < 1000; i++) {
        const fine = hadaSurface(type, i * 0.061, (i % 17) * 0.093, 0.02)
        const coarse = hadaSurface(type, i * 0.061, (i % 17) * 0.093, 0.5)
        expect(fine.roughness).toBeGreaterThan(0.4); expect(fine.roughness).toBeLessThanOrEqual(1)
        expect(fine.reflectance).toBeGreaterThan(0.65); expect(fine.reflectance).toBeLessThanOrEqual(1)
        expect(fine.height).toBeGreaterThanOrEqual(0); expect(fine.height).toBeLessThan(0.00165)
        expect(fine.height).toBeGreaterThanOrEqual(coarse.height)
        resolvedDetail += fine.height - coarse.height
      }
      expect(resolvedDetail).toBeGreaterThan(0.0001)
    }
  })
  it.each(types)('uploads %s as linear roughness, independently of hamon', type => {
    const texture = makePolishTexture(type, false)
    const data = texture.image.data as Uint8Array
    let min = 255, max = 0
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i + 1]); max = Math.max(max, data[i + 1])
    }
    expect(texture.colorSpace).toBe('')
    if (type === 'none') expect(min).toBe(255)
    else { expect(min).toBeGreaterThanOrEqual(102); expect(max - min).toBeGreaterThan(85) }
    const x = 177, y = 61, u = x / texture.image.width, v = y / texture.image.height
    const expected = type === 'none' ? 255 : Math.round(255 * hadaSurface(type, u * 700, (v - 0.5) * 33, Math.max(700 / texture.image.width, 33 / texture.image.height)).roughness)
    expect(data[(y * texture.image.width + x) * 4 + 1]).toBe(expected)
    texture.dispose()
  }, 20_000)
  it('preserves the original polish map when hada is off', () => {
    const texture = makePolishTexture()
    const data = texture.image.data as Uint8Array
    expect(texture.image.width).toBe(1024); expect(texture.image.height).toBe(128)
    for (const [i, j] of [[0, 0], [113, 24], [721, 93]]) {
      const u = i / 1024, v = j / 128
      const boundary = 0.16 + 0.035 * Math.sin(u * 116) + 0.015 * Math.sin(u * 281)
      const hamon = Math.exp(-(((v - boundary) / 0.028) ** 2))
      const grain = 0.025 * Math.sin(u * 1400 + Math.sin(v * 140) * 2)
      const expected = Math.round(255 * Math.min(1, 0.62 + 0.32 * hamon + grain + (v < boundary ? 0.08 : 0)))
      expect(data[(j * 1024 + i) * 4 + 1]).toBe(expected)
    }
    texture.dispose()
  })
})
