import { clamp, LIMITS } from './model'
import type { StudioState } from './model'

export type SetupTarget = 'camera' | 0 | 1
export interface SetupPosition { y: number; height: number }
export interface SetupProjection { scale: number; center: number; floor: number }

export function setupProjection(state: StudioState): SetupProjection {
  const extent = Math.max(1, Math.abs(state.blade.y) + state.blade.definition.width / 2 + state.blade.definition.curvature,
    ...state.lights.map(l => Math.abs(l.y) + state.diameter / 2))
  const height = Math.max(state.camera.height, ...state.lights.map(l => l.height + state.diameter / 2))
  const belowFloor = Math.max(0, ...state.lights.map(l => state.diameter / 2 - l.height))
  return { scale: Math.min(145 / extent, 270 / height, belowFloor > 0 ? 24 / belowFloor : Infinity), center: 230, floor: 330 }
}

export function setupPointFits(state: StudioState, target: SetupTarget, position: SetupPosition, projection: SetupProjection) {
  const radius = target === 'camera' ? 23 : Math.max(23, state.diameter / 2 * projection.scale)
  const x = projection.center + position.y * projection.scale, y = projection.floor - position.height * projection.scale
  return x - radius >= 60 && x + radius <= 408 && y - Math.max(38, radius) >= 8 && y + radius <= 360
}

export function setupDragProjection(state: StudioState, target: SetupTarget, position: SetupPosition, projection: SetupProjection): SetupProjection {
  if (setupPointFits(state, target, position, projection)) return projection
  const next = structuredClone(state)
  if (target === 'camera') next.camera.height = position.height
  else Object.assign(next.lights[target], position)
  return { ...projection, scale: Math.min(projection.scale, setupProjection(next).scale * 0.9) }
}

export function setupPosition(state: StudioState, target: SetupTarget): SetupPosition {
  return target === 'camera' ? { y: 0, height: state.camera.height } : {
    y: state.lights[target].y, height: state.lights[target].height,
  }
}

export function moveSetupPosition(target: SetupTarget, start: SetupPosition, dx: number, dy: number, scale: number): SetupPosition {
  const round = (value: number) => Math.round(value * 10) / 10
  const [minHeight, maxHeight] = target === 'camera' ? LIMITS.height : LIMITS.lightHeight
  return {
    y: target === 'camera' ? 0 : clamp(round(start.y + dx / scale), ...LIMITS.y),
    height: clamp(round(start.height - dy / scale), minHeight, maxHeight),
  }
}
