import { CanvasTexture, SRGBColorSpace } from 'three/webgpu'

export const TAPE_WIDTH = 0.02
export const TAPE_GAP = 0.003

export function tapeMarks(length: number) {
  return Array.from({ length: Math.floor(length) + 1 }, (_, mm) => ({
    mm, major: mm % 10 === 0, half: mm % 5 === 0, label: mm % 10 === 0 ? String(mm / 10) : '',
  }))
}

export function makeTapeTexture(length: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 4096; canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The browser cannot draw the metric reference tape.')
  // Physical yellow tape and black ink, not UI theme colors.
  ctx.fillStyle = '#ffdc28'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#181510'; ctx.strokeStyle = '#181510'
  ctx.font = `bold ${Math.min(30, 4096 / length * 5)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (const mark of tapeMarks(length)) {
    const x = mark.mm / length * (canvas.width - 1)
    ctx.fillRect(x, canvas.height - (mark.major ? 50 : mark.half ? 32 : 20), Math.max(1, 4096 / length * 0.15), mark.major ? 50 : mark.half ? 32 : 20)
    if (mark.major) {
      ctx.textAlign = mark.mm === 0 ? 'left' : mark.mm + 5 > length ? 'right' : 'center'
      ctx.fillText(mark.label, x, 12)
      if (mark.mm % 100 === 0) {
        const font = ctx.font
        ctx.font = '16px sans-serif'
        ctx.fillText('cm', x, 48)
        ctx.font = font
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
