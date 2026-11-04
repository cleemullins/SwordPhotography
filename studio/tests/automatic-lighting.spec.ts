import { expect, test } from '@playwright/test'
import { defaultState } from '../src/model'
import { saved, noGPU, load, samples, details } from './helpers'

test('one-shot suggestions preserve intensity and never follow the moving blade', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  await page.getByRole('button', { name: 'Left light', exact: true }).click()
  await page.getByLabel('Left brightness', { exact: true }).fill('42')
  await page.getByLabel('Right tube enabled', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect.poll(async () => (await saved(page)).lights[0].height).not.toBe(380)
  const first = await saved(page)
  expect(first.lights[0].brightness).toBe(42); expect(first.lights[1].enabled).toBe(false)
  expect(first.automaticLightPosition).toBe(false)
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await page.getByLabel('Camera height', { exact: true }).fill('800')
  await page.getByLabel('Viewed position from base', { exact: true }).fill('100')
  await expect.poll(async () => (await saved(page)).camera.height).toBe(800)
  expect((await saved(page)).lights).toEqual(first.lights)
  await page.reload()
  expect((await saved(page)).lights).toEqual(first.lights)
})

test('unavailable suggestions are explicit and retain previous positions', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const state = defaultState(); state.blade.y = 450
  await load(page, state)
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect(page.locator('.error-banner')).toContainText('Previous positions are retained')
  expect((await saved(page)).lights).toEqual(state.lights)
  await load(page, { ...state, blade: { ...state.blade, y: 0 } })
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect.poll(async () => (await saved(page)).lights[0].height).not.toBe(380)
})

test('suggestions illuminate both real GPU contributions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await samples(page, 32)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  for (const source of ['left', 'right']) {
    await page.getByLabel('Inspect lighting').selectOption(source)
    await expect.poll(() => page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => {
      const source = document.querySelector<HTMLCanvasElement>('.viewport canvas')!
      const c = document.createElement('canvas'); c.width = source.width; c.height = source.height
      const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0)
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data
      resolve(Array.from(pixels).filter((v, i) => i % 4 === 0 && v > 80).length)
    })))).toBeGreaterThan(100)
  }
  expect(errors).toEqual([])
})

test('GVM tube spans are 1200 mm, can be centered once, and remain fixed during scanning', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const ratio = await page.locator('.tube-span').evaluate(svg => {
    const tube = svg.querySelector<SVGLineElement>('.span-left')!
    const blade = svg.querySelector<SVGLineElement>('.span-blade')!
    return (tube.x2.baseVal.value - tube.x1.baseVal.value) / (blade.x2.baseVal.value - blade.x1.baseVal.value)
  })
  expect(ratio).toBeCloseTo(1200 / 700, 6)
  await page.getByLabel('Viewed position from base', { exact: true }).fill('250')
  await details(page, 'Advanced rig')
  await page.getByRole('button', { name: 'Center tube spans on blade' }).click()
  await expect.poll(async () => (await saved(page)).lights.map(l => l.x)).toEqual([100, 100])
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  expect((await saved(page)).lights.map(l => l.x)).toEqual([100, 100])
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await page.getByLabel('Viewed position from base', { exact: true }).fill('350')
  await expect.poll(async () => (await saved(page)).blade.x).toBe(0)
  expect((await saved(page)).lights.map(l => l.x)).toEqual([100, 100])
})

test('the camera stays visible while selecting and adjusting a tube on desktop', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  for (const width of [1000, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('button', { name: 'Left light', exact: true }).click()
    await page.getByLabel('Left brightness', { exact: true }).scrollIntoViewIfNeeded()
    const image = await page.locator('.viewport').boundingBox()
    const rig = await page.locator('#rig-setup').boundingBox()
    expect(rig!.x).toBeGreaterThan(image!.x + image!.width)
    expect(image!.y).toBeGreaterThanOrEqual(0)
    expect(image!.y + image!.height).toBeLessThanOrEqual(1000)
  }
})
