import { bladeSection } from './blade'
import { clamp, fieldOfView, LIMITS, SENSOR } from './model'
import type { StudioState } from './model'

function ridgeHeight(blade: StudioState['blade']) {
  return bladeSection(blade.definition, clamp(0.5 - blade.x / blade.definition.length, 0, 1)).thickness * 500
}

export function focusOnBlade(state: StudioState): StudioState {
  const focus = state.camera.height - ridgeHeight(state.blade)
  return state.camera.focus === focus ? state : { ...state, camera: { ...state.camera, focus } }
}

export function cameraForCoverage(state: StudioState, width: number) {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Frame coverage must be a positive, finite length.')
  const { camera, blade } = state
  const depth = ridgeHeight(blade)
  // Invert the focused thin-lens projection while focusing on the blade ridge.
  const k = width * camera.focalLength / SENSOR.width
  const sum = depth + camera.focalLength + k
  const requestedHeight = (sum + Math.sqrt(sum * sum - 4 * k * depth)) / 2
  const height = clamp(requestedHeight, ...LIMITS.height), focus = height - depth
  const focalLength = height === requestedHeight ? camera.focalLength :
    clamp(SENSOR.width * height * focus / (width * focus + SENSOR.width * height), ...LIMITS.focalLength)
  const next = { ...camera, height, focus, focalLength }
  const actualWidth = fieldOfView(next).width
  return {
    camera: next,
    warning: Math.abs(actualWidth - width) > 0.5
      ? `Coverage limited to ${(actualWidth / 10).toFixed(2)} cm by the camera height and 20-135 mm lens limits.`
      : '',
  }
}
