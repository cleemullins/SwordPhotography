import { useEffect, useId, useRef, useState } from 'react'
import type { StudioState } from './model'
import { metricTapeLayout } from './tape'

export function MetricTapeOverlay({ state }: { state: StudioState }) {
  const svg = useRef<SVGSVGElement>(null), clip = useId()
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!svg.current) return
    const observer = new ResizeObserver(entries => setSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }))
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])
  const tape = size.width > 0 && size.height > 0 ? metricTapeLayout(state, size.width, size.height) : null
  return <svg ref={svg} className="metric-tape-overlay" role="img" aria-label="Metric tape overlay"
    viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}>
    {tape && <>
      <defs><clipPath id={clip}><rect x={tape.x} y={tape.y} width={tape.width} height={tape.height} /></clipPath></defs>
      <rect x={tape.x} y={tape.y} width={tape.width} height={tape.height} fill="var(--cp-tape-bg)" />
      <text x={tape.x} y={tape.y - 4} fontSize={tape.captionSize} fill="var(--cp-tape-bg)">Metric overlay · cm from blade base</text>
      <g clipPath={`url(#${clip})`} fill="var(--cp-tape-ink)" stroke="var(--cp-tape-ink)">
        {tape.ticks.map(tick => <g key={tick.mm}>
          <line x1={tick.x} x2={tick.x} y1={tape.y + tape.height} y2={tape.y + tape.height - tick.length} strokeWidth={tick.mm === 0 ? 2 : 1} />
          {tick.label && <text x={tick.x} y={tape.y + 4} dominantBaseline="text-before-edge" textAnchor="middle" fontSize={tape.fontSize} stroke="none">{tick.label}</text>}
        </g>)}
      </g>
    </>}
  </svg>
}
