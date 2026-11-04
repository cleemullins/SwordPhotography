import { useMemo, useState } from 'react'
import { bladeAngles, clamp, editableBlade, HADA_TYPES, KISSAKI_TYPES, parseBladeDefinition, PRESETS } from './model'
import type { BladeDefinition, BladeProfile, HadaType, KissakiType } from './model'
import { bladeCrossSections, bladeSection } from './blade'
import { HISTORICAL_PRESETS, PRESET_MEASURE_LABELS } from './historical-presets'
import { NumberControl, Slider } from './components'
import { HADA_DESCRIPTIONS, hadaGrain } from './hada'
import { HadaPicker } from './HadaPicker'

function HadaPreview({ hada }: { hada: HadaType }) {
  const paths = useMemo(() => {
    const paths = Array<string>(6).fill('')
    for (let y = 0; y < 72; y++) {
      let start = 0, previous = -1
      for (let x = 0; x <= 240; x++) {
        const shade = x === 240 ? -1 : Math.min(5, Math.floor(hadaGrain(hada, x / 20, y / 20 - 1.8) * 6))
        if (shade !== previous) {
          if (previous >= 0) paths[previous] += `M${start},${y}h${x - start}v1h${start - x}z`
          start = x; previous = shade
        }
      }
    }
    return paths
  }, [hada])
  return <svg className="hada-preview" viewBox="0 0 240 72" role="img" aria-label={`${HADA_TYPES[hada]} hada grain preview`}>
    {paths.map((d, i) => <path key={i} d={d} opacity={0.08 + i * 0.14} />)}
  </svg>
}

