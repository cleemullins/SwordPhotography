import { useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { Aperture, Camera, Check, CircleHelp, Grid3X3, Maximize, Pause, Play, ScanLine, X } from 'lucide-react'
import { StudioRenderer } from './renderer'
import type { RenderStats } from './renderer'
import { defaultState, parseSetup, fieldOfView, PRESETS, clamp, sceneWarnings, SENSOR, LIMITS, TUBE_FIXTURE, TUBE_LENGTH } from './model'
import type { StudioState, Overlays, ViewMode, Quality, LightSettings, BladeDefinition } from './model'
import { Slider, ShutterSlider, NumberControl, BladeNavigator, SetupDiagram, TubeSpan } from './components'
import { ModelEditor } from './ModelEditor'
import { makeBlade } from './blade'
import { TAPE_GAP, TAPE_WIDTH } from './tape'
import { HISTORICAL_PRESETS } from './historical-presets'
import { shutterLabel } from './exposure'
import { cameraForCoverage } from './framing'
import { automaticLightPlacement } from './automatic-lighting'
import { prepareSetup, scanPlan, updateRig } from './scan'
import { download, downloadSetup, listCaptures, saveCapture, deleteCapture } from './storage'
import type { Capture } from './storage'
import './App.css'

const SESSION_KEY = 'nihonto-studio-setup-v1'
const CHECKBOX_HELP = {
  tape: 'A yellow tape with millimeter ticks and centimeter numbers moves with the blade table and appears in saved previews. Zero is at the blade base. It is not a screen overlay.',
  compensate: 'Keeps brightness steady when aperture changes. Turn off to simulate aperture-dependent light throughput. The preview always stays sharp.',
  linked: 'Mirrors light positions around the stationary camera origin and matches their heights and along-blade offsets. Brightness and on/off remain independent.',
  tube: 'Toggles emission from this tube. A disabled tube remains physical geometry and can still block or reflect light.',
  hamon: 'Adds illustrative hamon and polish variation to surface roughness, independently of the selected hada. This is not authentic hamon reconstruction.',
}
function initialSetup() {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    return { state: prepareSetup(saved ? parseSetup(JSON.parse(saved)) : defaultState()), error: '' }
  } catch (error) {
    return { state: prepareSetup(defaultState()), error: `The saved setup could not be restored; defaults are shown. ${String(error)}` }
  }
}
interface Reference { file: string; objectId: number; title: string; sourcePage: string; license: string }
function CaptureImage({ capture }: { capture: Capture }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(capture.image)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [capture.image])
  return <img ref={image} alt={`Preview at ${(capture.state.blade.definition.length / 2 - capture.state.blade.x).toFixed(1)} mm from base`} />
}

