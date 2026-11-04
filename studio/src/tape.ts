import { fieldOfView } from './model'
import type { StudioState } from './model'
import { bladeSection } from './blade'

export function tapeMarks(length: number, start = 0, step = 1, majorStep = 10) {
  return Array.from({ length: Math.max(0, Math.floor(length / step) + 1) }, (_, i) => {
    const mm = start + i * step
    return { mm, major: mm % majorStep === 0, half: mm % (majorStep / 2) === 0,
      label: mm % majorStep === 0 ? String(mm / 10) : '' }
  })
}

function niceStep(minimum: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, minimum)))
  return [1, 2, 5, 10].map(v => v * magnitude).find(v => v >= minimum) ?? 10 * magnitude
}

export function metricTapeLayout(state: StudioState, width: number, height: number, pixelScale = 1) {
  if (!(width > 0 && height > 0 && pixelScale > 0)) throw new Error('Metric tape requires positive image dimensions.')
  const fov = fieldOfView(state.camera), coverage = fov.width
  const position = state.blade.definition.length / 2 - state.blade.x
  const margin = 12 * pixelScale, barHeight = 44 * pixelScale
  // Both profiles reach maximum spine Y at the base; the old tape's near edge was 3 mm beyond it.
  const base = bladeSection(state.blade.definition, 0)
  const nearEdge = state.blade.y + (base.y + base.width / 2) * 1000 + 3
  const projectedY = height * (0.5 - nearEdge / fov.height) - barHeight
  const y = Math.max(margin + 14 * pixelScale, Math.min(height - margin - barHeight, projectedY))
  const pixelsPerMm = width / coverage
  const minor = niceStep(2 * pixelScale / pixelsPerMm)
  const major = Math.max(10, niceStep(42 * pixelScale / pixelsPerMm))
  const first = Math.ceil((position + (margin / width - 0.5) * coverage) / minor) * minor
  const last = Math.floor((position + (0.5 - margin / width) * coverage) / minor) * minor
  return {
    x: margin, y, width: Math.max(0, width - margin * 2), height: barHeight,
    fontSize: 12 * pixelScale, captionSize: 10 * pixelScale, strokeWidth: pixelScale,
    ticks: tapeMarks(last - first, first, minor, major).map(mark => ({
      ...mark, x: (0.5 + (mark.mm - position) / coverage) * width,
      length: (mark.major ? 22 : mark.half ? 15 : 9) * pixelScale,
    })),
  }
}

export function drawMetricTape(context: CanvasRenderingContext2D, state: StudioState, width: number, height: number, pixelScale = 1) {
  const tape = metricTapeLayout(state, width, height, pixelScale)
  const css = getComputedStyle(document.documentElement)
  const yellow = css.getPropertyValue('--cp-tape-bg').trim(), ink = css.getPropertyValue('--cp-tape-ink').trim()
  if (!yellow || !ink) throw new Error('The metric tape colors are unavailable.')
  context.save()
  context.globalAlpha = 1
  context.fillStyle = yellow; context.fillRect(tape.x, tape.y, tape.width, tape.height)
  context.font = `600 ${tape.captionSize}px ${css.getPropertyValue('--mono')}`
  context.textAlign = 'left'; context.textBaseline = 'bottom'
  context.fillText('Metric overlay · cm from blade base', tape.x, tape.y - 4 * pixelScale)
  context.beginPath(); context.rect(tape.x, tape.y, tape.width, tape.height); context.clip()
  context.fillStyle = ink; context.strokeStyle = ink
  context.font = `600 ${tape.fontSize}px ${css.getPropertyValue('--mono')}`
  context.textAlign = 'center'; context.textBaseline = 'top'
  for (const tick of tape.ticks) {
    context.lineWidth = tape.strokeWidth * (tick.mm === 0 ? 2 : 1)
    context.beginPath(); context.moveTo(tick.x, tape.y + tape.height)
    context.lineTo(tick.x, tape.y + tape.height - tick.length); context.stroke()
    if (tick.label) context.fillText(tick.label, tick.x, tape.y + 4 * pixelScale)
  }
  context.restore()
}
