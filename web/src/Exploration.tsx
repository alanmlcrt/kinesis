import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { manifest } from './Campaign.tsx'
import { replicationSeeds, type Replication } from './sim/campaign.ts'
import { analyzeExploration, explorationCampaign, explorationJobs, explorationPlans, PLATEAU_FRACTION, type ExplorationParams } from './sim/exploration.ts'
import { storageSlots, type Layout } from './sim/layout.ts'

type Analysis = ReturnType<typeof analyzeExploration>
type Done = Analysis & { params: ExplorationParams; date: string }
const list = (text: string) => text.split(/[\s,;]+/).filter(Boolean).map(Number)
const number = (v: number) => Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'

function exportExploration(d: Done, campaignManifest: typeof manifest) {
  const campaign = { ...d, params: explorationCampaign(d.params), seeds: replicationSeeds(d.params.seed, d.params.replications) }
  // Params differ between generator and campaign: retain both in the manifest.
  const data = { manifeste: { ...campaignManifest(campaign), format: 'kinesis-exploration-1',
    exploration: d.params, workers: 2,
    saturation: { fractionDuMaximum: PLATEAU_FRACTION, flottesPlusGrandesMinimum: 2,
      definition: 'Plus petite flotte testée à au moins 95 % du maximum, toutes les suivantes aussi, avec au moins deux suivantes et chauffe détectée partout. Repère descriptif, pas une preuve de congestion.' },
    configurations: d.rows.map((r) => ({ nom: r.name, emplacements: r.slots, empriseCases: r.area, solLibre: r.freeShare,
      surLeFront: r.front, seuilSaturationObserve: r.saturation,
      debitMaximalMesure: r.peak ? { flotte: r.peak.fleet, ...r.peak.meanThroughput } : null })),
    front: 'Capacité/débit à emprise égale, classement descriptif des moyennes, sans test de significativité.' },
    resultats: d.results, replications: d.replications }
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
  a.href = url; a.download = `kinesis-exploration-graine-${d.params.seed}.json`; a.click(); URL.revokeObjectURL(url)
}

function Front({ rows }: { rows: Analysis['rows'] }) {
  const measured = rows.filter((r) => r.peak)
  if (!measured.length) return <p>Chauffe non détectée : allonger la durée pour obtenir le front.</p>
  const W = 380, H = 240, L = 52, B = 36, T = 24, R = 18
  const maxX = Math.max(...measured.map((r) => r.slots)) * 1.08
  const maxY = Math.max(...measured.map((r) => r.peak!.meanThroughput.mean + r.peak!.meanThroughput.half)) * 1.12 || 1
  const x = (v: number) => L + v / maxX * (W - L - R)
  const y = (v: number) => H - B - v / maxY * (H - B - T)
  return <svg className="chart exploration-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Front capacité et débit maximal mesuré, avec intervalles à 95 % ; numéros des plans dans le tableau">
    {[0, 1, 2, 3, 4].map((i) => <g key={i}>
      <line className="grid" x1={L} x2={W - R} y1={y(i * maxY / 4)} y2={y(i * maxY / 4)} />
      <text x={L - 6} y={y(i * maxY / 4) + 4} textAnchor="end">{number(i * maxY / 4)}</text>
      <text x={x(i * maxX / 4)} y={H - B + 16} textAnchor="middle">{number(i * maxX / 4)}</text>
    </g>)}
    <text x={4} y={12}>bacs/h</text><text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">emplacements</text>
    {rows.map((r, i) => { if (!r.peak) return null
      const sameCapacity = rows.filter((s) => s.peak && s.slots === r.slots)
      // Separate error bars at equal capacity; exact capacities remain in the table.
      const offset = (sameCapacity.indexOf(r) - (sameCapacity.length - 1) / 2) * 10
      const m = r.peak.meanThroughput, cx = x(r.slots) + offset, cy = y(m.mean)
      return <g key={r.name} className={r.front ? 'front-point' : 'dominated-point'}>
        <title>{`${i + 1}. ${r.name} : ${number(m.mean)} ± ${number(m.half)} bacs/h · ${r.front ? 'sur le front' : 'dominée'}`}</title>
        <line x1={cx} x2={cx} y1={y(Math.max(0, m.mean - m.half))} y2={y(m.mean + m.half)} />
        <line x1={cx - 3} x2={cx + 3} y1={y(m.mean + m.half)} y2={y(m.mean + m.half)} />
        <line x1={cx - 3} x2={cx + 3} y1={y(Math.max(0, m.mean - m.half))} y2={y(Math.max(0, m.mean - m.half))} />
        {r.front ? <rect x={cx - 4} y={cy - 4} width={8} height={8} /> : <circle cx={cx} cy={cy} r={4} />}
        <text x={cx + 6} y={cy - 6}>{i + 1}</text>
      </g>
    })}
  </svg>
}

