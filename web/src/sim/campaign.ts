// Campagne de mesure (protocole : .agents/skills/experiment-protocol). TypeScript pur, exécuté dans un Worker.
import { createSim, DT, step } from './sim.ts'
import { validateControl, type Control, type ControlStats } from './control.ts'
import { footprint, storageSlots, validateFleet, validateLayout, validateSeed, type Layout } from './layout.ts'

export const WINDOW_STEPS = 100 // fenêtre d'observation : 10 s simulées
export const BATCH = 5 // MSER-5 : moyennes de lots de 5 fenêtres

export type Base = 'capacity' | 'footprint' | 'pareto'
export type Configuration = { name: string; layout: Layout; control?: Control }
// base : choisie par l'utilisateur dès deux configurations, jamais par défaut ; null pour une seule.
export type CampaignParams = { configurations: Configuration[]; base: Base | null; fleets: number[]; replications: number; seconds: number; seed: number }
// Séries par fenêtre (incréments) : assez pour refaire tout le calcul depuis l'export.
export type Replication = { configuration: number; fleet: number; seed: number; served: number[]; lost: number[]; free: number[]; controlStats?: ControlStats }
export type Interval = { mean: number; half: number }
export type FleetResult = {
  configuration: number; fleet: number; warmupSeconds: number; detected: boolean
  replicationWarmupSeconds: number[]; throughput: number[]; lostRatio: number[]
  meanThroughput: Interval; meanLostRatio: Interval
}

export function validateCampaign(p: CampaignParams): void {
  const configs = p.configurations
  // Trois au plus : au-delà, les couleurs des courbes ne restent pas distinguables (palette validée).
  if (!Array.isArray(configs) || configs.length < 1 || configs.length > 3) throw new RangeError('Choisir 1 à 3 configurations.')
  const names = configs.map((c) => typeof c.name === 'string' ? c.name.trim() : '')
  if (names.some((n) => !n || n.length > 40) || new Set(names).size !== names.length) throw new RangeError('Noms de configuration vides, trop longs ou en double.')
  const capacities = configs.map((c) => validateLayout(c.layout))
  configs.forEach((c) => { if (c.control !== undefined) { validateControl(c.control); if (c.layout.profile === 'lifts' && c.control.method !== 'whole' && c.control.horizon * 5 < c.layout.liftSteps!) throw new RangeError('Horizon trop court pour une transition d’ascenseur.') } })
  validateSeed(p.seed)
  if (configs.length === 1 && p.base !== null) throw new RangeError('Une seule configuration : aucune base de normalisation.')
  if (configs.length > 1) {
    if (!['capacity', 'footprint', 'pareto'].includes(p.base as string)) throw new RangeError('Choisir une base de normalisation pour comparer.')
    const list = (f: (l: Layout) => number) => configs.map((c, i) => `${names[i]} ${f(c.layout)}`).join(', ')
    if (p.base === 'capacity' && new Set(configs.map((c) => storageSlots(c.layout))).size > 1) {
      throw new RangeError(`Capacités différentes (${list(storageSlots)} emplacements) : choisir une autre base ou d’autres plans.`)
    }
    if (p.base === 'footprint' && new Set(configs.map((c) => footprint(c.layout))).size > 1) {
      throw new RangeError(`Emprises différentes (${list(footprint)} cases) : choisir une autre base ou d’autres plans.`)
    }
  }
  if (!Array.isArray(p.fleets) || p.fleets.length < 1 || p.fleets.length > 12) throw new RangeError('Choisir 1 à 12 tailles de flotte.')
  if (new Set(p.fleets).size !== p.fleets.length) throw new RangeError('Tailles de flotte en double.')
  for (const n of p.fleets) capacities.forEach((capacity, i) => {
    try { validateFleet(n, capacity) } catch (e) { throw new RangeError(`${names[i]} : ${(e as Error).message}`) }
  })
  if (!Number.isInteger(p.replications) || p.replications < 2 || p.replications > 30) throw new RangeError('Choisir 2 à 30 réplications.')
  // Au moins 4 lots MSER après une troncature maximale de la moitié de la série.
  const minimum = 8 * BATCH * WINDOW_STEPS * DT
  if (!Number.isInteger(p.seconds) || p.seconds < minimum || p.seconds > 86400) throw new RangeError(`Choisir une durée de ${minimum} à 86400 s simulées.`)
}

