import { useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { Aperture, Camera, Check, Maximize, Pause, Play, ScanLine, X } from 'lucide-react'
import { StudioRenderer } from './renderer'
import type { RenderStats } from './renderer'
import { defaultState, parseSetup, fieldOfView, PRESETS, clamp, sceneWarnings, SENSOR, TUBE_FIXTURE, TUBE_LENGTH } from './model'
import type { StudioState, Overlays, ViewMode, Quality, LightSettings, BladeDefinition } from './model'
import { HADA_DESCRIPTIONS } from './hada'
import { HadaPicker } from './HadaPicker'
import { MetricTapeOverlay } from './MetricTapeOverlay'
import { RigOverview } from './RigOverview'
import bladePhotos from '../public/blade-references/manifest.json'
import { MuseumReferences } from './MuseumReferences'
import type { MuseumReference } from './MuseumReferences'
import { Slider, ShutterSlider, NumberControl, BladeNavigator, SetupDiagram, TubeSpan } from './components'
import { ModelEditor } from './ModelEditor'
import { makeBlade } from './blade'
import { HISTORICAL_PRESETS } from './historical-presets'
import { shutterLabel } from './exposure'
import { cameraForCoverage } from './framing'
import type { automaticLightPlacement } from './automatic-lighting'
import { prepareSetup, scanPlan, updateRig } from './scan'
import { download, downloadSetup, listCaptures, saveCapture, deleteCapture } from './storage'
import type { Capture } from './storage'
import './App.css'

const SESSION_KEY = 'nihonto-studio-setup-v1'
function exposureInputKey(s: StudioState) {
  return JSON.stringify([{ ...s.camera, shutter: 0, autoExposure: false }, s.blade, s.lights, s.diameter])
}
const CHECKBOX_HELP = {
  tape: 'A bright metric overlay at the blade reference plane, with centimeter labels measured from the blade base. It is independent of exposure and included in saved previews.',
  compensate: 'Keeps brightness steady when aperture changes. Turn off to simulate aperture-dependent light throughput. The preview always stays sharp.',
  linked: 'Mirrors side offsets around the stationary camera origin and matches tube heights. Brightness and on/off remain independent.',
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
  const [references, setReferences] = useState<MuseumReference[]>([])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [captureGroup, setCaptureGroup] = useState<'all' | 'lighting' | 'scan'>('all')
  const [capturing, setCapturing] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [autoShutterStatus, setAutoShutterStatus] = useState('Waiting for stable rendering...')
  const [meteredInputs, setMeteredInputs] = useState('')
  const [stats, setStats] = useState<RenderStats>({ fps: 0, samples: 0, width: 0, height: 0, stage: 'refining' })
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null)
  const engine = useRef<StudioRenderer | null>(null), currentScene = useRef(state)
  const file = useRef<HTMLInputElement>(null), modal = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ x: number; bx: number } | null>(null)
  const locked = state.scan.locked
  const unit = inches ? 'in' : 'mm', displayScale = inches ? 1 / 25.4 : 1
  const measure = (n: number) => `${(n * displayScale).toFixed(inches ? 2 : 1)} ${unit}`
  const fov = fieldOfView(state.camera), plan = scanPlan(state)
  const bladePhoto = bladePhotos.find(photo => photo.name === state.blade.name)
  const warnings = sceneWarnings(state)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Vite replaces this class while retaining React state; rebuild its GPU scene.
  }, [StudioRenderer])
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
      .then((data: MuseumReference[]) => setReferences(data))
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

  useEffect(() => {
    if (!ready || gpuError || locked || !state.camera.autoExposure || placing) return
    let active = true, reading = false
    const meter = async () => {
      if (reading || !engine.current) return
      reading = true
      const base = currentScene.current
      try {
        const result = await engine.current.meterHighlights()
        if (!active || currentScene.current !== base) return
        if (!result) { setAutoShutterStatus('Waiting for 32 stable samples...'); return }
        setAutoShutterStatus(result.status)
        setMeteredInputs(exposureInputKey(base))
        if (Math.abs(Math.log2(result.shutter / base.camera.shutter)) > 0.02) {
          setState(s => ({ ...s, camera: { ...s.camera, shutter: result.shutter } }))
        }
      } catch (error) {
        if (active && currentScene.current === base) {
          setError(`Auto shutter failed: ${String(error)}`)
          setState(s => ({ ...s, camera: { ...s.camera, autoExposure: false } }))
        }
      } finally { reading = false }
    }
    const timer = setInterval(() => void meter(), 1000)
    void meter()
    return () => { active = false; clearInterval(timer) }
  }, [ready, gpuError, locked, state.camera.autoExposure, placing])

  function cameraValue(key: keyof StudioState['camera'], value: number | boolean) {
    if (key === 'autoExposure' && value) setMeteredInputs('')
    setState(s => ({ ...s, camera: { ...s.camera, [key]: value, ...(key === 'shutter' ? { autoExposure: false } : {}) } }))
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
  async function suggestLights() {
    const base = state
    setPlacing(true)
    let worker: Worker | undefined
    try {
      const activeWorker = new Worker(new URL('./lighting-worker.ts', import.meta.url), { type: 'module' })
      worker = activeWorker
      const result = await new Promise<ReturnType<typeof automaticLightPlacement>>((resolve, reject) => {
        activeWorker.onmessage = (event: MessageEvent<{ result?: ReturnType<typeof automaticLightPlacement>; error?: string }>) =>
          event.data.result ? resolve(event.data.result) : reject(new Error(event.data.error ?? 'Light placement returned no result.'))
        activeWorker.onerror = event => reject(new Error(event.message))
        activeWorker.postMessage(base)
      })
      if (currentScene.current !== base) throw new Error('The setup changed during placement. Suggest again for the updated rig.')
      if (!result.lights) throw new Error(result.warning)
      const lights = result.lights
      setMeteredInputs('')
      setState(s => ({ ...s, lights, camera: { ...s.camera, autoExposure: true } }))
      setError('')
      setNotice(`Tube heights kept below the camera and brightness balanced. Auto shutter is enabled to protect highlights after refinement. ${result.coverage < 0.8 || result.uniformity < 0.05 ? 'Some regions remain weak under this height limit; inspect the scan. ' : ''}Lock the rig once exposure settles.`)
    } catch (error) { setError(String(error)) }
    finally { worker?.terminate(); setPlacing(false) }
  }
  function coverage(width: number) {
    const result = cameraForCoverage(state, width)
    setState(s => ({ ...s, camera: result.camera }))
    setNotice(result.warning || `Coverage applied: camera ${measure(result.camera.height)}, lens ${result.camera.focalLength.toFixed(1)} mm. Focus is automatic.`)
  }
  function fitBlade() {
    const geometry = makeBlade(state.blade.definition), bounds = geometry.boundingBox!
    const maxY = bounds.max.y
    const y = -(bounds.min.y + maxY) * 500
    const width = Math.max(state.blade.definition.length, (maxY - bounds.min.y) * 1000 * SENSOR.width / SENSOR.height) * 1.15
    geometry.dispose()
    const centered = { ...state, camera: { ...state.camera, focalLength: 35 }, blade: { ...state.blade, x: 0, y } }
    const result = cameraForCoverage(centered, width)
    setState({ ...centered, camera: result.camera })
    setNotice(result.warning || 'Whole-blade shot configured: lens set to 35 mm and table centered. This changes the physical rig.')
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
      const image = await engine.current.capture()
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
          <button onClick={() => setDialog('references')}>Met study references</button>
          {bladePhoto && <a href={`${import.meta.env.BASE_URL}blade-references/${bladePhoto.file}`} target="_blank" rel="noreferrer">Original blade photograph</a>}
          <button disabled={locked || placing} onClick={fitBlade} title="Changes the physical rig: sets a 35 mm lens, moves the camera and centers the table."><Maximize size={14} />Reconfigure for whole-blade shot</button>
          <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; engine.current?.updateTheme() }}>Toggle light and dark theme</button>
          <button onClick={() => setDialog('help')}>Help</button>
          <button onClick={() => {
            setOverlays({ grid: false, clipping: false, focus: false }); setMode('beauty')
            setState(s => ({ ...s, referenceTape: false }))
          }}>Clean view</button>
          <button onClick={() => { restoreState(defaultState()); setNotice('Default setup restored') }}>Reset setup</button>
        </div></details>
      </nav>
      <input hidden ref={file} type="file" accept=".json,application/json" onChange={event => void importSetup(event.target.files?.[0])} />
    </header>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    <main className="workbench">
      <section className="image-column">
        <div className="workflow-status"><strong>{locked ? 'Preview scan' : 'Set up the fixed rig'}</strong>
          <span>{locked ? 'Camera, lights and exposure locked' : 'Adjust once, then lock the rig to inspect the blade'}</span></div>
        <div className="viewport-frame">
          <section className="exposure-panel" aria-label="Camera exposure and lighting">
            <div className="exposure-heading"><h2>{SENSOR.model} · ISO 100</h2>
              <p className="exposure-readout" aria-label="Exposure settings">{shutterLabel(state.camera.shutter)} · f/{state.camera.aperture.toFixed(1)}</p>
              <div className="quick-exposure-bias"><NumberControl label="Exposure bias" shortLabel="EV" disabled={locked} value={state.camera.exposure} min={-6} max={8} step={0.1} unit="" onChange={v => cameraValue('exposure', v)} /></div>
              {state.lights.some(l => l.brightness > 100) && <small className="exposure-boost" title="Values above 100% are simulation boost, not a physical dimmer setting.">Simulation boost</small>}
            </div>
            <fieldset className="quick-controls" disabled={locked}>
              <div><ShutterSlider value={state.camera.shutter} onChange={v => cameraValue('shutter', v)} />
                <label className="check-label quick-toggle"><input type="checkbox" aria-label="Auto shutter" checked={state.camera.autoExposure}
                  aria-description="Automatically sets shutter from the brightest rendered blade highlight, accounting for lights, aperture and EV. Pauses when the rig is locked; manual shutter edits turn Auto off."
                  onChange={e => cameraValue('autoExposure', e.target.checked)} />Auto</label></div>
              <div><Slider label="Camera aperture" shortLabel="Aperture" value={state.camera.aperture} min={1.2} max={11} step={0.1} unit="f/" onChange={v => cameraValue('aperture', v)} />
                <label className="check-label quick-toggle" title={CHECKBOX_HELP.compensate}><input type="checkbox" aria-label="Compensate aperture" aria-description={CHECKBOX_HELP.compensate} checked={state.camera.compensate} onChange={e => cameraValue('compensate', e.target.checked)} />Compensate</label></div>
              {state.lights.map((light, i) => <div key={i}>
                <Slider label={`${i === 0 ? 'Left' : 'Right'} tube brightness`} shortLabel={i === 0 ? 'Left light' : 'Right light'} value={light.brightness} min={0} max={200} unit="%" onChange={v => lightValue(i as 0 | 1, 'brightness', v)} />
                <label className="check-label quick-toggle" title={CHECKBOX_HELP.tube}><input type="checkbox" aria-label={`${i === 0 ? 'Left' : 'Right'} tube enabled`} aria-description={CHECKBOX_HELP.tube} checked={light.enabled} onChange={e => lightValue(i as 0 | 1, 'enabled', e.target.checked)} />On</label>
              </div>)}
            </fieldset>
            {state.camera.autoExposure && <p className="exposure-note auto-shutter-status" role="status">{locked ? 'Auto shutter paused: exposure is fixed for the scan.' : autoShutterStatus}</p>}
            <div className="analysis-bar">
              <button aria-pressed={overlays.clipping} onClick={() => setOverlays(o => ({ ...o, clipping: !o.clipping }))}><ScanLine size={14} />Clipping</button>
              <label className="inspect-label">Lighting<select aria-label="Inspect lighting" value={mode} onChange={e => setMode(e.target.value as ViewMode)}>
                <option value="beauty">Camera</option><option value="sources">Light contributions</option><option value="left">Left only</option><option value="right">Right only</option></select></label>
              <button aria-pressed={state.referenceTape} title={CHECKBOX_HELP.tape} onClick={() => setState(s => ({ ...s, referenceTape: !s.referenceTape }))}>Metric tape</button>
              {mode === 'sources' && <span className="source-legend"><span className="left-key" />Left tube <span className="right-key" />Right tube <small>False color</small></span>}
            </div>
          </section>
          <div className="viewport" ref={viewport} tabIndex={0} role="group" aria-label="Camera viewport. Drag or use arrow keys to translate the blade."
          onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); bladeValue('x', clamp(state.blade.x + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1), -800, 800)) }}
          onPointerDown={e => { if (!ready || gpuError || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, bx: state.blade.x } }}
          onPointerMove={e => { if (drag.current) bladeValue('x', clamp(drag.current.bx + (e.clientX - drag.current.x) / e.currentTarget.getBoundingClientRect().width * fov.width, -800, 800)) }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
          <canvas ref={canvas} aria-label="Ray-traced nihonto preview" />
          {(!ready || gpuError) && <div className="render-message" role={gpuError ? 'alert' : 'status'}><Aperture size={32} /><h2>{gpuError ? 'Ray tracing unavailable' : 'Preparing the light transport'}</h2><p>{gpuError || 'Building the scene and GPU shaders...'}</p>{gpuError && <button onClick={() => window.location.reload()}>Retry</button>}</div>}
          {state.referenceTape && <MetricTapeOverlay state={state} />}
        </div>
          <div className="viewport-status"><span className="render-status">{gpuError ? 'Unavailable' : !ready ? 'Initializing' : paused ? 'Paused' : stats.stage === 'interactive' ? 'Interactive' : 'Refining'}</span>
            <details className="render-details"><summary>Rendering details</summary><div><span>{Math.floor(stats.samples)} spp / source · target {stats.sampleLimit ?? 4096} · {stats.width} × {stats.height} · {stats.fps.toFixed(0)} display fps</span>
              <label>Render quality<select aria-label="Render quality" value={quality} onChange={e => setQuality(e.target.value as Quality)}><option value="interactive">Fast preview</option><option value="balanced">Balanced</option><option value="quality">Fine detail</option></select></label></div></details>
            <button className="icon-button" aria-label={paused ? 'Resume rendering' : 'Pause rendering'} onClick={() => setPaused(p => !p)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button></div>
        </div>
        <section className="panel navigator-panel" aria-label="Scan preview">
          <div className="panel-heading"><h2>Scan preview</h2><span>Simulated table movement · no hardware control</span></div>
          <BladeNavigator state={state} onPosition={x => bladeValue('x', x)} />
          <p className="control-note">The window marks the viewed section. The table moves; the camera and tubes stay fixed. Drag to scrub, or step between planned frames.</p>
          <NumberControl label="Viewed position from base" value={plan.position} min={0} max={state.blade.definition.length} step={0.1} unit={unit} displayScale={displayScale} onChange={position} />
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
          <p className="control-note">Coverage and overlap use the blade reference plane; surface relief can slightly change them.</p>
        </section>
        <RigOverview state={state} />
        {warnings.map(w => <p key={w} className="warning-note">{w}</p>)}
        <section className="preview-tray" aria-label="Saved previews"><div className="panel-heading"><h2>Saved previews</h2><button onClick={() => setDialog('captures')}>Comparisons ({captures.length})</button></div>
          <p className="control-note">Lighting comparisons: same position/exposure, different rigs. Scan previews: same locked rig, different positions.</p>
          <div>{captures.slice(0, 6).map(c => <button key={c.id} className="preview-thumb" onClick={() => { setCaptureGroup(captureKind(c)); setDialog('captures') }}><CaptureImage capture={c} /><span>{captureKind(c) === 'scan' ? 'Scan' : 'Lighting'} · {measure(c.state.blade.definition.length / 2 - c.state.blade.x)}</span></button>)}</div>
        </section>
        <footer className="workspace-footer">Illustrative steel · RGB light transport · No ambient illumination</footer>
      </section>
      <aside className="rig-column">
        <section className="panel" aria-label="Blade model"><div className="panel-heading"><h2>Blade model</h2><button disabled={locked} onClick={() => setDialog('model')}>Edit model...</button></div>
          <fieldset disabled={locked} className="rig-fields"><label className="select-field">Blade preset<select aria-label="Blade preset" value={state.blade.name}
            onChange={e => { const historical = HISTORICAL_PRESETS.find(p => p.name === e.target.value); modelValue(e.target.value, historical?.definition ?? PRESETS[e.target.value]) }}>
            {!Object.hasOwn(PRESETS, state.blade.name) && !HISTORICAL_PRESETS.some(p => p.name === state.blade.name) && <option>{state.blade.name}</option>}
            <optgroup label="Generic shapes">{Object.keys(PRESETS).map(name => <option key={name}>{name}</option>)}</optgroup>
            <optgroup label="Historical approximations">{HISTORICAL_PRESETS.map(p => <option key={p.name}>{p.name}</option>)}</optgroup>
          </select></label>
          <HadaPicker label="Rendered hada" value={state.blade.hada}
            onChange={hada => setState(s => ({ ...s, blade: { ...s.blade, hada } }))} /></fieldset>
          {state.blade.hada === 'none' && <p className="warning-note">Hada is off. Select a grain type to render the steel grain; the hamon alone is not hada.</p>}
          <p className="control-note">{HADA_DESCRIPTIONS[state.blade.hada]}</p>
          <p className="control-note">Length {measure(state.blade.definition.length)} · curvature {measure(state.blade.definition.curvature)}</p></section>
        <section className="panel setup-panel" id="rig-setup" aria-labelledby="setup-heading">
          <div className="panel-heading"><h2 id="setup-heading">Fixed rig</h2><button className="primary"
            disabled={placing || (!locked && state.camera.autoExposure && !gpuError && meteredInputs !== exposureInputKey(state))}
            title={!locked && state.camera.autoExposure ? 'Wait for Auto shutter to evaluate the current rig, or turn Auto off to lock a manual exposure.' : undefined}
            onClick={() => setState(s => ({ ...s, scan: { ...s.scan, locked: !s.scan.locked } }))}>{locked ? 'Edit rig' : 'Lock rig / Preview scan'}</button></div>
          <p className="control-note">{locked ? 'Camera, lighting and exposure are fixed. Only the table moves.' : 'Suggest positions balances whole-blade lighting with tubes below camera height and enables Auto shutter. Lock once exposure settles.'}</p>
          {!locked && <div className="rig-actions"><button disabled={placing} onClick={() => void suggestLights()}>{placing ? 'Evaluating blade surfaces...' : 'Suggest light positions'}</button></div>}
          {state.diameter !== TUBE_FIXTURE.depth && <div className="warning-note">
            <p>This setup uses a {state.diameter} mm emitter, not the {TUBE_FIXTURE.depth} mm GVM approximation. A narrower tube gives narrower reflections and can leave blade regions unlit.</p>
            <button disabled={locked || placing} onClick={() => {
              setState(s => ({ ...s, diameter: TUBE_FIXTURE.depth }))
              setNotice('GVM-sized emitter approximation applied: 1200 mm long, 46 mm diameter. Positions and exposure are unchanged.')
            }}>Use {TUBE_FIXTURE.depth} mm emitter approximation</button>
          </div>}
          <TubeSpan state={state} />
          <p className="control-note">Tube spans stay centered on the fixed camera origin while the table moves. Drag the handles below; dimensions update in place.</p>
          <SetupDiagram state={state} inches={inches} onCameraMove={height => cameraValue('height', height)}
            onLightMove={(i, p) => { lightValue(i, 'y', p.y); lightValue(i, 'height', p.height) }} />
          <fieldset className="rig-fields" disabled={locked}>
              <Slider label="Focal length" value={state.camera.focalLength} min={20} max={135} unit="mm" onChange={v => cameraValue('focalLength', v)} />
              <Slider label="Coverage per frame" value={fov.width} min={1} max={3200} step={1} unit={unit} displayScale={displayScale} onChange={coverage} />
              <p className="control-note">Coverage changes camera height and automatic focus; lens changes only at travel limits.</p>
          </fieldset>
          <details><summary>Advanced rig and table alignment</summary><fieldset className="rig-fields" disabled={locked}>
            <label className="check-label" title={CHECKBOX_HELP.linked}><input type="checkbox" aria-description={CHECKBOX_HELP.linked} checked={linked} onChange={e => setLinked(e.target.checked)} />Link positions symmetrically</label>
            <Slider label="Tube diameter" value={state.diameter} min={10} max={80} unit={unit} displayScale={displayScale} onChange={v => setState(s => ({ ...s, diameter: v }))} />
            <Slider label="Across frame" value={state.blade.y} min={-450} max={450} unit={unit} displayScale={displayScale} onChange={v => bladeValue('y', v)} />
          </fieldset></details>
          <div className="controls-bottom"><span>Rig and scan units · tape always metric</span><div className="segmented"><button aria-pressed={!inches} onClick={() => setInches(false)}>mm</button><button aria-pressed={inches} onClick={() => setInches(true)}>in</button></div></div>
        </section>
      </aside>
    </main>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    <dialog ref={modal} className="studio-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)}>
      <div className="dialog-heading"><h2>{dialog === 'model' ? 'Nihonto Designer' : dialog === 'captures' ? 'Saved previews' : dialog === 'references' ? 'A study in steel' : 'Help & model limits'}</h2><button aria-label="Close dialog" onClick={() => setDialog(null)}><X /></button></div>
      {dialog === 'model' && <fieldset className="rig-fields model-dialog" disabled={locked}>
        <ModelEditor definition={state.blade.definition} name={state.blade.name} inches={inches} hada={state.blade.hada}
          onHada={hada => setState(s => ({ ...s, blade: { ...s.blade, hada } }))}
          onChange={d => modelValue(HISTORICAL_PRESETS.some(p => p.name === state.blade.name) ? state.blade.name : 'Custom blade', d)} onPreset={modelValue} />
        <h3>Surface</h3><Slider label="Surface roughness" value={state.blade.roughness} min={0.025} max={0.45} step={0.005} unit="" onChange={v => bladeValue('roughness', v)} />
        <label className="check-label" title={CHECKBOX_HELP.hamon}><input type="checkbox" aria-description={CHECKBOX_HELP.hamon} checked={state.blade.detail} onChange={e => bladeValue('detail', e.target.checked)} />Illustrative hamon / polish variation</label>
      </fieldset>}
      {dialog === 'references' && <MuseumReferences references={references} />}
      {dialog === 'captures' && <>
        <label className="select-field">Preview group<select value={captureGroup} onChange={e => setCaptureGroup(e.target.value as typeof captureGroup)}><option value="all">All previews</option><option value="lighting">Lighting comparisons</option><option value="scan">Scan positions</option></select></label>
        <p>Restoring a full setup also restores the table position and opens Edit rig. Rig-only restore preserves the current blade, position and scan range. Existing saved images remain unchanged.</p>
        <div className="capture-grid">{captures.filter(c => captureGroup === 'all' || captureKind(c) === captureGroup).map(c => <article className="capture-card" key={c.id}><CaptureImage capture={c} /><div className="capture-details">
          <h3>{c.state.setupName ?? 'Saved rig'} · {captureKind(c) === 'scan' ? 'Scan position' : 'Lighting comparison'}</h3>
          <p>{measure(c.state.blade.definition.length / 2 - c.state.blade.x)} from base · {c.state.camera.focalLength} mm · f/{c.state.camera.aperture} · {shutterLabel(c.state.camera.shutter)} · EV {c.state.camera.exposure}</p>
          <p>{new Date(c.created).toLocaleString()} · {Math.floor(c.samples)} spp · {c.view}</p>
          <div className="capture-actions">
            <button onClick={() => { try { restoreState(parseSetup(c.state)); setMode(c.view); setOverlays({ ...c.overlays, grid: false, focus: false }); setNotice('Full setup restored in Edit rig mode') } catch (error) { setError(String(error)); setDialog(null) } }}>Restore full setup</button>
            <button onClick={() => { try { const rig = parseSetup(c.state); restoreState({ ...state, setupName: rig.setupName, camera: rig.camera, lights: rig.lights, diameter: rig.diameter, referenceTape: rig.referenceTape }); setNotice('Rig restored; blade and scan position preserved') } catch (error) { setError(String(error)); setDialog(null) } }}>Restore rig only</button>
            <button onClick={() => download(c.image, `nihonto-${c.id.slice(0, 8)}.png`)}>PNG</button><button onClick={() => downloadSetup(c.state)}>Setup</button>
            <button aria-label="Delete capture" onClick={async () => { try { await deleteCapture(c.id); setCaptures(await listCaptures()) } catch (error) { setError(String(error)) } }}>Delete</button>
          </div></div></article>)}</div>
      </>}
      {dialog === 'help' && <div className="help-content">
        <h3>Set up the fixed rig → Preview the scan → Save the rig</h3><p>Set shutter, aperture, exposure bias, tube brightness and on/off above the camera view. Use the rig diagram for camera height, focal length, coverage, tube height and side offsets. Suggest light positions evaluates the whole blade, including the kissaki, keeps the full tubes at or below camera height, balances enabled-source brightness within 100%, and enables Auto shutter. On/off settings are preserved. Some regions may remain weak within the height limit; inspect before saving. Lock the rig to freeze lighting and exposure while moving only the blade table. This app does not drive hardware or stitch images.</p>
        <h3>Fixed centering and framing</h3><p>Both tube spans are always centered along the fixed rig origin beneath the camera, including in restored setups. They never follow the moving blade. Move the table with the camera view, scan navigator or frame steps; Across frame under Advanced rig and table alignment remains available during setup. The table is not continuously recentered. More → Reconfigure for whole-blade shot sets the lens to 35 mm, moves the camera and centers the table: it changes the physical rig and is unavailable while locked. The scan navigator provides an overview without reconfiguring the rig.</p>
        <h3>Dimensioned diagram and 3D overview</h3><p>The end-on diagram shows camera height, tube heights and signed offsets with dimension lines and arrowheads. Drag or focus the handles to adjust them; arrow keys move 1 mm, or 10 mm with Shift. The shaded 3D overview shows the same blade geometry and rig positions, with table and blade moving together. Orbiting, panning or zooming this overview never moves the photographic camera. Table and camera-body shapes are illustrative, and its shading is not a lighting prediction.</p>
        <h3>Always-sharp lighting preview</h3><p>Manual focus and depth-of-field blur are disabled. During setup the thin-lens projection follows the local blade ridge; during a locked scan the projection stays fixed. Aperture still affects throughput unless compensated. This is not a prediction of real-camera sharpness. Diffraction, aberrations, lens distortion and camera-body occlusion are not modeled.</p>
        <h3>Auto shutter and exposure bias</h3><p>Auto shutter reads the full-resolution, scene-linear blade highlights after at least 32 stable samples. It targets 90% of clipping, accounting for tube output, aperture compensation and EV. It updates during setup, including after light changes; manual shutter edits turn it off. Lock rig pauses Auto and holds that exposure through the scan. Empty or dark views retain the last shutter value with an explicit status. To choose a different brightness, turn Auto off and adjust shutter or Exposure bias. Exposure is relative, not a calibrated camera recommendation; ISO is fixed at 100.</p>
        <h3>Camera specifications</h3><p>{SENSOR.model}: FX {SENSOR.type}, {SENSOR.width} × {SENSOR.height} mm, {SENSOR.megapixels} MP effective, {SENSOR.pixelWidth} × {SENSOR.pixelHeight} native pixels. The interactive preview and saved previews use the selected rendering resolution, not full sensor resolution. Sensor noise and spectral response are not simulated.</p>
        <details className="fixture-details"><summary>GVM fixture specifications and model limits</summary>
          <p>User-supplied specifications for each {TUBE_FIXTURE.model} photography fill light.</p>
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
          <p>The preview uses a {TUBE_LENGTH} × {state.diameter} mm cylindrical emitter approximation at fixed 5600 K. Existing saved diameters are preserved. Housing dimensions do not specify the emitting surface or beam pattern. Lux measures illuminance, not lumens; these two ratings do not calibrate the renderer or camera exposure. RGB, effects and hardware control are not simulated.</p>
        </details>
        <h3>Metric reference overlay</h3><p>Metric tape toggles a bright yellow ruler inside the image. Its markings follow the viewed position and reference-plane coverage, with zero at the blade base and labels in centimeters. Tick density adapts to zoom. It is a synthetic overlay, not ray-traced geometry or a photometric target, and is included in saved PNGs. Showing it never changes the rig and is allowed while locked. Clean view hides it. Surface relief and real-lens behavior still prevent treating it as a calibrated measurement of a raised blade.</p>
        <h3>Light transport and diagnostics</h3><p>Each {TUBE_LENGTH} mm tube has its own importance-sampled path-traced contribution with up to six scattering events. Contributions are combined before exposure and Reinhard tone mapping. Light contributions uses false color, not ray-path visualization. Clipping marks exposed linear channels at or above 1, not Nikon sensor saturation. Rendering is progressive without denoising; fine highlights may remain noisy. Fixed exposure does not mean identical brightness: steel must reflect a tube toward the camera. Auto evaluates body and kissaki positions before choosing one fixed rig; it never brightens scan frames individually.</p>
        <h3>Geometry and materials</h3><p>Blade shapes are generated, not scanned. Historical presets use source-reported dimensions with other parameters explicitly estimated. Hada combines procedural roughness, neutral metallic reflectance and microscopic normal variation, not measured metallurgy or anisotropic scattering. Hamon and polish are illustrative. Tang, fittings, grooves and authentic hamon reconstruction are not included. Tubes approximate 5600 K emission in RGB; neither radiometry nor sensor response is calibrated.</p>
        <h3>Grain selection and references</h3><p>Rendered hada selects Itame, Mokume, Masame, Ayasugi or None. New rigs start with Itame; saved None settings remain off and show a warning. Picker thumbnails are ray-traced reference swatches, not photographs or the current lighting. Enlarged automatic photo comparisons have been removed because the available full-blade photographs do not reliably support fine-detail crops at the rendered resolution. More → Original blade photograph opens the selected historical source without artificial enlargement. More → Met study references opens the separate public-domain zoom viewer. Neither reference collection is painted onto the simulated material.</p>
        <h3>Units, zoom and storage</h3><p>Rig and scan measurements follow the mm/in preference; lens focal length stays in mm and reference tape stays metric. Setup diagram zoom keeps the bottom-center origin fixed and does not move the rig. It zooms out at drag boundaries. Capture previews and setups are local to this browser. Legacy light-following is disabled; the Auto shutter choice is saved, runs only in setup and pauses while locked. Imported and restored rigs open unlocked. Existing images are not rewritten.</p>
      </div>}
    </dialog>
  </div>
}
