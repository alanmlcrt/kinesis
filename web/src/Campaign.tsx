import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { validateLayout, type Layout } from './sim/layout.ts'
import { BATCH, validateCampaign, WINDOW_STEPS, type CampaignParams, type FleetResult, type Replication } from './sim/campaign.ts'
import { DT } from './sim/sim.ts'

declare const __COMMIT__: string
type Done = { params: CampaignParams; seeds: number[]; replications: Replication[]; results: FleetResult[]; date: string }

const SOLVER = 'non validé (validation contre MAPF 3D, ICAPS 2024, prévue à l’étape 9)'
const number = (v: number, digits = 0) => Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'

function manifest(d: Done) {
  return {
    format: 'kinesis-campagne-1', date: d.date, code: __COMMIT__, solveur: SOLVER,
    parametres: { ...d.params, dtSecondes: DT, fenetreObservationSecondes: WINDOW_STEPS * DT },
    grainesReplications: d.seeds,
    chauffe: {
      methode: `MSER-${BATCH} sur les bacs servis par fenêtre de ${WINDOW_STEPS * DT} s ; chauffe d’une flotte = la plus longue de ses réplications, appliquée à toutes`,
      retenueSecondes: Object.fromEntries(d.results.map((r) => [r.fleet, r.warmupSeconds])),
      nonDetectee: d.results.filter((r) => !r.detected).map((r) => r.fleet),
    },
    confiance: 'intervalle à 95 %, loi de Student, R − 1 degrés de liberté',
    baseNormalisation: 'sans objet : une seule configuration, aucune comparaison',
    definitions: {
      debit: 'bacs servis aux stations par heure simulée, après la chauffe',
      tempsPerdu: 'pas perdus / pas de trajet libre, après la chauffe (définition dans experiment-protocol)',
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

// Débit moyen par taille de flotte avec son intervalle à 95 % ; une seule série, nommée par le titre.
function Chart({ results }: { results: FleetResult[] }) {
  const shown = results.filter((r) => r.detected)
  if (!shown.length) return null
  const W = 380, H = 220, L = 46, B = 36, T = 24, R = 14 // petit repère : texte lisible une fois réduit sur téléphone
  const maxX = Math.max(...shown.map((r) => r.fleet)), maxY = Math.max(...shown.map((r) => r.meanThroughput.mean + r.meanThroughput.half))
  const raw = maxY / 4 || 1, magnitude = 10 ** Math.floor(Math.log10(raw))
  const stepY = [1, 2, 5, 10].find((m) => m * magnitude >= raw)! * magnitude // graduations rondes
  const topY = Math.ceil(maxY / stepY) * stepY || 1
  const x = (v: number) => L + v / maxX * (W - L - R), y = (v: number) => H - B - v / topY * (H - B - T)
  const ticks = Array.from({ length: Math.round(topY / stepY) + 1 }, (_, i) => i * stepY)
  return <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Débit moyen selon la taille de flotte, avec intervalle de confiance à 95 %">
    {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
      <text x={L - 6} y={y(v) + 4} textAnchor="end">{number(v)}</text></g>)}
    {shown.map((r) => <text key={r.fleet} x={x(r.fleet)} y={H - B + 16} textAnchor="middle">{r.fleet}</text>)}
    <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">robots</text>
    <text x={4} y={12}>bacs/h</text>
    <polyline className="series" points={shown.map((r) => `${x(r.fleet)},${y(r.meanThroughput.mean)}`).join(' ')} />
    {shown.map((r) => { const m = r.meanThroughput, cx = x(r.fleet)
      return <g key={r.fleet} className="point">
        <title>{`${r.fleet} robots : ${number(m.mean)} ± ${number(m.half)} bacs/h`}</title>
        <line x1={cx} x2={cx} y1={y(m.mean - m.half)} y2={y(m.mean + m.half)} />
        <line x1={cx - 4} x2={cx + 4} y1={y(m.mean - m.half)} y2={y(m.mean - m.half)} />
        <line x1={cx - 4} x2={cx + 4} y1={y(m.mean + m.half)} y2={y(m.mean + m.half)} />
        <circle cx={cx} cy={y(m.mean)} r={4} />
        <rect x={cx - 12} y={T} width={24} height={H - B - T} fill="transparent" />
      </g> })}
  </svg>
}

export function Campaign({ layout, onClose }: { layout: Layout; onClose: () => void }) {
  useLayoutEffect(() => { document.getElementById('campaign-title')?.focus() }, [])
  const capacity = validateLayout(layout)
  const [fields, setFields] = useState({
    fleets: [10, 20, 50, 100, 150, 200, 300].filter((n) => n <= capacity).join(', '), replications: '10', seconds: '3600', seed: '1',
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState('')
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  const stop = () => { worker.current?.terminate(); worker.current = null; setProgress(null) }
  const start = () => {
    const params: CampaignParams = { layout, fleets: fields.fleets.split(/[\s,;]+/).filter(Boolean).map(Number),
      replications: Number(fields.replications), seconds: Number(fields.seconds), seed: Number(fields.seed) }
    try { validateCampaign(params) } catch (e) { setError((e as Error).message); return }
    stop(); setError(''); setDone(null); setProgress({ done: 0, total: params.fleets.length * params.replications })
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
  return <section className="editor" aria-labelledby="campaign-title" onKeyDown={(e) => { if (e.key === 'Escape') { stop(); onClose() } }}>
    <header><div><h1 id="campaign-title" tabIndex={-1}>Mesurer la saturation</h1>
      <p>Plan appliqué : {layout.racks.length} travées, {layout.levels} niveaux, {layout.stations.length} stations · capacité {capacity} robots</p></div>
      <button onClick={() => { stop(); onClose() }}>Fermer</button></header>
    <div className="campaign-body">
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
          une seule configuration, pas de base de normalisation · graine de campagne {done.params.seed}</p>
        <Chart results={done.results} />
        <table>
          <caption className="sr-only">Résultats par taille de flotte</caption>
          <thead><tr><th scope="col">Robots</th><th scope="col">Débit (bacs/h)</th><th scope="col">Temps perdu / trajet libre</th><th scope="col">Chauffe écartée</th></tr></thead>
          <tbody>{done.results.map((r) => <tr key={r.fleet}><th scope="row">{r.fleet}</th>
            {r.detected ? <>
              <td>{number(r.meanThroughput.mean)} ± {number(r.meanThroughput.half)}</td>
              <td>{number(r.meanLostRatio.mean * 100)} ± {number(r.meanLostRatio.half * 100)} %</td>
              <td>{number(r.warmupSeconds)} s</td>
            </> : <td colSpan={3} className="error">Chauffe non détectée : allonger la durée simulée.</td>}
          </tr>)}</tbody>
        </table>
      </>}
    </div>
  </section>
}