export function Exploration({ layout, onClose, onBack, campaignManifest }: { layout: Layout; onClose: () => void; onBack: () => void; campaignManifest: typeof manifest }) {
  useLayoutEffect(() => { document.getElementById('exploration-title')?.focus() }, [])
  const [fields, setFields] = useState({ blocks: '1, 2', aisles: '1, 5, 9', fleets: '10, 20, 40, 60', replications: '10', seconds: '3600', seed: '1' })
  const [accepted, setAccepted] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof explorationPlans> | null>(null)
  const workers = useRef<Worker[]>([])
  const stop = () => { for (const w of workers.current) w.terminate(); workers.current = []; setProgress(null) }
  useEffect(() => () => { for (const w of workers.current) w.terminate(); workers.current = [] }, [])
  const params = (): ExplorationParams => {
    if (Object.values(fields).some((v) => !v.trim())) throw new RangeError('Remplir tous les paramètres de l’exploration.')
    return {
      spec: { width: layout.width, depth: layout.depth, levels: layout.levels, fill: layout.fill, storage: layout.storage,
        profile: layout.profile, lifts: layout.lifts, liftSteps: layout.liftSteps, generation: layout.generation, stations: layout.stations.length, sides: 1, block: 1, aisle: 1, cross: 0, front: 2 },
      blocks: list(fields.blocks), aisles: list(fields.aisles), base: accepted ? 'footprint' : null,
      fleets: list(fields.fleets), replications: Number(fields.replications), seconds: Number(fields.seconds), seed: Number(fields.seed),
    }
  }
  const start = () => {
    let p: ExplorationParams, jobs: ReturnType<typeof explorationJobs>
    try { p = params(); jobs = explorationJobs(p) } catch (e) { setError((e as Error).message); return }
    stop(); setError(''); setDone(null); setPreview(null); setProgress({ done: 0, total: jobs.length })
    const replications: Replication[] = []
    let next = 0
    const fail = (message: string) => { setError(`Calcul interrompu : ${message}`); stop() }
    try {
      for (let i = 0; i < 2; i++) {
        const w = new Worker(new URL('./exploration.worker.ts', import.meta.url), { type: 'module' })
        workers.current.push(w)
        w.onerror = (e) => { if (workers.current.includes(w)) fail(e.message) }
        w.onmessage = (e) => {
          if (!workers.current.includes(w)) return
          if (e.data.type === 'error') { fail(e.data.message); return }
          replications.push(e.data.replication)
          setProgress({ done: replications.length, total: jobs.length })
          if (replications.length === jobs.length) {
            try { setDone({ ...analyzeExploration(p, replications), params: p, date: new Date().toISOString() }); stop() }
            catch (e) { fail((e as Error).message) }
          } else if (next < jobs.length) w.postMessage(jobs[next++])
        }
        w.postMessage(jobs[next++])
      }
    } catch (e) { fail((e as Error).message) }
  }
  const field = (key: keyof typeof fields, label: string) => <label>{label}<input name={`explore-${key}`} value={fields[key]} disabled={!!progress}
    autoComplete="off" spellCheck={false} inputMode={['blocks', 'aisles', 'fleets'].includes(key) ? 'text' : 'numeric'} onChange={(e) => { setFields({ ...fields, [key]: e.target.value }); setPreview(null) }} /></label>
  return <section className="editor" aria-labelledby="exploration-title" onKeyDown={(e) => { if (e.key === 'Escape') { stop(); onClose() } }}>
    <header><div><h1 id="exploration-title" tabIndex={-1}>Explorer densité / débit</h1><p>Famille de plans · solveur non validé</p></div>
      <button onClick={() => { stop(); onClose() }}>Fermer</button></header>
    <div className="campaign-body">
      <button onClick={() => { stop(); onBack() }}>Retour aux campagnes</button>
      <p>Sol {layout.width} × {layout.depth} cases · {layout.levels} niveaux · {layout.profile === 'lifts' ? 'Ascenseurs' : layout.profile === 'autostore' ? 'AutoStore' : `Skypod ${layout.generation === 'classic' ? 'classique' : '2025+'}`}.</p>
      <p className="meta">{layout.stations.length} stations sur un côté · allée devant les stations : 2 cases · aucune transversale · remplissage {layout.fill} % · rangement {layout.storage === 'random' ? 'aléatoire' : 'proche des stations'}. Le plan appliqué reste affiché dans la scène.</p>
      <fieldset disabled={!!progress}><legend>Famille à emprise égale (15 combinaisons au plus)</legend>
        <div className="field-grid campaign-fields">{field('blocks', 'Rangées par bloc (1–12)')}{field('aisles', 'Largeurs d’allée (1, 3, 5, 7, 9)')}</div>
        <p className="meta">Listes séparées par des virgules ; plans identiques dédoublonnés.</p>
        <label className="choice"><input type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setPreview(null) }} />Comparer à emprise au sol égale</label>
      </fieldset>
      <div className="field-grid campaign-fields">{field('fleets', 'Tailles de flotte')}{field('replications', 'Réplications R (2–30)')}{field('seconds', 'Durée simulée (s)')}{field('seed', 'Graine de campagne')}</div>
      <div className="tools">
        <button disabled={!!progress} onClick={() => { try { setPreview(explorationPlans(params())); setError('') } catch (e) { setError((e as Error).message) } }}>Vérifier les plans</button>
        <button className={progress ? '' : 'primary'} onClick={progress ? stop : start}>{progress ? 'Annuler' : 'Lancer l’exploration'}</button>
        {done && !progress && <button onClick={() => exportExploration(done, campaignManifest)}>Exporter l’exploration (JSON)</button>}</div>
      {preview && <p role="status">{preview.length} plans valides à emprise égale · {preview.map((c) => `${c.name} : ${storageSlots(c.layout)} emplacements`).join(' ; ')}</p>}
      {progress && <p role="status"><progress value={progress.done} max={progress.total} /> {progress.done} / {progress.total} réplications · calcul en parallèle</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {done && <>
        <h2>Front capacité / débit</h2>
        <p className="meta">Base : emprise égale · R = {done.params.replications} · IC 95 % Student · chauffe MSER-5 écartée · graine {done.params.seed} · solveur non validé.</p>
        <p className="meta">Carré bleu : sur le front ; cercle gris : dominée. Numéros des plans dans le tableau ; points de même capacité légèrement décalés pour lire les IC. Classement des moyennes, sans test de significativité ; maximum mesuré biaisé vers le haut.</p>
        <Front rows={done.rows} />
        <p className="meta">Seuil observé : première flotte à 95 % du maximum, avec au moins deux flottes plus grandes également à 95 %. Repère descriptif, pas une preuve de congestion. « Non identifié » : élargir les flottes ou allonger la durée.</p>
        <div className="table-scroll"><table><caption className="sr-only">Plans et front capacité débit</caption>
          <thead><tr><th scope="col">Plan</th><th scope="col">Emplacements</th><th scope="col">Sol libre</th><th scope="col">Débit maximal (bacs/h) ± IC 95 %</th><th scope="col">Front</th><th scope="col">Seuil (robots)</th></tr></thead>
          <tbody>{done.rows.map((r, i) => <tr key={r.name}><th scope="row">{i + 1}. {r.name}</th><td>{r.slots}</td><td>{number(r.freeShare * 100)} %</td>
            <td>{r.peak ? `${number(r.peak.meanThroughput.mean)} ± ${number(r.peak.meanThroughput.half)} (${r.peak.fleet} robots)` : 'Chauffe non détectée'}</td>
            <td>{r.peak ? r.front ? 'sur le front' : 'dominée' : 'hors front'}</td><td>{r.saturation ?? 'non identifié'}</td></tr>)}</tbody>
        </table></div>
        <details><summary>Mesures par plan et flotte</summary><div className="table-scroll"><table>
          <thead><tr><th scope="col">Plan</th><th scope="col">Robots</th><th scope="col">Débit ± IC 95 % (bacs/h)</th><th scope="col">Temps perdu / libre ± IC 95 %</th><th scope="col">Chauffe</th></tr></thead>
          <tbody>{done.results.map((r) => <tr key={`${r.configuration}-${r.fleet}`}><th scope="row">{done.rows[r.configuration].name}</th><td>{r.fleet}</td>
            {r.detected ? <><td>{number(r.meanThroughput.mean)} ± {number(r.meanThroughput.half)}</td><td>{number(r.meanLostRatio.mean * 100)} ± {number(r.meanLostRatio.half * 100)} %</td><td>{r.warmupSeconds} s</td></> : <td colSpan={3}>Chauffe non détectée : allonger la durée.</td>}</tr>)}</tbody>
        </table></div></details>
      </>}
    </div>
  </section>
}
