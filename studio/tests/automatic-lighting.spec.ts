import { expect, test } from '@playwright/test'
import { defaultState } from '../src/model'
import { saved, noGPU, load, samples } from './helpers'

test('one-shot suggestions balance power below the camera and never follow the moving blade', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  await page.getByLabel('Left tube brightness', { exact: true }).fill('42')
  await page.getByLabel('Right tube enabled', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect.poll(async () => (await saved(page)).lights[0].height).not.toBe(380)
  const first = await saved(page)
  expect(first.lights[0].brightness).toBeGreaterThan(0); expect(first.lights[0].brightness).toBeLessThanOrEqual(100)
  expect(first.lights[1].enabled).toBe(false)
  expect(first.camera.autoExposure).toBe(true)
  for (const light of first.lights) expect(light.height + first.diameter / 2).toBeLessThanOrEqual(first.camera.height)
  expect(first.automaticLightPosition).toBe(false)
  await page.getByRole('button', { name: 'Camera position', exact: true }).focus()
  await page.keyboard.press('Shift+ArrowUp')
  await page.getByLabel('Viewed position from base', { exact: true }).fill('100')
  await expect.poll(async () => (await saved(page)).camera.height).toBe(first.camera.height + 10)
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

test('GVM tube spans are 1200 mm and always centered on the stationary origin', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const ratio = await page.locator('.tube-span').evaluate(svg => {
    const tube = svg.querySelector<SVGLineElement>('.span-left')!
    const blade = svg.querySelector<SVGPolygonElement>('.span-blade')!
    return (tube.x2.baseVal.value - tube.x1.baseVal.value) / blade.getBBox().width
  })
  expect(ratio).toBeCloseTo(1200 / 700, 6)
  await page.getByLabel('Viewed position from base', { exact: true }).fill('250')
  await expect.poll(async () => (await saved(page)).lights.map(l => l.x)).toEqual([0, 0])
  await expect(page.getByRole('button', { name: 'Center tube spans on blade' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Suggest light positions' }).click()
  await expect(page.getByRole('button', { name: 'Suggest light positions' })).toBeEnabled()
  expect((await saved(page)).lights.map(l => l.x)).toEqual([0, 0])
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await page.getByLabel('Viewed position from base', { exact: true }).fill('350')
  await expect.poll(async () => (await saved(page)).blade.x).toBe(0)
  expect((await saved(page)).lights.map(l => l.x)).toEqual([0, 0])
})

test('top view projects actual side offsets, blade translation and camera coverage at one scale', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  const state = defaultState()
  state.blade.definition.curvature = 0; state.blade.x = 75; state.blade.y = 35
  state.lights[0].x = -30; state.lights[0].y = -160
  state.lights[1].x = 90; state.lights[1].y = 210
  await load(page, state)
  await expect.poll(async () => (await saved(page)).lights[0].y).toBe(-160)
  const geometry = () => page.locator('.tube-span').evaluate(svg => {
    const origin = svg.querySelector<SVGCircleElement>('.top-camera-origin')!
    const tubes = ['.span-left', '.span-right'].map(selector => {
      const line = svg.querySelector<SVGLineElement>(selector)!
      return { x: (line.x1.baseVal.value + line.x2.baseVal.value) / 2, y: line.y1.baseVal.value,
        length: line.x2.baseVal.value - line.x1.baseVal.value, thickness: Number(line.getAttribute('stroke-width')) }
    })
    const blade = svg.querySelector<SVGPolygonElement>('.span-blade')!.getBBox()
    const frame = svg.querySelector<SVGRectElement>('.top-camera-window')!
    return { origin: { x: origin.cx.baseVal.value, y: origin.cy.baseVal.value }, tubes,
      blade: { x: blade.x + blade.width / 2, y: blade.y + blade.height / 2, width: blade.width },
      frame: { x: frame.x.baseVal.value + frame.width.baseVal.value / 2, y: frame.y.baseVal.value + frame.height.baseVal.value / 2,
        width: frame.width.baseVal.value, height: frame.height.baseVal.value } }
  })
  const first = await geometry(), scale = first.tubes[0].length / 1200
  for (const [i, tube] of first.tubes.entries()) {
    expect(tube.x).toBeCloseTo(first.origin.x)
    expect(first.origin.y - tube.y).toBeCloseTo(state.lights[i].y * scale)
    expect(tube.thickness).toBeCloseTo(state.diameter * scale)
  }
  expect(first.blade.x - first.origin.x).toBeCloseTo(75 * scale)
  expect(first.origin.y - first.blade.y).toBeCloseTo(35 * scale)
  expect(first.frame.x).toBeCloseTo(first.origin.x, 3); expect(first.frame.y).toBeCloseTo(first.origin.y, 3)
  expect(first.frame.width / first.frame.height).toBeCloseTo(35.9 / 23.9)
  expect(first.tubes[0].y).toBeGreaterThan(first.blade.y)
  expect(first.tubes[1].y).toBeLessThan(first.blade.y)
  const repositioned = await saved(page); repositioned.lights[0].y = 160
  await load(page, repositioned)
  const sameSide = await geometry()
  expect(sameSide.tubes.every(tube => tube.y < sameSide.blade.y)).toBe(true)
  await page.getByRole('button', { name: 'Lock rig / Preview scan' }).click()
  await page.getByLabel('Viewed position from base', { exact: true }).fill('0')
  const atBase = await geometry()
  expect(atBase.tubes).toEqual(sameSide.tubes); expect(atBase.frame).toEqual(sameSide.frame)
  expect(atBase.blade.x).not.toBe(sameSide.blade.x)
  await page.getByLabel('Viewed position from base', { exact: true }).fill('700')
  const atTip = await geometry()
  expect(atTip.tubes).toEqual(sameSide.tubes); expect(atTip.frame).toEqual(sameSide.frame)
  expect(atTip.blade.x).toBeLessThan(atBase.blade.x)
})

test('the camera stays visible while selecting and adjusting a tube on desktop', async ({ page }) => {
  await noGPU(page); await page.goto('/')
  for (const width of [1000, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('button', { name: 'Left light position', exact: true }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Left light position', exact: true }).focus()
    const image = await page.locator('.viewport').boundingBox()
    const rig = await page.locator('#rig-setup').boundingBox()
    expect(rig!.x).toBeGreaterThan(image!.x + image!.width)
    expect(image!.y).toBeLessThan(1000)
    expect(image!.y + image!.height).toBeGreaterThan(0)
    const frame = await page.locator('.viewport-frame').boundingBox()
    const scan = await page.locator('.navigator-panel').boundingBox()
    expect(frame!.width).toBeCloseTo(scan!.width, 0)
  }
})
