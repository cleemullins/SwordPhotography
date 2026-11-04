export const KISSAKI_TYPES = { ko: 'Ko-kissaki', chu: 'Chu-kissaki', o: 'O-kissaki', ikubi: 'Ikubi-kissaki', custom: 'Custom kissaki' } as const
export type KissakiType = keyof typeof KISSAKI_TYPES
export const HADA_TYPES = { none: 'None', itame: 'Itame', mokume: 'Mokume', masame: 'Masame', ayasugi: 'Ayasugi' } as const
export type HadaType = keyof typeof HADA_TYPES
export interface BladeProfile {
  version: 1
  tipWidth: number
  baseKasane: number
  tipKasane: number
  curvePosition: number
  kissakiType: KissakiType
  fukura: number
  niku: number
}
export interface BladeDefinition {
  length: number
  width: number
  thickness: number
  curvature: number
  taper: number
  ridge: number
  tipLength: number
  profile?: BladeProfile
}

export interface LightSettings {
  enabled: boolean
  x: number
  y: number
  height: number
  brightness: number
}

export interface StudioState {
  version: 1
  setupName: string
  referenceTape: boolean
  scan: { start: number; end: number; step: number; locked: boolean }
  automaticLightPosition: boolean
  camera: {
    height: number
    focalLength: number
    aperture: number
    focus: number
    exposure: number
    compensate: boolean
    shutter: number
    autoExposure: boolean
  }
  blade: {
    name: string
    definition: BladeDefinition
    x: number
    y: number
    roughness: number
    detail: boolean
    hada: HadaType
  }
  lights: [LightSettings, LightSettings]
  diameter: number
}

export type Quality = 'interactive' | 'balanced' | 'quality'
export type ViewMode = 'beauty' | 'sources' | 'left' | 'right'
export interface Overlays { grid: boolean; clipping: boolean; focus: boolean }

export const SENSOR = {
  model: 'Nikon Z5II', type: 'BSI-CMOS', width: 35.9, height: 23.9,
  megapixels: 24.5, pixelWidth: 6048, pixelHeight: 4032,
}
export const TUBE_FIXTURE = {
  model: 'GVM-PRO-BD45R',
  length: 1200, width: 50, depth: 46,
  power: 45, leds: 660, cri: 97, weight: 1.6,
  colorTemperature: [2700, 10000],
  illuminance: [{ distance: 1, lux: 750 }, { distance: 0.5, lux: 2180 }],
} as const
export const TUBE_LENGTH = TUBE_FIXTURE.length
export const LIMITS = {
  height: [160, 1800], focalLength: [20, 135], aperture: [1.2, 11],
  focus: [140, 2000], exposure: [-6, 8], x: [-800, 800], y: [-450, 450],
  lightHeight: [15, 1000], brightness: [0, 200], diameter: [10, 80],
  roughness: [0.025, 0.45],
  shutter: [1 / 8000, 30],
} as const

export const PRESETS: Record<string, BladeDefinition> = {
  'Shinogi-zukuri': { length: 700, width: 33, thickness: 6.5, curvature: 18, taper: 0.3, ridge: 0.18, tipLength: 45 },
  'Slender tachi': { length: 770, width: 28, thickness: 5.5, curvature: 30, taper: 0.4, ridge: 0.12, tipLength: 35 },
  'Wide wakizashi': { length: 460, width: 36, thickness: 6, curvature: 9, taper: 0.22, ridge: 0.16, tipLength: 50 },
}

export function defaultState(): StudioState {
  return {
    version: 1,
    setupName: 'Untitled rig',
    referenceTape: true,
    scan: { start: 0, end: 700, step: 50, locked: false },
    automaticLightPosition: false,
    camera: { height: 480, focalLength: 60, aperture: 5.6, focus: 477, exposure: -1.5, compensate: true, shutter: 1 / 125, autoExposure: false },
    blade: { name: 'Shinogi-zukuri', definition: { ...PRESETS['Shinogi-zukuri'] }, x: 0, y: 0, roughness: 0.12, detail: true, hada: 'none' },
    lights: [
      { enabled: true, x: 0, y: -110, height: 380, brightness: 100 },
      { enabled: true, x: 0, y: 110, height: 760, brightness: 65 },
    ],
    diameter: TUBE_FIXTURE.depth,
  }
}

