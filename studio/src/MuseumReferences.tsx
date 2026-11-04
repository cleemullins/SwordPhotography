import { useEffect, useRef, useState } from 'react'

interface MuseumView { file: string; width: number; height: number; label: string }
export interface MuseumReference {
  file: string; objectId: number; title: string; sourcePage: string; license: string;
  artist: string; date: string; dimensions: string; width: number; height: number;
  licenseUrl: string; additionalViews?: MuseumView[]
}

export function MuseumReferences({ references }: { references: MuseumReference[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [viewIndex, setViewIndex] = useState(0), [zoom, setZoom] = useState(1), [error, setError] = useState('')
  const [size, setSize] = useState({ width: 800, height: 600 })
  const frame = useRef<HTMLDivElement>(null)
  const record = references.find(r => r.objectId === selected)
  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver(entries => setSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [selected])
  const title = (r: MuseumReference) => r.title.replace(/<[^>]*>/g, '')
  if (!record) return <>
    <p>Public-domain photographs from The Metropolitan Museum of Art. Study geometry, hamon and surface activity at full resolution; these are not the ten named Juyo blades or calibrated lighting captures.</p>
    <p><a href="https://www.metmuseum.org/art/collection/search?q=nihonto" target="_blank" rel="noreferrer">Browse the Met's nihonto collection</a></p>
    <div className="reference-grid">{references.map(r => <button key={r.objectId} className="reference-card"
      onClick={() => { setSelected(r.objectId); setViewIndex(0); setZoom(1); setError('') }}>
      <img loading="lazy" src={`${import.meta.env.BASE_URL}references/${r.file}`} alt={`${title(r)} · Met ${r.objectId}`} />
      <div><h3>{r.artist || title(r)}</h3><small>{r.date}</small><small>{r.license} · Met {r.objectId}</small></div>
    </button>)}</div>
  </>
  const views: MuseumView[] = [{ file: record.file, width: record.width, height: record.height, label: 'Primary photograph' }, ...(record.additionalViews ?? [])]
  const view = views[viewIndex], fit = Math.min(size.width / view.width, size.height / view.height)
  return <section className="museum-study" aria-label="Met museum study viewer">
    <div className="museum-toolbar"><button onClick={() => setSelected(null)}>Back to museum gallery</button>
      <a href={record.sourcePage} target="_blank" rel="noreferrer">Met object {record.objectId}</a>
      <a href={`${import.meta.env.BASE_URL}references/${view.file}`} target="_blank" rel="noreferrer">Open original image</a></div>
    <h3>{record.artist || title(record)} · {record.date}</h3>
    <p>{record.dimensions}</p>
    <p>Supplemental study reference, not the selected Juyo blade. Photographic lighting is baked in; do not treat it as a relightable material.</p>
    <div className="museum-toolbar">
      <label>Photograph<select aria-label="Met photograph" value={viewIndex} onChange={e => { setViewIndex(Number(e.target.value)); setZoom(1); setError('') }}>
        {views.map((v, i) => <option value={i} key={v.file}>{v.label}</option>)}
      </select></label>
      <label className="museum-zoom">Image zoom <output>{Math.round(zoom * 100)}%</output>
        <input aria-label="Met image zoom" type="range" min="1" max="8" step="0.25" value={zoom} onChange={e => setZoom(e.target.valueAsNumber)} />
      </label>
      <button onClick={() => setZoom(1)}>Fit image</button>
    </div>
    <div className="museum-image-viewer" ref={frame}>
      <img src={`${import.meta.env.BASE_URL}references/${view.file}`} alt={`${record.artist || title(record)} · ${view.label}`}
        style={{ width: view.width * fit * zoom, height: view.height * fit * zoom }}
        onError={() => setError('The museum photograph could not be loaded.')} />
    </div>
    {error && <p role="alert" className="warning-note">{error}</p>}
    <p>Scroll to pan when zoomed. Source image: {view.width} × {view.height} pixels. The Metropolitan Museum of Art · <a href={record.licenseUrl} target="_blank" rel="noreferrer">{record.license}</a>.</p>
  </section>
}
