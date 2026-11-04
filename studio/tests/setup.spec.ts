import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaultState } from '../src/model'
import type { StudioState } from '../src/model'
import { setupProjection } from '../src/setup'
import { focusOnBlade } from '../src/framing'
import { details, samples } from './helpers'

async function saved(page: Page): Promise<StudioState> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nihonto-studio-setup-v1'))).not.toBeNull()
  return page.evaluate(() => JSON.parse(localStorage.getItem('nihonto-studio-setup-v1')!))
}

async function dragHandle(page: Page, id: string, dx: number, dy: number) {
  const handle = page.locator(`#${id} .setup-hit-target`)
  await handle.scrollIntoViewIfNeeded()
  const box = await handle.boundingBox()
  if (!box) throw new Error('Setup handle is missing.')
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

test.describe('rig controls and responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    // Layout and pointer semantics must work independently of GPU availability.
    await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }))
    await page.goto('/?clawpilotTheme=dark')
  })

  test('setup remains visible and usable across all former hiding breakpoints', async ({ page }) => {
    for (const width of [390, 500, 600, 800, 801, 900, 901, 1000, 1100, 1101, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const panel = page.getByRole('region', { name: 'Fixed rig', exact: true })
      await expect(panel).toBeVisible()
      await expect(page.getByRole('button', { name: 'Camera position', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Left light position', exact: true })).toBeVisible()
      const box = await panel.boundingBox()
      expect(box!.width).toBeGreaterThan(280)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 1000, height: 900 })
    await page.getByRole('region', { name: 'Fixed rig', exact: true }).screenshot({ path: 'test-results/setup-medium.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('region', { name: 'Fixed rig', exact: true }).screenshot({ path: 'test-results/setup-mobile.png' })
    await expect(page.getByLabel('Camera height slider', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Left light', exact: true }).click()
    await expect(page.getByLabel('Left height slider', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Right side offset slider', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Left brightness slider', { exact: true })).toBeVisible()
    await details(page, 'Advanced tube')
    await expect(page.getByLabel('Left along blade slider', { exact: true })).toBeVisible()
  })

  test('dragging within the diagram keeps a stable scale and mirrors linked lights', async ({ page }) => {
    await details(page, 'Advanced rig')
    await page.getByLabel('Link positions symmetrically', { exact: true }).check()
    await page.locator('#setup-light-1').scrollIntoViewIfNeeded()
    const svg = await page.locator('.setup-diagram').boundingBox()
    const scale = setupProjection(defaultState()).scale * svg!.width / 460
    await dragHandle(page, 'setup-light-1', 20, 25)
    const expectedY = Math.round((110 + 20 / scale) * 10) / 10
    const expectedHeight = Math.round((760 - 25 / scale) * 10) / 10
    await expect.poll(async () => (await saved(page)).lights[1].height).toBeCloseTo(expectedHeight, 0)
    const state = await saved(page)
    expect(state.lights[1].y).toBeCloseTo(expectedY, 0)
    expect(state.lights[0].y).toBe(-state.lights[1].y)
    expect(state.lights[0].height).toBe(state.lights[1].height)
    expect(state.lights[0].brightness).toBe(100)
    expect(state.lights[1].brightness).toBe(65)
    const height = state.lights[1].height
    await page.mouse.move(20, 20)
    expect(Number(await page.getByLabel('Right height', { exact: true }).inputValue())).toBe(height)

    await page.getByRole('button', { name: 'Right light position', exact: true }).focus()
    await page.keyboard.press('Shift+ArrowDown')
    await expect(page.getByLabel('Right height', { exact: true })).toHaveValue(String(height - 10))
    await page.getByLabel('Right height', { exact: true }).fill('1000')
    await page.getByRole('button', { name: 'Right light position', exact: true }).focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByLabel('Right height', { exact: true })).toHaveValue('1000')
  })

  test('camera drag is vertical only, supports precise units, and persists', async ({ page }) => {
    await page.locator('#setup-camera').scrollIntoViewIfNeeded()
    const svg = await page.locator('.setup-diagram').boundingBox()
    const scale = setupProjection(defaultState()).scale * svg!.width / 460
    await dragHandle(page, 'setup-camera', 35, -30)
    const expected = Math.round((480 + 30 / scale) * 10) / 10
    await expect.poll(async () => (await saved(page)).camera.height).toBeCloseTo(expected, 0)
    const state = await saved(page)
    expect(state.camera.focus).toBeCloseTo(focusOnBlade(state).camera.focus)
    expect(state.lights).toEqual(defaultState().lights)
    const beforeX = await page.locator('#setup-camera').getAttribute('transform')
    await page.getByRole('button', { name: 'Camera position', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    expect(await page.locator('#setup-camera').getAttribute('transform')).toBe(beforeX)
    await page.keyboard.press('ArrowUp')
    await expect(page.getByLabel('Camera height', { exact: true })).toHaveValue(String(Number((expected + 1).toFixed(1))))
    await page.getByRole('button', { name: 'in', exact: true }).click()
    await page.getByLabel('Camera height', { exact: true }).fill('30')
    await expect.poll(async () => (await saved(page)).camera.height).toBeCloseTo(762, 5)
    await page.reload()
    await expect(page.getByLabel('Camera height', { exact: true })).toHaveValue('762')
    await page.getByLabel('Camera height', { exact: true }).fill('1801')
    await expect(page.getByLabel('Camera height', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect((await saved(page)).camera.height).toBeCloseTo(762)
  })

  test('a touch drag changes light position without scrolling the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const handle = page.locator('#setup-light-0 .setup-hit-target')
    await handle.scrollIntoViewIfNeeded()
    const box = await handle.boundingBox()
    const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2
    const scroll = await page.evaluate(() => scrollY)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 20, y: y - 25, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => (await saved(page)).lights[0].height).toBeGreaterThan(380)
    expect((await saved(page)).lights[0].y).toBeLessThan(-110)
    expect(await page.evaluate(() => scrollY)).toBe(scroll)
    await cdp.detach()
  })

  test('disabled lights capture outside drags, clamp positions, and release cleanly', async ({ page }) => {
    await page.getByLabel('Left tube enabled', { exact: true }).uncheck()
    await dragHandle(page, 'setup-light-0', -700, 100)
    await expect.poll(async () => (await saved(page)).lights[0].y).toBe(-450)
    expect((await saved(page)).lights[0].enabled).toBe(false)
    const height = await page.getByLabel('Left height', { exact: true }).inputValue()
    const svg = await page.locator('.setup-diagram').boundingBox()
    await page.mouse.move(svg!.x + svg!.width / 2, svg!.y + 100)
    await expect(page.getByLabel('Left height', { exact: true })).toHaveValue(height)
    await expect(page.getByLabel('Left rig offset', { exact: true })).toHaveValue('-450')
    await dragHandle(page, 'setup-light-0', 20, -20)
    await expect.poll(async () => (await saved(page)).lights[0].y).toBeGreaterThan(-450)
  })

  test('object selection exposes overlapping handles for dragging', async ({ page }) => {
    await page.getByRole('button', { name: 'Left light', exact: true }).click()
    await page.getByLabel('Left height', { exact: true }).fill('480')
    await page.getByLabel('Left rig offset', { exact: true }).fill('0')
    await page.getByLabel('Selected setup object').getByRole('button', { name: 'Camera', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Camera position', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByLabel('Camera height', { exact: true })).toHaveValue('481')
    await dragHandle(page, 'setup-camera', 0, -20)
    await expect.poll(async () => (await saved(page)).camera.height).toBeGreaterThan(480)
    expect((await saved(page)).lights[0]).toMatchObject({ height: 480, y: 0 })
  })

  test('zoom controls keep the bottom center fixed and never change the physical scene', async ({ page }) => {
    const scene = await saved(page), svg = page.locator('.setup-diagram')
    const origin = () => svg.evaluate(s => {
      const svg = s as SVGSVGElement
      const matrix = svg.getScreenCTM()!
      const point = new DOMPoint(Number(svg.dataset.originX), Number(svg.dataset.originY)).matrixTransform(matrix)
      return { x: point.x, y: point.y }
    })
    await svg.scrollIntoViewIfNeeded()
    const anchor = await origin(), scale = Number(await svg.getAttribute('data-scale'))
    await page.getByRole('button', { name: 'Zoom in setup', exact: true }).click()
    expect(Number(await svg.getAttribute('data-scale'))).toBeCloseTo(scale * 1.25)
    expect(await origin()).toEqual(anchor)
    await page.getByRole('button', { name: 'Zoom out setup', exact: true }).click()
    expect(Number(await svg.getAttribute('data-scale'))).toBeCloseTo(scale)
    expect(await origin()).toEqual(anchor)
    expect(await saved(page)).toEqual(scene)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in setup', exact: true }).click()
    await page.getByRole('button', { name: 'Fit rig', exact: true }).click()
    expect(Number(await svg.getAttribute('data-scale'))).toBeCloseTo(scale)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in setup', exact: true }).click()
    await page.getByRole('button', { name: 'Right light', exact: true }).click()
    expect(Number(await svg.getAttribute('data-scale'))).toBeCloseTo(scale)
    expect(await saved(page)).toEqual(scene)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Zoom in setup', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('dragging near the edge zooms out and rebases without drifting at a stationary pointer', async ({ page }) => {
    await page.getByRole('button', { name: 'Left light', exact: true }).click()
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom in setup', exact: true }).click()
    const svg = page.locator('.setup-diagram')
    const scale = Number(await svg.getAttribute('data-scale'))
    const factor = (await svg.boundingBox())!.width / 460
    const handle = await page.locator('#setup-light-0 .setup-hit-target').boundingBox()
    const x = handle!.x + handle!.width / 2, y = handle!.y + handle!.height / 2
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x, y - 90 * factor)
    await expect.poll(() => svg.getAttribute('data-scale')).not.toBe(String(scale))
    const expanded = Number(await svg.getAttribute('data-scale'))
    expect(expanded).toBeLessThan(scale)
    const expectedHeight = Math.round((380 + 90 / scale) * 10) / 10
    await expect.poll(async () => (await saved(page)).lights[0].height).toBe(expectedHeight)
    await page.mouse.move(x, y - 90 * factor)
    expect(Number(await page.getByLabel('Left height', { exact: true }).inputValue())).toBe(expectedHeight)
    await page.mouse.move(x, y - 100 * factor)
    await expect.poll(async () => (await saved(page)).lights[0].height).toBeCloseTo(expectedHeight + 10 / expanded, 0)
    await page.mouse.up()
    expect(await svg.getAttribute('data-origin-x')).toBe('230')
    expect(await svg.getAttribute('data-origin-y')).toBe('330')
    const box = await svg.boundingBox()
    const light = await page.locator('#setup-light-0 .setup-hit-target').boundingBox()
    expect(light!.y).toBeGreaterThan(box!.y)
    expect(light!.y + light!.height).toBeLessThan(box!.y + box!.height)
  })
})

test('dragging the rig updates the live ray-traced scene', async ({ page }) => {
  await page.goto('/?clawpilotTheme=dark')
  await samples(page, 4)
  const coverage = await page.locator('.scan-summary').innerText()
  await dragHandle(page, 'setup-camera', 10, -25)
  await expect(page.locator('.scan-summary')).not.toHaveText(coverage)
  await dragHandle(page, 'setup-light-0', -20, -20)
  await expect.poll(async () => (await saved(page)).lights[0].height).toBeGreaterThan(380)
  await samples(page, 4)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('region', { name: 'Fixed rig', exact: true }).screenshot({ path: 'test-results/setup-interactive.png' })
})
