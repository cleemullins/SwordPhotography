import { expect, test } from '@playwright/test'
import { noGPU, saved } from './helpers'

test('preview fills the scan column and compact inspection controls stay above it', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  for (const width of [390, 600, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    const frame = await page.locator('.viewport-frame').boundingBox()
    const scan = await page.locator('.navigator-panel').boundingBox()
    const exposure = await page.locator('.exposure-panel').boundingBox()
    const image = await page.locator('.viewport').boundingBox()
    expect(frame!.width).toBeCloseTo(scan!.width, 0)
    expect(exposure!.height).toBeLessThan(width <= 500 ? 250 : 180)
    expect(exposure!.y + exposure!.height).toBeLessThanOrEqual(image!.y + 2)
    const controls = await page.locator('.quick-controls > div').evaluateAll(elements => elements.map(element => {
      const label = element.querySelector('.control-heading label')!.getBoundingClientRect()
      return { top: element.getBoundingClientRect().y, label: label.y + label.height / 2,
        slider: element.querySelector('input[type="range"]')!.getBoundingClientRect().y,
        toggle: element.querySelector('.quick-toggle')!.getBoundingClientRect().y }
    }))
    for (const control of controls) for (const peer of controls.filter(c => Math.abs(c.top - control.top) < 1)) {
      expect(Math.abs(control.label - peer.label)).toBeLessThan(1)
      expect(Math.abs(control.slider - peer.slider)).toBeLessThan(1)
      expect(Math.abs(control.toggle - peer.toggle)).toBeLessThan(1)
    }
    await expect(page.getByRole('button', { name: 'Framing', exact: true })).toHaveCount(0)
    await expect(page.locator('.image-label')).toHaveCount(0)
    await expect(page.locator('.exposure-panel').getByRole('button', { name: 'Clipping', exact: true })).toHaveCount(1)
    await expect(page.locator('.exposure-panel').getByLabel('Inspect lighting')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Include tape in frame' })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Metric tape overlay' })).toHaveCount(1)
  }
})

test('scan navigation keeps the draggable graphic and numeric position without a duplicate slider', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  await expect(page.getByLabel('Viewed position from base slider', { exact: true })).toHaveCount(0)
  const position = page.getByLabel('Viewed position from base', { exact: true })
  await expect(position).toHaveAttribute('type', 'number')
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  const before = await saved(page)
  const graphic = page.getByRole('img', { name: 'Whole blade navigator. Click to choose the viewed section.' })
  await graphic.scrollIntoViewIfNeeded()
  const bounds = (await graphic.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.5, { steps: 4 })
  await page.mouse.up()
  const after = await saved(page)
  expect(after.blade.x).not.toBe(before.blade.x)
  expect(Number(await position.inputValue())).toBeCloseTo(after.blade.definition.length / 2 - after.blade.x, 3)
  expect(after.camera).toEqual(before.camera)
  expect(after.lights).toEqual(before.lights)
})
