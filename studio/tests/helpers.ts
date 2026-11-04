import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { StudioState } from '../src/model'

export async function saved(page: Page): Promise<StudioState> {
  let value: StudioState | null = null
  await expect.poll(async () => {
    value = await page.evaluate(() => document.querySelector('.brand small')?.textContent === 'Autosaved locally'
      ? JSON.parse(localStorage.getItem('nihonto-studio-setup-v1') ?? 'null') : null)
    return value !== null
  }).toBe(true)
  if (!value) throw new Error('The current setup was not persisted.')
  return value
}
export async function noGPU(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }))
}
export async function samples(page: Page, count = 16) {
  await expect(page.getByRole('button', { name: 'Save preview', exact: true })).toBeEnabled({ timeout: 120_000 })
  await expect.poll(async () => Number((await page.locator('.render-details').textContent())?.match(/(\d+) spp/)?.[1] ?? 0), { timeout: 120_000 }).toBeGreaterThan(count)
}
export async function load(page: Page, state: StudioState) {
  await page.locator('input[type=file]').setInputFiles({ name: 'setup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) })
}
export async function details(page: Page, name: string) {
  const summary = page.locator('summary').filter({ hasText: name })
  if (!await summary.evaluate(s => s.parentElement!.hasAttribute('open'))) await summary.click()
}
