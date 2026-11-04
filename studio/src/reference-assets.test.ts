/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import manifest from '../public/blade-references/manifest.json'
import { HISTORICAL_PRESETS } from './historical-presets'

describe('reference-photo archive', () => {
  it('includes the exact ten blades with valid endpoint bounds, provenance and intact image files', () => {
    expect(manifest.map(p => p.name).sort()).toEqual(HISTORICAL_PRESETS.map(p => p.name).sort())
    for (const p of manifest) {
      expect(p.lengthMm).toBe(HISTORICAL_PRESETS.find(s => s.name === p.name)!.published.length)
      expect(p.crop.x + p.crop.width).toBeLessThanOrEqual(p.width)
      expect(p.crop.y + p.crop.height).toBeLessThanOrEqual(p.height)
      for (const point of [p.base, p.tip]) {
        expect(point.x).toBeGreaterThanOrEqual(p.crop.x); expect(point.x).toBeLessThanOrEqual(p.crop.x + p.crop.width)
        expect(point.y).toBeGreaterThanOrEqual(p.crop.y); expect(point.y).toBeLessThanOrEqual(p.crop.y + p.crop.height)
      }
      for (const image of [p, ...p.detailImages]) {
        const data = readFileSync(new URL(`../public/blade-references/${image.file}`, import.meta.url))
        expect(createHash('sha256').update(data).digest('hex')).toBe(image.sha256)
      }
      expect(p.rights).toContain('Permission')
    }
  })
})
