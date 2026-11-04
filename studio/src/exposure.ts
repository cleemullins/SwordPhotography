import { clamp, LIMITS } from './model'
import type { StudioState } from './model'

export interface ExposureReading {
  shutter: number
  status: string
}

export const SHUTTER_SPEEDS = [
  ...[8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400,
    320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4].map(n => 1 / n),
  0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30,
]

export function shutterStep(seconds: number) {
  return SHUTTER_SPEEDS.reduce((nearest, speed, i) =>
    Math.abs(Math.log2(speed / seconds)) < Math.abs(Math.log2(SHUTTER_SPEEDS[nearest] / seconds)) ? i : nearest, 0)
}

export function meterBlade(pixels: ArrayLike<number>, camera: StudioState['camera']): ExposureReading {
  const luminance: number[] = [], peaks: number[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 0.5) continue
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    if (![r, g, b].every(Number.isFinite)) throw new Error('Non-finite radiance in the exposure meter.')
    luminance.push(Math.max(0, r * 0.2126 + g * 0.7152 + b * 0.0722))
    peaks.push(Math.max(0, r, g, b))
  }
  if (luminance.length < 32) return { shutter: camera.shutter, status: 'Not enough blade in view to meter. Reframe the blade.' }
  luminance.sort((a, b) => a - b); peaks.sort((a, b) => a - b)
  const percentile = (values: number[], p: number) => values[Math.floor((values.length - 1) * p)]
  const highlight = percentile(peaks, 0.99), middle = percentile(luminance, 0.7)
  if (highlight < 1e-8) return { shutter: camera.shutter, status: 'Blade is dark. Enable or reposition the lights.' }
  const targetGain = Math.min(middle > 1e-8 ? 0.45 / middle : Infinity, 0.95 / highlight)
  const apertureGain = camera.compensate ? 1 : (5.6 / camera.aperture) ** 2
  // Exposure EV is user bias; the shutter meters the neutral target at fixed ISO 100.
  const desired = targetGain / (125 * apertureGain)
  const bounded = clamp(desired, ...LIMITS.shutter)
  const delta = Math.log2(bounded / camera.shutter)
  if (Math.abs(delta) < 0.08) return { shutter: highlight * camera.shutter * 125 * apertureGain > 0.95 ? Math.min(camera.shutter, bounded) : camera.shutter,
    status: desired !== bounded ? 'At shutter limit. Adjust lighting to reach the target.' : 'Exposure settled on blade details.' }
  return { shutter: clamp(camera.shutter * 2 ** clamp(delta, -1, 1), ...LIMITS.shutter), status: 'Adjusting shutter for blade detail...' }
}

export function shutterLabel(seconds: number) {
  return seconds < 0.25 ? `1/${Math.round(1 / seconds)} s` : `${Number(seconds.toFixed(3))} s`
}
