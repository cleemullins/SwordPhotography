import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { bladeCrossSections, bladeSection } from './blade'
import { clamp, fieldOfView, LIMITS, TUBE_FIXTURE, TUBE_LENGTH } from './model'
import type { StudioState } from './model'
import { SHUTTER_SPEEDS, shutterLabel, shutterStep } from './exposure'
import { moveSetupPosition, setupDragProjection, setupPointFits, setupPosition, setupProjection } from './setup'
import type { SetupPosition, SetupProjection, SetupTarget } from './setup'

interface NumberControlProps {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (value: number) => void; displayScale?: number; precision?: number
}

export function NumberControl({ label, value, min, max, step = 1, unit = 'mm', onChange, displayScale = 1, precision, showSlider = false }: NumberControlProps & { showSlider?: boolean }) {
  const id = useId()
  const formatted = (n: number) => Number((n * displayScale).toFixed(precision ?? (displayScale === 1 ? 3 : 2))).toString()
  const [draft, setDraft] = useState<{ value: number; scale: number; text: string; error: string } | null>(null)
  const currentDraft = draft?.value === value && draft.scale === displayScale ? draft : null
  const error = currentDraft?.error ?? ''
  return <div className={showSlider ? 'slider-control' : 'numeric-control'}>
    <div className="control-heading">
      <label htmlFor={id}>{label}</label>
      <span className="number-field"><input id={id} type="number" value={currentDraft?.text ?? formatted(value)}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        min={min * displayScale} max={max * displayScale} step={displayScale === 1 ? step : 'any'}
        onChange={event => {
          const n = event.target.valueAsNumber / displayScale
          if (!Number.isFinite(n) || n < min || n > max) {
            setDraft({ value, scale: displayScale, text: event.target.value, error: `Use ${formatted(min)} to ${formatted(max)} ${unit}.` })
          } else {
            setDraft({ value: n, scale: displayScale, text: event.target.value, error: '' })
            onChange(n)
          }
        }} /><span>{unit}</span></span>
    </div>
    {showSlider && <input type="range" aria-label={`${label} slider`} min={min} max={max} step={step} value={value}
      onChange={event => onChange(event.target.valueAsNumber)} />}
    {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
  </div>
}

export function Slider(props: NumberControlProps) { return <NumberControl {...props} showSlider /> }

export function ShutterSlider({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const id = useId()
  return <div className="slider-control">
    <div className="control-heading"><label htmlFor={id}>Shutter speed</label><output htmlFor={id}>{shutterLabel(value)}</output></div>
    <input id={id} type="range" min={0} max={SHUTTER_SPEEDS.length - 1} step={1} value={shutterStep(value)}
      aria-valuetext={shutterLabel(value)} aria-description="Photographic shutter steps, from 1/8000 second on the left to 30 seconds on the right. Longer exposure brightens the image without adding motion blur."
      onChange={event => onChange(SHUTTER_SPEEDS[event.target.valueAsNumber])} />
  </div>
}

export function TubeSpan({ state }: { state: StudioState }) {
  const d = state.blade.definition, fov = fieldOfView(state.camera)
  const outline = Array.from({ length: 121 }, (_, i) => bladeSection(d, i / 120))
  // Reserve the entire base-to-tip scan envelope so scanning does not rescale the fixed rig.
  const extentX = Math.max(d.length, Math.abs(state.blade.x) + d.length / 2,
    ...state.lights.map(l => Math.abs(l.x) + TUBE_LENGTH / 2), fov.width / 2)
  const extentY = Math.max(...outline.flatMap(s => [
    Math.abs(state.blade.y + (s.y - s.width / 2) * 1000),
    Math.abs(state.blade.y + (s.y + s.width / 2) * 1000),
  ]), ...state.lights.map(l => Math.abs(l.y) + state.diameter / 2), fov.height / 2)
  const scale = Math.min(660 / (2 * extentX), 190 / (2 * extentY))
  const X = (x: number) => 350 + x * scale
  const Y = (y: number) => 140 - y * scale
  const path = [...outline.map(s => `${X(state.blade.x + s.x * 1000)},${Y(state.blade.y + (s.y + s.width / 2) * 1000)}`),
    ...outline.toReversed().map(s => `${X(state.blade.x + s.x * 1000)},${Y(state.blade.y + (s.y - s.width / 2) * 1000)}`)].join(' ')
  return <svg className="tube-span" viewBox="0 0 700 280" role="img" aria-label={`Top view: actual X/Y positions of two ${TUBE_LENGTH} mm GVM tubes and the moving blade`}>
    <desc>Equal scale along and across the blade. Positive Y is up. The camera footprint is at the blade reference plane; height is shown in the end-on diagram.</desc>
    <text x="20" y="15">TOP VIEW (X/Y) · {TUBE_FIXTURE.model} · {TUBE_LENGTH} mm</text>
    <line x1="20" x2="680" y1={Y(0)} y2={Y(0)} className="diagram-guide" />
    {state.lights.map((l, i) => <line key={i} x1={X(l.x - TUBE_LENGTH / 2)} x2={X(l.x + TUBE_LENGTH / 2)} y1={Y(l.y)} y2={Y(l.y)}
      strokeWidth={state.diameter * scale} className={i === 0 ? 'span-left' : 'span-right'} opacity={l.enabled ? 1 : 0.3}>
      <title>{i === 0 ? 'Left' : 'Right'} tube: X {l.x.toFixed(1)} mm, Y {l.y.toFixed(1)} mm, height {l.height.toFixed(1)} mm</title>
    </line>)}
    <polygon points={path} className="span-blade" />
    <rect x={X(-fov.width / 2)} y={Y(fov.height / 2)} width={fov.width * scale} height={fov.height * scale} className="navigator-window top-camera-window" />
    <circle cx={X(0)} cy={Y(0)} r="3" className="top-camera-origin" />
    <text x="20" y="267" className="top-left-label">LEFT TUBE</text>
    <text x="170" y="267" className="top-right-label">RIGHT TUBE</text>
    <text x="340" y="267">BLADE</text>
    <text x="455" y="267">CAMERA FOOTPRINT</text>
  </svg>
}

export function BladeNavigator({ state, onPosition }: { state: StudioState; onPosition: (x: number) => void }) {
  const d = state.blade.definition
  const length = d.length + 100
  const outline = Array.from({ length: 121 }, (_, i) => bladeSection(d, i / 120))
  const minY = Math.min(...outline.map(s => (s.y - s.width / 2) * 1000))
  const maxY = Math.max(...outline.map(s => (s.y + s.width / 2) * 1000))
  const scale = Math.min(660 / length, 64 / (maxY - minY))
  const X = (x: number) => 350 + x * 1000 * scale
  const Y = (y: number) => 50 - (y * 1000 - (maxY + minY) / 2) * scale
  const path = [...outline.map(s => `${X(s.x)},${Y(s.y + s.width / 2)}`),
    ...outline.toReversed().map(s => `${X(s.x)},${Y(s.y - s.width / 2)}`)].join(' ')
  const fov = fieldOfView(state.camera).width
  const center = 350 - state.blade.x * scale
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * 700
    onPosition(clamp((350 - x) / scale, -800, 800))
  }
  return <svg className="blade-navigator" viewBox="0 0 700 100" role="img"
    aria-label="Whole blade navigator. Click to choose the viewed section." onPointerDown={event => {
      event.currentTarget.setPointerCapture(event.pointerId); move(event)
    }} onPointerMove={event => { if (event.buttons === 1) move(event) }}>
    <line x1="20" y1="50" x2="680" y2="50" className="diagram-guide" />
    <polygon points={path} className="blade-outline" />
    <rect x={center - fov * scale / 2} y="14" width={fov * scale} height="72" rx="4" className="navigator-window" />
    <line x1={center} y1="10" x2={center} y2="90" className="diagram-accent" />
    <text x="20" y="96">BASE</text><text x="650" y="96">TIP</text>
  </svg>
}

export function SetupDiagram({ state, inches, onCameraMove, onLightMove, children }: {
  state: StudioState; inches: boolean; onCameraMove: (height: number) => void;
  onLightMove: (index: 0 | 1, position: SetupPosition) => void;
  children?: (selected: SetupTarget) => ReactNode
}) {
  const svg = useRef<SVGSVGElement>(null)
  const instructions = useId(), readout = useId()
  const [selected, setSelected] = useState<SetupTarget>('camera')
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<{
    target: SetupTarget; pointerId: number; point: DOMPoint; start: SetupPosition; projection: SetupProjection
  } | null>(null)
  const fit = setupProjection(state)
  const projection = drag?.projection ?? { ...fit, scale: fit.scale * zoom }
  const { scale, center, floor } = projection
  const X = (v: number) => center + v * scale
  const Y = (v: number) => floor - v * scale
  const unit = inches ? 'in' : 'mm', displayScale = inches ? 1 / 25.4 : 1
  const measure = (v: number) => `${(v * displayScale).toFixed(inches ? 2 : 1)} ${unit}`
  const current = setupPosition(state, selected)
  const section = bladeSection(state.blade.definition, clamp(0.5 - state.blade.x / state.blade.definition.length, 0, 1))
  const cross = bladeCrossSections(state.blade.definition).flatMap(s => s.slice(0, -1))
  const name = selected === 'camera' ? 'Camera' : selected === 0 ? 'Left light' : 'Right light'

  function select(target: SetupTarget) {
    setSelected(target)
    if (!drag && !setupPointFits(state, target, setupPosition(state, target), projection)) setZoom(1)
  }
  function move(target: SetupTarget, position: SetupPosition) {
    if (state.scan.locked) return
    if (!drag && !setupPointFits(state, target, position, projection)) setZoom(1)
    if (target === 'camera') onCameraMove(position.height)
    else onLightMove(target, position)
  }
  function point(event: PointerEvent<SVGElement>) {
    return new DOMPoint(event.clientX, event.clientY)
  }
  function start(event: PointerEvent<SVGGElement>, target: SetupTarget) {
    if (event.button !== 0 || drag || state.scan.locked) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    setSelected(target)
    svg.current?.setPointerCapture(event.pointerId)
    setDrag({ target, pointerId: event.pointerId, point: point(event), start: setupPosition(state, target), projection })
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(null)
  }
  function keyboard(event: KeyboardEvent<SVGGElement>, target: SetupTarget) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || drag || state.scan.locked) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    move(target, moveSetupPosition(target, setupPosition(state, target), dx, dy, 1))
  }
  const handleProps = (target: SetupTarget) => ({
    role: 'button',
    tabIndex: 0,
    id: target === 'camera' ? 'setup-camera' : `setup-light-${target}`,
    'aria-label': target === 'camera' ? 'Camera position' : `${target === 0 ? 'Left' : 'Right'} light position`,
    'aria-describedby': `${instructions} ${readout}`,
    'aria-pressed': selected === target,
    onPointerDown: (event: PointerEvent<SVGGElement>) => start(event, target),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => keyboard(event, target),
    onFocus: () => select(target),
    className: `setup-handle ${target === 'camera' ? 'camera-handle' : ''} ${drag?.target === target ? 'dragging' : ''}`,
  })

  return <div className="setup-control">
    <p className="setup-instructions" id={instructions}>{state.scan.locked ? 'Rig locked. Select an object to inspect it; Edit rig to reposition it.' : 'Drag lights in any direction; drag the camera up/down. Arrow keys: 1 mm. Shift: 10 mm.'}</p>
    <div className="setup-zoom" role="group" aria-label="Setup diagram zoom">
      <button type="button" aria-label="Zoom out setup" title="Zoom out around the bottom center; does not move the rig" disabled={Boolean(drag) || zoom <= 0.25}
        onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}>Zoom −</button>
      <span aria-label="Setup zoom level">{Math.round(projection.scale / fit.scale * 100)}%</span>
      <button type="button" aria-label="Zoom in setup" title="Zoom in around the bottom center; does not move the rig" disabled={Boolean(drag) || zoom >= 4}
        onClick={() => setZoom(z => Math.min(4, z * 1.25))}>Zoom +</button>
      <button type="button" disabled={Boolean(drag)} onClick={() => setZoom(1)} title="Fit the camera, lights and blade into the diagram">Fit rig</button>
    </div>
    <svg ref={svg} viewBox="0 0 460 380" className="setup-diagram" role="group" aria-label="Draggable camera and light setup"
      data-scale={scale} data-origin-x={center} data-origin-y={floor}
      onPointerMove={event => {
        if (!drag || event.pointerId !== drag.pointerId) return
        const p = point(event)
        const matrix = svg.current?.getScreenCTM()
        if (!matrix) throw new Error('The setup diagram is not attached to the screen.')
        const inverse = matrix.inverse(), dx = p.x - drag.point.x, dy = p.y - drag.point.y
        // Use pointer deltas, not page-relative SVG positions: inspector layout can scroll the page.
        const position = moveSetupPosition(drag.target, drag.start, inverse.a * dx + inverse.c * dy, inverse.b * dx + inverse.d * dy, drag.projection.scale)
        const nextProjection = setupDragProjection(state, drag.target, position, drag.projection)
        if (nextProjection.scale !== drag.projection.scale) {
          // Rebase at the current physical position: zooming must not add movement.
          setDrag({ ...drag, point: p, start: position, projection: nextProjection })
          setZoom(1)
        }
        move(drag.target, position)
      }} onPointerUp={finish} onPointerCancel={finish}
      onLostPointerCapture={event => { if (event.pointerId === drag?.pointerId) setDrag(null) }}>
      <g aria-hidden="true">
        <line x1="20" y1={floor} x2="440" y2={floor} className="diagram-guide" />
        <line x1={center} y1="24" x2={center} y2={floor} className="diagram-guide" />
        <polygon points={cross.map(([v, z]) => `${X(state.blade.y + (section.y + v * section.width) * 1000)},${Y(z * section.thickness * 1000)}`).join(' ')} className="blade-line" />
        <text x={X(state.blade.y)} y={floor + 21} textAnchor="middle">NIHONTO</text>
        {state.lights.map((l, i) => <line key={i} x1={X(l.y)} y1={Y(l.height)} x2={X(state.blade.y)} y2={floor}
          className={`${i === 0 ? 'ray-left' : 'ray-right'} ${l.enabled ? '' : 'disabled-light'}`} />)}
        <path d={`M ${X(current.y)} ${Y(current.height)} V ${floor} H ${X(state.blade.y)}`} className="setup-dimensions" />
      </g>
      {(['camera', 0, 1] as const).toSorted((a, b) => Number(a === selected) - Number(b === selected)).map(i => {
        if (i === 'camera') return <g key={i} {...handleProps(i)} transform={`translate(${center},${Y(state.camera.height)})`}>
          <title>Camera: drag vertically or use up/down arrows</title>
          <circle r="23" className="setup-hit-target" />
          <rect x="-11" y="-8" width="22" height="16" rx="4" className="camera-symbol" />
          <circle r="4" className="camera-symbol" />
          <text y="-30" textAnchor="middle" aria-hidden="true">CAMERA</text>
        </g>
        const l = state.lights[i]
        return <g key={i} {...handleProps(i)} transform={`translate(${X(l.y)},${Y(l.height)})`}>
          <title>{i === 0 ? 'Left' : 'Right'} tube: drag to set height and side offset</title>
          <circle r="23" className="setup-hit-target" />
          <circle r={Math.max(4, state.diameter / 2 * scale)} className={`${i === 0 ? 'tube-left' : 'tube-right'} ${l.enabled ? '' : 'disabled-light'}`} />
          <text y="-30" textAnchor="middle" aria-hidden="true">{i === 0 ? 'LEFT' : 'RIGHT'}{l.enabled ? '' : ' / OFF'}</text>
          {Math.abs(l.x) > TUBE_LENGTH / 2 && <text y="38" textAnchor="middle" aria-hidden="true">past tube ends</text>}
        </g>
      })}
      <text x="16" y="373" aria-hidden="true">END-ON · bottom-center zoom · auto-fit at edges</text>
    </svg>
    <div className="segmented setup-selection" aria-label="Selected setup object">
      {(['camera', 0, 1] as const).map(target => <button key={target} aria-pressed={selected === target} onClick={() => {
        select(target)
        document.getElementById(target === 'camera' ? 'setup-camera' : `setup-light-${target}`)?.focus()
      }}>{target === 'camera' ? 'Camera' : target === 0 ? 'Left light' : 'Right light'}</button>)}
    </div>
    <p className="setup-readout" id={readout} aria-live={drag ? 'off' : 'polite'}>
      {name}: {measure(current.height)} high{selected === 'camera' ? ' · vertical movement only' : ` · rig offset ${measure(current.y)} · ${measure(current.y - state.blade.y)} from blade`}
    </p>
    <fieldset disabled={state.scan.locked} className="rig-fields">
    <NumberControl label={selected === 'camera' ? 'Camera height' : `${selected === 0 ? 'Left' : 'Right'} height`}
      value={current.height} min={selected === 'camera' ? LIMITS.height[0] : LIMITS.lightHeight[0]}
      max={selected === 'camera' ? LIMITS.height[1] : LIMITS.lightHeight[1]} unit={unit} displayScale={displayScale}
      onChange={height => move(selected, { ...current, height })} />
    {selected !== 'camera' && <NumberControl label={`${selected === 0 ? 'Left' : 'Right'} rig offset`}
      value={current.y} min={LIMITS.y[0]} max={LIMITS.y[1]}
      unit={unit} displayScale={displayScale} onChange={offset => move(selected, { ...current, y: offset })} />}
    {children?.(selected)}
    </fieldset>
    <p className="setup-axis-note">Rig origin: directly under the stationary camera. Negative offset is left, positive is right. Height is above the blade plane.</p>
  </div>
}
