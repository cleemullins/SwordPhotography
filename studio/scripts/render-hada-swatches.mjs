import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-webgpu'] })
const images = new Map()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.on('pageerror', error => console.error(error))
  await page.goto(process.env.STUDIO_BASE_URL ?? 'http://127.0.0.1:5173')
  const state = await page.evaluate(async () => {
    const { defaultState } = await import('/src/model.ts')
    const s = defaultState()
    s.blade.y = 4.49; s.blade.detail = false; s.blade.hada = 'none'
    s.camera.height = 240; s.camera.focalLength = 135; s.camera.autoExposure = true
    s.lights[0] = { enabled: true, x: 0, y: -48, height: 200, brightness: 100 }
    s.lights[1].enabled = false; s.diameter = 25; s.referenceTape = false
    return s
  })
  await page.evaluate(s => localStorage.setItem('nihonto-studio-setup-v1', JSON.stringify(s)), state)
  await page.reload()
  await page.locator('.render-details summary').click()
  await page.getByLabel('Render quality', { exact: true }).selectOption('balanced')
  await mkdir('public/hada', { recursive: true })
  for (const type of (process.argv.length > 2 ? process.argv.slice(2) : ['none', 'itame', 'mokume', 'masame', 'ayasugi'])) {
    if (type !== 'none') {
      await page.getByRole('combobox', { name: 'Rendered hada' }).click()
      await page.getByRole('option', { name: type[0].toUpperCase() + type.slice(1), exact: true }).click()
      await page.waitForFunction(type => JSON.parse(localStorage.getItem('nihonto-studio-setup-v1')).blade.hada === type, type)
      if (await page.getByRole('button', { name: 'Resume rendering' }).count()) await page.getByRole('button', { name: 'Resume rendering' }).click()
    }
    await page.waitForFunction(() => Number(document.querySelector('.render-details')?.textContent.match(/(\d+) spp/)?.[1] ?? 0) >= 96, null, { timeout: 180_000 })
    await page.waitForFunction(() => document.querySelector('.auto-shutter-status')?.textContent.includes('90%'), null, { timeout: 30_000 }).catch(async error => {
      console.error(await page.locator('.exposure-panel').innerText())
      console.error(await page.locator('[role=alert]').allTextContents())
      await page.screenshot({ path: 'test-results/swatch-debug.png' })
      throw error
    })
    await page.getByRole('button', { name: 'Pause rendering' }).click()
    const image = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
      const source = document.querySelector('.viewport canvas')
      const target = document.createElement('canvas'); target.width = 512; target.height = 192
      const height = source.width * target.height / target.width
      target.getContext('2d').drawImage(source, 0, (source.height - height) / 2, source.width, height, 0, 0, 512, 192)
      resolve(target.toDataURL('image/png').split(',')[1])
    })))
    images.set(type, Buffer.from(image, 'base64'))
    console.log(`Rendered ${type} swatch`)
  }
} finally { await browser.close() }
for (const [type, image] of images) await writeFile(`public/hada/${type}.png`, image)
