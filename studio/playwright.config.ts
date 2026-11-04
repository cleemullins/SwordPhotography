import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: process.env.STUDIO_BASE_URL ?? 'http://127.0.0.1:5173',
    channel: 'msedge',
    viewport: { width: 1440, height: 1100 },
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.STUDIO_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
