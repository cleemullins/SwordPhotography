import { expect, test } from '@playwright/test'
import { HISTORICAL_PRESETS } from '../src/historical-presets'
import { noGPU, saved, details } from './helpers'

test('historical photos remain available as originals without an enlarged comparison panel', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  await page.getByLabel('Blade preset', { exact: true }).selectOption(HISTORICAL_PRESETS[2].name)
  await expect(page.getByRole('region', { name: 'Scale-matched blade reference' })).toHaveCount(0)
  await details(page, 'More')
  await expect(page.getByRole('link', { name: 'Original blade photograph' })).toHaveAttribute('href', /blade-references\/ayanokoji-juyo-66\/original\.png/)
})

test('Met study viewer exposes native detail views without changing the rig', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const before = await saved(page)
  await details(page, 'More')
  await page.getByRole('button', { name: 'Met study references', exact: true }).click()
  await expect(page.locator('.reference-card')).toHaveCount(10)
  await page.locator('.reference-card').filter({ hasText: 'Met 27614' }).click()
  const viewer = page.getByRole('region', { name: 'Met museum study viewer' })
  await page.getByLabel('Met photograph', { exact: true }).selectOption({ label: 'Kissaki and steel grain detail' })
  const image = viewer.locator('.museum-image-viewer img')
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight >= 3000)).toBe(true)
  const first = await image.boundingBox()
  await page.getByLabel('Met image zoom', { exact: true }).focus()
  await page.keyboard.press('End')
  expect((await image.boundingBox())!.height).toBeGreaterThan(first!.height * 7.9)
  await page.getByRole('button', { name: 'Fit image' }).click()
  await expect(viewer).toContainText('100%')
  await expect(viewer).toContainText('CC0-1.0')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  expect(await saved(page)).toEqual(before)
})
