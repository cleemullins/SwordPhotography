import { clamp, fieldOfView } from './model'
import type { StudioState } from './model'
import { focusOnBlade } from './framing'

export function prepareSetup(state: StudioState): StudioState {
  const manual = { ...state, automaticLightPosition: false, camera: { ...state.camera, autoExposure: false } }
  return state.scan.locked ? manual : focusOnBlade(manual)
}

export function updateRig(previous: StudioState, next: StudioState): StudioState {
  if (previous.scan.locked && next.scan.locked) {
    return { ...previous, scan: next.scan, blade: { ...previous.blade, x: next.blade.x } }
  }
  return prepareSetup(next)
}

export function scanPlan(state: StudioState) {
  const { start, end, step } = state.scan
  const count = Math.ceil((end - start) / step) + 1
  const at = (index: number) => Math.min(end, start + clamp(index, 0, count - 1) * step)
  const position = state.blade.definition.length / 2 - state.blade.x
  const index = position >= end - 0.05 ? count - 1 : clamp(Math.round((position - start) / step), 0, count - 1)
  const coverage = fieldOfView(state.camera).width
  const maxStep = Math.min(step, end - start)
  return {
    count, at, position, index, coverage,
    overlap: count === 1 ? null : Math.max(0, 1 - maxStep / coverage) * 100,
    gap: Math.max(0, maxStep - coverage),
    previous: at(Math.ceil((position - start) / step) - 1),
    next: at(Math.floor((position - start) / step) + 1),
    onFrame: Math.abs(position - at(index)) < 0.05,
  }
}
