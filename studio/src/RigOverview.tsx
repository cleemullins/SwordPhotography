import { useEffect, useRef, useState } from 'react'
import { PerspectiveCamera, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameRigCamera, RigOverviewScene } from './rig-overview'
import type { StudioState } from './model'

export function RigOverview({ state }: { state: StudioState }) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const current = useRef(state), model = useRef<RigOverviewScene | null>(null)
  const redraw = useRef<(() => void) | null>(null), reset = useRef<(() => void) | null>(null)
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => { current.current = state; model.current?.update(state); redraw.current?.() }, [state])
  useEffect(() => {
    if (!canvas.current || !stage.current) return
    const element = canvas.current, container = stage.current
    let renderer: WebGLRenderer
    try { renderer = new WebGLRenderer({ canvas: element, antialias: true }) }
    catch (error) { setError(`3D rig overview unavailable: ${String(error)}`); return }
    const rig = new RigOverviewScene(current.current)
    model.current = rig
    const camera = new PerspectiveCamera(40, 1, 0.01, 50)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, element)
    controls.minDistance = 0.2; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI / 2 - 0.02
    let frame = 0, visible = false, viewAdjusted = false
    const draw = () => {
      if (frame || !visible) return
      frame = requestAnimationFrame(() => { frame = 0; renderer.render(rig.scene, camera) })
    }
    const fit = () => {
      controls.target.copy(frameRigCamera(camera, rig.viewPoints()))
      controls.update(); draw()
    }
    const theme = () => {
      const css = getComputedStyle(document.documentElement)
      const color = (name: string) => css.getPropertyValue(name).trim()
      rig.setColors({ background: color('--cp-bg-elevated'), table: color('--cp-surface-soft'),
        steel: color('--cp-text'), camera: color('--cp-border-strong'), left: color('--cp-accent'),
        right: color('--cp-success'), grid: color('--cp-border'), guide: color('--cp-text-soft') })
      draw()
    }
    const resize = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (!(width > 0 && height > 0)) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height, false)
      camera.aspect = width / height; camera.updateProjectionMatrix()
      if (!viewAdjusted) fit()
      draw()
    })
    const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; draw() })
    const themeChanges = new MutationObserver(theme)
    const lost = (event: Event) => { event.preventDefault(); setError('The 3D overview lost its graphics context. Reload to restore it.') }
    element.addEventListener('webglcontextlost', lost)
    controls.addEventListener('change', draw)
    controls.addEventListener('start', () => { viewAdjusted = true })
    resize.observe(container); visibility.observe(container)
    themeChanges.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    redraw.current = draw; reset.current = () => { viewAdjusted = false; fit() }
    theme(); setError(''); setReady(true)
    return () => {
      resize.disconnect(); visibility.disconnect(); themeChanges.disconnect()
      cancelAnimationFrame(frame)
      element.removeEventListener('webglcontextlost', lost)
      // Strict Mode and hot reload reuse this canvas; forcibly losing its context breaks the next setup.
      controls.dispose(); rig.dispose(); renderer.dispose()
      model.current = null; redraw.current = null; reset.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Rebuild scene resources after a renderer-module hot update.
  }, [RigOverviewScene])
  return <section className="panel rig-overview" aria-label="3D rig overview">
    <div className="panel-heading"><h2>3D rig overview</h2>
      <button disabled={!ready || Boolean(error)} onClick={() => reset.current?.()}>Reset 3D view</button></div>
    <p className="control-note">Drag to orbit · right-drag to pan · scroll to zoom. The outline shows camera coverage.</p>
    <div ref={stage} className="rig-overview-stage" data-ready={ready && !error}>
      <canvas ref={canvas} aria-label="Shaded 3D model of the table, nihonto, camera and two light tubes" />
      {error && <p className="rig-overview-error" role="alert">{error}</p>}
    </div>
    <p className="control-note">Shaded spatial preview, not a lighting simulation. Blade geometry and rig positions match the setup; table and camera bodies are illustrative.</p>
  </section>
}