export function fieldOfView(camera: StudioState['camera']) {
  // Thin-lens image distance at the selected focus, not infinity-focus framing.
  const imageDistance = camera.focalLength * camera.focus / (camera.focus - camera.focalLength)
  return {
    width: SENSOR.width * camera.height / imageDistance,
    height: SENSOR.height * camera.height / imageDistance,
    imageDistance,
  }
}

export function exposureScale(camera: StudioState['camera']) {
  return 2 ** camera.exposure * camera.shutter * 125 * (camera.compensate ? 1 : (5.6 / camera.aperture) ** 2)
}

export function editableBlade(d: BladeDefinition): BladeDefinition & { profile: BladeProfile } {
  if (d.profile) return { ...d, profile: { ...d.profile } }
  const tipStart = 1 - d.tipLength / d.length
  return { ...d, profile: {
    version: 1, tipWidth: d.width * (1 - d.taper * tipStart),
    baseKasane: d.thickness * 0.76, tipKasane: d.thickness * (1 - 0.35 * tipStart) * 0.76,
    curvePosition: 0.5, kissakiType: 'custom', fukura: 0.5, niku: 0,
  } }
}

export function bladeAngles(d: BladeDefinition) {
  const p = editableBlade(d).profile
  const bevel = Math.atan2(d.thickness / 2, d.width * (d.ridge + 0.5)) * 180 / Math.PI
  const upper = Math.atan2((d.thickness - p.baseKasane) / 2, d.width * (0.5 - d.ridge)) * 180 / Math.PI
  return { bevel, upper, included: bevel * 2 }
}

export function parseBladeDefinition(value: unknown): BladeDefinition {
  const d = object(value, 'Blade definition')
  const modern = d.profile !== undefined
  const length = number(d.length, 'Blade length', modern ? 100 : 200, 1200)
  const width = number(d.width, 'Blade width', 15, 70)
  const thickness = number(d.thickness, 'Shinogi thickness', 2, 12)
  const definition: BladeDefinition = {
    length, width, thickness, curvature: number(d.curvature, 'Curvature', 0, 60),
    taper: number(d.taper, 'Taper', 0, 0.6), ridge: number(d.ridge, 'Ridge', -0.1, 0.35),
    tipLength: number(d.tipLength, 'Tip length', modern ? 5 : 10, modern ? Math.min(300, length - 20) : 100),
  }
  if (modern) {
    const p = object(d.profile, 'Blade profile')
    if (p.version !== 1) throw new Error('Unsupported blade profile version.')
    if (typeof p.kissakiType !== 'string' || !Object.hasOwn(KISSAKI_TYPES, p.kissakiType)) throw new Error('Unknown kissaki type.')
    const baseKasane = number(p.baseKasane, 'Motokasane', 1, thickness)
    definition.profile = {
      version: 1, kissakiType: p.kissakiType as KissakiType,
      tipWidth: number(p.tipWidth, 'Sakihaba', 5, width),
      baseKasane, tipKasane: number(p.tipKasane, 'Sakikasane', 0.5, baseKasane),
      curvePosition: number(p.curvePosition, 'Curvature peak', 0.15, 0.85),
      fukura: number(p.fukura, 'Fukura', 0, 1), niku: number(p.niku, 'Niku', 0, 0.1),
    }
  }
  return definition
}

export function blurDiameter(depth: number, camera: StudioState['camera']) {
  const f = camera.focalLength
  return Math.abs(f * f * (depth - camera.focus) / (camera.aperture * depth * (camera.focus - f)))
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function number(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`)
  }
  return value
}

function bool(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`)
  return value
}

