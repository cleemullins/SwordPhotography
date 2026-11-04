import { expect, test } from '@playwright/test'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { defaultState, fieldOfView } from '../src/model'
import { bladeSection, makeBlade } from '../src/blade'
import { hamonBoundary } from '../src/hada'
import { saved, samples, details, noGPU } from './helpers'

test('hada picker presents decoded swatches and supports keyboard selection', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const picker = page.getByRole('combobox', { name: 'Rendered hada' })
  await expect(picker).toContainText('Itame')
  await picker.click()
  const options = page.getByRole('listbox', { name: 'Rendered hada' }).getByRole('option')
  await expect(options).toHaveCount(5)
  for (const option of await options.all()) {
    await expect.poll(() => option.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 512)).toBe(true)
    if (await option.getAttribute('aria-label') !== 'None') {
      const contrast = await option.locator('img').evaluate((img: HTMLImageElement) => {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
        const values = Array.from(ctx.getImageData(0, 0, c.width, c.height).data).filter((_, i) => i % 4 === 0).sort((a, b) => a - b)
        return values[Math.floor(values.length * 0.9)] - values[Math.floor(values.length * 0.1)]
      })
      expect(contrast).toBeGreaterThan(30)
    }
  }
  await page.keyboard.press('End'); await page.keyboard.press('Enter')
  await expect(picker).toContainText('Ayasugi')
  await expect.poll(async () => (await saved(page)).blade.hada).toBe('ayasugi')
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await expect(picker).toBeDisabled()
})

test('surface-aware Auto and highlight shutter illuminate the ha as well as ji without clipping', async ({ page }) => {
  test.setTimeout(360_000)
  const state = defaultState(), errors: string[] = []
  state.blade.hada = 'none'; state.blade.x = -15.9; state.blade.y = -21.695; state.diameter = 25
  state.camera = { ...state.camera, focalLength: 85, aperture: 9, shutter: 1 / 13 }
  state.lights = [
    { enabled: true, x: 0, y: -55.38, height: 123.69, brightness: 100 },
    { enabled: true, x: 16, y: 82.88, height: 613.29, brightness: 100 },
  ]
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.goto('/?clawpilotTheme=dark')
  await expect(page.getByText('Hada is off.', { exact: false })).toBeVisible()
  await page.getByRole('combobox', { name: 'Rendered hada' }).click()
  await page.getByRole('option', { name: 'Itame', exact: true }).click()
  await details(page, 'Rendering details')
  await page.getByLabel('Render quality', { exact: true }).selectOption('balanced')
  await expect(page.getByText('This setup uses a 25 mm emitter', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Use 46 mm emitter approximation' }).click()
  await expect.poll(async () => (await saved(page)).diameter).toBe(46)
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect(page.getByRole('button', { name: 'Suggest light positions' })).toBeEnabled()
  await expect(page.locator('.error-banner')).toHaveCount(0)
  await page.getByLabel('Auto shutter', { exact: true }).check()
  await page.getByRole('button', { name: 'Clipping', exact: true }).click()
  await samples(page, 64)
  await expect(page.locator('.auto-shutter-status')).toContainText('90%', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Pause rendering' }).click()
  const metered = await saved(page)
  expect(metered.camera.shutter).toBeLessThan(state.camera.shutter)
  for (const light of metered.lights) {
    expect(light.height + metered.diameter / 2).toBeLessThanOrEqual(metered.camera.height)
    expect(light.brightness).toBeLessThanOrEqual(100)
  }
  await page.getByLabel('Left tube brightness', { exact: true }).fill(String(metered.lights[0].brightness * 2))
  await page.getByLabel('Right tube brightness', { exact: true }).fill(String(metered.lights[1].brightness * 2))
  await expect.poll(async () => (await saved(page)).camera.shutter / metered.camera.shutter).toBeCloseTo(0.5, 1)
  await page.getByLabel('Left tube brightness', { exact: true }).fill(String(metered.lights[0].brightness))
  await page.getByLabel('Right tube brightness', { exact: true }).fill(String(metered.lights[1].brightness))
  await expect.poll(async () => (await saved(page)).camera.shutter / metered.camera.shutter).toBeCloseTo(1, 1)
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  const fixed = await saved(page)
  await expect(page.locator('.auto-shutter-status')).toContainText('paused')
  for (const position of [25, 350, 675]) {
    await page.getByLabel('Viewed position from base', { exact: true }).fill(String(position))
    await expect.poll(async () => (await saved(page)).blade.x).toBe(350 - position)
    await page.getByRole('button', { name: 'Resume rendering' }).click()
    await samples(page, 48)
    await page.getByRole('button', { name: 'Pause rendering' }).click()
    const current = await saved(page), d = current.blade.definition
    expect(current.camera).toEqual(fixed.camera); expect(current.lights).toEqual(fixed.lights)
    const u = position / d.length, section = bladeSection(d, u), boundary = hamonBoundary(u)
    const shape = makeBlade(d), material = new MeshBasicMaterial(), mesh = new Mesh(shape, material)
    mesh.position.set(current.blade.x / 1000, current.blade.y / 1000, 0); mesh.updateMatrixWorld()
    const coverage = fieldOfView(current.camera)
    const rows = [0.06, boundary * 0.6, boundary, (boundary + d.ridge + 0.5) / 2, 0.85].map(v => {
      const y = section.y + (v - 0.5) * section.width + current.blade.y / 1000
      const hit = new Raycaster(new Vector3(0, y, 2), new Vector3(0, 0, -1)).intersectObject(mesh)[0]
      if (!hit) throw new Error('Missing sampled blade surface')
      return 0.5 - y * 1000 / coverage.height * current.camera.height / (current.camera.height - hit.point.z * 1000)
    })
    shape.dispose(); material.dispose()
    const metrics = await page.evaluate(rows => new Promise<{ mean: number; peak: number }[]>(resolve => requestAnimationFrame(() => {
      const source = document.querySelector<HTMLCanvasElement>('.viewport canvas')!
      const c = document.createElement('canvas'); c.width = source.width; c.height = source.height
      const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0)
      resolve(rows.map(y => {
        const data = ctx.getImageData(Math.floor(c.width / 2) - 2, Math.floor(y * c.height), 5, 1).data
        let total = 0, peak = 0
        for (let i = 0; i < data.length; i += 4) {
          total += (data[i] + data[i + 1] + data[i + 2]) / 3; peak = Math.max(peak, data[i], data[i + 1], data[i + 2])
        }
        return { mean: total / 5, peak }
      }))
    })), rows)
    for (const [region, metric] of metrics.entries()) {
      expect(metric.mean, `${position} mm region ${region}`).toBeGreaterThan(25)
      expect(metric.peak, `${position} mm region ${region}`).toBeLessThan(205)
    }
    await page.locator('.viewport').screenshot({ path: `test-results/surface-${position}.png` })
  }
  await page.getByRole('button', { name: 'Edit rig', exact: true }).click()
  await page.getByRole('slider', { name: 'Shutter speed' }).focus()
  await page.keyboard.press('Home')
  await expect(page.getByLabel('Auto shutter', { exact: true })).not.toBeChecked()
  await expect.poll(async () => (await saved(page)).camera.shutter).toBe(1 / 8000)
  expect(errors).toEqual([])
})
