import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { editLayout, layoutMetrics, regularLayout, resizeLayout, TEMPLATES, templateLayout, validateLayout, profileLabel, withProfile, type Architecture, type Layout } from './sim/layout.ts'
import { loadPlans, savePlans } from './preferences.ts'

type Tool = 'rack' | 'station' | 'lift' | 'erase'
type Mode = 'point' | 'line' | 'area'
const ARCHITECTURES: [Architecture, string][] = [['skypod', 'Skypod 2025+'], ['classic', 'Skypod classique'], ['lifts', 'Ascenseurs'], ['autostore', 'AutoStore']]
// Ce qu'il faut savoir d'une technologie pour la configurer ; hypothèses détaillées dans docs/SKYPOD.md et docs/PROFILES.md.
const HOW: Record<Architecture, string> = {
  skypod: 'Le robot roule au sol, passe sous les rayonnages et grimpe dans l’allée entre deux rayonnages face à face : un bac de chaque côté par niveau.',
  classic: 'Même robot grimpeur, mais le sol sous les rayonnages est plein : on circule seulement dans les allées et par les transversales.',
  lifts: 'Robots par étage ; des gaines d’ascenseur relient les étages, une gaine pour un robot à la fois. Placer 1 à 8 gaines.',
  autostore: 'Piles de bacs en grille ; les robots roulent au sommet, creusent la pile et restituent les bacs. Ports en bordure.',
}
const architecture = (l: Layout): Architecture => l.profile === 'lifts' || l.profile === 'autostore' ? l.profile : l.generation === 'classic' ? 'classic' : 'skypod'

function Stepper({ id, label, value, min, max, step = 1, onChange }: { id: string; label: string; value: string; min: number; max: number; step?: number; onChange: (v: string) => void }) {
  const n = Number(value)
  return <div className="field"><label htmlFor={id}>{label}</label><div className="stepper">
    <button type="button" aria-label="Diminuer" title={`${label} : diminuer`} disabled={!(n > min)} onClick={() => onChange(String(Math.max(min, n - step)))}>−</button>
    <input id={id} name={id.replace(/^edit-/, '')} type="number" inputMode="numeric" autoComplete="off" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" aria-label="Augmenter" title={`${label} : augmenter`} disabled={!(n < max)} onClick={() => onChange(String(Math.min(max, n + step)))}>+</button>
  </div></div>
}