export function parseSetup(value: unknown): StudioState {
  const root = object(value, 'Setup')
  if (root.version !== 1) throw new Error('Unsupported setup version. Expected version 1.')
  const c = object(root.camera, 'Camera')
  const b = object(root.blade, 'Blade')
  const hada = b.hada === undefined ? 'none' : b.hada
  if (typeof hada !== 'string' || !Object.hasOwn(HADA_TYPES, hada)) throw new Error('Unknown hada type.')
  if (typeof b.name !== 'string' || b.name.length < 1 || b.name.length > 80) throw new Error('Blade name must contain 1-80 characters.')
  if (!Array.isArray(root.lights) || root.lights.length !== 2) throw new Error('A setup must contain exactly two lights.')
  const definition = parseBladeDefinition(b.definition)
  const scan = root.scan === undefined ? { start: 0, end: definition.length, step: 50, locked: false } : object(root.scan, 'Scan')
  const start = number(scan.start, 'Scan start', 0, definition.length), end = number(scan.end, 'Scan end', start, definition.length)
  const setupName = root.setupName === undefined ? 'Untitled rig' : root.setupName
  if (typeof setupName !== 'string' || !setupName.trim() || setupName.length > 80) throw new Error('Setup name must contain 1-80 characters.')
  const readLight = (value: unknown): LightSettings => {
    const l = object(value, 'Light')
    return {
      enabled: bool(l.enabled, 'Light enabled'), x: number(l.x, 'Light x', ...LIMITS.x),
      y: number(l.y, 'Light y', ...LIMITS.y), height: number(l.height, 'Light height', ...LIMITS.lightHeight),
      brightness: number(l.brightness, 'Brightness', ...LIMITS.brightness),
    }
  }
  return {
    version: 1,
    setupName,
    referenceTape: root.referenceTape === undefined ? true : bool(root.referenceTape, 'Reference tape'),
    scan: { start, end, step: number(scan.step, 'Scan step', 0.1, 1200), locked: bool(scan.locked, 'Rig lock') },
    automaticLightPosition: root.automaticLightPosition === undefined ? false : bool(root.automaticLightPosition, 'Automatic light position'),
    camera: {
      height: number(c.height, 'Camera height', ...LIMITS.height),
      focalLength: number(c.focalLength, 'Focal length', ...LIMITS.focalLength),
      aperture: number(c.aperture, 'Aperture', ...LIMITS.aperture),
      focus: number(c.focus, 'Focus', ...LIMITS.focus),
      exposure: number(c.exposure, 'Exposure', ...LIMITS.exposure),
      compensate: bool(c.compensate, 'Exposure compensation'),
      shutter: c.shutter === undefined ? 1 / 125 : number(c.shutter, 'Shutter speed', ...LIMITS.shutter),
      autoExposure: c.autoExposure === undefined ? false : bool(c.autoExposure, 'Auto exposure'),
    },
    blade: {
      name: b.name,
      definition,
      x: number(b.x, 'Blade x', ...LIMITS.x), y: number(b.y, 'Blade y', ...LIMITS.y),
      roughness: number(b.roughness, 'Roughness', ...LIMITS.roughness),
      detail: bool(b.detail, 'Material detail'),
      hada: hada as HadaType,
    },
    lights: [readLight(root.lights[0]), readLight(root.lights[1])],
    diameter: number(root.diameter, 'Tube diameter', ...LIMITS.diameter),
  }
}

export function sceneWarnings(s: StudioState): string[] {
  const warnings: string[] = []
  for (const [i, l] of s.lights.entries()) {
    const distance = Math.abs(l.y - s.blade.y)
    if (distance < s.blade.definition.width / 2 + s.blade.definition.curvature + s.diameter / 2 &&
      l.height - s.diameter / 2 < s.blade.definition.thickness / 2) {
      warnings.push(`${i === 0 ? 'Left' : 'Right'} tube may intersect the blade. Check clearance.`)
    }
    if (Math.abs(l.x) < TUBE_LENGTH / 2 && Math.hypot(l.y, l.height - s.camera.height) < s.diameter / 2 + 5) {
      warnings.push(`${i === 0 ? 'Left' : 'Right'} tube overlaps the camera pupil.`)
    }
  }
  if (!s.lights.some(l => l.enabled && l.brightness > 0)) warnings.push('Both sources are dark. The simulated room has no ambient illumination.')
  return warnings
}
