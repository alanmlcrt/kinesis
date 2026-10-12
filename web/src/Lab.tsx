import { useEffect, useState } from 'react'
import { DT, type Phase, type State } from './sim/sim.ts'

const number = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const phases: Record<Phase, string> = {
  idle: 'Prêt au départ', toRack: 'Vers le stockage', engageTake: 'Accès au bac', upTake: 'Montée vers le bac',
  take: 'Prise du bac', downTake: 'Descente avec le bac', bufferToStation: 'Départ vers la station',
  toStation: 'Vers la station', service: 'Service en station', bufferToReturn: 'Départ pour le retour',
  toReturn: 'Retour au stockage', engagePut: 'Accès au rangement', upPut: 'Montée pour ranger',
  put: 'Rangement du bac', downPut: 'Descente après rangement', home: 'Retour à la baie',
}
type Sample = { time: number; throughput: number; congestion: number | null; cycle: number | null; served: number }
const metrics = [
  { key: 'throughput', label: 'Débit cumulé', unit: 'bacs/h' },
  { key: 'congestion', label: 'Temps perdu / trajet libre', unit: '%' },
  { key: 'cycle', label: 'Cycle moyen terminé', unit: 's' },
  { key: 'served', label: 'Bacs servis', unit: 'bacs' },
] as const

// Lecture à 4 Hz ; historique borné et indépendant des instruments affichés.
export function LiveLab({ sim, selected, onSelect }: { sim: State; selected: number | null; onSelect: (id: number | null) => void }) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [enabled, setEnabled] = useState<string[]>(['throughput'])
  const [, refresh] = useState(0)
  useEffect(() => {
    const update = () => {
      refresh((n) => n + 1)
      setSamples((previous) => {
        if (previous.at(-1)?.time === sim.tick * DT) return previous
        const served = sim.robots.reduce((n, r) => n + r.visits, 0)
        const cycles = sim.robots.reduce((n, r) => n + r.returns, 0)
        const time = sim.tick * DT
        return [...previous.slice(-119), { time, served, throughput: time ? served * 3600 / time : 0,
          congestion: sim.freeSteps ? sim.lostSteps / sim.freeSteps * 100 : null,
          cycle: cycles ? sim.robots.reduce((n, r) => n + r.cycleSteps, 0) * DT / cycles : null }]
      })
    }
    update()
    const timer = setInterval(update, 250)
    return () => clearInterval(timer)
  }, [sim])
  const robot = selected === null ? null : sim.robots[selected]
  const latest = samples.at(-1)
  return <aside className="live-lab" aria-label="Instruments du laboratoire">
    <details className="robot-inspector" open={robot !== null}>
      <summary>{robot ? `Robot R${String(robot.id + 1).padStart(3, '0')}` : 'Inspecter un robot'}</summary>
      <label className="robot-choice">Robot<select name="inspect-robot" value={selected ?? ''} onChange={(e) => onSelect(e.target.value === '' ? null : Number(e.target.value))}><option value="">Choisir dans la flotte</option>{sim.robots.map((r) => <option key={r.id} value={r.id}>R{String(r.id + 1).padStart(3, '0')}</option>)}</select></label>
      {robot ? <>
        <p className="meta">Un seul run · solveur non validé · chauffe incluse</p>
        <p className="robot-phase">{phases[robot.phase]}</p>
        <dl className="robot-stats">
          <div><dt>Position moteur</dt><dd>({robot.x}, {robot.z}) · N{robot.level}</dd></div>
          <div><dt>Bac affecté</dt><dd>{robot.bin < 0 ? 'Aucun' : `B${robot.bin + 1}`}</dd></div>
          <div><dt>Station</dt><dd>({robot.station % sim.width}, {Math.floor(robot.station / sim.width)})</dd></div>
          <div><dt>Services / cycles</dt><dd>{robot.visits} / {robot.returns}</dd></div>
          <div><dt>Cycle moyen terminé</dt><dd>{robot.returns ? `${number(robot.cycleSteps * DT / robot.returns)} s` : 'Aucun cycle terminé'}</dd></div>
        </dl><button onClick={() => onSelect(null)}>Désélectionner</button>
      </> : <p className="meta">Cliquez sur un robot dans la scène, ou choisissez son identifiant. Ses données suivent le moteur en direct.</p>}
    </details>
    <details className="live-instruments">
      <summary>Courbes en direct</summary>
      <p className="meta">Un seul run · solveur non validé · chauffe incluse</p>
      <details className="instrument-picker"><summary>Choisir les courbes</summary><fieldset><legend>Instruments affichés</legend>{metrics.map((m) => <label className="choice" key={m.key}><input type="checkbox" checked={enabled.includes(m.key)} onChange={(e) => setEnabled((old) => e.target.checked ? [...old, m.key] : old.filter((key) => key !== m.key))} />{m.label}</label>)}</fieldset></details>
      {!enabled.length && <p className="meta">Activez un instrument pour suivre son évolution.</p>}
      {metrics.filter((m) => enabled.includes(m.key)).map((m) => {
        const values = samples.flatMap((p) => p[m.key] === null ? [] : [p[m.key]!])
        const max = Math.max(1, ...values), start = samples[0]?.time ?? 0, end = latest?.time ?? 0
        const points = samples.flatMap((p) => p[m.key] === null ? [] : [`${36 + (p.time - start) / Math.max(1, end - start) * 208},${86 - p[m.key]! / max * 66}`]).join(' ')
        return <figure className="live-chart" key={m.key}>
          <figcaption>{m.label} <strong data-metric={m.key}>{latest?.[m.key] == null ? '—' : number(latest[m.key]!)} {m.unit}</strong></figcaption>
          <svg viewBox="0 0 260 112" role="img" aria-label={`${m.label}, de ${number(start)} à ${number(end)} secondes simulées`}>
            <path className="live-axis" d="M36 18V86H244" /><text x="0" y="22">{number(max)}</text><text x="12" y="90">0</text>
            <polyline className="live-line" points={points} /><text x="36" y="107">{number(start)} s</text><text x="244" y="107" textAnchor="end">{number(end)} s</text>
          </svg>
          {!values.length && <p className="meta">{m.key === 'cycle' ? 'En attente du premier cycle terminé.' : 'En attente de trajets libres terminés.'}</p>}
        </figure>
      })}
      <p className="meta">120 derniers relevés, temps simulé en abscisse. Débit et ratio cumulés depuis le lancement ; ratio pouvant dépasser 100 %. Cycle : attente, service et retour inclus, cycles inachevés exclus. Les courbes sont descriptives, sans intervalle de confiance.</p>
    </details>
  </aside>
}
