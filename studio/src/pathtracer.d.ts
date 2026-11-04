// The pinned package ships WebGL declarations but not its WebGPU entry point.
declare module 'three-gpu-pathtracer/webgpu' {
  import type { Camera, Scene, Texture, WebGPURenderer } from 'three/webgpu'
  export class WebGPUPathTracer {
    constructor(renderer: WebGPURenderer)
    maxBounces: number
    frameBudget: number
    maxSamples: number
    filterGlossyFactor: number
    clampDirect: number
    clampIndirect: number
    dynamicLowRes: boolean
    renderDelay: number
    fadeDuration: number
    minSamples: number
    synchronizeRenderSize: boolean
    pause: boolean
    readonly target: Texture | null
    setScene(scene: Scene, camera: Camera): void
    updateCamera(): void
    updateMaterials(): void
    updateTransforms(): void
    updateLights(): void
    setSize(width: number, height: number): void
    renderSample(): void
    reset(): void
    getSampleCountsAsync(): Promise<{ min: number; max: number; avg: number; samplesPerSecond: number }>
    dispose(): void
  }
}
