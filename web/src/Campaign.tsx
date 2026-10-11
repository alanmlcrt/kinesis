import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { footprint, PRESETS, storageSlots, validateLayout, type Layout } from './sim/layout.ts'
import { BATCH, pareto, peak, validateCampaign, WINDOW_STEPS, type Base, type CampaignParams, type FleetResult, type Replication } from './sim/campaign.ts'
import { DT } from './sim/sim.ts'
import { loadPlans, savePlans, type NamedPlan } from './preferences.ts'

declare const __COMMIT__: string
type Done = { params: CampaignParams; seeds: number[]; replications: Replication[]; results: FleetResult[]; date: string }

const SOLVER = 'non validé (validation contre MAPF 3D, ICAPS 2024, prévue à l’étape 9)'
const APPLIED = 'Plan appliqué'
const BUILT_IN: NamedPlan[] = [
  { name: 'Démonstration · 4 rangées', layout: PRESETS.demo },
  { name: 'Compact · 8 rangées', layout: PRESETS.dense },
  { name: 'Étendu · 10 rangées', layout: PRESETS.large },
]
const BASES: Record<Base, string> = {
  capacity: 'Capacité de stockage égale', footprint: 'Emprise au sol égale',
  pareto: 'Front de Pareto (emplacements, emprise, débit maximal mesuré)',
}
const MARKERS = ['circle', 'square', 'triangle'] as const // forme en plus de la couleur pour chaque série
const number = (v: number, digits = 0) => Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'
const baseText = (p: CampaignParams) => p.base ? BASES[p.base] : 'sans objet : une seule configuration, aucune comparaison'

function summary(d: Done) {
  const peaks = d.params.configurations.map((_, i) => peak(d.results.filter((r) => r.configuration === i)))
  const front = pareto(d.params.configurations.map((c, i) => ({ slots: storageSlots(c.layout), area: footprint(c.layout), throughput: peaks[i]?.meanThroughput.mean ?? NaN })))
  return d.params.configurations.map((c, i) => ({ name: c.name, slots: storageSlots(c.layout), area: footprint(c.layout), peak: peaks[i], front: front[i] }))
}

function manifest(d: Done) {
  return {
    format: 'kinesis-campagne-2', date: d.date, code: __COMMIT__, solveur: SOLVER,
    parametres: { ...d.params, dtSecondes: DT, fenetreObservationSecondes: WINDOW_STEPS * DT },
    grainesReplications: d.seeds,
    chauffe: {
      methode: `MSER-${BATCH} sur les bacs servis par fenêtre de ${WINDOW_STEPS * DT} s, recherche dans la première moitié ; chauffe d’une flotte = la plus longue de ses réplications, appliquée à toutes`,
      retenueSecondes: d.results.map((r) => ({ configuration: d.params.configurations[r.configuration].name, flotte: r.fleet, secondes: r.warmupSeconds, detectee: r.detected })),
    },
    confiance: 'intervalle à 95 %, loi de Student, R − 1 degrés de liberté',
    baseNormalisation: baseText(d.params),
    configurations: summary(d).map((s) => ({ nom: s.name, emplacements: s.slots, empriseCases: s.area,
      debitMaximalMesure: s.peak ? { flotte: s.peak.fleet, ...s.peak.meanThroughput } : null, ...(d.params.base === 'pareto' ? { surLeFront: s.front } : {}) })),
    definitions: {
      debit: 'bacs servis aux stations par heure simulée, après la chauffe',
      tempsPerdu: 'pas perdus / pas de trajet libre, après la chauffe (définition dans experiment-protocol)',
      debitMaximalMesure: 'plus haute moyenne parmi les flottes à chauffe détectée ; biaisée vers le haut, donnée avec l’intervalle de cette flotte',
      emplacements: 'travées × niveaux', emprise: 'largeur × profondeur du sol, en cases',
    },
  }
}

