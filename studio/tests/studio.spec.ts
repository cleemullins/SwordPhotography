import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { saved, noGPU, details, samples, load } from './helpers'
import { defaultState } from '../src/model'

async function imageStats(page: Page) {
  return page.evaluate(() => new Promise<{ hash: number; mean: number; yellow: number; yellowY: number }>(resolve => requestAnimationFrame(() => {
    const source = document.querySelector<HTMLCanvasElement>('.viewport canvas')!
    const c = document.createElement('canvas'); c.width = source.width; c.height = source.height
    const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0)
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data
    let hash = 0, total = 0, yellow = 0, y = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      total += r + g + b; hash = (Math.imul(hash, 31) + r + 3 * g + 7 * b) >>> 0
      if (r > 60 && g > 45 && b < g * 0.65) { yellow++; y += Math.floor(i / 4 / c.width) / c.height }
    }
    resolve({ hash, mean: total / pixels.length * 4 / 3, yellow, yellowY: yellow ? y / yellow : -1 })
  })))
}

test('fixed scan preserves rig values, endpoints and imported legacy focus are safe', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const old = defaultState(); old.camera.focus = 1900; old.automaticLightPosition = true; old.camera.autoExposure = true
  await load(page, old)
  await expect.poll(async () => (await saved(page)).camera.focus).toBeLessThan(480)
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await expect.poll(async () => (await saved(page)).scan.locked).toBe(true)
  const fixed = await saved(page)
  await details(page, 'Range and step')
  await page.getByLabel('Scan end', { exact: true }).fill('100')
  await page.getByLabel('Step distance', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Go to scan start' }).click()
  for (const expected of [30, 60, 90, 100]) {
    await page.getByRole('button', { name: 'Next frame' }).click()
    await expect(page.getByLabel('Viewed position from base', { exact: true })).toHaveValue(String(expected))
  }
  await expect(page.locator('.scan-steps')).toContainText('Frame 5 of 5')
  await expect(page.getByRole('button', { name: 'Next frame' })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous frame' }).click()
  await expect(page.getByLabel('Viewed position from base', { exact: true })).toHaveValue('90')
  await page.getByRole('button', { name: 'Left light', exact: true }).click()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByLabel('Left height', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Edit model...' })).toBeDisabled()
  await expect.poll(async () => (await saved(page)).blade.x).toBe(260)
  const after = await saved(page)
  expect(after.camera).toEqual(fixed.camera); expect(after.lights).toEqual(fixed.lights)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Edit rig', exact: true })).toBeVisible()
  expect((await saved(page)).camera).toEqual(fixed.camera)
  await page.getByRole('button', { name: 'Edit rig', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Suggest light positions' })).toBeVisible()
})

test('responsive layout and accessible advanced controls remain usable', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  for (const width of [390, 600, 900, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('region', { name: 'Fixed rig', exact: true })).toBeVisible()
    const exposure = await page.getByRole('region', { name: 'Camera exposure and lighting' }).boundingBox()
    const image = await page.locator('.viewport').boundingBox()
    expect(exposure!.y + exposure!.height).toBeLessThanOrEqual(image!.y + 2)
    expect(image!.y - exposure!.y - exposure!.height).toBeLessThan(3)
  }
  await details(page, 'Advanced camera'); await details(page, 'Advanced rig')
  for (const checkbox of await page.getByRole('checkbox').all()) {
    const description = await checkbox.getAttribute('aria-description')
    expect(description!.length).toBeGreaterThan(40)
    await expect(checkbox).toHaveAccessibleDescription(description!)
  }
  await expect(page.getByRole('button', { name: 'Save preview', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('WebGPU is unavailable')
  await expect(page.getByRole('button', { name: 'Set focus', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Focus', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/studio-workflow.png', fullPage: true })
})

test('quick exposure controls synchronize, persist, and respect the fixed rig lock', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const panel = page.getByRole('region', { name: 'Camera exposure and lighting' })
  await expect(panel).toContainText('Nikon Z5II')
  const shutter = panel.getByRole('slider', { name: 'Shutter speed' })
  await shutter.focus(); await page.keyboard.press('Home')
  await expect.poll(async () => (await saved(page)).camera.shutter).toBe(1 / 8000)
  await expect(panel.getByLabel('Exposure settings')).toContainText('1/8000 s')
  await page.keyboard.press('End')
  await expect.poll(async () => (await saved(page)).camera.shutter).toBe(30)
  await panel.getByLabel('Camera aperture', { exact: true }).fill('8')
  await expect(page.getByLabel('Aperture', { exact: true })).toHaveValue('8')
  await page.getByLabel('Aperture', { exact: true }).fill('5.6')
  await expect(panel.getByLabel('Camera aperture', { exact: true })).toHaveValue('5.6')
  await panel.getByLabel('Left tube brightness', { exact: true }).fill('75')
  await panel.getByLabel('Right tube brightness', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Left light', exact: true }).click()
  await expect(page.getByLabel('Left brightness', { exact: true })).toHaveValue('75')
  await page.getByLabel('Left brightness', { exact: true }).fill('80')
  await expect(panel.getByLabel('Left tube brightness', { exact: true })).toHaveValue('80')
  await page.getByLabel('Right tube enabled').uncheck()
  await expect(panel).toContainText('Right tube is off')
  await expect.poll(async () => (await saved(page)).lights[0].brightness).toBe(80)
  await page.reload()
  await expect(panel.getByLabel('Left tube brightness', { exact: true })).toHaveValue('80')
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  const fixed = await saved(page)
  for (const input of await panel.locator('input').all()) await expect(input).toBeDisabled()
  await page.getByLabel('Viewed position from base', { exact: true }).fill('200')
  await expect.poll(async () => (await saved(page)).blade.x).toBe(150)
  expect((await saved(page)).camera).toEqual(fixed.camera)
  expect((await saved(page)).lights).toEqual(fixed.lights)
})

test('GVM specifications distinguish lux from calibration and update old emitter sizes explicitly', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const state = defaultState(); state.diameter = 25
  await load(page, state)
  await details(page, 'GVM fixture specifications')
  await expect(page.locator('.fixture-details')).toContainText('750 lux at 1 m')
  await expect(page.locator('.fixture-details')).toContainText('2180 lux at 0.5 m')
  await expect(page.locator('.fixture-details')).toContainText('not lumens')
  await page.getByRole('button', { name: 'Use 46 mm emitter approximation' }).click()
  await expect.poll(async () => (await saved(page)).diameter).toBe(46)
  expect((await saved(page)).lights).toEqual(state.lights)
  await details(page, 'Advanced camera')
  await expect(page.getByText(/FX BSI-CMOS/)).toContainText('6048 × 4032')
})

test('quick shutter, aperture and brightness controls recompose real GPU lighting without resampling', async ({ page }) => {
  const state = defaultState(); state.camera.compensate = false
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/'); await samples(page, 32)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  const first = await imageStats(page)
  const shutter = page.getByRole('slider', { name: 'Shutter speed' })
  await shutter.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await imageStats(page)).mean).toBeGreaterThan(first.mean * 1.1)
  await page.getByLabel('Camera aperture', { exact: true }).fill('11')
  await expect.poll(async () => (await imageStats(page)).mean).toBeLessThan(first.mean)
  await page.getByLabel('Left tube brightness', { exact: true }).fill('0')
  await page.getByLabel('Right tube brightness', { exact: true }).fill('0')
  await expect.poll(async () => (await imageStats(page)).mean).toBe(0)
  await page.getByLabel('Left tube brightness', { exact: true }).fill('100')
  await expect.poll(async () => (await imageStats(page)).mean).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Resume rendering' })).toBeVisible()
})

test('real tape is yellow, moves with the table, survives capture, and aperture never adds blur', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  // Expose for the diffuse tape rather than the much brighter steel reflection.
  const state = defaultState(); state.camera.shutter = 1 / 15
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/?clawpilotTheme=dark')
  await samples(page, 64)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  const first = await imageStats(page)
  expect(first.yellow).toBeGreaterThan(200)
  expect(first.yellowY).toBeLessThan(0.5)
  const count = await page.locator('.render-details').textContent()
  for (const aperture of ['1.2', '11']) {
    await page.getByLabel('Aperture', { exact: true }).fill(aperture)
    await expect.poll(async () => (await imageStats(page)).hash).toBe(first.hash)
    expect(Number((await page.locator('.render-details').textContent())?.match(/(\d+) spp/)?.[1])).toBeGreaterThanOrEqual(Number(count?.match(/(\d+) spp/)?.[1]))
  }
  await page.getByRole('button', { name: 'Save preview', exact: true }).click()
  await expect(page.locator('.preview-thumb')).toHaveCount(1)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: /Comparisons/ }).click()
  const pixels = await page.locator('.capture-card img').evaluate(async (img: HTMLImageElement) => {
    await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const p = ctx.getImageData(0, 0, c.width, c.height).data
    let yellow = 0
    for (let i = 0; i < p.length; i += 4) if (p[i] > 60 && p[i + 1] > 45 && p[i + 2] < p[i + 1] * 0.65) yellow++
    return yellow
  })
  expect(pixels).toBeGreaterThan(200)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await details(page, 'Advanced rig')
  await page.getByLabel('Across frame', { exact: true }).fill('15')
  await page.getByRole('button', { name: 'Resume rendering' }).click(); await samples(page, 32)
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  expect((await imageStats(page)).yellowY).toBeLessThan(first.yellowY - 0.04)
  await page.locator('.viewport').screenshot({ path: 'test-results/metric-tape.png' })
  await page.getByLabel('Metric reference tape', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Resume rendering' }).click(); await samples(page, 32)
  expect((await imageStats(page)).yellow).toBeLessThan(50)
  await page.getByLabel('Viewed position from base', { exact: true }).fill('100')
  await expect.poll(async () => (await saved(page)).blade.x).toBe(250)
  await page.getByRole('button', { name: /Comparisons/ }).click()
  await page.getByRole('button', { name: 'Restore rig only' }).click()
  expect((await saved(page)).blade.x).toBe(250)
  await expect.poll(async () => (await saved(page)).referenceTape).toBe(true)
  await page.getByRole('button', { name: /Comparisons/ }).click()
  await page.getByRole('button', { name: 'Restore full setup' }).click()
  await expect.poll(async () => (await saved(page)).blade.x).toBe(0)
  expect(errors).toEqual([])
})

test('saving, import validation, references and locked scan preview groups work', async ({ page }) => {
  await page.goto('/'); await samples(page)
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await page.getByLabel('Viewed position from base', { exact: true }).fill('200')
  await samples(page)
  await page.getByRole('button', { name: 'Save preview', exact: true }).click()
  await expect(page.locator('.preview-thumb')).toHaveCount(1)
  await expect(page.locator('.preview-thumb')).toContainText('Scan')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save setup', exact: true }).click()
  const path = await (await downloadPromise).path()
  await page.locator('input[type=file]').setInputFiles(path)
  await expect(page.getByRole('button', { name: 'Lock rig / Preview scan' })).toBeVisible()
  await expect(page.getByLabel('Viewed position from base', { exact: true })).toHaveValue('200')
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') })
  await expect(page.locator('.error-banner')).toContainText('Unsupported setup version')
  await details(page, 'More')
  await page.getByRole('button', { name: 'References', exact: true }).click()
  await expect(page.locator('.reference-card')).toHaveCount(10)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: /Comparisons/ }).click()
  await page.getByRole('button', { name: 'Delete capture' }).click()
  await expect(page.locator('.capture-card')).toHaveCount(0)
})
