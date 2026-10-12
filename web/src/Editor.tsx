import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { editLayout, layoutMetrics, rackBounds, regularLayout, resizeLayout, TEMPLATES, templateLayout, validateLayout, profileLabel, withProfile, type Architecture, type Layout } from './sim/layout.ts'
import { loadPlans, savePlans } from './preferences.ts'

type Tool = 'rack' | 'station' | 'lift' | 'erase'
type Mode = 'point' | 'line' | 'area'
type Cell = { x: number; z: number }
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
  const [shape, setShape] = useState<{ tool: Tool; start: Cell; end: Cell } | null>(null)
  const [cursor, setCursor] = useState({ x: 2, z: 2 })
  const [hover, setHover] = useState<Cell | null>(null)
  const [frame, setFrame] = useState<{ w: number; d: number } | null>(null)
  const [error, setError] = useState('')
  const [planName, setPlanName] = useState('')
  const [notice, setNotice] = useState('Brouillon : la simulation en cours continue jusqu’à « Appliquer le plan ».')
  const svg = useRef<SVGSVGElement>(null)
  const current = useRef(draft); current.current = draft
  // Geste en cours : trait de pinceau (un seul pas d'annulation), ligne/zone, ou poignée de redimensionnement (base figée au début du geste).
  type Stroke = { kind: 'paint'; tool: Tool; last: Cell; seen: Set<string>; base: Layout; done: number; skipped: number; error: string }
  const gesture = useRef<Stroke | { kind: 'shape'; tool: Tool; start: Cell; end: Cell } | { kind: 'resize'; axis: 'x' | 'z' | 'xz'; x: number; y: number; scale: number; base: Layout } | null>(null)

  const commit = (plan: Layout, record = true) => {
    const previous = current.current
    if (record) setHistory((items) => [...items.slice(-49), previous])
    current.current = plan; setDraft(plan); setSize({ width: String(plan.width), depth: String(plan.depth) })
    setError(''); setNotice('Plan modifié. « Appliquer le plan » redémarre la simulation avec ce plan.')
  }
  const fail = (e: unknown) => setError((e as Error).message)
  const pointAt = (e: PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: p.x, z: p.y }
  }
  const onFloor = (p: Cell) => p.x >= 0 && p.z >= 0 && p.x < current.current.width && p.z < current.current.depth
  // Position visée par l'outil : la travée se centre sous le pointeur (allée sur la colonne paire la plus proche),
  // ramenée dans la zone permise ; stations et gaines sur l'emplacement pair le plus proche ; gomme sur la cellule.
  const snap = (t: Tool, p: Cell): Cell => {
    const l = current.current, b = rackBounds(l), even = (v: number) => Math.round((v - .5) / 2) * 2, clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    if (t === 'erase') return { x: Math.floor(p.x), z: Math.floor(p.z) }
    if (t === 'rack') return { x: clamp(l.profile === 'autostore' ? Math.floor(p.x) : even(p.x), b.x0, b.x1), z: clamp(Math.floor(p.z), b.z0, b.z1) }
    return { x: clamp(even(p.x), 0, l.width - 2), z: clamp(even(p.z), 0, l.depth - 2) }
  }
  const items = (l: Layout) => l.racks.length + l.stations.length + (l.lifts?.length ?? 0)
  // Pinceau : chaque position traversée depuis le dernier point est traitée, même si le pointeur va vite ;
  // les positions refusées (occupées, hors règles) sont sautées sans interrompre le trait.
  const paint = (g: Stroke, to: Cell, first = false) => {
    const from = g.last, n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) * 3)
    let plan = current.current
    for (let i = first ? 0 : 1; i <= n; i++) {
      const c = snap(g.tool, { x: from.x + (to.x - from.x) * i / Math.max(1, n), z: from.z + (to.z - from.z) * i / Math.max(1, n) }), id = `${c.x},${c.z}`
      if (g.seen.has(id)) continue
      g.seen.add(id)
      try { const next = editLayout(plan, g.tool, c.x, c.z); if (items(next) !== items(plan)) { plan = next; g.done++ } } catch (e) { g.skipped++; g.error ||= (e as Error).message }
      setCursor(c)
    }
    g.last = to
    if (plan !== current.current) commit(plan, false)
  }
  const use = (x: number, z: number) => {
    setCursor({ x, z })
    try { commit(editLayout(current.current, tool, x, z)) } catch (e) { fail(e) }
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
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 2) return
    const handle = (e.target as Element).getAttribute('data-handle') as 'x' | 'z' | 'xz' | null
    if (handle && e.button === 0) {
      const box = svg.current!.getBoundingClientRect(), view = svg.current!.viewBox.baseVal
      gesture.current = { kind: 'resize', axis: handle, x: e.clientX, y: e.clientY, scale: box.width / view.width, base: current.current }
      const previous = current.current
      setFrame({ w: previous.width, d: previous.depth }); setHistory((items) => [...items.slice(-49), previous])
    } else {
      const p = pointAt(e)
      if (!onFloor(p)) return
      // Clic droit : gomme le temps du geste, quel que soit l'outil choisi.
      const t: Tool = e.button === 2 ? 'erase' : tool
      setHover(null)
      if (mode === 'point') {
        const g: Stroke = { kind: 'paint', tool: t, last: p, seen: new Set(), base: current.current, done: 0, skipped: 0, error: '' }
        gesture.current = g; paint(g, p, true)
      } else { const c = { x: Math.floor(p.x), z: Math.floor(p.z) }; const sh = { tool: t, start: c, end: c }; gesture.current = { kind: 'shape', ...sh }; setShape(sh) }
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
    const p = pointAt(e), l = current.current
    if (g?.kind === 'paint') { paint(g, { x: Math.max(0, Math.min(l.width - .01, p.x)), z: Math.max(0, Math.min(l.depth - .01, p.z)) }); return }
    if (g?.kind === 'shape') {
      const c = { x: Math.max(0, Math.min(l.width - 1, Math.floor(p.x))), z: Math.max(0, Math.min(l.depth - 1, Math.floor(p.z))) }
      if (g.end.x !== c.x || g.end.z !== c.z) { g.end = c; setShape({ tool: g.tool, start: g.start, end: c }) }
      return
    }
    const c = onFloor(p) ? snap(tool, p) : null
    setHover((h) => h?.x === c?.x && h?.z === c?.z ? h : c)
  }
  // Ligne (horizontale ou verticale selon le geste) ou zone : la sélection couvre des cellules ; on y loge le plus
  // de positions possible. Travées à 4 cellules d'écart, calées pour équilibrer les marges des deux côtés.
  const shapeCells = (t: Tool, start: Cell, end: Cell): Cell[] => {
    const l = draft, b = rackBounds(l)
    const horizontal = mode === 'area' || Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
    const [x0, x1] = horizontal ? [Math.min(start.x, end.x), Math.max(start.x, end.x)] : [start.x, start.x]
    const [z0, z1] = mode === 'area' || !horizontal ? [Math.min(start.z, end.z), Math.max(start.z, end.z)] : [start.z, start.z]
    const seq = (a: number, z: number, step: number) => { const out: number[] = []; for (let v = a; v <= z; v += step) out.push(v); return out }
    const up2 = (v: number) => Math.ceil(v / 2) * 2
    let xs: number[], zs: number[]
    if (t === 'rack' && l.profile !== 'autostore') {
      // Une travée occupe x − 1 à x + 1 : elle doit tenir dans la sélection (une colonne cliquée suffit en vertical).
      const lo = Math.max(b.x0, up2(x0 === x1 ? snap('rack', { x: x0 + .5, z: 0 }).x : x0 + 1)), hi = Math.min(b.x1, x0 === x1 ? lo : Math.floor((x1 - 1) / 2) * 2)
      const options = [seq(lo, hi, 4), seq(lo + 2, hi, 4)].filter((o) => o.length)
      const gap = (o: number[]) => Math.abs((o[0] - 1 - x0) - (x1 - o[o.length - 1] - 1))
      xs = options.sort((a, c) => c.length - a.length || gap(a) - gap(c))[0] ?? []
      zs = seq(Math.max(b.z0, z0), Math.min(b.z1, z1), 1)
    } else if (t === 'rack') { xs = seq(Math.max(b.x0, x0), Math.min(b.x1, x1), 1); zs = seq(Math.max(b.z0, z0), Math.min(b.z1, z1), 1) }
    else { xs = seq(up2(x0), x1, 2); zs = seq(up2(z0), z1, 2) }
    return xs.flatMap((x) => zs.map((z) => ({ x, z })))
  }
  const up = () => {
    const g = gesture.current
    if (g?.kind === 'paint') {
      const plan = current.current
      if (plan !== g.base) { setHistory((items) => [...items.slice(-49), g.base]); setNotice(`${g.done} ${g.tool === 'erase' ? 'retrait' : 'ajout'}${g.done > 1 ? 's' : ''}${g.skipped ? ` · ${g.skipped} position${g.skipped > 1 ? 's' : ''} sautée${g.skipped > 1 ? 's' : ''} (occupée ou hors règles)` : ''}. « Appliquer le plan » redémarre la simulation avec ce plan.`) }
      else if (g.tool !== 'erase' && g.error) setError(g.error)
    }
    // Sélection lue dans le geste, pas dans l'état React : un relâchement rapide arrive avant le rendu.
    if (g?.kind === 'shape') {
      const { tool: t, start, end } = g
      let plan = current.current, done = 0, skipped = 0
      if (t === 'erase') {
        // Gomme en zone : tout équipement qui touche la sélection, en une seule validation.
        const [x0, x1, z0, z1] = [Math.min(start.x, end.x), Math.max(start.x, end.x), Math.min(start.z, end.z), Math.max(start.z, end.z)]
        const w = plan.profile === 'autostore' ? 0 : 1, hit = (p: Cell, r: number) => p.x + r >= x0 && p.x - r <= x1 && p.z >= z0 && p.z <= z1
        const next = { ...plan, racks: plan.racks.filter((p) => !hit(p, w)), stations: plan.stations.filter((p) => !hit(p, 0)), ...(plan.lifts ? { lifts: plan.lifts.filter((p) => !hit(p, 0)) } : {}) }
        done = items(plan) - items(next)
        try { if (done) { validateLayout(next); plan = next } } catch (e) { skipped = done; done = 0; fail(e) }
      } else for (const p of shapeCells(t, start, end)) { try { plan = editLayout(plan, t, p.x, p.z); done++ } catch { skipped++ } }
      if (plan !== current.current) commit(plan)
      setNotice(`${done} ${t === 'erase' ? 'retrait' : 'ajout'}${done > 1 ? 's' : ''}${skipped ? ` · ${skipped} ignoré${skipped > 1 ? 's' : ''} (occupé ou hors règles)` : ''}.`)
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
  // Fantôme : emprise de ce que l'outil poserait, ou de l'équipement que la gomme retirerait.
  const ghostShape = useMemo(() => {
    if (!ghost) return null
    const autostore = draft.profile === 'autostore'
    if (tool === 'erase') {
      const rack = draft.racks.find((p) => p.z === ghost.z && Math.abs(p.x - ghost.x) <= (autostore ? 0 : 1))
      const other = [...draft.stations, ...draft.lifts ?? []].some((p) => p.x === ghost.x && p.z === ghost.z)
      return rack && !autostore ? { x: rack.x - 1, w: 3, valid: true } : { x: ghost.x, w: 1, valid: !!rack || other }
    }
    let valid = true
    try { editLayout(draft, tool, ghost.x, ghost.z) } catch { valid = false }
    return tool === 'rack' && !autostore ? { x: ghost.x - 1, w: 3, valid } : { x: ghost.x, w: 1, valid }
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

  // Couches mémorisées : survoler le plan ne redessine ni la grille (jusqu'à 5 120 cases) ni les équipements.
  const grid = useMemo(() => Array.from({ length: draft.width * draft.depth }, (_, i) => {
    // Une case = une cellule du moteur ; emplacements aux coordonnées paires, voies entre eux.
    const x = i % draft.width, z = Math.floor(i / draft.width), slot = x % 2 === 0 && z % 2 === 0
    return <rect key={i} className={slot ? 'plan-cell' : 'plan-lane'} data-cell={x % 2 === 0 || autostore ? `${x},${z}` : undefined} x={x + .06} y={z + .06} width=".88" height=".88" rx=".18" />
  }), [draft.width, draft.depth, autostore])
  const equipment = useMemo(() => <>
    {draft.racks.map((p) => <g key={`r${p.x}-${p.z}`} className="plan-rack">
      {!autostore && [-1, 1].map((side) => <rect key={side} className="plan-stock" x={p.x + side + .08} y={p.z + .08} width=".84" height=".84" rx=".2" />)}
      <rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" />
      <text x={p.x + .5} y={p.z + .7} style={{ fontSize: '.6px' }}>{autostore ? 'P' : 'R'}</text></g>)}
    {draft.lifts?.map((p) => <g key={`l${p.x}-${p.z}`} className="plan-station plan-lift"><rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" /><text x={p.x + .5} y={p.z + .7}>L</text></g>)}
    {draft.stations.map((p) => <g key={`s${p.x}-${p.z}`} className="plan-station"><rect x={p.x + .08} y={p.z + .08} width=".84" height=".84" rx=".2" /><text x={p.x + .5} y={p.z + .7}>S</text></g>)}
  </>, [draft, autostore])

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
          onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)} onContextMenu={(e) => e.preventDefault()}>
          <rect className="plan-ground" width={draft.width} height={draft.depth} rx=".6" />
          {grid}
          {equipment}
          {ghostShape && !shape && <rect className={`plan-ghost${ghostShape.valid ? '' : ' invalid'}${tool === 'erase' ? ' erase' : ''}`} x={ghostShape.x} y={ghost!.z} width={ghostShape.w} height="1" rx=".25" />}
          {shape && <rect className={`plan-selection${shape.tool === 'erase' ? ' erase' : ''}`} x={Math.min(shape.start.x, shape.end.x)} y={Math.min(shape.start.z, shape.end.z)}
            width={Math.abs(shape.end.x - shape.start.x) + 1} height={Math.abs(shape.end.z - shape.start.z) + 1} rx=".3" />}
          {shape && shape.tool !== 'erase' && shapeCells(shape.tool, shape.start, shape.end).slice(0, 2500).map((p) => <rect key={`g${p.x}-${p.z}`} className="plan-ghost" x={shape.tool === 'rack' && !autostore ? p.x - 1 : p.x} y={p.z}
            width={shape.tool === 'rack' && !autostore ? 3 : 1} height="1" rx=".25" />)}
          <rect className="plan-cursor" x={cursor.x} y={cursor.z} width="1" height="1" rx=".25" />
          <rect className="handle" data-handle="x" x={draft.width + .5} y={draft.depth / 2 - 2.5} width="1" height="5" rx=".5"><title>Étirer la largeur</title></rect>
          <rect className="handle" data-handle="z" x={draft.width / 2 - 2.5} y={draft.depth + .5} width="5" height="1" rx=".5"><title>Étirer la profondeur</title></rect>
          <circle className="handle" data-handle="xz" cx={draft.width + 1} cy={draft.depth + 1} r=".9"><title>Étirer le sol</title></circle>
        </svg>
      </div>
      <p id="plan-help" className="meta">Point : cliquer ou glisser pour peindre, la travée se centre sous le pointeur. Clic droit : gommer. Ligne : glisser, horizontale ou verticale. Zone : glisser un rectangle, rempli au mieux. Poignées pour étirer le sol ; au clavier : flèches puis Entrée. {autostore ? 'Une pile occupe une cellule.' : 'Une travée = allée de grimpe R entre deux rayonnages, un bac de chaque côté par niveau ; deux allées voisines sont à 4 cellules (rayonnages dos à dos).'}</p>
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