function download(d: Done) {
  const blob = new Blob([JSON.stringify({ manifeste: manifest(d), resultats: d.results, replications: d.replications }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `kinesis-campagne-graine-${d.params.seed}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Marker({ kind, x, y }: { kind: typeof MARKERS[number]; x: number; y: number }) {
  if (kind === 'square') return <rect x={x - 4} y={y - 4} width={8} height={8} />
  if (kind === 'triangle') return <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} />
  return <circle cx={x} cy={y} r={4} />
}

// Débit moyen par taille de flotte avec son intervalle à 95 %, une série par configuration.
function Chart({ done }: { done: Done }) {
  const names = done.params.configurations.map((c) => c.name)
  const series = names.map((_, i) => done.results.filter((r) => r.configuration === i && r.detected))
  const shown = series.flat()
  if (!shown.length) return null
  const many = names.length > 1
  const W = 380, H = 220, L = 46, B = 36, T = 24, R = 14 // petit repère : texte lisible une fois réduit sur téléphone
  const maxX = Math.max(...shown.map((r) => r.fleet)), maxY = Math.max(...shown.map((r) => r.meanThroughput.mean + r.meanThroughput.half))
  const raw = maxY / 4 || 1, magnitude = 10 ** Math.floor(Math.log10(raw))
  const stepY = [1, 2, 5, 10].find((m) => m * magnitude >= raw)! * magnitude // graduations rondes
  const topY = Math.ceil(maxY / stepY) * stepY || 1
  // Décalage horizontal léger entre séries : les barres d'erreur d'une même flotte ne se recouvrent pas.
  const x = (v: number, i = 0) => L + v / maxX * (W - L - R) + (many ? (i - (names.length - 1) / 2) * 5 : 0)
  const y = (v: number) => H - B - v / topY * (H - B - T)
  const ticks = Array.from({ length: Math.round(topY / stepY) + 1 }, (_, i) => i * stepY)
  const fleets = [...new Set(shown.map((r) => r.fleet))]
  return <>
    {many && <ul className="legend-list" aria-label="Configurations">{names.map((n, i) => <li key={n}>
      <svg width="14" height="14" viewBox="-7 -7 14 14" className={`s${i}`} aria-hidden="true"><Marker kind={MARKERS[i]} x={0} y={0} /></svg>{n}</li>)}</ul>}
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Débit moyen selon la taille de flotte, avec intervalle de confiance à 95 %">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
        <text x={L - 6} y={y(v) + 4} textAnchor="end">{number(v)}</text></g>)}
      {fleets.map((f) => <text key={f} x={x(f)} y={H - B + 16} textAnchor="middle">{f}</text>)}
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">robots</text>
      <text x={4} y={12}>bacs/h</text>
      {series.map((points, i) => <g key={names[i]} className={`s${i}`}>
        <polyline className="series" points={points.map((r) => `${x(r.fleet, i)},${y(r.meanThroughput.mean)}`).join(' ')} />
        {points.map((r) => { const m = r.meanThroughput, cx = x(r.fleet, i)
          const low = Math.max(0, m.mean - m.half) // un débit n'est pas négatif : tracé arrêté à 0, valeur exacte dans le tableau
          return <g key={r.fleet} className="point">
            <title>{`${names[i]} · ${r.fleet} robots : ${number(m.mean)} ± ${number(m.half)} bacs/h`}</title>
            <line x1={cx} x2={cx} y1={y(low)} y2={y(m.mean + m.half)} />
            <line x1={cx - 3} x2={cx + 3} y1={y(low)} y2={y(low)} />
            <line x1={cx - 3} x2={cx + 3} y1={y(m.mean + m.half)} y2={y(m.mean + m.half)} />
            <Marker kind={MARKERS[i]} x={cx} y={y(m.mean)} />
            <rect x={cx - 8} y={T} width={16} height={H - B - T} fill="transparent" />
          </g> })}
      </g>)}
    </svg>
  </>
}

export function Campaign({ layout, onClose }: { layout: Layout; onClose: () => void }) {
  useLayoutEffect(() => { document.getElementById('campaign-title')?.focus() }, [])
  const capacity = validateLayout(layout)
  const [saved, setSaved] = useState(loadPlans)
  const [notice, setNotice] = useState(saved.warning)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([APPLIED])
  const [base, setBase] = useState<Base | null>(null)
  const [fields, setFields] = useState({
    fleets: [10, 20, 50, 100, 150, 200, 300].filter((n) => n <= capacity).join(', '), replications: '10', seconds: '3600', seed: '1',
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState('')
  const worker = useRef<Worker | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  const library: NamedPlan[] = [{ name: APPLIED, layout }, ...BUILT_IN, ...saved.plans]
  const stop = () => { worker.current?.terminate(); worker.current = null; setProgress(null) }
  const store = (plans: NamedPlan[], message: string) => {
    const warning = savePlans(plans)
    setSaved({ plans, warning }); setNotice(warning || message)
  }
  const saveApplied = () => {
    const n = name.trim()
    if (!n || n.length > 40 || library.some((p) => p.name === n)) { setNotice('Choisir un nom de 1 à 40 caractères, différent des plans existants.'); return }
    store([...saved.plans, { name: n, layout: structuredClone(layout) }], `Plan « ${n} » enregistré.`)
    setName('')
  }
  const remove = (n: string) => {
    setSelected((s) => s.filter((x) => x !== n)); store(saved.plans.filter((p) => p.name !== n), `Plan « ${n} » supprimé.`)
    nameInput.current?.focus() // le bouton disparaît : le focus reste dans la fenêtre
  }
  const toggle = (n: string) => setSelected((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n])
  const start = () => {
    const configurations = library.filter((p) => selected.includes(p.name))
    const params: CampaignParams = { configurations, base: configurations.length > 1 ? base : null,
      fleets: fields.fleets.split(/[\s,;]+/).filter(Boolean).map(Number),
      replications: Number(fields.replications), seconds: Number(fields.seconds), seed: Number(fields.seed) }
    try { validateCampaign(params) } catch (e) { setError((e as Error).message); return }
    stop(); setError(''); setDone(null); setProgress({ done: 0, total: configurations.length * params.fleets.length * params.replications })
    const w = new Worker(new URL('./campaign.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e) => {
      if (e.data.type === 'progress') setProgress({ done: e.data.done, total: e.data.total })
      else {
        if (e.data.type === 'done') setDone({ params, seeds: e.data.seeds, replications: e.data.replications, results: e.data.results, date: new Date().toISOString() })
        else setError(e.data.message)
        w.terminate(); worker.current = null; setProgress(null)
      }
    }
    w.onerror = (e) => { setError(`Calcul interrompu : ${e.message}`); stop() }
    w.postMessage(params)
  }
  const field = (key: keyof typeof fields, label: string, help?: string) => <label>{label}
    <input name={key} value={fields[key]} inputMode={key === 'fleets' ? 'text' : 'numeric'} disabled={!!progress}
      onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />{help && <small>{help}</small>}</label>
  const R = done?.params.replications
  const rows = done ? summary(done) : []
  return <section className="editor" aria-labelledby="campaign-title" onKeyDown={(e) => { if (e.key === 'Escape') { stop(); onClose() } }}>
    <header><div><h1 id="campaign-title" tabIndex={-1}>Mesurer et comparer</h1>
      <p>Même campagne pour chaque configuration : mêmes flottes, R, durée et graines.</p></div>
      <button onClick={() => { stop(); onClose() }}>Fermer</button></header>
    <div className="campaign-body">
      <fieldset disabled={!!progress}>
        <legend>Configurations (1 à 3)</legend>
        <ul className="plans">{library.map((p) => <li key={p.name}>
          <label><input type="checkbox" checked={selected.includes(p.name)} onChange={() => toggle(p.name)}
            disabled={!selected.includes(p.name) && selected.length >= 3} />{p.name}</label>
          <span className="meta">{storageSlots(p.layout)} empl. · {p.layout.width} × {p.layout.depth} · {p.layout.levels} niv.</span>
          {saved.plans.includes(p) && <button onClick={() => remove(p.name)} aria-label={`Supprimer ${p.name}`}>Supprimer</button>}
        </li>)}</ul>
        <div className="coordinates save-plan">
          <label>Nom<input ref={nameInput} name="plan-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <button onClick={saveApplied}>Enregistrer le plan appliqué</button>
        </div>
        {notice && <p role="status" className="meta">{notice}</p>}
      </fieldset>
      {selected.length > 1 && <fieldset disabled={!!progress}>
        <legend>Base de normalisation (obligatoire)</legend>
        {(Object.keys(BASES) as Base[]).map((b) => <label key={b} className="choice">
          <input type="radio" name="base" checked={base === b} onChange={() => setBase(b)} />{BASES[b]}</label>)}
      </fieldset>}
      <div className="field-grid campaign-fields">
        {field('fleets', 'Tailles de flotte', 'séparées par des virgules')}
        {field('replications', 'Réplications R', '2 à 30')}
        {field('seconds', 'Durée simulée (s)', 'par réplication')}
        {field('seed', 'Graine de campagne')}
      </div>
      <div className="tools">
        {progress ? <button onClick={stop}>Annuler</button> : <button className="primary" onClick={start}>Lancer la campagne</button>}
        {done && !progress && <button onClick={() => download(done)}>Exporter (JSON + manifeste)</button>}
      </div>
      {progress && <p role="status"><progress value={progress.done} max={progress.total} /> {progress.done} / {progress.total} réplications · calcul hors affichage</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {done && <>
        <h2>Débit selon la taille de flotte</h2>
        <p className="meta">Moyenne de R = {R} réplications · IC 95 % (Student) · chauffe écartée (MSER-5) · solveur non validé ·
          base : {baseText(done.params)} · graine de campagne {done.params.seed}</p>
        <Chart done={done} />
        <div className="table-scroll"><table>
          <caption className="sr-only">Comparaison des configurations</caption>
          <thead><tr><th scope="col">Configuration</th><th scope="col">Emplacements</th><th scope="col">Emprise (cases)</th>
            <th scope="col">Débit maximal mesuré (bacs/h)</th>{done.params.base === 'pareto' && <th scope="col">Pareto</th>}</tr></thead>
          <tbody>{rows.map((s) => <tr key={s.name}><th scope="row">{s.name}</th><td>{s.slots}</td><td>{s.area}</td>
            <td>{s.peak ? `${number(s.peak.meanThroughput.mean)} ± ${number(s.peak.meanThroughput.half)} (${s.peak.fleet} robots)` : '—'}</td>
            {done.params.base === 'pareto' && <td>{s.peak ? s.front ? 'sur le front' : 'dominée' : '—'}</td>}</tr>)}</tbody>
        </table></div>
        <div className="table-scroll"><table>
          <caption className="sr-only">Résultats par configuration et taille de flotte</caption>
          <thead><tr><th scope="col">Configuration</th><th scope="col">Robots</th><th scope="col">Débit (bacs/h)</th><th scope="col">Temps perdu / trajet libre</th><th scope="col">Chauffe écartée</th></tr></thead>
          <tbody>{done.results.map((r) => <tr key={`${r.configuration}-${r.fleet}`}><td>{done.params.configurations[r.configuration].name}</td><th scope="row">{r.fleet}</th>
            {r.detected ? <>
              <td>{number(r.meanThroughput.mean)} ± {number(r.meanThroughput.half)}</td>
              <td>{number(r.meanLostRatio.mean * 100)} ± {number(r.meanLostRatio.half * 100)} %</td>
              <td>{number(r.warmupSeconds)} s</td>
            </> : <td colSpan={3} className="error">Chauffe non détectée : allonger la durée simulée.</td>}
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>
  </section>
}