export default function App() {
  const [initial] = useState(initialSetup)
  const [state, updateState] = useState(initial.state)
  const [savedState, setSavedState] = useState<StudioState | null>(null)
  const [error, setError] = useState(initial.error)
  const [gpuError, setGpuError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ViewMode>('beauty')
  const [overlays, setOverlays] = useState<Overlays>({ grid: false, clipping: false, focus: false })
  const [quality, setQuality] = useState<Quality>('quality')
  const [paused, setPaused] = useState(false)
  const [linked, setLinked] = useState(false)
  const [inches, setInches] = useState(false)
  const [dialog, setDialog] = useState<'references' | 'captures' | 'help' | 'model' | null>(null)
  const [references, setReferences] = useState<Reference[]>([])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [captureGroup, setCaptureGroup] = useState<'all' | 'lighting' | 'scan'>('all')
  const [capturing, setCapturing] = useState(false)
  const [metering, setMetering] = useState(false)
  const [stats, setStats] = useState<RenderStats>({ fps: 0, samples: 0, width: 0, height: 0, stage: 'refining' })
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null)
  const engine = useRef<StudioRenderer | null>(null), currentScene = useRef(state)
  const file = useRef<HTMLInputElement>(null), modal = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ x: number; bx: number } | null>(null)
  const locked = state.scan.locked
  const unit = inches ? 'in' : 'mm', displayScale = inches ? 1 / 25.4 : 1
  const measure = (n: number) => `${(n * displayScale).toFixed(inches ? 2 : 1)} ${unit}`
  const fov = fieldOfView(state.camera), plan = scanPlan(state)
  const warnings = sceneWarnings(state)
  if (state.referenceTape && Math.abs(state.blade.y + state.blade.definition.width / 2 + state.blade.definition.curvature + (TAPE_GAP + TAPE_WIDTH / 2) * 1000) + TAPE_WIDTH * 500 > fov.height / 2) {
    warnings.push('The metric tape is partly outside the camera frame. Increase Coverage per frame or adjust Across frame in table alignment to include it.')
  }
  function setState(update: SetStateAction<StudioState>) {
    updateState(previous => updateRig(previous, typeof update === 'function' ? update(previous) : update))
  }
  function restoreState(next: StudioState) {
    updateState(prepareSetup({ ...next, scan: { ...next.scan, locked: false } }))
    setDialog(null)
  }
  useEffect(() => { currentScene.current = state; engine.current?.update(state) }, [state])
  useEffect(() => {
    if (!canvas.current || !viewport.current) return
    let active = true
    setReady(false); setGpuError('')
    const renderer = new StudioRenderer(canvas.current, currentScene.current,
      value => { if (active) setStats(value) }, message => { if (active) setGpuError(message) })
    engine.current = renderer
    const observer = new ResizeObserver(entries => renderer.resize(entries[0].contentRect.width))
    observer.observe(viewport.current)
    renderer.init().then(() => { if (active) setReady(true) })
      .catch(error => { if (active) setGpuError(String(error)) })
    return () => { active = false; observer.disconnect(); renderer.dispose(); engine.current = null }
  }, [])
  useEffect(() => { engine.current?.setView(mode, overlays) }, [mode, overlays])
  useEffect(() => { engine.current?.setQuality(quality) }, [quality])
  useEffect(() => { engine.current?.setPaused(paused) }, [paused])
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); setSavedState(state) }
      catch (error) { setError(`Cannot autosave: ${String(error)}. Download the setup instead.`) }
    }, 350)
    return () => clearTimeout(timer)
  }, [state])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}references/manifest.json`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`Reference library: HTTP ${r.status}`); return r.json() })
      .then((data: Reference[]) => setReferences(data))
      .catch(error => { if (!controller.signal.aborted) setError(String(error)) })
    listCaptures().then(setCaptures).catch(error => setError(String(error)))
    return () => controller.abort()
  }, [])
  useEffect(() => { if (dialog) modal.current?.showModal(); else modal.current?.close() }, [dialog])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 6500)
    return () => clearTimeout(timer)
  }, [notice])

  function cameraValue(key: keyof StudioState['camera'], value: number | boolean) {
    setState(s => ({ ...s, camera: { ...s.camera, [key]: value } }))
  }
  function bladeValue(key: 'x' | 'y' | 'roughness' | 'detail', value: number | boolean) {
    setState(s => ({ ...s, blade: { ...s.blade, [key]: value } }))
  }
  function modelValue(name: string, definition: BladeDefinition) {
    setState(s => ({ ...s, blade: { ...s.blade, name, definition },
      scan: { ...s.scan, start: Math.min(s.scan.start, definition.length),
        end: s.scan.end === s.blade.definition.length ? definition.length : Math.min(s.scan.end, definition.length) } }))
  }
  function lightValue(index: 0 | 1, key: keyof LightSettings, value: number | boolean) {
    setState(s => {
      const lights: StudioState['lights'] = [{ ...s.lights[0] }, { ...s.lights[1] }]
      lights[index] = { ...lights[index], [key]: value }
      if (linked && ['x', 'y', 'height'].includes(key)) lights[1 - index] = { ...lights[1 - index],
        [key]: key === 'y' && typeof value === 'number' ? -value : value }
      return { ...s, lights }
    })
  }
  function suggestLights() {
    const result = automaticLightPlacement(state)
    if (!result.lights) { setError(result.warning); return }
    const lights = result.lights
    setState(s => ({ ...s, lights }))
    setNotice(`Fixed tube positions optimized across the whole blade, including the kissaki. ${result.coverage < 0.8 ? 'Some facets still have weak predicted reflections; inspect the scan before saving the rig. ' : ''}Meter once if needed, then lock the rig. Exposure stays fixed between frames.`)
  }
  async function meterOnce() {
    if (!engine.current) return
    setMetering(true)
    const base = state
    try {
      const reading = await engine.current.meterOnce()
      if (currentScene.current !== base) throw new Error('The scene changed. Meter again once it is still.')
      setState(s => ({ ...s, camera: { ...s.camera, shutter: reading.shutter, exposure: 0, compensate: false } }))
      setNotice(reading.status)
    } catch (error) { setError(`Metering failed: ${String(error)}`) }
    finally { setMetering(false) }
  }
  function coverage(width: number) {
    const result = cameraForCoverage(state, width)
    setState(s => ({ ...s, camera: result.camera }))
    setNotice(result.warning || `Coverage applied: camera ${measure(result.camera.height)}, lens ${result.camera.focalLength.toFixed(1)} mm. Focus is automatic.`)
  }
  function fitBlade() {
    const geometry = makeBlade(state.blade.definition), bounds = geometry.boundingBox!
    const maxY = bounds.max.y + (state.referenceTape ? TAPE_GAP + TAPE_WIDTH : 0)
    const y = -(bounds.min.y + maxY) * 500
    const width = Math.max(state.blade.definition.length, (maxY - bounds.min.y) * 1000 * SENSOR.width / SENSOR.height) * 1.15
    geometry.dispose()
    const centered = { ...state, camera: { ...state.camera, focalLength: 35 }, blade: { ...state.blade, x: 0, y } }
    const result = cameraForCoverage(centered, width)
    setState({ ...centered, camera: result.camera })
    setNotice(result.warning || 'Whole-blade shot configured: lens set to 35 mm and table centered. This changes the physical rig.')
  }
  function includeTape() {
    const geometry = makeBlade(state.blade.definition), bounds = geometry.boundingBox!
    const maxY = bounds.max.y + TAPE_GAP + TAPE_WIDTH
    const y = -(bounds.min.y + maxY) * 500
    const width = Math.max(fov.width, (maxY - bounds.min.y) * 1000 * SENSOR.width / SENSOR.height * 1.1)
    geometry.dispose()
    const aligned = { ...state, referenceTape: true, blade: { ...state.blade, y } }
    const result = cameraForCoverage(aligned, width)
    setState({ ...aligned, camera: result.camera })
    setNotice(result.warning || 'Blade and tape centered across the frame. Scan position and tube positions are unchanged. The physical tape shares camera exposure; use Meter once if it is too dark.')
  }
  async function importSetup(selected: File | undefined) {
    if (!selected) return
    try {
      if (selected.size > 100_000) throw new Error('Setup files must be smaller than 100 KB.')
      restoreState(parseSetup(JSON.parse(await selected.text())))
      setNotice('Setup restored in Edit rig mode. Review it before locking.'); setError('')
    } catch (error) { setError(`Setup was not loaded: ${String(error)}`) }
    if (file.current) file.current.value = ''
  }
  async function capture() {
    if (!engine.current || !ready || gpuError) return
    setCapturing(true)
    const base = state, view = mode, analysis = { ...overlays }, samples = stats.samples
    try {
      const image = await engine.current.capture(analysis.grid)
      if (currentScene.current !== base) throw new Error('The scene changed while saving. Save the preview again.')
      await saveCapture({ id: crypto.randomUUID(), created: new Date().toISOString(), state: structuredClone(base), image, view, overlays: analysis, samples })
      setCaptures(await listCaptures())
      setNotice(locked ? 'Scan-position preview saved below the image.' : 'Lighting comparison saved below the image.')
    } catch (error) { setError(`Preview was not saved: ${String(error)}`) }
    finally { setCapturing(false) }
  }
  function position(value: number) { bladeValue('x', state.blade.definition.length / 2 - value) }
  const captureKind = (c: Capture) => c.state.scan?.locked ? 'scan' : 'lighting'

  return <div className="studio">
    <header className="app-header">
      <div className="brand"><Aperture size={28} /><div><h1>Nihonto <span>Lighting Studio</span></h1>
        <label className="setup-name"><span className="sr-only">Setup name</span><input key={state.setupName} aria-label="Setup name" defaultValue={state.setupName} maxLength={80}
          onBlur={e => { const name = e.target.value.trim(); if (name) setState(s => ({ ...s, setupName: name })); else { e.target.value = state.setupName; setError('Setup name cannot be empty.') } }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} disabled={locked} /></label>
        <small>{savedState === state ? 'Autosaved locally' : 'Saving locally...'}</small></div></div>
      <nav className="header-actions" aria-label="Project actions">
        <button onClick={() => downloadSetup(state)}>Save setup</button>
        <button className="primary" onClick={capture} disabled={!ready || Boolean(gpuError) || capturing}><Camera size={16} />{capturing ? 'Saving...' : 'Save preview'}</button>
        <details className="project-menu"><summary aria-label="Project menu">More</summary><div>
          <button onClick={() => file.current?.click()}>Load setup</button>
          <button onClick={() => setDialog('references')}>References</button>
          <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; engine.current?.updateTheme() }}>Toggle light and dark theme</button>
          <button onClick={() => setDialog('help')}>Help</button>
          <button onClick={() => { restoreState(defaultState()); setNotice('Default setup restored') }}>Reset setup</button>
        </div></details>
      </nav>
      <input hidden ref={file} type="file" accept=".json,application/json" onChange={event => void importSetup(event.target.files?.[0])} />
    </header>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    <main className="workbench">
      <section className="image-column">
        <div className="workflow-status"><strong>{locked ? 'Preview scan' : 'Set up the fixed rig'}</strong>
          <span>{locked ? 'Camera, lights and exposure locked · always sharp' : 'Adjust once, then lock the rig to inspect the blade'}</span></div>
        <div className="viewport-frame">
          <section className="exposure-panel" aria-label="Camera exposure and lighting">
            <div className="exposure-heading"><h2>{SENSOR.model} · Exposure & light</h2>
              <p className="exposure-readout" aria-label="Exposure settings">{shutterLabel(state.camera.shutter)} · f/{state.camera.aperture.toFixed(1)} · ISO 100 · {state.camera.exposure > 0 ? '+' : ''}{state.camera.exposure.toFixed(1)} EV</p>
              <span className="badge">{locked ? 'Locked for scan' : 'Setup'}</span></div>
            <fieldset className="quick-controls" disabled={locked || metering}>
              <ShutterSlider value={state.camera.shutter} onChange={v => cameraValue('shutter', v)} />
              <Slider label="Camera aperture" value={state.camera.aperture} min={1.2} max={11} step={0.1} unit="f/" onChange={v => cameraValue('aperture', v)} />
              {state.lights.map((light, i) => <div key={i}>
                <Slider label={`${i === 0 ? 'Left' : 'Right'} tube brightness`} value={light.brightness} min={0} max={200} unit="%" onChange={v => lightValue(i as 0 | 1, 'brightness', v)} />
                {!light.enabled && <small className="quick-light-state">{i === 0 ? 'Left' : 'Right'} tube is off</small>}
              </div>)}
              <label className="check-label quick-compensation" title={CHECKBOX_HELP.compensate}><input type="checkbox" aria-description={CHECKBOX_HELP.compensate} checked={state.camera.compensate} onChange={e => cameraValue('compensate', e.target.checked)} />Compensate aperture</label>
            </fieldset>
            <p className="exposure-note">{state.camera.compensate ? 'Aperture compensation is on: f-number changes do not change brightness.' : 'Aperture changes exposure; the preview always stays sharp.'} Relative light output; {state.lights.some(l => l.brightness > 100) ? 'above 100% is simulation boost, not a hardware dimmer setting.' : '100% is an uncalibrated model reference.'}</p>
          </section>
          <div className="viewport" ref={viewport} tabIndex={0} role="group" aria-label="Camera viewport. Drag or use arrow keys to translate the blade."
          onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); bladeValue('x', clamp(state.blade.x + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1), -800, 800)) }}
          onPointerDown={e => { if (!ready || gpuError || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, bx: state.blade.x } }}
          onPointerMove={e => { if (drag.current) bladeValue('x', clamp(drag.current.bx + (e.clientX - drag.current.x) / e.currentTarget.getBoundingClientRect().width * fov.width, -800, 800)) }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
          <canvas ref={canvas} aria-label="Ray-traced camera view of a nihonto with metric reference tape" />
          {overlays.grid && <svg className="framing-overlay" viewBox="0 0 900 600" aria-label="Rule-of-thirds framing grid"><path d="M300 0V600 M600 0V600 M0 200H900 M0 400H900" /></svg>}
          <div className="image-label">{mode === 'beauty' ? 'CAMERA VIEW' : mode === 'sources' ? 'LIGHT CONTRIBUTIONS' : `${mode.toUpperCase()} TUBE`}<span>ALWAYS SHARP</span></div>
          {(!ready || gpuError) && <div className="render-message" role={gpuError ? 'alert' : 'status'}><Aperture size={32} /><h2>{gpuError ? 'Ray tracing unavailable' : 'Preparing the light transport'}</h2><p>{gpuError || 'Building the scene and GPU shaders...'}</p>{gpuError && <button onClick={() => window.location.reload()}>Retry</button>}</div>}
          {mode === 'sources' && <div className="source-legend"><span className="left-key" />Left tube <span className="right-key" />Right tube <small>False color</small></div>}
        </div>
          <div className="viewport-status"><span className="render-status">{gpuError ? 'Unavailable' : !ready ? 'Initializing' : paused ? 'Paused' : stats.stage === 'interactive' ? 'Interactive' : 'Refining'}</span>
            <details className="render-details"><summary>Rendering details</summary><div><span>{Math.floor(stats.samples)} spp / source · target {stats.sampleLimit ?? 4096} · {stats.width} × {stats.height} · {stats.fps.toFixed(0)} display fps</span>
              <label>Render quality<select aria-label="Render quality" value={quality} onChange={e => setQuality(e.target.value as Quality)}><option value="interactive">Fast preview</option><option value="balanced">Balanced</option><option value="quality">Fine detail</option></select></label></div></details>
            <button className="icon-button" aria-label={paused ? 'Resume rendering' : 'Pause rendering'} onClick={() => setPaused(p => !p)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button></div>
        </div>
        <div className="analysis-bar">
          <button aria-pressed={overlays.grid} onClick={() => setOverlays(o => ({ ...o, grid: !o.grid }))}><Grid3X3 size={14} />Framing</button>
          <button aria-pressed={overlays.clipping} onClick={() => setOverlays(o => ({ ...o, clipping: !o.clipping }))}><ScanLine size={14} />Clipping</button>
          <label className="inspect-label">Inspect lighting<select aria-label="Inspect lighting" value={mode} onChange={e => setMode(e.target.value as ViewMode)}>
            <option value="beauty">Camera</option><option value="sources">Light contributions</option><option value="left">Left only</option><option value="right">Right only</option></select></label>
          <button className="text-button" onClick={() => { setOverlays({ grid: false, clipping: false, focus: false }); setMode('beauty') }}>Clean view</button>
        </div>
        <section className="panel navigator-panel" aria-label="Scan preview">
          <div className="panel-heading"><h2>Scan preview</h2><span>Simulated table movement · no hardware control</span></div>
          <BladeNavigator state={state} onPosition={x => bladeValue('x', x)} />
          <p className="control-note">The window marks the viewed section. The table moves; the camera and tubes stay fixed. Drag to scrub, or step between planned frames.</p>
          <Slider label="Viewed position from base" value={plan.position} min={0} max={state.blade.definition.length} step={0.1} unit={unit} displayScale={displayScale} onChange={position} />
          <div className="scan-steps"><button disabled={plan.position <= state.scan.start} onClick={() => position(plan.previous)}>Previous frame</button>
            <span>{plan.onFrame ? `Frame ${plan.index + 1} of ${plan.count}` : `Between frames · ${plan.count} planned`}</span>
            <button disabled={plan.position >= state.scan.end} onClick={() => position(plan.next)}>Next frame</button></div>
          <details className="scan-range"><summary>Range and step · {measure(state.scan.start)} to {measure(state.scan.end)}</summary>
            <NumberControl label="Scan start" value={state.scan.start} min={0} max={state.scan.end} step={0.1} unit={unit} displayScale={displayScale} onChange={start => setState(s => ({ ...s, scan: { ...s.scan, start } }))} />
            <NumberControl label="Scan end" value={state.scan.end} min={state.scan.start} max={state.blade.definition.length} step={0.1} unit={unit} displayScale={displayScale} onChange={end => setState(s => ({ ...s, scan: { ...s.scan, end } }))} />
            <NumberControl label="Step distance" value={state.scan.step} min={0.1} max={1200} step={0.1} unit={unit} displayScale={displayScale} onChange={step => setState(s => ({ ...s, scan: { ...s.scan, step } }))} />
            <button onClick={() => position(state.scan.start)}>Go to scan start</button>
          </details>
          <p className="scan-summary">Coverage per frame: {measure(plan.coverage)} · {plan.overlap === null ? 'Single frame' : `${plan.overlap.toFixed(1)}% minimum overlap`}</p>
          {plan.gap > 0 && <p className="warning-note">The step leaves a {measure(plan.gap)} gap between frames. Reduce step distance.</p>}
          <p className="control-note">{state.referenceTape ? 'Yellow tape: millimeter ticks, numbers in centimeters, zero at blade base.' : 'Metric reference tape is off.'} Coverage and overlap use the blade reference plane; surface relief can slightly change them.</p>
          <button onClick={includeTape} disabled={locked} title="Re-align the table across the frame and increase camera coverage only if needed. Does not move the tubes or change the scan position.">Include tape in frame</button>
        </section>
        {warnings.map(w => <p key={w} className="warning-note">{w}</p>)}
        <section className="preview-tray" aria-label="Saved previews"><div className="panel-heading"><h2>Saved previews</h2><button onClick={() => setDialog('captures')}>Comparisons ({captures.length})</button></div>
          <p className="control-note">Lighting comparisons: same position/exposure, different rigs. Scan previews: same locked rig, different positions.</p>
          <div>{captures.slice(0, 6).map(c => <button key={c.id} className="preview-thumb" onClick={() => { setCaptureGroup(captureKind(c)); setDialog('captures') }}><CaptureImage capture={c} /><span>{captureKind(c) === 'scan' ? 'Scan' : 'Lighting'} · {measure(c.state.blade.definition.length / 2 - c.state.blade.x)}</span></button>)}</div>
        </section>
        <footer className="workspace-footer"><span>Illustrative steel · RGB light transport · No ambient illumination</span><button className="text-button" onClick={() => setDialog('help')}><CircleHelp size={14} />Model boundaries</button></footer>
      </section>
      <aside className="rig-column">
        <section className="panel" aria-label="Blade model"><div className="panel-heading"><h2>Blade model</h2><button disabled={locked} onClick={() => setDialog('model')}>Edit model...</button></div>
          <fieldset disabled={locked} className="rig-fields"><label className="select-field">Blade preset<select aria-label="Blade preset" value={state.blade.name}
            onChange={e => { const historical = HISTORICAL_PRESETS.find(p => p.name === e.target.value); modelValue(e.target.value, historical?.definition ?? PRESETS[e.target.value]) }}>
            {!Object.hasOwn(PRESETS, state.blade.name) && !HISTORICAL_PRESETS.some(p => p.name === state.blade.name) && <option>{state.blade.name}</option>}
            <optgroup label="Generic shapes">{Object.keys(PRESETS).map(name => <option key={name}>{name}</option>)}</optgroup>
            <optgroup label="Historical approximations">{HISTORICAL_PRESETS.map(p => <option key={p.name}>{p.name}</option>)}</optgroup>
          </select></label></fieldset><p className="control-note">Length {measure(state.blade.definition.length)} · curvature {measure(state.blade.definition.curvature)} · {state.blade.hada} hada</p></section>
        <section className="panel setup-panel" id="rig-setup" aria-labelledby="setup-heading">
          <div className="panel-heading"><h2 id="setup-heading">Fixed rig</h2><button className="primary" disabled={metering} onClick={() => setState(s => ({ ...s, scan: { ...s.scan, locked: !s.scan.locked } }))}>{locked ? 'Edit rig' : 'Lock rig / Preview scan'}</button></div>
          <p className="control-note">{locked ? 'Camera, tube positions, brightness, focus projection and exposure are fixed. Only the table moves.' : 'Auto evaluates the whole blade, including the kissaki, for one fixed rig. It prioritizes lighting coverage, then grain contrast.'}</p>
          {!locked && <div className="rig-actions"><button onClick={suggestLights}>Suggest light positions</button><button disabled={!ready || Boolean(gpuError) || metering || stats.samples < 8} onClick={() => void meterOnce()}>{metering ? 'Metering...' : 'Meter once'}</button></div>}
          <p className="shutter-readout">{shutterLabel(state.camera.shutter)} · ISO 100 · f/{state.camera.aperture.toFixed(1)} · {state.camera.focalLength.toFixed(1)} mm lens</p>
          <TubeSpan state={state} />
          <p className="control-note">Top view: actual along-blade and side offsets, at the same scale; +Y is up. The dashed camera footprint stays at the rig origin while the blade moves. Height is shown in the end-on view below. Two {TUBE_FIXTURE.model} fixtures, modeled as {TUBE_LENGTH} mm-long cylinders.</p>
          <details className="fixture-details"><summary>GVM fixture specifications and model limits</summary>
            <p>User-supplied specifications for each photography fill light.</p>
            <dl>
              <div><dt>Housing</dt><dd>{TUBE_FIXTURE.width} × {TUBE_FIXTURE.depth} × {TUBE_FIXTURE.length} mm</dd></div>
              <div><dt>Electrical power</dt><dd>{TUBE_FIXTURE.power} W</dd></div>
              <div><dt>LEDs / CRI</dt><dd>{TUBE_FIXTURE.leds} / ≥ {TUBE_FIXTURE.cri}</dd></div>
              <div><dt>Color temperature</dt><dd>{TUBE_FIXTURE.colorTemperature[0]}–{TUBE_FIXTURE.colorTemperature[1]} K</dd></div>
              <div><dt>Illuminance</dt><dd>{TUBE_FIXTURE.illuminance.map(v => <span key={v.distance}>{v.lux} lux at {v.distance} m</span>)}</dd></div>
              <div><dt>Hue / saturation</dt><dd>0–360° / 0–100%</dd></div>
              <div><dt>Effects</dt><dd>5 light modes, pixel FX</dd></div>
              <div><dt>Controls</dt><dd>Bluetooth app, MESH, manual, DMX</dd></div>
              <div><dt>Net weight</dt><dd>{TUBE_FIXTURE.weight} kg</dd></div>
            </dl>
            <p>The preview uses a {TUBE_LENGTH} × {state.diameter} mm cylindrical emitter approximation at fixed 5600 K. Housing dimensions do not specify the emitting surface or beam pattern. Lux measures illuminance, not lumens; these two ratings do not calibrate the renderer or camera exposure. RGB, effects and hardware control are not simulated.</p>
            {state.diameter !== TUBE_FIXTURE.depth && <button disabled={locked} onClick={() => {
              setState(s => ({ ...s, diameter: TUBE_FIXTURE.depth }))
              setNotice('GVM-sized emitter approximation applied: 1200 mm long, 46 mm diameter. Positions and exposure are unchanged.')
            }}>Use {TUBE_FIXTURE.depth} mm emitter approximation</button>}
          </details>
          <fieldset className="rig-fields tube-summaries" disabled={locked}>
            {state.lights.map((light, i) => <div key={i}><label className="check-label" title={CHECKBOX_HELP.tube}><input type="checkbox" aria-label={`${i === 0 ? 'Left' : 'Right'} tube enabled`} aria-description={CHECKBOX_HELP.tube} checked={light.enabled} onChange={e => lightValue(i as 0 | 1, 'enabled', e.target.checked)} />{i === 0 ? 'Left' : 'Right'} tube</label>
              <button className="text-button" onClick={() => { const h = document.getElementById(`setup-light-${i}`); h?.focus(); h?.scrollIntoView({ block: 'nearest' }) }}>{light.brightness}% · {measure(light.height)} high</button></div>)}
          </fieldset>
          <SetupDiagram state={state} inches={inches} onCameraMove={height => cameraValue('height', height)}
            onLightMove={(i, p) => { lightValue(i, 'y', p.y); lightValue(i, 'height', p.height) }}>
            {target => locked ? <p className="control-note">Edit rig to change these settings.</p> : target === 'camera' ? <>
              <Slider label="Focal length" value={state.camera.focalLength} min={20} max={135} unit="mm" onChange={v => cameraValue('focalLength', v)} />
              <Slider label="Aperture" value={state.camera.aperture} min={1.2} max={11} step={0.1} unit="f/" onChange={v => cameraValue('aperture', v)} />
              <Slider label="Coverage per frame" value={fov.width} min={1} max={3200} step={1} unit={unit} displayScale={displayScale} onChange={coverage} />
              <p className="control-note">Coverage changes camera height and automatic focus; lens changes only at travel limits. Current: {measure(state.camera.height)} high, {state.camera.focalLength.toFixed(1)} mm lens. Always sharp: no depth-of-field blur.</p>
              <details><summary>Advanced camera</summary>
                <p className="control-note">{SENSOR.model}: FX {SENSOR.type}, {SENSOR.width} × {SENSOR.height} mm, {SENSOR.megapixels} MP effective, {SENSOR.pixelWidth} × {SENSOR.pixelHeight} native pixels. The interactive preview and saved previews use the selected rendering resolution, not full sensor resolution. Sensor noise and spectral response are not simulated.</p>
                <NumberControl label="Shutter time" value={state.camera.shutter} min={LIMITS.shutter[0]} max={LIMITS.shutter[1]} step={0.000125} precision={6} unit="s" onChange={v => cameraValue('shutter', v)} />
                <Slider label="Exposure" value={state.camera.exposure} min={-6} max={8} step={0.1} unit="EV" onChange={v => cameraValue('exposure', v)} />
                <label className="check-label" title={CHECKBOX_HELP.compensate}><input type="checkbox" aria-description={CHECKBOX_HELP.compensate} checked={state.camera.compensate} onChange={e => cameraValue('compensate', e.target.checked)} />Compensate for aperture</label>
                <p className="control-note">Meter once sets neutral EV and physical aperture throughput, adjusting shutter only. Exposure is relative, not a calibrated camera recommendation.</p>
                <button onClick={fitBlade}><Maximize size={14} />Reconfigure for whole-blade shot</button>
                <p className="control-note">This sets the lens to 35 mm, moves the camera and centers the table. Use the navigator instead for a display-only overview.</p>
              </details>
            </> : <>
              <Slider label={`${target === 0 ? 'Left' : 'Right'} brightness`} value={state.lights[target].brightness} min={0} max={200} unit="%" onChange={v => lightValue(target, 'brightness', v)} />
              <details><summary>Advanced tube</summary><Slider label={`${target === 0 ? 'Left' : 'Right'} along blade`} value={state.lights[target].x} min={-800} max={800} unit={unit} displayScale={displayScale} onChange={v => lightValue(target, 'x', v)} /></details>
            </>}
          </SetupDiagram>
          <details><summary>Advanced rig and table alignment</summary><fieldset className="rig-fields" disabled={locked}>
            <button onClick={() => setState(s => ({ ...s, lights: [{ ...s.lights[0], x: s.blade.x }, { ...s.lights[1], x: s.blade.x }] }))}>Center tube spans on blade</button>
            <p className="control-note">One-time alignment to the blade's current center. Suggestions preserve this alignment; scan movement never repositions the tubes.</p>
            <label className="check-label" title={CHECKBOX_HELP.linked}><input type="checkbox" aria-description={CHECKBOX_HELP.linked} checked={linked} onChange={e => setLinked(e.target.checked)} />Link positions symmetrically</label>
            <Slider label="Tube diameter" value={state.diameter} min={10} max={80} unit={unit} displayScale={displayScale} onChange={v => setState(s => ({ ...s, diameter: v }))} />
            <Slider label="Across frame" value={state.blade.y} min={-450} max={450} unit={unit} displayScale={displayScale} onChange={v => bladeValue('y', v)} />
            <button onClick={() => setState(s => ({ ...s, blade: { ...s.blade, x: 0, y: 0 } }))}>Center blade</button>
            <label className="check-label" title={CHECKBOX_HELP.tape}><input type="checkbox" aria-description={CHECKBOX_HELP.tape} checked={state.referenceTape} onChange={e => setState(s => ({ ...s, referenceTape: e.target.checked }))} />Metric reference tape</label>
          </fieldset></details>
          <div className="controls-bottom"><span>Rig and scan units · tape always metric</span><div className="segmented"><button aria-pressed={!inches} onClick={() => setInches(false)}>mm</button><button aria-pressed={inches} onClick={() => setInches(true)}>in</button></div></div>
        </section>
      </aside>
    </main>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    <dialog ref={modal} className="studio-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)}>
      <div className="dialog-heading"><h2>{dialog === 'model' ? 'Nihonto Designer' : dialog === 'captures' ? 'Saved previews' : dialog === 'references' ? 'A study in steel' : 'Model boundaries'}</h2><button aria-label="Close dialog" onClick={() => setDialog(null)}><X /></button></div>
      {dialog === 'model' && <fieldset className="rig-fields model-dialog" disabled={locked}>
        <ModelEditor definition={state.blade.definition} name={state.blade.name} inches={inches} hada={state.blade.hada}
          onHada={hada => setState(s => ({ ...s, blade: { ...s.blade, hada } }))}
          onChange={d => modelValue(HISTORICAL_PRESETS.some(p => p.name === state.blade.name) ? state.blade.name : 'Custom blade', d)} onPreset={modelValue} />
        <h3>Surface</h3><Slider label="Surface roughness" value={state.blade.roughness} min={0.025} max={0.45} step={0.005} unit="" onChange={v => bladeValue('roughness', v)} />
        <label className="check-label" title={CHECKBOX_HELP.hamon}><input type="checkbox" aria-description={CHECKBOX_HELP.hamon} checked={state.blade.detail} onChange={e => bladeValue('detail', e.target.checked)} />Illustrative hamon / polish variation</label>
      </fieldset>}
      {dialog === 'references' && <><p>Public-domain photographs from The Metropolitan Museum of Art. Appearance references, not calibrated lighting data.</p><div className="reference-grid">{references.map(r => <a href={r.sourcePage} key={r.objectId} target="_blank" rel="noreferrer" className="reference-card"><img loading="lazy" src={`${import.meta.env.BASE_URL}references/${r.file}`} alt={r.title.replace(/<[^>]*>/g, '')} /><div><h3>{r.title.replace(/<[^>]*>/g, '')}</h3><small>{r.license} · Met {r.objectId}</small></div></a>)}</div></>}
      {dialog === 'captures' && <>
        <label className="select-field">Preview group<select value={captureGroup} onChange={e => setCaptureGroup(e.target.value as typeof captureGroup)}><option value="all">All previews</option><option value="lighting">Lighting comparisons</option><option value="scan">Scan positions</option></select></label>
        <p>Restoring a full setup also restores the table position and opens Edit rig. Rig-only restore preserves the current blade, position and scan range. Existing saved images remain unchanged.</p>
        <div className="capture-grid">{captures.filter(c => captureGroup === 'all' || captureKind(c) === captureGroup).map(c => <article className="capture-card" key={c.id}><CaptureImage capture={c} /><div className="capture-details">
          <h3>{c.state.setupName ?? 'Saved rig'} · {captureKind(c) === 'scan' ? 'Scan position' : 'Lighting comparison'}</h3>
          <p>{measure(c.state.blade.definition.length / 2 - c.state.blade.x)} from base · {c.state.camera.focalLength} mm · f/{c.state.camera.aperture} · {shutterLabel(c.state.camera.shutter)} · EV {c.state.camera.exposure}</p>
          <p>{new Date(c.created).toLocaleString()} · {Math.floor(c.samples)} spp · {c.view}</p>
          <div className="capture-actions">
            <button onClick={() => { try { restoreState(parseSetup(c.state)); setMode(c.view); setOverlays({ ...c.overlays, focus: false }); setNotice('Full setup restored in Edit rig mode') } catch (error) { setError(String(error)); setDialog(null) } }}>Restore full setup</button>
            <button onClick={() => { try { const rig = parseSetup(c.state); restoreState({ ...state, setupName: rig.setupName, camera: rig.camera, lights: rig.lights, diameter: rig.diameter, referenceTape: rig.referenceTape }); setNotice('Rig restored; blade and scan position preserved') } catch (error) { setError(String(error)); setDialog(null) } }}>Restore rig only</button>
            <button onClick={() => download(c.image, `nihonto-${c.id.slice(0, 8)}.png`)}>PNG</button><button onClick={() => downloadSetup(c.state)}>Setup</button>
            <button aria-label="Delete capture" onClick={async () => { try { await deleteCapture(c.id); setCaptures(await listCaptures()) } catch (error) { setError(String(error)) } }}>Delete</button>
          </div></div></article>)}</div>
      </>}
      {dialog === 'help' && <div className="help-content">
        <h3>Set up the fixed rig → Preview the scan → Save the rig</h3><p>Configure the camera and tubes once. Suggest light positions evaluates the whole blade, including the kissaki, for one fixed arrangement using the tubes' current brightness and on/off settings; it never follows the blade. Meter once measures blade-only radiance at ISO 100 and adjusts shutter while preserving aperture and lights. Lock the rig to move only the blade table through the scan. This app does not drive hardware or stitch images.</p>
        <h3>Always-sharp lighting preview</h3><p>Manual focus and depth-of-field blur are disabled. During setup the thin-lens projection follows the local blade ridge; during a locked scan the projection stays fixed. Aperture still affects throughput unless compensated. This is not a prediction of real-camera sharpness. Diffraction, aberrations, lens distortion and camera-body occlusion are not modeled.</p>
        <h3>Metric reference tape</h3><p>The yellow tape is physical ray-traced geometry at the blade reference plane, 20 mm wide and 3 mm beyond the spine's widest lateral extent. It moves with the table, is included in saved images, and starts at zero at the blade base. Include tape in frame re-aligns the table and expands coverage only if necessary. The tape shares camera exposure and can look dark when exposing for bright steel; Meter once can help, but prioritizes the blade. Small ticks are 1 mm, longer ticks 5 mm, and numbered marks 1 cm. Surface relief causes small parallax differences; it is a reference, not a calibrated measurement of the raised blade surface. The exposure meter excludes the tape.</p>
        <h3>Light transport and diagnostics</h3><p>Each {TUBE_LENGTH} mm tube has its own importance-sampled path-traced contribution with up to six scattering events. The {TUBE_FIXTURE.model} housing is 50 × 46 × 1200 mm; a 46 mm-diameter cylinder is the default emitting-surface approximation, not a measured diffuser. Existing saved diameters are preserved. Contributions are combined before exposure and Reinhard tone mapping. Light contributions uses false color, not ray-path visualization. Clipping marks exposed linear channels at or above 1, not Nikon sensor saturation. Rendering is progressive without denoising; fine highlights may remain noisy. Fixed exposure does not mean identical brightness: steel must reflect a tube toward the camera. Auto evaluates body and kissaki positions before choosing one fixed rig; it never brightens scan frames individually.</p>
        <h3>Geometry and materials</h3><p>Blade shapes are generated, not scanned. Historical presets use source-reported dimensions with other parameters explicitly estimated. Hada combines procedural roughness, neutral metallic reflectance and microscopic normal variation, not measured metallurgy or anisotropic scattering. Hamon and polish are illustrative. Tang, fittings, grooves and authentic hamon reconstruction are not included. Tubes approximate 5600 K emission in RGB; neither radiometry nor sensor response is calibrated.</p>
        <h3>Units, zoom and storage</h3><p>Rig and scan measurements follow the mm/in preference; lens focal length stays in mm and reference tape stays metric. Setup diagram zoom keeps the bottom-center origin fixed and does not move the rig. It zooms out at drag boundaries. Capture previews and setups are local to this browser. Old setups retain compatibility but continuous lighting/exposure modes are turned off; imported and restored rigs open unlocked. Existing images are not rewritten.</p>
      </div>}
    </dialog>
  </div>
}
