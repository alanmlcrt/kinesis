import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { editLayout, PRESETS, regularLayout, validateLayout, type Layout } from './sim/layout.ts'
import { GEOMETRY } from './sim/geometry.ts'

function layoutFields(layout: Layout) {
  const rows = new Set(layout.racks.map((p) => p.x))
  return { width: String(layout.width), depth: String(layout.depth), levels: String(layout.levels),
    rows: String(rows.size), bays: String(Math.max(...Array.from(rows, (x) => layout.racks.filter((p) => p.x === x).length))),
    stations: String(layout.stations.length), fill: String(layout.fill) }
}

export function Editor({ layout, count, onApply, onClose }: {
  layout: Layout; count: number; onApply: (layout: Layout, count: number) => void; onClose: () => void
}) {
  useLayoutEffect(() => { document.getElementById('editor-title')?.focus() }, [])
  const [draft, setDraft] = useState(layout)
  const [robots, setRobots] = useState(String(count))
  const [fields, setFields] = useState(() => layoutFields(layout))
  const [generated, setGenerated] = useState(fields)
  const [history, setHistory] = useState<Layout[]>([])
  const presetSelect = useRef<HTMLSelectElement>(null)
  const [storage, setStorage] = useState(layout.storage)
  const [tool, setTool] = useState<'rack' | 'station' | 'erase'>('rack')
  const [cursor, setCursor] = useState({ x: 2, z: 2 })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('Brouillon : le run actuel continue jusqu’à « Appliquer ».')
  const geometryPending = (['width', 'depth', 'rows', 'bays', 'stations'] as const).some((key) => fields[key] !== generated[key])
  const updateDraft = (plan: Layout) => {
    setHistory((items) => [...items.slice(-49), draft])
    setDraft(plan); setError(''); setNotice('Plan modifié. Appliquer pour redémarrer la simulation.')
    if (presetSelect.current) presetSelect.current.value = ''
  }
  const act = (x: number, z: number) => {
    setCursor({ x, z })
    try { updateDraft(editLayout(draft, tool, x, z)) } catch (e) { setError((e as Error).message) }
  }
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const dx = e.key === 'ArrowRight' ? 2 : e.key === 'ArrowLeft' ? -2 : 0
    const dz = e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : 0
    if (dx || dz) {
      e.preventDefault(); setCursor({ x: Math.max(0, Math.min(draft.width - 2, cursor.x + dx)),
        z: Math.max(0, Math.min(draft.depth - 2, cursor.z + dz)) })
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(cursor.x, cursor.z) }
  }
  const usePreset = (value: keyof typeof PRESETS) => {
    const plan = PRESETS[value]
    updateDraft(plan); const values = layoutFields(plan)
    setFields(values); setGenerated(values); setStorage(plan.storage); setCursor({ x: 2, z: 2 })
  }
  const build = () => {
    try {
      updateDraft(regularLayout(Number(fields.width), Number(fields.depth), Number(fields.rows), Number(fields.bays), Number(fields.levels), Number(fields.stations), Number(fields.fill), storage))
      setGenerated(fields)
      setCursor({ x: 2, z: 2 })
    } catch (e) { setError((e as Error).message) }
  }
  const apply = () => {
    try {
      if (geometryPending) throw new RangeError('Les réglages d’implantation ont changé. Cliquer sur « Générer le plan » avant d’appliquer.')
      const plan = { ...draft, levels: Number(fields.levels), fill: Number(fields.fill), storage }
      validateLayout(plan); onApply(plan, Number(robots))
    } catch (e) { setError((e as Error).message) }
  }
  return <section className="editor" aria-labelledby="editor-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <header><div><h1 id="editor-title" tabIndex={-1}>Construire l’entrepôt</h1><p>Skypod 2025+ · implantation illustrative</p></div>
      <button type="button" onClick={onClose}>Fermer</button></header>
    <div className="editor-body">
      <div className="settings">
        <label htmlFor="preset">Configuration prédéfinie</label>
        <select ref={presetSelect} id="preset" name="preset" defaultValue="" onChange={(e) => { if (e.target.value) usePreset(e.target.value as keyof typeof PRESETS) }}>
          <option value="" disabled>Choisir une configuration</option>
          <option value="demo">Démonstration · 4 rangées</option>
          <option value="dense">Compact · 8 rangées</option>
          <option value="large">Étendu · 10 rangées</option>
        </select>
        <fieldset><legend>Sol et implantation régulière</legend><div className="field-grid">
          {([
            ['width', 'Largeur (cellules)', 16, 80, 2], ['depth', 'Profondeur (cellules)', 16, 64, 2],
            ['rows', 'Rangées', 1, 12, 1], ['bays', 'Travées / rangée', 1, 24, 1], ['stations', 'Stations', 1, 12, 1],
          ] as const).map(([id, label, min, max, step]) => <label key={id} htmlFor={`edit-${id}`}>{label}
            <input id={`edit-${id}`} name={id} type="number" min={min} max={max} step={step} value={fields[id]}
              onChange={(e) => setFields({ ...fields, [id]: e.target.value })} /></label>)}
        </div><button type="button" onClick={build}>Générer le plan</button>
          <p>{geometryPending ? 'Réglages en attente : générer le plan pour les prendre en compte.' : 'Remplace le brouillon par des rangées régulières. Pour changer le sol, générer le plan.'}</p></fieldset>
        <fieldset><legend>Stockage et flotte</legend><div className="field-grid">
          <label htmlFor="edit-levels">Niveaux<input id="edit-levels" name="levels" type="number" min="1" max="8" value={fields.levels}
            onChange={(e) => setFields({ ...fields, levels: e.target.value })} /></label>
          <label htmlFor="edit-fill">Remplissage (%)<input id="edit-fill" name="fill" type="number" min="1" max="100" value={fields.fill}
            onChange={(e) => setFields({ ...fields, fill: e.target.value })} /></label>
          <label htmlFor="edit-robots">Robots<input id="edit-robots" name="robots" type="number" min="1" max="300" value={robots}
            onChange={(e) => setRobots(e.target.value)} /></label>
        </div><label htmlFor="storage">Rangement initial</label>
          <select id="storage" name="storage" value={storage} onChange={(e) => setStorage(e.target.value as Layout['storage'])}>
            <option value="random">Aléatoire à graine fixe</option><option value="near-station">Au plus proche des stations</option>
          </select><p>Choisit les emplacements occupés lorsque le remplissage est inférieur à 100 %.</p></fieldset>
      </div>
      <div className="plan-pane">
        <h2>Plan vu de dessus</h2>
        <div className="tools" role="group" aria-label="Outil de placement">
          {(['rack', 'station', 'erase'] as const).map((t) => <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
            {t === 'rack' ? 'Travée' : t === 'station' ? 'Station' : 'Effacer'}</button>)}
          <button type="button" disabled={!history.length} onClick={() => {
            const previous = history[history.length - 1], values = layoutFields(previous)
            setDraft(previous); setFields(values); setGenerated(values); setStorage(previous.storage)
            setHistory(history.slice(0, -1)); setCursor({ x: 2, z: 2 }); setError(''); setNotice('Dernière modification du plan annulée.')
          }}>Annuler la modification</button>
        </div>
        <p id="plan-help">Cliquer un emplacement. Au clavier : flèches pour choisir, Entrée pour placer. Une travée occupe un accès et un support à droite.</p>
        <div className="coordinates">
          <label htmlFor="plan-x">X<input id="plan-x" name="x" type="number" min="0" max={draft.width - 2} step="2" value={cursor.x}
            onChange={(e) => setCursor({ ...cursor, x: Number(e.target.value) })} /></label>
          <label htmlFor="plan-z">Z<input id="plan-z" name="z" type="number" min="0" max={draft.depth - 2} step="2" value={cursor.z}
            onChange={(e) => setCursor({ ...cursor, z: Number(e.target.value) })} /></label>
          <button type="button" onClick={() => act(cursor.x, cursor.z)}>Utiliser l’outil</button>
        </div>
        <svg className="plan" viewBox={`-1 -1 ${draft.width + 2} ${draft.depth + 2}`} tabIndex={0} role="group"
          aria-label={`Plan ${draft.width} par ${draft.depth}. Emplacement x ${cursor.x}, z ${cursor.z}. Outil ${tool}.`}
          aria-describedby="plan-help" onKeyDown={key}>
          <rect className="plan-ground" width={draft.width} height={draft.depth} />
          {Array.from({ length: draft.width / 2 * draft.depth / 2 }, (_, i) => {
            const x = i % (draft.width / 2) * 2, z = Math.floor(i / (draft.width / 2)) * 2
            return <rect key={i} className="plan-cell" x={x} y={z} width="1.8" height="1.8" onClick={() => act(x, z)} />
          })}
          {draft.racks.map((p) => <g key={`r${p.x}-${p.z}`} className="plan-rack" pointerEvents="none">
            <rect x={p.x} y={p.z} width="1.8" height="1.8" /><rect className="plan-support" x={p.x + GEOMETRY.supportOffsetX} y={p.z} width="1.8" height="1.8" />
            <text x={p.x + .9} y={p.z + 1.3}>R</text></g>)}
          {draft.stations.map((p) => <g key={`s${p.x}-${p.z}`} className="plan-station" pointerEvents="none">
            <rect x={p.x} y={p.z} width="1.8" height="1.8" /><text x={p.x + .9} y={p.z + 1.3}>S</text></g>)}
          <rect className="plan-cursor" x={cursor.x} y={cursor.z} width="1.8" height="1.8" pointerEvents="none" />
        </svg>
        <p className="legend">R : accès de grimpe · case pleine à droite : support · S : station. Les passages entre emplacements restent libres.</p>
        <span className="sr-only" role="status">Emplacement x {cursor.x}, z {cursor.z}.</span>
        <p>{draft.width} × {draft.depth} cellules · {draft.racks.length} travées · {draft.stations.length} stations</p>
        <p>{validateLayout(draft)} baies de stationnement disponibles pour la flotte.</p>
      </div>
    </div>
    <footer>
      <div>{error ? <p role="alert" className="error">{error}</p> : <p role="status">{notice}</p>}
        <p className="meta">Appliquer redémarre le run et sauvegarde le plan sur cet appareil. La graine est conservée.</p></div>
      <button className="primary" type="button" onClick={apply}>Appliquer et redémarrer</button>
    </footer>
  </section>
}
