// Campagne de mesure (protocole : .agents/skills/experiment-protocol). TypeScript pur, exécuté dans un Worker.
import { createSim, DT, step } from './sim.ts'
import { validateFleet, validateLayout, validateSeed, type Layout } from './layout.ts'

export const WINDOW_STEPS = 100 // fenêtre d'observation : 10 s simulées
export const BATCH = 5 // MSER-5 : moyennes de lots de 5 fenêtres

export type CampaignParams = { layout: Layout; fleets: number[]; replications: number; seconds: number; seed: number }
// Séries par fenêtre (incréments) : assez pour refaire tout le calcul depuis l'export.
export type Replication = { fleet: number; seed: number; served: number[]; lost: number[]; free: number[] }
export type Interval = { mean: number; half: number }
export type FleetResult = {
  fleet: number; warmupSeconds: number; detected: boolean
  replicationWarmupSeconds: number[]; throughput: number[]; lostRatio: number[]
  meanThroughput: Interval; meanLostRatio: Interval
}

export function validateCampaign(p: CampaignParams): void {
  const capacity = validateLayout(p.layout)
  validateSeed(p.seed)
  if (!Array.isArray(p.fleets) || p.fleets.length < 1 || p.fleets.length > 12) throw new RangeError('Choisir 1 à 12 tailles de flotte.')
  if (new Set(p.fleets).size !== p.fleets.length) throw new RangeError('Tailles de flotte en double.')
  for (const n of p.fleets) validateFleet(n, capacity)
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

export function runReplication(layout: Layout, fleet: number, seed: number, seconds: number): Replication {
  const s = createSim(seed, fleet, layout), out: Replication = { fleet, seed, served: [], lost: [], free: [] }
  const windows = Math.floor(seconds / (WINDOW_STEPS * DT))
  let served = 0, lost = 0, free = 0
  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < WINDOW_STEPS; i++) step(s)
    let total = 0
    for (const r of s.robots) total += r.visits
    out.served.push(total - served); out.lost.push(s.lostSteps - lost); out.free.push(s.freeSteps - free)
    served = total; lost = s.lostSteps; free = s.freeSteps
  }
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
  return { fleet: reps[0].fleet, warmupSeconds: start * window, detected: cuts.every((c) => c.detected),
    replicationWarmupSeconds: cuts.map((c) => c.windows * window), throughput, lostRatio,
    meanThroughput: interval(throughput), meanLostRatio: interval(lostRatio) }
}