function Pills<T extends string>({ name, legend, value, options, onChange }: { name: string; legend: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <fieldset className="pills"><legend>{legend}</legend>{options.map(([v, text]) =>
    <label key={v} className="pill"><input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />{text}</label>)}</fieldset>
}

function MiniPlan({ layout }: { layout: Layout }) {
  return <svg viewBox={`0 0 ${layout.width} ${layout.depth}`} aria-hidden="true">
    <rect className="mini-floor" width={layout.width} height={layout.depth} rx="2" />
    {layout.racks.map((p) => <rect key={`${p.x}-${p.z}`} className="mini-rack" x={layout.profile === 'autostore' ? p.x : p.x - 1} y={p.z} width={layout.profile === 'autostore' ? 1 : 3} height="1" />)}
    {layout.stations.map((p) => <rect key={`${p.x}-${p.z}`} className="mini-station" x={p.x} y={p.z} width="1.6" height="1.6" />)}
  </svg>
}

export function Editor({ layout, count, onApply }: { layout: Layout; count: number; onApply: (layout: Layout, count: number) => void }) {
  useLayoutEffect(() => { document.getElementById('editor-title')?.focus({ preventScroll: true }) }, [])
  const [draft, setDraft] = useState(layout)
  const [history, setHistory] = useState<Layout[]>([])
  const [robots, setRobots] = useState(String(count))
  const [fields, setFields] = useState(() => {
    const rows = new Set(layout.racks.map((p) => p.x))
    return { levels: String(layout.levels), fill: String(layout.fill), rows: String(rows.size), stations: String(layout.stations.length),
      bays: String(Math.max(...Array.from(rows, (x) => layout.racks.filter((p) => p.x === x).length))) }
  })
  const [size, setSize] = useState({ width: String(layout.width), depth: String(layout.depth) })
  const [liftSteps, setLiftSteps] = useState(String(layout.liftSteps ?? 15))
  const [storage, setStorage] = useState(layout.storage)
  const [tool, setTool] = useState<Tool>('rack')
  const [mode, setMode] = useState<Mode>('point')
  const [shape, setShape] = useState<{ start: { x: number; z: number }; end: { x: number; z: number } } | null>(null)
  const [cursor, setCursor] = useState({ x: 2, z: 2 })
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null)
  const [frame, setFrame] = useState<{ w: number; d: number } | null>(null)
  const [error, setError] = useState('')
  const [planName, setPlanName] = useState('')
  const [notice, setNotice] = useState('Brouillon : la simulation en cours continue jusqu’à « Appliquer le plan ».')
  const svg = useRef<SVGSVGElement>(null)
  const current = useRef(draft); current.current = draft
  // Geste en cours : peinture d'outil, ou poignée de redimensionnement (base figée au début du geste).
  const gesture = useRef<{ kind: 'paint'; last: string } | { kind: 'shape' } | { kind: 'resize'; axis: 'x' | 'z' | 'xz'; x: number; y: number; scale: number; base: Layout } | null>(null)

  const commit = (plan: Layout, record = true) => {
    const previous = current.current
    if (record) setHistory((items) => [...items.slice(-49), previous])
    current.current = plan; setDraft(plan); setSize({ width: String(plan.width), depth: String(plan.depth) })
    setError(''); setNotice('Plan modifié. « Appliquer le plan » redémarre la simulation avec ce plan.')
  }
  const fail = (e: unknown) => setError((e as Error).message)
  const use = (x: number, z: number, record = true, quiet = false) => {
    setCursor({ x, z })
    try { commit(editLayout(current.current, tool, x, z), record) } catch (e) { if (!quiet) fail(e) }
  }
  const resize = (width: number, depth: number, base = current.current, record = true) => {
    try { commit(resizeLayout(base, width, depth), record) } catch (e) { setError(`Sol ${width} × ${depth} impossible : ${(e as Error).message}`) }
  }
  const editSize = (key: 'width' | 'depth', value: string) => {
    setSize((s) => ({ ...s, [key]: value }))
    const n = Number(value), [min, max] = key === 'width' ? [16, 80] : [16, 64]
    if (Number.isInteger(n) && n % 2 === 0 && n >= min && n <= max && n !== current.current[key]) {
      resize(key === 'width' ? n : current.current.width, key === 'depth' ? n : current.current.depth)
    }
  }
  const cellAt = (e: PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    // Travées et gomme sur toutes les lignes ; stations et gaines sur les lignes paires.
    const fine = tool === 'rack' || tool === 'erase', x = fine && current.current.profile === 'autostore' ? Math.floor(p.x) : Math.floor(p.x / 2) * 2, z = fine ? Math.floor(p.y) : Math.floor(p.y / 2) * 2
    return x >= 0 && z >= 0 && x < current.current.width && z < current.current.depth ? { x, z } : null
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const handle = (e.target as Element).getAttribute('data-handle') as 'x' | 'z' | 'xz' | null
    if (handle) {
      const box = svg.current!.getBoundingClientRect(), view = svg.current!.viewBox.baseVal
      gesture.current = { kind: 'resize', axis: handle, x: e.clientX, y: e.clientY, scale: box.width / view.width, base: current.current }
      const previous = current.current
      setFrame({ w: previous.width, d: previous.depth }); setHistory((items) => [...items.slice(-49), previous])
    } else {
      const cell = cellAt(e)
      if (!cell) return
      if (mode === 'point') { gesture.current = { kind: 'paint', last: `${cell.x},${cell.z}` }; use(cell.x, cell.z) }
      else { gesture.current = { kind: 'shape' }; setShape({ start: cell, end: cell }); setCursor(cell) }
    }
    svg.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (g?.kind === 'resize') {
      const step = (start: number, delta: number, max: number) => Math.max(16, Math.min(max, Math.round((start + delta / g.scale) / 2) * 2))
      const width = g.axis === 'z' ? g.base.width : step(g.base.width, e.clientX - g.x, 80)
      const depth = g.axis === 'x' ? g.base.depth : step(g.base.depth, e.clientY - g.y, 64)
      if (width !== current.current.width || depth !== current.current.depth) resize(width, depth, g.base, false)
      return
    }
    const cell = cellAt(e)
    setHover(cell)
    if (g?.kind === 'shape' && cell) setShape((sh) => sh && { ...sh, end: cell })
    if (g?.kind === 'paint' && cell && `${cell.x},${cell.z}` !== g.last) { g.last = `${cell.x},${cell.z}`; use(cell.x, cell.z, false, true) }
  }
  // Ligne (horizontale ou verticale selon le geste) ou zone : chaque position suit l'outil, un seul pas d'annulation.
  const shapeCells = (start: { x: number; z: number }, end: { x: number; z: number }) => {
    const sx = draft.profile === 'autostore' ? (tool === 'station' ? 2 : 1) : tool === 'rack' ? 4 : 2, sz = tool === 'rack' || tool === 'erase' ? 1 : 2
    const range = (a: number, b: number, step: number) => { const out: number[] = []; for (let v = a; b >= a ? v <= b : v >= b; v += b >= a ? step : -step) out.push(v); return out }
    if (mode === 'line') return Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
      ? range(start.x, end.x, sx).map((x) => ({ x, z: start.z })) : range(start.z, end.z, sz).map((z) => ({ x: start.x, z }))
    return range(start.x, end.x, sx).flatMap((x) => range(start.z, end.z, sz).map((z) => ({ x, z })))
  }
  const up = () => {
    if (gesture.current?.kind === 'shape' && shape) {
      let plan = current.current, done = 0, skipped = 0
      for (const p of shapeCells(shape.start, shape.end)) { try { plan = editLayout(plan, tool, p.x, p.z); done++ } catch { skipped++ } }
      if (plan !== current.current) commit(plan)
      setNotice(`${done} position${done > 1 ? 's' : ''} traitée${done > 1 ? 's' : ''}${skipped ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''} (occupée ou hors règles)` : ''}.`)
      setShape(null)
    }
    gesture.current = null; setFrame(null)
  }
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const dx = e.key === 'ArrowRight' ? 2 : e.key === 'ArrowLeft' ? -2 : 0
    const row = tool === 'rack' || tool === 'erase' ? 1 : 2
    const dz = e.key === 'ArrowDown' ? row : e.key === 'ArrowUp' ? -row : 0
    if (dx || dz) {
      e.preventDefault(); setCursor({ x: Math.max(0, Math.min(draft.width - 2, cursor.x + dx)), z: Math.max(0, Math.min(draft.depth - 2, (row === 2 ? cursor.z - cursor.z % 2 : cursor.z) + dz)) })
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); use(cursor.x, cursor.z) }
  }
  const ghost = hover
  const ghostValid = useMemo(() => {
    if (!ghost) return false
    try { editLayout(draft, tool, ghost.x, ghost.z); return true } catch { return false }
  }, [draft, tool, ghost?.x, ghost?.z])

  const setArchitecture = (value: Architecture) => {
    try {
      const plan = withProfile(draft, value === 'classic' ? 'skypod' : value, undefined, Number(liftSteps))
      if (value === 'classic') plan.generation = 'classic'
      else if (plan.generation) plan.generation = '2025+'
      validateLayout(plan); commit(plan); setTool('rack')
    } catch (e) { fail(e) }
  }
  const arch = architecture(draft)
  const templates = useMemo(() => TEMPLATES.filter((t) => t.architecture === arch).map((t) => {
    try { const plan = templateLayout(t.id, draft.width, draft.depth, Number(fields.levels) || 1, Number(fields.stations) || 1); return { ...t, plan, metrics: layoutMetrics(plan), error: '' } }
    catch (e) { return { ...t, plan: null, metrics: null, error: (e as Error).message } }
  }), [arch, draft.width, draft.depth, fields.levels, fields.stations])
  const useTemplate = (plan: Layout) => {
    try {
      const next = { ...plan, fill: Number(fields.fill), storage, ...(plan.profile === 'lifts' ? { liftSteps: Number(liftSteps) } : {}) }
      validateLayout(next); commit(next); setTool('rack'); setCursor({ x: 2, z: 2 })
    } catch (e) { fail(e) }
  }
  const build = () => {
    try {
      commit(withProfile(regularLayout(draft.width, draft.depth, Number(fields.rows), Number(fields.bays), Number(fields.levels), Number(fields.stations), Number(fields.fill), storage, draft.generation), draft.profile ?? 'skypod', undefined, Number(liftSteps)))
      setCursor({ x: 2, z: 2 })
    } catch (e) { fail(e) }
  }
  const finished = () => ({ ...draft, levels: Number(fields.levels), fill: Number(fields.fill), storage, ...(draft.profile === 'lifts' ? { liftSteps: Number(liftSteps) } : {}) })
  // Le brouillon rejoint les plans comparables (onglet Analyser) sans redémarrer le run.
  const savePlan = () => {
    try {
      const name = planName.trim(), { plans } = loadPlans()
      if (!name || name.length > 40 || plans.some((p) => p.name === name)) throw new RangeError('Choisir un nom de 1 à 40 caractères, différent des plans enregistrés.')
      const plan = finished(); validateLayout(plan)
      const warning = savePlans([...plans, { name, layout: plan }])
      if (warning) throw new RangeError(warning)
      setError(''); setPlanName(''); setNotice(`Plan « ${name} » enregistré pour les comparaisons.`)
    } catch (e) { fail(e) }
  }
  const apply = () => { try { const plan = finished(); validateLayout(plan); onApply(plan, Number(robots)) } catch (e) { fail(e) } }
  const metrics = (() => { try { return layoutMetrics({ ...draft, levels: Number(fields.levels) || 1 }) } catch { return null } })()
  const autostore = draft.profile === 'autostore'
  const view = frame ?? { w: draft.width, d: draft.depth }
  const fleetShare = metrics ? Math.min(1, Number(robots) / Math.max(1, metrics.fleet)) : 0

  return <section className="editor studio" aria-labelledby="editor-title">
    <div className="board">
      <header className="board-head">
        <div><h1 id="editor-title" tabIndex={-1}>Concevoir l’entrepôt</h1><p className="meta">{profileLabel(draft)} · implantation illustrative · dimensions en cellules de simulation</p></div>
      </header>
      <div className="toolbar">
        <div className="tools" role="group" aria-label="Outil de placement">
          {(['rack', 'station', ...(draft.profile === 'lifts' ? ['lift'] as const : []), 'erase'] as const).map((t) => <button key={t} type="button" className={`tool tool-${t}`} aria-pressed={tool === t} onClick={() => setTool(t)}>
            <i aria-hidden="true" />{t === 'rack' ? (autostore ? 'Pile' : 'Travée') : t === 'station' ? 'Station' : t === 'lift' ? 'Ascenseur' : 'Gomme'}</button>)}
        </div>
        <div className="seg modes" role="group" aria-label="Tracé">
          {([['point', 'Point'], ['line', 'Ligne'], ['area', 'Zone']] as const).map(([m, text]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{text}</button>)}
        </div>
        <button type="button" className="undo" disabled={!history.length} onClick={() => {
          const previous = history[history.length - 1]
          if (tool === 'lift' && previous.profile !== 'lifts') setTool('rack')
          current.current = previous; setDraft(previous); setSize({ width: String(previous.width), depth: String(previous.depth) }); setLiftSteps(String(previous.liftSteps ?? 15)); setStorage(previous.storage)
          setHistory(history.slice(0, -1)); setCursor({ x: 2, z: 2 }); setError(''); setNotice('Dernière modification du plan annulée.')
        }}><span aria-hidden="true">↶ </span>Annuler la modification</button>
      </div>
      <div className="matrix">
        <div className="ruler ruler-x"><span className="ruler-line" aria-hidden="true" />
          <div className="dimension"><label htmlFor="edit-width">Largeur (cellules)</label><div className="stepper">
            <button type="button" aria-label="Largeur : moins" disabled={draft.width <= 16} onClick={() => resize(draft.width - 2, draft.depth)}>−</button>
            <input id="edit-width" name="width" type="number" min="16" max="80" step="2" autoComplete="off" value={size.width} aria-invalid={size.width !== String(draft.width)}
              onChange={(e) => editSize('width', e.target.value)} onBlur={() => setSize((s) => ({ ...s, width: String(current.current.width) }))} />
            <button type="button" aria-label="Largeur : plus" disabled={draft.width >= 80} onClick={() => resize(draft.width + 2, draft.depth)}>+</button></div></div>
          <span className="ruler-line" aria-hidden="true" /></div>
        <div className="ruler ruler-z"><span className="ruler-line" aria-hidden="true" />
          <div className="dimension"><label htmlFor="edit-depth">Profondeur (cellules)</label><div className="stepper">
            <button type="button" aria-label="Profondeur : moins" disabled={draft.depth <= 16} onClick={() => resize(draft.width, draft.depth - 2)}>−</button>
            <input id="edit-depth" name="depth" type="number" min="16" max="64" step="2" autoComplete="off" value={size.depth} aria-invalid={size.depth !== String(draft.depth)}
              onChange={(e) => editSize('depth', e.target.value)} onBlur={() => setSize((s) => ({ ...s, depth: String(current.current.depth) }))} />
            <button type="button" aria-label="Profondeur : plus" disabled={draft.depth >= 64} onClick={() => resize(draft.width, draft.depth + 2)}>+</button></div></div>
          <span className="ruler-line" aria-hidden="true" /></div>
        <svg ref={svg} className="plan" viewBox={`-1 -1 ${view.w + 4} ${view.d + 4}`} style={{ '--ratio': (view.w + 4) / (view.d + 4) } as CSSProperties} tabIndex={0} role="group"
          aria-label={`Plan ${draft.width} par ${draft.depth}. Emplacement x ${cursor.x}, z ${cursor.z}. Outil ${tool}.`} aria-describedby="plan-help"
          onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)}>
          <rect className="plan-ground" width={draft.width} height={draft.depth} rx=".6" />
          {/* Une case = une cellule du moteur ; emplacements aux coordonnées paires, voies entre eux. */}
          {Array.from({ length: draft.width * draft.depth }, (_, i) => {
            const x = i % draft.width, z = Math.floor(i / draft.width), slot = x % 2 === 0 && z % 2 === 0
            return <rect key={i} className={slot ? 'plan-cell' : 'plan-lane'} data-cell={x % 2 === 0 || autostore ? `${x},${z}` : undefined} x={x + .06} y={z + .06} width=".88" height=".88" rx=".18" />
          })}
          {draft.racks.map((p) => <g key={`r${p.x}-${p.z}`} className="plan-rack">
            {!autostore && [-1, 1].map((side) => <rect key={side} className="plan-stock" x={p.x + side + .08} y={p.z + .08} width=".84" height=".84" rx=".2" />)}
            <rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" />
            <text x={p.x + .5} y={p.z + .7} style={{ fontSize: '.6px' }}>{autostore ? 'P' : 'R'}</text></g>)}
          {draft.lifts?.map((p) => <g key={`l${p.x}-${p.z}`} className="plan-station plan-lift"><rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" /><text x={p.x + .5} y={p.z + .7}>L</text></g>)}
          {draft.stations.map((p) => <g key={`s${p.x}-${p.z}`} className="plan-station"><rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" /><text x={p.x + .5} y={p.z + .7}>S</text></g>)}
          {ghost && !gesture.current && <rect className={`plan-ghost${ghostValid ? '' : ' invalid'}`} x={tool === 'rack' && !autostore ? ghost.x - 1 : ghost.x} y={ghost.z}
            width={tool === 'rack' && !autostore ? 3 : 1} height="1" rx=".25" />}
          {shape && shapeCells(shape.start, shape.end).slice(0, 2500).map((p) => <rect key={`g${p.x}-${p.z}`} className="plan-ghost" x={tool === 'rack' && !autostore ? p.x - 1 : p.x} y={p.z}
            width={tool === 'rack' && !autostore ? 3 : 1} height="1" rx=".25" />)}
          <rect className="plan-cursor" x={cursor.x} y={cursor.z} width="1" height="1" rx=".25" />
          <rect className="handle" data-handle="x" x={draft.width + .5} y={draft.depth / 2 - 2.5} width="1" height="5" rx=".5"><title>Étirer la largeur</title></rect>
          <rect className="handle" data-handle="z" x={draft.width / 2 - 2.5} y={draft.depth + .5} width="5" height="1" rx=".5"><title>Étirer la profondeur</title></rect>
          <circle className="handle" data-handle="xz" cx={draft.width + 1} cy={draft.depth + 1} r=".9"><title>Étirer le sol</title></circle>
        </svg>
      </div>
      <p id="plan-help" className="meta">Point : cliquer ou glisser pour peindre. Ligne : glisser, horizontale ou verticale. Zone : glisser un rectangle à remplir. Poignées pour étirer le sol ; au clavier : flèches puis Entrée. {autostore ? 'Une pile occupe une cellule.' : 'Une travée = allée de grimpe R entre deux rayonnages, un bac de chaque côté par niveau ; deux allées voisines sont à 4 cellules (rayonnages dos à dos).'}</p>
      <span className="sr-only" role="status">Emplacement x {cursor.x}, z {cursor.z}.</span>
    </div>

    <aside className="side" aria-label="Réglages du plan"><div className="side-scroll">
      <div className="card setup">
        <div className="setup-step"><Pills name="architecture" legend="1 · Technologie" value={arch} options={ARCHITECTURES} onChange={setArchitecture} />
          <p className="meta how">{HOW[arch]}</p></div>
        <div className="setup-step"><h2>2 · Partir d’un modèle <span className="meta">généré sur le sol actuel, {draft.width} × {draft.depth}</span></h2>
          <div className="presets" role="group" aria-label="Modèles pour cette technologie">
            {templates.map((t) => <button key={t.id} type="button" data-preset={t.id} className="preset" disabled={!t.plan} title={t.error || t.purpose} onClick={() => t.plan && useTemplate(t.plan)}>
              {t.plan ? <MiniPlan layout={t.plan} /> : <span className="mini-empty" aria-hidden="true" />}
              <span>{t.name}<small>{t.metrics ? `${t.metrics.slots} empl. · ${t.metrics.fleet} robots max` : t.error}</small><small className="purpose">{t.purpose}</small></span></button>)}
          </div></div>
      </div>
      <div className="card">
        <h2>Stockage et flotte</h2>
        {draft.profile === 'lifts' && <Stepper id="lift-duration" label="Ascenseur · pas par niveau (0,1 s)" value={liftSteps} min={5} max={100} step={5} onChange={setLiftSteps} />}
        <div className="field-grid">
          <Stepper id="edit-levels" label="Niveaux" value={fields.levels} min={1} max={8} onChange={(v) => setFields({ ...fields, levels: v })} />
          <Stepper id="edit-fill" label="Remplissage (%)" value={fields.fill} min={1} max={100} step={5} onChange={(v) => setFields({ ...fields, fill: v })} />
        </div>
        <Pills name="storage" legend="Rangement initial" value={storage} options={[['random', 'Aléatoire'], ['near-station', 'Près des stations']]} onChange={setStorage} />
        <Stepper id="edit-robots" label="Robots" value={robots} min={1} max={300} onChange={setRobots} />
        {metrics && <div className="gauge" aria-hidden="true"><span style={{ width: `${fleetShare * 100}%` }} className={Number(robots) > metrics.fleet ? 'over' : ''} /></div>}
        {metrics && <p className="meta">{robots || 0} robots pour {metrics.fleet} baies de stationnement au plus.</p>}
      </div>
      {metrics && <dl className="card tiles">
        <div><dt>Emplacements</dt><dd>{metrics.slots}</dd></div>
        <div><dt>Sol libre</dt><dd>{Math.round(metrics.freeShare * 100)} %</dd></div>
        <div><dt>{autostore ? 'Piles' : 'Travées'}</dt><dd>{draft.racks.length}</dd></div>
        <div><dt>Stations</dt><dd>{draft.stations.length}</dd></div>
        <p className="plan-metrics meta">{metrics.slots} emplacements · sol libre {Math.round(metrics.freeShare * 100)} % · {metrics.fleet} robots au plus (baies de stationnement). Sol libre : part du sol sans stockage au-dessus (hypothèse du modèle).</p>
      </dl>}
      <details className="card regular-settings"><summary>Remplir automatiquement</summary>
        <p className="meta">Répartit des rangées régulières sur le sol actuel ({draft.width} × {draft.depth}). Remplace le plan ; annulation disponible.</p>
        <div className="field-grid">
          <Stepper id="edit-rows" label="Rangées" value={fields.rows} min={1} max={12} onChange={(v) => setFields({ ...fields, rows: v })} />
          <Stepper id="edit-bays" label="Travées / rangée" value={fields.bays} min={1} max={60} onChange={(v) => setFields({ ...fields, bays: v })} />
          <Stepper id="edit-stations" label="Stations" value={fields.stations} min={1} max={12} onChange={(v) => setFields({ ...fields, stations: v })} />
        </div>
        <button type="button" onClick={build}>Générer le plan</button>
      </details>
      <div className="card save-plan">
        <label htmlFor="plan-save-name">Nom pour comparer</label>
        <div className="inline"><input id="plan-save-name" name="plan-save-name" value={planName} maxLength={40} placeholder="Ex. Dense" onChange={(e) => setPlanName(e.target.value)} />
          <button type="button" onClick={savePlan}>Enregistrer pour comparer</button></div>
      </div>
      </div><footer className="side-foot">
        {error ? <p role="alert" className="error">{error}</p> : <p role="status">{notice}</p>}
        <button className="primary launch" type="button" onClick={apply}>Appliquer le plan →</button>
        <p className="meta">Redémarre la simulation, graine conservée ; plan sauvegardé sur cet appareil.</p>
      </footer>
    </aside>
  </section>
}
