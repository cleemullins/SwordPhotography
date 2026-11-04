import { expect, test } from '@playwright/test'
import { defaultState, fieldOfView } from '../src/model'
import { HISTORICAL_PRESETS } from '../src/historical-presets'
import { bladeSection } from '../src/blade'
import { noGPU, saved, samples, load } from './helpers'

function referenceState() {
  const state = defaultState()
  state.blade.definition = structuredClone(HISTORICAL_PRESETS.find(p => p.name === 'Norishige - Juyo 67')!.definition)
  state.blade.hada = 'itame'; state.blade.x = 80.35; state.blade.y = -13.13
  state.scan.end = state.blade.definition.length
  state.camera = { ...state.camera, height: 440.1, focalLength: 85, exposure: -3.6 }
  state.lights = [
    { enabled: true, x: 80.35, y: -130.27, height: 249.52, brightness: 117 },
    { enabled: true, x: 80.35, y: 50.24, height: 249.52, brightness: 200 },
  ]
  return state
}

test('metric overlay is visible without moving the rig and remains toggleable while locked', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const state = defaultState()
  state.blade.y = 80; state.blade.x = 100; state.referenceTape = false
  await load(page, state)
  await page.getByRole('button', { name: 'Metric tape', exact: true }).click()
  await expect.poll(async () => (await saved(page)).referenceTape).toBe(true)
  const next = await saved(page)
  expect(next.blade.x).toBe(state.blade.x); expect(next.lights).toEqual(state.lights)
  expect(next.blade.y).toBe(state.blade.y)
  expect(next.camera.height).toBe(state.camera.height)
  await expect(page.getByRole('img', { name: 'Metric tape overlay' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await page.getByRole('button', { name: 'Metric tape', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Metric tape overlay' })).toHaveCount(0)
})

test('fine-detail captures retain render resolution and grain across illuminated facets', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const state = referenceState()
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/')
  await samples(page, 64)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  await expect(page.getByLabel('Render quality', { exact: true })).toHaveValue('quality')
  await expect(page.locator('.render-details')).toContainText('target 4096')
  await page.getByRole('button', { name: 'Save preview', exact: true }).click()
  await page.getByRole('button', { name: /Comparisons/ }).click()
  const metrics = await page.locator('.capture-card img').evaluate(async (img: HTMLImageElement) => {
    await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const bands: number[] = []
    // Both broad, bright facet interiors, excluding the dark shinogi reflection edge.
    for (const fraction of [0.50, 0.69]) {
      const values: number[] = []
      for (let y = Math.floor(canvas.height * (fraction - 0.012)); y < canvas.height * (fraction + 0.012); y++) {
        for (let x = Math.floor(canvas.width * 0.2); x < canvas.width * 0.8; x++) {
          const at = (y * canvas.width + x) * 4
          const center = pixels[at]
          const average = (pixels[at - 12] + pixels[at + 12]) / 2
          if (center > 50 && center < 245) values.push(Math.abs(center - average))
        }
      }
      bands.push(values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length))
    }
    return { width: canvas.width, height: canvas.height, bands }
  })
  expect(metrics.width).toBeGreaterThanOrEqual(1200)
  expect(metrics.height).toBe(Math.round(metrics.width * 23.9 / 35.9))
  for (const detail of metrics.bands) expect(detail).toBeGreaterThan(0.5)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.locator('.viewport').screenshot({ path: 'test-results/grain-broad-reflection.png' })
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await page.getByRole('button', { name: 'Resume rendering' }).click()
  await samples(page, 64)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  await page.locator('.viewport').screenshot({ path: 'test-results/grain-optimized-reflection.png' })
  expect(errors).toEqual([])
})

test('one Auto rig illuminates grain at base, middle and kissaki with unchanged exposure', async ({ page }) => {
  test.setTimeout(360_000)
  const state = referenceState(), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/')
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  const rig = await saved(page)
  for (const fromBase of [20, 351, 688]) {
    await page.getByLabel('Viewed position from base', { exact: true }).fill(String(fromBase))
    await samples(page, 32)
    const current = await saved(page)
    expect(current.lights).toEqual(rig.lights); expect(current.camera).toEqual(rig.camera)
    const section = bladeSection(current.blade.definition, fromBase / current.blade.definition.length)
    const y = section.y * 1000 + current.blade.y + (current.blade.definition.ridge - 0.5) / 2 * section.width * 1000
    const coverage = fieldOfView(current.camera)
    const mean = await page.evaluate(({ y, coverage }) => new Promise<number>(resolve => requestAnimationFrame(() => {
      const source = document.querySelector<HTMLCanvasElement>('.viewport canvas')!
      const c = document.createElement('canvas'); c.width = source.width; c.height = source.height
      const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0)
      const x0 = Math.floor(c.width / 2 - c.width / coverage.width * 2)
      const y0 = Math.floor(c.height * (0.5 - y / coverage.height) - 1)
      const pixels = ctx.getImageData(x0, y0, Math.max(2, Math.floor(c.width / coverage.width * 4)), 3).data
      let total = 0
      for (let i = 0; i < pixels.length; i += 4) total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      resolve(total / (pixels.length / 4))
    })), { y, coverage })
    expect(mean, `Grain-bearing bevel at ${fromBase} mm`).toBeGreaterThan(25)
    await page.locator('.viewport').screenshot({ path: `test-results/fixed-rig-${fromBase}mm.png` })
  }
  expect(errors).toEqual([])
})
