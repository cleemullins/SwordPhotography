import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { blurDiameter, defaultState, HADA_TYPES } from '../src/model'
import type { StudioState } from '../src/model'
import { details, samples } from './helpers'

async function saved(page: Page): Promise<StudioState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nihonto-studio-setup-v1'))).not.toBeNull()
  return page.evaluate(() => JSON.parse(localStorage.getItem('nihonto-studio-setup-v1')!))
}

test('designer hada selection, previews and persistence stay independent of geometry', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit model...' }).click()
  await expect(page.getByText('NIHONTO DESIGNER', { exact: true })).toBeVisible()
  const previews = new Set<string>()
  for (const [type, label] of Object.entries(HADA_TYPES)) {
    await page.getByLabel('Hada type', { exact: true }).selectOption(type)
    await expect.poll(async () => (await saved(page)).blade.hada).toBe(type)
    await expect(page.getByRole('img', { name: `${label} hada grain preview` })).toBeVisible()
    previews.add(await page.locator('.hada-preview').innerHTML())
    expect((await saved(page)).blade.definition).toEqual(defaultState().blade.definition)
  }
  expect(previews.size).toBe(5)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Save setup', exact: true }).click()
  const path = await (await downloadPromise).path()
  await details(page, 'More')
  await page.getByRole('button', { name: 'Reset setup', exact: true }).click()
  await expect.poll(async () => (await saved(page)).blade.hada).toBe('none')
  await page.locator('input[type=file]').setInputFiles(path)
  await expect.poll(async () => (await saved(page)).blade.hada).toBe('ayasugi')
  await page.reload()
  await page.getByRole('button', { name: 'Edit model...' }).click()
  await expect(page.getByLabel('Hada type', { exact: true })).toHaveValue('ayasugi')
  const invalid = await saved(page)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid-hada.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...invalid, blade: { ...invalid.blade, hada: 'unknown' } })),
  })
  await expect(page.locator('.error-banner')).toContainText('Unknown hada type')
  expect((await saved(page)).blade.hada).toBe('ayasugi')
})

async function image(page: Page) {
  return page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const source = document.querySelector<HTMLCanvasElement>('.viewport canvas')!
    const canvas = document.createElement('canvas')
    canvas.width = 128; canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(source, 0, 0, 128, 80)
    resolve(Array.from(ctx.getImageData(0, 0, 128, 80).data).filter((_, i) => i % 4 === 0))
  })))
}

test('old defocused setups are automatically focused without changing aperture or exposure', async ({ page }) => {
  const state = defaultState()
  state.blade.hada = 'ayasugi'
  state.camera = { ...state.camera, height: 336.2, focus: 844.85, focalLength: 35, aperture: 10, exposure: -3.6 }
  await page.addInitScript(s => {
    Object.defineProperty(navigator, 'gpu', { value: undefined })
    localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s))
  }, state)
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit model...' }).click()
  await expect(page.getByRole('button', { name: 'Focus to reveal hada', exact: true })).toHaveCount(0)
  await expect(page.locator('.hada-focus-warning')).toHaveCount(0)
  await expect.poll(async () => (await saved(page)).camera.focus).toBeLessThan(336.2)
  const focused = (await saved(page)).camera
  expect(focused.aperture).toBe(10)
  expect(focused.exposure).toBe(-3.6)
  expect(focused.shutter).toBe(state.camera.shutter)
  expect(focused.height).toBe(336.2)
  expect(focused.focalLength).toBe(35)
  expect(blurDiameter(focused.focus, focused)).toBe(0)
})

test('every hada changes real GPU reflections without hamon and captures restore its type', async ({ page }) => {
  test.setTimeout(360_000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const state = defaultState()
  state.automaticLightPosition = true
  state.blade.detail = false; state.blade.roughness = 0.22
  state.camera.focalLength = 100; state.camera.aperture = 11
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/?clawpilotTheme=dark')
  await details(page, 'Rendering details')
  await page.getByLabel('Render quality', { exact: true }).selectOption('balanced')
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await samples(page)
  const refine = async () => {
    await samples(page, 64)
    await page.getByRole('button', { name: 'Pause rendering', exact: true }).click()
  }
  await refine()
  const plain = await image(page)
  for (const type of ['itame', 'mokume', 'masame', 'ayasugi']) {
    await page.getByRole('button', { name: 'Edit model...' }).click()
    await page.getByLabel('Hada type', { exact: true }).selectOption(type)
    await expect.poll(async () => (await saved(page)).blade.hada).toBe(type)
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: 'Resume rendering', exact: true }).click()
    await refine()
    const textured = await image(page)
    const difference = textured.reduce((sum, v, i) => sum + Math.abs(v - plain[i]), 0) / plain.length
    expect(difference).toBeGreaterThan(1)
    expect((await saved(page)).blade.detail).toBe(false)
    await page.locator('.viewport').screenshot({ path: `test-results/hada-${type}.png` })
  }
  await page.getByRole('button', { name: 'Save preview', exact: true }).click()
  await expect(page.locator('.preview-thumb')).toHaveCount(1)
  await page.getByRole('button', { name: 'Edit model...' }).click()
  await page.getByLabel('Hada type', { exact: true }).selectOption('none')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: /Comparisons/ }).click()
  await page.getByRole('button', { name: 'Restore full setup', exact: true }).click()
  await page.getByRole('button', { name: 'Edit model...' }).click()
  await expect(page.getByLabel('Hada type', { exact: true })).toHaveValue('ayasugi')
  await expect.poll(async () => (await saved(page)).blade.hada).toBe('ayasugi')
  expect(errors).toEqual([])
  await expect(page.getByRole('alert')).toHaveCount(0)
})
