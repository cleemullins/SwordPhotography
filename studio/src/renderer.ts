import {
  Scene, Mesh, MeshStandardMaterial, MeshBasicNodeMaterial, CylinderGeometry, PlaneGeometry,
  Color, WebGPURenderer, QuadMesh, StorageTexture, RenderTarget, HalfFloatType,
  Vector2, NoToneMapping, SRGBColorSpace, BufferGeometry, FloatType, NoBlending,
} from 'three/webgpu'
import { uniform, texture, uv, vec4, positionView, wgslFn, wgsl } from 'three/tsl'
import { PhysicalCamera } from 'three-gpu-pathtracer'
import { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu'
import { makeRenderBlade, makeBladeTextures, HADA_NORMAL_SCALE } from './blade'
import { SENSOR, TUBE_LENGTH, exposureScale, fieldOfView } from './model'
import type { StudioState, Quality, ViewMode, Overlays } from './model'
import { meterBlade } from './exposure'
import type { ExposureReading } from './exposure'
import { makeTapeTexture, TAPE_WIDTH, TAPE_GAP } from './tape'
import { createTubeEmitters, updateTubeEmitters, TUBE_SEGMENTS } from './tube-light'

export interface RenderStats {
  fps: number
  samples: number
  width: number
  height: number
  sampleLimit?: number
  stage: 'interactive' | 'refining' | 'paused' | 'sample limit'
}

const readPixel = wgsl(`
  fn readPixel(tex: texture_2d<f32>, coord: vec2f) -> vec3f {
    let size = vec2f(textureDimensions(tex));
    // QuadMesh and the storage textures both use top-down coordinates.
    let p = coord * size - 0.5;
    let i = vec2i(floor(p));
    let f = fract(p);
    let hi = vec2i(size) - 1;
    let a = textureLoad(tex, clamp(i, vec2i(0), hi), 0).rgb;
    let b = textureLoad(tex, clamp(i + vec2i(1,0), vec2i(0), hi), 0).rgb;
    let c = textureLoad(tex, clamp(i + vec2i(0,1), vec2i(0), hi), 0).rgb;
    let d = textureLoad(tex, clamp(i + vec2i(1,1), vec2i(0), hi), 0).rgb;
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
`)
const composite = wgslFn(`
  fn studioComposite(
    left: texture_2d<f32>, right: texture_2d<f32>, coord: vec2f,
    gains: vec2f, exposure: f32, mode: f32, clipping: f32,
    rose: vec3f, green: vec3f
  ) -> vec4f {
    let l = readPixel(left, coord) * gains.x;
    let r = readPixel(right, coord) * gains.y;
    let beauty = (l + r) * exposure;
    var radiance = beauty;
    var measured = beauty;
    if (mode > 0.5 && mode < 1.5) {
      radiance = (dot(l, vec3f(0.2126,0.7152,0.0722)) * rose +
                  dot(r, vec3f(0.2126,0.7152,0.0722)) * green) * exposure;
    } else if (mode > 1.5 && mode < 2.5) {
      radiance = l * exposure;
      measured = radiance;
    } else if (mode > 2.5) {
      radiance = r * exposure;
      measured = radiance;
    }
    // Reinhard display mapping; diagnostics use the linear values above.
    var display = radiance / (vec3f(1.0) + radiance);
    if (clipping > 0.5 && max(measured.r, max(measured.g, measured.b)) >= 1.0) {
      let stripe = step(0.5, fract((coord.x + coord.y) * 90.0));
      display = mix(display, rose, 0.45 + stripe * 0.5);
    }
    return vec4f(display, 1.0);
  }
`, [readPixel])

const meter = wgslFn(`
  fn bladeMeter(left: texture_2d<f32>, right: texture_2d<f32>, depth: texture_2d<f32>, coord: vec2f, gains: vec2f) -> vec4f {
    let radiance = readPixel(left, coord) * gains.x + readPixel(right, coord) * gains.y;
    let mask = select(0.0, 1.0, readPixel(depth, coord).r > 0.0);
    return vec4f(radiance, mask);
  }
`, [readPixel])

export class StudioRenderer {
  private renderer: WebGPURenderer
  private canvas: HTMLCanvasElement
  private state: StudioState
  private onStats: (stats: RenderStats) => void
  private onError: (message: string) => void
  private camera = new PhysicalCamera(30, SENSOR.width / SENSOR.height, 0.001, 20)
  private tracers: WebGPUPathTracer[] = []
  private scenes: Scene[] = []
  private blades: Mesh[] = []
  private tubeMeshes: Mesh<CylinderGeometry, MeshStandardMaterial>[][] = []
  private tubeEmitters: ReturnType<typeof createTubeEmitters>[] = []
  private bladeMaterial = new MeshStandardMaterial({ color: new Color(0.64, 0.67, 0.69), metalness: 1, roughness: 0.12 })
  private geometry: BufferGeometry
  private polish: ReturnType<typeof makeBladeTextures>['polish']
  private grainNormals: ReturnType<typeof makeBladeTextures>['normals']
  private grainReflectance: ReturnType<typeof makeBladeTextures>['reflectance']
  private tapeTexture: ReturnType<typeof makeTapeTexture>
  private tapeGeometry: PlaneGeometry
  private tapeMaterial: MeshStandardMaterial
  private tapes: Mesh[] = []
  private tubeGeometry = new CylinderGeometry(1, 1, 1, TUBE_SEGMENTS, 1, false)
  private bedGeometry = new PlaneGeometry(4, 3)
  private bedMaterial = new MeshStandardMaterial({ color: new Color(0.008, 0.009, 0.01), roughness: 0.95 })
  private depthScene = new Scene()
  private depthMaterial = new MeshBasicNodeMaterial()
  private depthBlade: Mesh
  private depthTarget = new RenderTarget(1, 1, { type: HalfFloatType })
  private leftTexture = texture(new StorageTexture(1, 1))
  private rightTexture = texture(new StorageTexture(1, 1))
  private gains = uniform(new Vector2(1, 1))
  private exposure = uniform(1)
  private mode = uniform(0)
  private clipping = uniform(0)
  private rose = uniform(new Color())
  private green = uniform(new Color())
  private postMaterial = new MeshBasicNodeMaterial()
  private quad: QuadMesh
  private meterTarget = new RenderTarget(256, 170, { type: FloatType, depthBuffer: false })
  private meterMaterial = new MeshBasicNodeMaterial()
  private meterQuad: QuadMesh
  private revision = 0
  private samples = 0
  private animation = 0
  private running = false
  private disposed = false
  private width = 900
  private height = Math.round(900 * SENSOR.height / SENSOR.width)
  private renderWidth = 0
  private renderHeight = 0
  private frames = 0
  private lastStats = performance.now()
  private changedAt = performance.now()
  private measuring = false
  private quality: Quality = 'quality'
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  private paused = false
  private depthDirty = true

  constructor(
    canvas: HTMLCanvasElement,
    state: StudioState,
    onStats: (stats: RenderStats) => void,
    onError: (message: string) => void,
  ) {
    this.canvas = canvas; this.state = state; this.onStats = onStats; this.onError = onError
    this.geometry = makeRenderBlade(state.blade.definition)
    const surface = makeBladeTextures(state.blade.hada, state.blade.detail, state.blade.definition)
    this.polish = surface.polish; this.grainNormals = surface.normals
    this.grainReflectance = surface.reflectance
    this.tapeTexture = makeTapeTexture(state.blade.definition.length)
    this.tapeGeometry = new PlaneGeometry(state.blade.definition.length / 1000, TAPE_WIDTH)
    this.tapeMaterial = new MeshStandardMaterial({ map: this.tapeTexture, roughness: 0.85, metalness: 0 })
    this.depthBlade = new Mesh(this.geometry, this.depthMaterial)
    this.renderer = new WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.toneMapping = NoToneMapping
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.onDeviceLost = info => this.fail(`GPU device lost: ${info.message}. Reload the app to reconnect.`)
    this.camera.up.set(0, 1, 0)
    this.depthMaterial.colorNode = vec4(positionView.z.negate(), 0, 0, 1)
    this.depthMaterial.toneMapped = false
    this.depthScene.add(this.depthBlade)
    // wgslFn's declarations erase its return type; studioComposite explicitly returns vec4f.
    this.postMaterial.colorNode = composite(
      this.leftTexture, this.rightTexture, uv(),
      this.gains, this.exposure, this.mode, this.clipping,
      this.rose, this.green,
    ) as ReturnType<typeof vec4>
    this.postMaterial.toneMapped = false
    this.quad = new QuadMesh(this.postMaterial)
    this.meterMaterial.colorNode = meter(this.leftTexture, this.rightTexture, texture(this.depthTarget.texture), uv(), this.gains) as ReturnType<typeof vec4>
    this.meterMaterial.toneMapped = false
    this.meterMaterial.transparent = true
    this.meterMaterial.blending = NoBlending
    this.meterQuad = new QuadMesh(this.meterMaterial)
  }

  async init() {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable. Use a current desktop Chrome or Edge with hardware acceleration, over HTTPS or localhost.')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No compatible WebGPU adapter was found. Check browser hardware acceleration and your graphics driver.')
    await this.renderer.init()
    if (this.disposed) { this.renderer.dispose(); return }
    if (!('isWebGPUBackend' in this.renderer.backend)) throw new Error('The browser selected a non-WebGPU backend. Ray tracing requires WebGPU.')
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(this.width, this.height, false)
    for (let source = 0; source < 2; source++) {
      const scene = new Scene()
      scene.background = new Color(0, 0, 0)
      const blade = new Mesh(this.geometry, this.bladeMaterial)
      const bed = new Mesh(this.bedGeometry, this.bedMaterial)
      const tape = new Mesh(this.tapeGeometry, this.tapeMaterial)
      this.tapes.push(tape)
      bed.position.z = -0.035
      scene.add(blade, bed, tape)
      const tubes = [0, 1].map(() => {
        // Emission comes only from the matching analytic panels, never twice.
        const material = new MeshStandardMaterial({
          color: new Color(0.7, 0.7, 0.7), roughness: 0.5,
        })
        const tube = new Mesh(this.tubeGeometry, material)
        tube.rotation.z = Math.PI / 2
        scene.add(tube)
        return tube
      })
      const emitters = createTubeEmitters()
      scene.add(...emitters)
      this.tubeEmitters.push(emitters)
      this.scenes.push(scene); this.blades.push(blade); this.tubeMeshes.push(tubes)
      const tracer = new WebGPUPathTracer(this.renderer)
      tracer.maxBounces = 6
      tracer.maxSamples = this.sampleLimit()
      tracer.frameBudget = 131072
      tracer.filterGlossyFactor = 0
      tracer.clampDirect = 0
      tracer.clampIndirect = 0
      tracer.dynamicLowRes = false
      tracer.renderDelay = 0
      tracer.minSamples = 0
      tracer.fadeDuration = 0
      tracer.synchronizeRenderSize = false
      this.tracers.push(tracer)
    }
    this.applyTransforms()
    this.updateCamera()
    this.applyMaterial()
    this.scenes.forEach((s, i) => this.tracers[i].setScene(s, this.camera))
    this.updateDisplay()
    this.updateTheme()
    this.running = true
    this.tick()
  }

  private applyMaterial() {
    this.bladeMaterial.roughness = this.state.blade.roughness
    this.bladeMaterial.roughnessMap = this.state.blade.detail || this.state.blade.hada !== 'none' ? this.polish : null
    this.bladeMaterial.normalMap = this.grainNormals
    this.bladeMaterial.normalScale.setScalar(HADA_NORMAL_SCALE)
    this.bladeMaterial.map = this.grainReflectance
    this.bladeMaterial.needsUpdate = true
  }

  private applyTransforms() {
    const s = this.state
    for (const blade of [...this.blades, this.depthBlade]) blade.position.set(s.blade.x / 1000, s.blade.y / 1000, 0)
    for (const tape of this.tapes) {
      tape.position.set(s.blade.x / 1000, s.blade.y / 1000 + this.geometry.boundingBox!.max.y + TAPE_GAP + TAPE_WIDTH / 2, 0)
      tape.visible = s.referenceTape
    }
    this.tubeMeshes.forEach(tubes => tubes.forEach((tube, i) => {
      const l = s.lights[i]
      tube.position.set(l.x / 1000, l.y / 1000, l.height / 1000)
      tube.scale.set(s.diameter / 2000, TUBE_LENGTH / 1000, s.diameter / 2000)
    }))
    this.tubeEmitters.forEach((emitters, i) => updateTubeEmitters(emitters, s.lights[i], s.diameter))
    this.scenes.forEach(s => s.updateMatrixWorld(true))
    this.depthScene.updateMatrixWorld(true)
    this.depthDirty = true
  }

  private updateCamera() {
    const s = this.state.camera
    const optics = fieldOfView(s)
    this.camera.position.set(0, 0, s.height / 1000)
    this.camera.lookAt(0, 0, 0)
    this.camera.filmGauge = SENSOR.width
    this.camera.fov = 2 * Math.atan(SENSOR.height / (2 * optics.imageDistance)) * 180 / Math.PI
    this.camera.focusDistance = s.focus / 1000
    // Always-sharp lighting preview; aperture affects throughput, not ray spread.
    this.camera.bokehSize = 0
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    this.depthDirty = true
  }

  private updateDisplay() {
    const lights = this.state.lights
    this.gains.value.set(lights[0].enabled ? lights[0].brightness / 100 : 0, lights[1].enabled ? lights[1].brightness / 100 : 0)
    this.exposure.value = exposureScale(this.state.camera)
  }

  update(next: StudioState) {
    if (this.disposed) return
    this.revision++
    const old = this.state
    const definitionChanged = JSON.stringify(old.blade.definition) !== JSON.stringify(next.blade.definition)
    const geometryChanged = definitionChanged || old.referenceTape !== next.referenceTape
    const textureChanged = old.blade.hada !== next.blade.hada || old.blade.detail !== next.blade.detail ||
      definitionChanged
    const materialChanged = old.blade.roughness !== next.blade.roughness || textureChanged
    const transformsChanged = old.blade.x !== next.blade.x || old.blade.y !== next.blade.y || old.diameter !== next.diameter ||
      old.lights.some((l, i) => l.x !== next.lights[i].x || l.y !== next.lights[i].y || l.height !== next.lights[i].height)
    const cameraChanged = ['height', 'focalLength', 'focus'].some(k =>
      old.camera[k as keyof StudioState['camera']] !== next.camera[k as keyof StudioState['camera']])
    this.state = next
    const previousPolish = this.polish, previousNormals = this.grainNormals, previousReflectance = this.grainReflectance
    if (textureChanged) {
      const surface = makeBladeTextures(next.blade.hada, next.blade.detail, next.blade.definition)
      this.polish = surface.polish; this.grainNormals = surface.normals
      this.grainReflectance = surface.reflectance
    }
    if (geometryChanged) {
      const oldGeometry = this.geometry
      const oldTape = this.tapeGeometry, oldTapeTexture = this.tapeTexture
      this.geometry = makeRenderBlade(next.blade.definition)
      this.tapeGeometry = new PlaneGeometry(next.blade.definition.length / 1000, TAPE_WIDTH)
      this.tapeTexture = makeTapeTexture(next.blade.definition.length)
      this.tapeMaterial.map = this.tapeTexture
      for (const tape of this.tapes) tape.geometry = this.tapeGeometry
      for (const blade of [...this.blades, this.depthBlade]) blade.geometry = this.geometry
      this.applyTransforms(); this.applyMaterial(); this.updateCamera()
      this.scenes.forEach((s, i) => this.tracers[i].setScene(s, this.camera))
      oldGeometry.dispose()
      oldTape.dispose(); oldTapeTexture.dispose()
    } else {
      if (transformsChanged) {
        this.applyTransforms()
        this.tracers.forEach(t => { t.updateTransforms(); t.updateLights() })
      }
      if (cameraChanged) { this.updateCamera(); this.tracers.forEach(t => t.updateCamera()) }
      if (materialChanged) { this.applyMaterial(); this.tracers.forEach(t => t.updateMaterials()) }
    }
    if (textureChanged) { previousPolish.dispose(); previousNormals?.dispose(); previousReflectance?.dispose() }
    if (geometryChanged || transformsChanged || cameraChanged || materialChanged) {
      this.samples = 0
      this.changedAt = performance.now()
      this.onStats({ fps: 0, samples: 0, width: this.renderWidth, height: this.renderHeight, stage: this.paused ? 'paused' : 'interactive' })
    }

    this.updateDisplay()
  }

  async meterOnce(): Promise<ExposureReading> {
    if (this.disposed || this.samples < 8) throw new Error('Wait for at least 8 stable samples before metering.')
    const revision = this.revision
    try {
      this.renderer.setRenderTarget(this.meterTarget)
      this.meterQuad.render(this.renderer)
    } finally {
      this.renderer.setRenderTarget(null)
    }
    const pixels = await this.renderer.readRenderTargetPixelsAsync(this.meterTarget, 0, 0, 256, 170)
    if (this.disposed || revision !== this.revision) throw new Error('The scene changed while metering. Meter again once it is still.')
    const camera = { ...this.state.camera, compensate: false }
    let reading = meterBlade(pixels, camera)
    for (let i = 0; i < 20 && reading.status.startsWith('Adjusting'); i++) {
      camera.shutter = reading.shutter
      reading = meterBlade(pixels, camera)
    }
    if (reading.status.startsWith('Not enough') || reading.status.startsWith('Blade is dark')) throw new Error(reading.status)
    return reading
  }

  updateTheme() {
    const css = getComputedStyle(document.documentElement)
    this.rose.value.set(css.getPropertyValue('--cp-accent').trim())
    this.green.value.set(css.getPropertyValue('--cp-success').trim())
  }

  setView(mode: ViewMode, overlays: Overlays) {
    this.mode.value = { beauty: 0, sources: 1, left: 2, right: 3 }[mode]
    this.clipping.value = Number(overlays.clipping)
  }

  private sampleLimit() { return { interactive: 256, balanced: 1024, quality: 4096 }[this.quality] }
  setQuality(quality: Quality) {
    this.quality = quality; this.changedAt = performance.now(); this.revision++
    this.tracers.forEach(t => { t.maxSamples = this.sampleLimit() })
  }
  setPaused(paused: boolean) { this.paused = paused }

  resize(width: number) {
    this.width = Math.max(100, Math.round(width))
    this.height = Math.round(this.width * SENSOR.height / SENSOR.width)
    this.renderer.setSize(this.width, this.height, false)
    this.depthDirty = true
  }

  private tick = () => {
    if (!this.running || this.disposed) return
    try {
      const interactive = performance.now() - this.changedAt < 400
      const nativeWidth = Math.round(this.width * this.pixelRatio)
      const w = interactive ? Math.min(nativeWidth, 360) : this.quality === 'quality' ?
        Math.min(Math.max(nativeWidth, 1200), 2400) : Math.min(nativeWidth, this.quality === 'balanced' ? 1200 : 480)
      const h = Math.round(w * SENSOR.height / SENSOR.width)
      if (w !== this.renderWidth || h !== this.renderHeight) {
        this.revision++
        this.tracers.forEach(t => t.setSize(w, h))
        this.samples = 0
        this.renderWidth = w; this.renderHeight = h
      }
      for (const t of this.tracers) { t.pause = this.paused; t.renderSample() }
      if (this.tracers[0].target && this.tracers[1].target) {
        this.leftTexture.value = this.tracers[0].target
        this.rightTexture.value = this.tracers[1].target
      }
      if (this.depthDirty) {
        this.depthTarget.setSize(this.width, this.height)
        this.renderer.setRenderTarget(this.depthTarget)
        this.renderer.setClearColor(0, 1)
        this.renderer.render(this.depthScene, this.camera)
        this.renderer.setRenderTarget(null)
        this.depthDirty = false
      }
      this.quad.render(this.renderer)
      this.frames++
      const now = performance.now()
      if (now - this.lastStats > 1000 && !this.measuring) {
        const fps = this.frames * 1000 / (now - this.lastStats)
        this.frames = 0; this.lastStats = now; this.measuring = true
        const revision = this.revision
        Promise.all(this.tracers.map(t => t.getSampleCountsAsync())).then(counts => {
          if (this.disposed || revision !== this.revision) return
          this.samples = Math.min(...counts.map(c => c.min))
          this.onStats({
            fps, samples: this.samples, width: w, height: h,
            sampleLimit: this.sampleLimit(),
            stage: this.paused ? 'paused' : interactive ? 'interactive' : this.samples >= this.sampleLimit() ? 'sample limit' : 'refining',
          })
        }).catch(error => this.fail(`Cannot read GPU progress: ${String(error)}`)).finally(() => { this.measuring = false })
      }
    } catch (error) {
      this.fail(`Rendering failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    this.animation = requestAnimationFrame(this.tick)
  }

  async capture(grid = false): Promise<Blob> {
    const output = document.createElement('canvas')
    output.width = this.renderWidth; output.height = this.renderHeight
    const context = output.getContext('2d')
    if (!context) throw new Error('A 2D canvas is required to export captures.')
    try {
      this.renderer.setDrawingBufferSize(output.width, output.height, 1)
      this.quad.render(this.renderer)
      context.drawImage(this.canvas, 0, 0)
    } finally {
      this.renderer.setDrawingBufferSize(this.width, this.height, this.pixelRatio)
      this.quad.render(this.renderer)
    }
    if (grid) {
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--cp-border-strong').trim()
      context.globalAlpha = 0.65
      context.lineWidth = Math.max(1, output.width / 900)
      context.beginPath()
      for (const fraction of [1 / 3, 2 / 3]) {
        context.moveTo(output.width * fraction, 0); context.lineTo(output.width * fraction, output.height)
        context.moveTo(0, output.height * fraction); context.lineTo(output.width, output.height * fraction)
      }
      context.moveTo(output.width * 0.489, output.height / 2); context.lineTo(output.width * 0.511, output.height / 2)
      context.moveTo(output.width / 2, output.height * 0.483); context.lineTo(output.width / 2, output.height * 0.517)
      context.stroke()
    }
    return new Promise((resolve, reject) => output.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('The browser could not capture the camera image.')), 'image/png'))
  }

  private fail(message: string) {
    if (this.disposed) return
    this.running = false
    cancelAnimationFrame(this.animation)
    this.onError(message)
  }

  dispose() {
    this.disposed = true; this.running = false
    cancelAnimationFrame(this.animation)
    this.tracers.forEach(t => t.dispose())
    this.tubeMeshes.flat().forEach(t => t.material.dispose())
    this.geometry.dispose(); this.tubeGeometry.dispose(); this.bedGeometry.dispose()
    this.tapeGeometry.dispose(); this.tapeTexture.dispose(); this.tapeMaterial.dispose()
    this.bladeMaterial.dispose(); this.bedMaterial.dispose(); this.depthMaterial.dispose()
    this.polish.dispose(); this.grainNormals?.dispose(); this.grainReflectance?.dispose(); this.depthTarget.dispose(); this.postMaterial.dispose(); this.quad.dispose()
    this.meterTarget.dispose(); this.meterMaterial.dispose(); this.meterQuad.dispose()
    this.renderer.dispose()
  }
}
