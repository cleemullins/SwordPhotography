import type { HadaType } from './model'

export const HADA_DESCRIPTIONS: Record<HadaType, string> = {
  none: 'No added grain. Existing hamon and polish settings still apply.',
  itame: 'Interwoven fine folds, irregular closed contours and occasional larger flowing grain.',
  mokume: 'Uneven rounded eyes with tightly nested, locally distorted layers.',
  masame: 'Fine longitudinal layers with subtle wandering and intermittent darker strands.',
  ayasugi: 'Nested wave-like folds with naturally varying amplitude and spacing.',
}

export function hamonBoundary(u: number) {
  return 0.16 + 0.035 * Math.sin(u * 116) + 0.015 * Math.sin(u * 281)
}

export function bladePolish(u: number, v: number, detail: boolean) {
  if (!detail) return 1
  const boundary = hamonBoundary(u)
  const hamon = Math.exp(-(((v - boundary) / 0.028) ** 2))
  const variation = 0.025 * Math.sin(u * 1400 + Math.sin(v * 140) * 2)
  return Math.min(1, 0.62 + 0.32 * hamon + variation + (v < boundary ? 0.08 : 0))
}

function jitter(x: number, y: number, seed: number) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const ease = (t: number) => t * t * (3 - 2 * t)
  const u = ease(x - ix), v = ease(y - iy)
  const a = jitter(ix, iy, 83) * (1 - u) + jitter(ix + 1, iy, 83) * u
  const b = jitter(ix, iy + 1, 83) * (1 - u) + jitter(ix + 1, iy + 1, 83) * u
  return a * (1 - v) + b * v
}

function grainPhase(type: Exclude<HadaType, 'none'>, x: number, y: number): number {
  switch (type) {
    case 'masame':
      return y / 0.55 + 0.35 * noise(x / 60, y / 4) + 0.12 * noise(x / 24, y / 1.5)
    case 'ayasugi': {
      const along = x + 0.65 * noise(x / 30, y / 8)
      const amplitude = 2.4 * (0.85 + 0.3 * noise(x / 40, y / 12))
      return (y + amplitude * Math.cos(along * Math.PI / 9) +
        0.22 * Math.cos(along * Math.PI / 4.5) + 0.15 * noise(x / 6, y / 3)) / 0.65
    }
    case 'itame': {
      const along = x + 3 * (noise(x / 9, y / 4) - 0.5)
      const across = y + 1.4 * (noise(x / 7, y / 3) - 0.5)
      return 15 * noise(along / 6, across / 2.4) +
        3 * noise(along / 2.1, across / 0.9) + across / 2.5
    }
    case 'mokume': {
      const px = (x + 1.2 * noise(x / 5, y / 3)) / 7
      const py = (y + 0.65 * noise(x / 4, y / 2)) / 4
      const cx = Math.floor(px), cy = Math.floor(py)
      let nearest = Infinity
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
        const dx = px - i - 0.2 - jitter(i, j, 17) * 0.6
        const dy = py - j - 0.2 - jitter(i, j, 41) * 0.6
        const distance = dx * dx + dy * dy
        const blend = Math.max(0.12 - Math.abs(distance - nearest), 0) / 0.12
        nearest = Math.min(nearest, distance) - blend * blend * 0.03
      }
      return Math.sqrt(Math.max(0, nearest)) * 12 + 0.25 * noise(x / 1.5, y / 0.8)
    }
  }
}

function layers(phase: number) {
  const broad = (0.5 + 0.5 * Math.cos(phase * 2 * Math.PI)) ** 4
  const fine = (0.5 + 0.5 * Math.cos((phase * 2.17 + 0.13 * Math.sin(phase * 0.71)) * 2 * Math.PI)) ** 6
  return 0.68 * broad + 0.32 * fine
}

// Millimeter coordinates on the unwrapped steel, not image-space noise.
export function hadaGrain(type: HadaType, x: number, y: number): number {
  return type === 'none' ? 0.5 : layers(grainPhase(type, x, y))
}

export function hadaSurface(type: Exclude<HadaType, 'none'>, x: number, y: number, footprint: number) {
  const phase = grainPhase(type, x, y), grain = layers(phase)
  const activity = noise(x / 3, y / 1.7)
  const chikei = (0.5 + 0.5 * Math.cos(phase * 2 * Math.PI)) ** 16 * Math.max(0, (activity - 0.42) / 0.58)
  const cell = 0.22, ix = Math.floor(x / cell), iy = Math.floor(y / cell)
  const dx = x / cell - ix - (0.3 + 0.4 * jitter(ix, iy, 113))
  const dy = y / cell - iy - (0.3 + 0.4 * jitter(ix, iy, 197))
  const inclusion = jitter(ix, iy, 317)
  const nie = inclusion > 0.72 ? Math.exp(-(dx * dx + dy * dy) / 0.018) * (inclusion - 0.72) / 0.28 : 0
  // Unresolved microfacets contribute polish variation, not aliased pinprick normals.
  const resolved = Math.max(0, Math.min(1, cell / (2 * footprint) - 0.5))
  return {
    grain,
    roughness: 0.5 + 0.46 * grain + 0.04 * activity - 0.07 * chikei - 0.08 * nie * resolved,
    reflectance: 0.76 + 0.2 * grain + 0.035 * activity - 0.07 * chikei,
    height: 0.0009 * grain + 0.00025 * chikei + 0.00035 * nie * resolved,
  }
}
