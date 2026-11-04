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

export function protectHighlights(pixels: ArrayLike<number>, camera: StudioState['camera']): ExposureReading {
  let peak = 0, count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= 0) continue
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    if (![r, g, b].every(Number.isFinite)) throw new Error('Non-finite radiance in the highlight meter.')
    peak = Math.max(peak, r, g, b); count += pixels[i + 3]
  }
  if (count < 32) return { shutter: camera.shutter, status: 'Not enough blade in view for Auto shutter.' }
  if (peak < 1e-8) return { shutter: camera.shutter, status: 'Blade is dark. Enable or reposition the lights.' }
  const apertureGain = camera.compensate ? 1 : (5.6 / camera.aperture) ** 2
  const desired = 0.9 / (peak * 125 * 2 ** camera.exposure * apertureGain)
  const shutter = clamp(desired, ...LIMITS.shutter)
  return { shutter, status: shutter !== desired ? 'Auto shutter at its limit; adjust lighting, aperture or EV.' : 'Auto shutter: brightest blade highlight held at 90% of clipping.' }
}

export function shutterLabel(seconds: number) {
  return seconds < 0.25 ? `1/${Math.round(1 / seconds)} s` : `${Number(seconds.toFixed(3))} s`
}