// Graines des réplications déduites de la graine de campagne (mulberry32), distinctes, communes à toutes les flottes.
export function replicationSeeds(seed: number, count: number): number[] {
  const seeds: number[] = []
  let state = seed | 0
  while (seeds.length < count) {
    let t = (state = (state + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const next = (t ^ (t >>> 14)) >>> 0
    if (!seeds.includes(next)) seeds.push(next)
  }
  return seeds
}

export function runReplication(layout: Layout, fleet: number, seed: number, seconds: number, configuration = 0, control?: Control): Replication {
  const s = createSim(seed, fleet, layout, control), out: Replication = { configuration, fleet, seed, served: [], lost: [], free: [] }
  const windows = Math.floor(seconds / (WINDOW_STEPS * DT))
  let served = 0, lost = 0, free = 0
  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < WINDOW_STEPS; i++) step(s)
    let total = 0
    for (const r of s.robots) total += r.visits
    out.served.push(total - served); out.lost.push(s.lostSteps - lost); out.free.push(s.freeSteps - free)
    served = total; lost = s.lostSteps; free = s.freeSteps
  }
  if (control) out.controlStats = { ...s.controlStats }
  return out
}

// MSER-5 (White 1997 ; Franklin et White 2008) sur les bacs servis par fenêtre : troncature d (en lots)
// qui minimise la variance de la moyenne restante. Recherche limitée à la première moitié : en fin de série,
// deux lots égaux donnent une variance nulle (artefact connu). Minimum à la limite : chauffe non détectée.
export function mser5(series: number[]): { windows: number; detected: boolean } {
  const batches: number[] = []
  for (let i = 0; i + BATCH <= series.length; i += BATCH) {
    let sum = 0
    for (let j = i; j < i + BATCH; j++) sum += series[j]
    batches.push(sum / BATCH)
  }
  const n = batches.length
  let best = 0, bestValue = Infinity
  const limit = Math.floor(n / 2)
  for (let d = 0; d <= limit; d++) {
    let mean = 0
    for (let i = d; i < n; i++) mean += batches[i]
    mean /= n - d
    let sse = 0
    for (let i = d; i < n; i++) sse += (batches[i] - mean) ** 2
    const value = sse / (n - d) ** 2
    if (value < bestValue) { bestValue = value; best = d }
  }
  return { windows: best * BATCH, detected: best < limit }
}

// Quantile 0,975 de la loi de Student, 1 à 29 degrés de liberté (R de 2 à 30).
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045]

export function interval(values: number[]): Interval {
  const n = values.length, mean = values.reduce((a, v) => a + v, 0) / n
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)
  return { mean, half: T975[n - 2] * Math.sqrt(variance / n) }
}

const sum = (values: number[], from: number) => { let s = 0; for (let i = from; i < values.length; i++) s += values[i]; return s }

// Une flotte : chauffe retenue = la plus longue des réplications, appliquée à toutes ; mesures après cette chauffe.
export function analyzeFleet(reps: Replication[]): FleetResult {
  const cuts = reps.map((r) => mser5(r.served)), window = WINDOW_STEPS * DT
  const start = Math.max(...cuts.map((c) => c.windows))
  const throughput = reps.map((r) => sum(r.served, start) / ((r.served.length - start) * window) * 3600)
  const lostRatio = reps.map((r) => { const free = sum(r.free, start); return free ? sum(r.lost, start) / free : NaN }) // aucun trajet terminé : indéfini, pas 0
  return { configuration: reps[0].configuration, fleet: reps[0].fleet, warmupSeconds: start * window, detected: cuts.every((c) => c.detected),
    replicationWarmupSeconds: cuts.map((c) => c.windows * window), throughput, lostRatio,
    meanThroughput: interval(throughput), meanLostRatio: interval(lostRatio) }
}

// Débit maximal mesuré d'une configuration : la plus haute moyenne parmi ses flottes à chauffe détectée.
// Le maximum de moyennes bruitées est biaisé vers le haut : l'intervalle de cette flotte l'accompagne.
export function peak(results: FleetResult[]): FleetResult | undefined {
  let best: FleetResult | undefined
  for (const r of results) if (r.detected && (!best || r.meanThroughput.mean > best.meanThroughput.mean)) best = r
  return best
}

// Front de Pareto : plus d'emplacements, moins d'emprise, plus de débit. Sans débit mesuré : hors front.
export function pareto(points: { slots: number; area: number; throughput: number }[]): boolean[] {
  return points.map((a, i) => Number.isFinite(a.throughput) && !points.some((b, j) => j !== i && Number.isFinite(b.throughput) &&
    b.slots >= a.slots && b.area <= a.area && b.throughput >= a.throughput &&
    (b.slots > a.slots || b.area < a.area || b.throughput > a.throughput)))
}
