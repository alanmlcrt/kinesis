import { aisleLayout, layoutMetrics, type AisleSpec } from './layout.ts'
import { analyzeFleet, pareto, peak, replicationSeeds, validateCampaign, type CampaignParams, type Configuration, type FleetResult, type Replication } from './campaign.ts'

export type ExplorationParams = {
  spec: AisleSpec; blocks: number[]; aisles: number[]; base: 'footprint' | null
  fleets: number[]; replications: number; seconds: number; seed: number
}
export const PLATEAU_FRACTION = .95

export function explorationPlans(p: ExplorationParams): Configuration[] {
  if (p.base !== 'footprint') throw new RangeError('Accepter la base emprise égale pour explorer.')
  if (!Array.isArray(p.blocks) || !Array.isArray(p.aisles) || !p.blocks.length || !p.aisles.length ||
      p.blocks.length * p.aisles.length > 15 || new Set(p.blocks).size !== p.blocks.length || new Set(p.aisles).size !== p.aisles.length) {
    throw new RangeError('Choisir des listes sans doublons, pour 15 combinaisons au plus.')
  }
  const configurations: Configuration[] = [], seen = new Set<string>()
  for (const block of p.blocks) for (const aisle of p.aisles) {
    const name = `Bloc ${block} · allée ${aisle}`
    let layout
    try { layout = aisleLayout({ ...p.spec, block, aisle }) }
    catch (e) { throw new RangeError(`${name} : ${(e as Error).message}`) }
    const signature = JSON.stringify(layout)
    if (seen.has(signature)) continue
    seen.add(signature)
    validateCampaign({ ...p, configurations: [{ name, layout }], base: null })
    configurations.push({ name, layout })
  }
  if (configurations.length < 2) throw new RangeError('Choisir au moins deux plans distincts ; ces combinaisons donnent le même plan.')
  return configurations
}

// Plateau descriptif uniquement sur les flottes échantillonnées (protocole 7d).
export function saturation(results: FleetResult[]): number | null {
  const sorted = [...results].sort((a, b) => a.fleet - b.fleet)
  const maximum = peak(sorted)?.meanThroughput.mean ?? 0
  if (maximum <= 0 || sorted.some((r) => !r.detected || !Number.isFinite(r.meanThroughput.mean))) return null
  const index = sorted.findIndex((r, i) => i <= sorted.length - 3 &&
    sorted.slice(i).every((s) => s.meanThroughput.mean >= PLATEAU_FRACTION * maximum) && r.meanThroughput.mean >= PLATEAU_FRACTION * maximum)
  return index < 0 ? null : sorted[index].fleet
}

export function explorationJobs(p: ExplorationParams) {
  const configurations = explorationPlans(p), seeds = replicationSeeds(p.seed, p.replications)
  return configurations.flatMap((c, configuration) => [...p.fleets].sort((a, b) => a - b).flatMap((fleet) =>
    seeds.map((seed) => ({ layout: c.layout, configuration, fleet, seed, seconds: p.seconds }))))
}

export function analyzeExploration(p: ExplorationParams, replications: Replication[]) {
  const configurations = explorationPlans(p), jobs = explorationJobs(p)
  if (replications.length !== jobs.length) throw new RangeError('Exploration incomplète.')
  const ordered = jobs.map((j) => {
    const matches = replications.filter((r) => r.configuration === j.configuration && r.fleet === j.fleet && r.seed === j.seed)
    if (matches.length !== 1) throw new RangeError('Réplication manquante ou en double.')
    return matches[0]
  })
  const results = configurations.flatMap((_, i) => [...p.fleets].sort((a, b) => a - b).map((fleet) =>
    analyzeFleet(ordered.filter((r) => r.configuration === i && r.fleet === fleet))))
  const rows = configurations.map((c, i) => {
    const measurements = results.filter((r) => r.configuration === i)
    return { ...c, ...layoutMetrics(c.layout), peak: peak(measurements), saturation: saturation(measurements) }
  })
  const front = pareto(rows.map((r) => ({ slots: r.slots, area: r.area, throughput: r.peak?.meanThroughput.mean ?? NaN })))
  return { replications: ordered, results, rows: rows.map((r, i) => ({ ...r, front: front[i] })) }
}

export function explorationCampaign(p: ExplorationParams): CampaignParams {
  // Manifest includes complete generated layouts, not only generator settings.
  return { configurations: explorationPlans(p), base: 'footprint', fleets: [...p.fleets].sort((a, b) => a - b),
    replications: p.replications, seconds: p.seconds, seed: p.seed }
}
