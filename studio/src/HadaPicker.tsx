import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { HADA_TYPES } from './model'
import type { HadaType } from './model'
import { HADA_DESCRIPTIONS } from './hada'

export function HadaPicker({ label, value, onChange }: { label: string; value: HadaType; onChange: (value: HadaType) => void }) {
  const [open, setOpen] = useState(false)
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null)
  const types = Object.keys(HADA_TYPES) as HadaType[]
  const image = (type: HadaType) => <img src={`${import.meta.env.BASE_URL}hada/${type}.png`} alt="" width="96" height="48" />
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus()
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div className="hada-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}
    onKeyDown={e => {
      if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close() }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      if (!open) { setOpen(true); return }
      const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 :
        (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }}>
    <span className="hada-picker-label" id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="hada-picker-trigger" role="combobox" aria-labelledby={`${id}-label`}
      aria-controls={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {image(value)}<span>{HADA_TYPES[value]}</span><ChevronDown size={16} />
    </button>
    {open && <div className="hada-picker-menu">
      <div id={id} role="listbox" aria-labelledby={`${id}-label`} ref={list}>
        {types.map(type => <button key={type} type="button" role="option" aria-label={HADA_TYPES[type]} aria-selected={value === type}
          onClick={() => { onChange(type); close() }}>{image(type)}
          <span><strong>{HADA_TYPES[type]}</strong><small>{HADA_DESCRIPTIONS[type]}</small></span></button>)}
      </div>
      <p>Ray-traced reference swatches. Live appearance depends on lighting and exposure.</p>
    </div>}
  </div>
}