export function ModelEditor({ definition, name, inches, hada, onHada, onChange, onPreset }: {
  definition: BladeDefinition; name: string; inches: boolean; hada: HadaType; onHada: (hada: HadaType) => void;
  onChange: (definition: BladeDefinition) => void; onPreset: (name: string, definition: BladeDefinition) => void
}) {
  const d = editableBlade(definition), p = d.profile
  const [error, setError] = useState('')
  const scale = inches ? 1 / 25.4 : 1, unit = inches ? 'in' : 'mm'
  const physical = { unit, displayScale: scale, step: 0.1 }
  const angles = bladeAngles(d)
  const angle = (rise: number, run: number) => Math.atan2(rise, run) * 180 / Math.PI
  const record = HISTORICAL_PRESETS.find(item => item.name === name)
  function change(next: BladeDefinition) {
    try { onChange(parseBladeDefinition(next)); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  function value(key: 'length' | 'width' | 'thickness' | 'curvature' | 'ridge' | 'tipLength', value: number) {
    change({ ...d, [key]: value, profile: { ...p, kissakiType: key === 'tipLength' ? 'custom' : p.kissakiType } })
  }
  function profile(key: keyof BladeProfile, value: number) {
    change({ ...d, profile: { ...p, [key]: value, kissakiType: key === 'fukura' ? 'custom' : p.kissakiType } })
  }
  function kissaki(type: KissakiType) {
    if (type === 'custom') { change({ ...d, profile: { ...p, kissakiType: type } }); return }
    const settings = { ko: [0.9, 0.5], chu: [1.5, 0.5], o: [3, 0.3], ikubi: [0.7, 0.85] }[type]
    change({ ...d, tipLength: Math.max(5, p.tipWidth * settings[0]), profile: { ...p, kissakiType: type, fukura: settings[1] } })
  }
  const sections = Array.from({ length: 121 }, (_, i) => bladeSection(d, i / 120))
  const minY = Math.min(...sections.map(s => (s.y - s.width / 2) * 1000))
  const maxY = Math.max(...sections.map(s => (s.y + s.width / 2) * 1000))
  const silhouetteScale = Math.min(300 / d.length, 75 / (maxY - minY))
  const X = (x: number) => 170 + x * 1000 * silhouetteScale
  const Y = (y: number) => 63 - (y * 1000 - (maxY + minY) / 2) * silhouetteScale
  const outline = [...sections.map(s => `${X(s.x)},${Y(s.y + s.width / 2)}`),
    ...sections.toReversed().map(s => `${X(s.x)},${Y(s.y - s.width / 2)}`)].join(' ')
  const yokote = bladeSection(d, 1 - d.tipLength / d.length)
  const cross = bladeCrossSections(d).flatMap(s => s.slice(0, -1))
  const crossScale = Math.min(260 / d.width, 70 / d.thickness)
  return <div className="model-editor">
    <div className="section-heading"><span className="eyebrow">NIHONTO DESIGNER</span><span className="badge">Live geometry</span></div>
    <label className="select-field">Model preset<select aria-label="Model preset" value={record || Object.hasOwn(PRESETS, name) ? name : ''} onChange={e => {
      const historical = HISTORICAL_PRESETS.find(preset => preset.name === e.target.value)
      const selected = historical?.definition ?? PRESETS[e.target.value]
      if (selected) { onPreset(e.target.value, structuredClone(selected)); setError('') }
    }}>
      {!record && !Object.hasOwn(PRESETS, name) && <option value="">Custom blade</option>}
      <optgroup label="Representative shapes">{Object.keys(PRESETS).map(name => <option key={name}>{name}</option>)}</optgroup>
      <optgroup label="Historical / source-reported Juyo">{HISTORICAL_PRESETS.map(preset => <option key={preset.name}>{preset.name}</option>)}</optgroup>
    </select></label>
    {record && <div className="preset-provenance">
      <strong>{record.grade}</strong><p>{record.period} · <a href={record.source} target="_blank" rel="noreferrer">Published source</a></p>
      <p>{JSON.stringify(parseBladeDefinition(definition)) === JSON.stringify(parseBladeDefinition(record.definition)) ? 'Source-based approximation, not a scan.' : 'Modified historical approximation; current dimensions may differ from the source.'}</p>
      <details><summary>Published measurements and assumptions</summary>
        <dl>{Object.entries(record.published).map(([key, v]) => <div key={key}><dt>{PRESET_MEASURE_LABELS[key as keyof typeof PRESET_MEASURE_LABELS]}</dt><dd>{typeof v === 'number' ? `${v} mm` : v}</dd></div>)}</dl>
        <p>{record.notes}</p>
        <p>Unlisted dimensions, ridge position/height, facet angles, curvature distribution, niku, and fukura are estimates. Flat mune, no grooves, tang, or fittings. Grading is reported by the linked source, not independently authenticated here.</p>
      </details>
    </div>}
    <div className="section-heading"><span className="eyebrow">HADA / GRAIN</span></div>
    <HadaPicker label="Hada type" value={hada} onChange={onHada} />
    <p className="control-note">{HADA_DESCRIPTIONS[hada]}</p>
    <HadaPreview hada={hada} />
    <p className="control-note">Enlarged schematic of a 12 x 3.6 mm grain patch. Fine layers, intermittent chikei-like strands and ji-nie-like microfacets vary roughness, reflection normals and neutral steel reflectance. No highlights are painted in. Independent of hamon; inspect the camera image under different lights and polish settings.</p>
    <details><summary>Grain model and reference examples</summary>
      <p className="control-note">Original procedural steel informed by documented examples, not copied photographs or measured metallurgy. Submicron relief and crystal activity are illustrative and not authenticated to any blade preset. Changing grain regenerates the 8K surface maps; very fine details need close framing.</p>
      <p className="control-note"><a href="https://www.nihonto-museum.com/collection/exhibit/tokubetsu-juyo-samonji-katana" target="_blank" rel="noreferrer">Samonji, Tokubetsu Juyo 17: close-up surface references</a></p>
      <p className="control-note"><a href="https://www.nihonto-museum.com/collection/exhibit/juyo-token-hoki-kami-taira-ason-masayuki" target="_blank" rel="noreferrer">Masayuki, Juyo 63: mixed itame, mokume, flowing grain and chikei</a></p>
      <p className="control-note"><a href="https://uniquejapan.com/swords/ujka148-hosho-katana/" target="_blank" rel="noreferrer">Hosho, Juyo 48: masame with ji-nie and chikei</a></p>
    </details>
    {!definition.profile && <p className="control-note">This is a legacy shape. Your first geometry edit upgrades it to the dimensioned profile; the tip and curvature distribution will change. Legacy dimensions are retained, with corrected outward-edge curvature.</p>}
    <svg className="model-preview" viewBox="0 0 340 130" role="img" aria-label="Blade silhouette and yokote">
      <polygon points={outline} className="blade-outline" />
      <line x1={X(yokote.x)} x2={X(yokote.x)} y1={Y(yokote.y - yokote.width / 2)} y2={Y(yokote.y + yokote.width / 2)} className="diagram-accent" />
      <text x="12" y="120">BASE</text><text x="285" y="120">KISSAKI</text>
    </svg>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="section-heading"><span className="eyebrow">LENGTH &amp; CURVATURE</span></div>
    <Slider label="Nagasa / blade length" value={d.length} min={Math.max(100, d.tipLength + 20)} max={1200} {...physical} onChange={v => value('length', v)} />
    <Slider label="Sori / curvature" value={d.curvature} min={0} max={60} {...physical} onChange={v => value('curvature', v)} />
    <Slider label="Curvature peak from base" value={p.curvePosition * 100} min={15} max={85} unit="%" onChange={v => profile('curvePosition', v / 100)} />
    <p className="control-note">35% suggests koshi-zori, 50% torii-zori, 65% saki-zori. The sharp edge is on the convex, larger-radius side; the mune is on the inner side. Sori is the spine's maximum offset from its base-to-tip chord; nagasa excludes the tang.</p>
    <div className="section-heading"><span className="eyebrow">WIDTH &amp; THICKNESS</span></div>
    <Slider label="Motohaba / base width" value={d.width} min={Math.max(15, p.tipWidth)} max={70} {...physical} onChange={v => value('width', v)} />
    <Slider label="Sakihaba / yokote width" value={p.tipWidth} min={5} max={d.width} {...physical} onChange={v => profile('tipWidth', v)} />
    <Slider label="Motokasane / base spine thickness" value={p.baseKasane} min={Math.max(1, p.tipKasane)} max={d.thickness} {...physical} onChange={v => profile('baseKasane', v)} />
    <Slider label="Sakikasane / yokote spine thickness" value={p.tipKasane} min={0.5} max={p.baseKasane} {...physical} onChange={v => profile('tipKasane', v)} />
    <Slider label="Shinogi thickness at base" value={d.thickness} min={Math.max(2, p.baseKasane)} max={12} {...physical} onChange={v => value('thickness', v)} />
    <div className="section-heading"><span className="eyebrow">KISSAKI</span></div>
    <label className="select-field">Kissaki type<select aria-label="Kissaki type" value={p.kissakiType} onChange={e => kissaki(e.target.value as KissakiType)}>
      {Object.entries(KISSAKI_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <Slider label="Kissaki length" value={d.tipLength} min={5} max={Math.min(300, d.length - 20)} {...physical} onChange={v => value('tipLength', v)} />
    <Slider label="Fukura / tip fullness" value={p.fukura * 100} min={0} max={100} unit="%" onChange={v => profile('fukura', v / 100)} />
    <p className="control-note">Types apply illustrative length/fullness proportions, not historical classification rules. Editing length or fullness selects Custom. Sakihaba and sakikasane are measured at the yokote, not at the terminal point.</p>
    <div className="section-heading"><span className="eyebrow">CROSS-SECTION &amp; ANGLES</span></div>
    <svg className="model-preview" viewBox="0 0 340 100" role="img" aria-label="Base cross-section at equal horizontal and vertical scale">
      <polygon points={cross.map(([v, z]) => `${170 + v * d.width * crossScale},${50 - z * d.thickness * crossScale}`).join(' ')} className="blade-outline" />
      <text x="12" y="95">EDGE</text><text x="285" y="95">MUNE</text>
    </svg>
    <Slider label="Shinogi position from edge" value={(d.ridge + 0.5) * 100} min={40} max={85} unit="%" onChange={v => value('ridge', v / 100 - 0.5)} />
    <Slider label="Niku / bevel convexity" value={p.niku * 100} min={0} max={10} unit="%" step={0.1} onChange={v => profile('niku', v / 100)} />
    <NumberControl label="Edge bevel chord angle" value={angles.bevel}
      min={angle(Math.max(2, p.baseKasane) / 2, d.width * (d.ridge + 0.5))}
      max={angle(6, d.width * (d.ridge + 0.5))} unit="deg" step={0.1}
      onChange={v => value('thickness', clamp(2 * d.width * (d.ridge + 0.5) * Math.tan(v * Math.PI / 180), Math.max(2, p.baseKasane), 12))} />
    <NumberControl label="Shinogi-ji facet angle" value={angles.upper} min={0}
      max={angle((d.thickness - Math.max(1, p.tipKasane)) / 2, d.width * (0.5 - d.ridge))} unit="deg" step={0.1}
      onChange={v => profile('baseKasane', clamp(d.thickness - 2 * d.width * (0.5 - d.ridge) * Math.tan(v * Math.PI / 180), Math.max(1, p.tipKasane), d.thickness))} />
    <p className="control-note">Per-side angles at the base. Edge angle changes shinogi thickness; shinogi-ji angle changes spine thickness. Included chord angle: {angles.included.toFixed(2)}°. Niku adds convexity, so local surface angles vary.</p>
    <p className="control-note">Shinogi-zukuri blade only, with a simplified flat mune. These dimensions do not reconstruct grooves, tangs, fittings, hamon, or microscopic polish.</p>
  </div>
}
