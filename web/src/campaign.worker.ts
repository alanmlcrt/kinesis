// Calcul de la campagne hors du fil d'affichage : l'interface et la scène restent fluides.
import { analyzeFleet, replicationSeeds, runReplication, validateCampaign, type CampaignParams, type Replication } from './sim/campaign.ts'

self.onmessage = (e: MessageEvent<CampaignParams>) => {
  const p = e.data
  try {
    validateCampaign(p)
    const seeds = replicationSeeds(p.seed, p.replications), replications: Replication[] = []
    const timings: { configuration: number; fleet: number; seed: number; seconds: number }[] = []
    // Mêmes graines pour toutes les configurations et flottes (nombres aléatoires communs).
    const total = p.configurations.length * p.fleets.length * seeds.length
    p.configurations.forEach((c, i) => { for (const fleet of p.fleets) for (const seed of seeds) {
      const start = performance.now()
      replications.push(runReplication(c.layout, fleet, seed, p.seconds, i, c.control))
      timings.push({ configuration: i, fleet, seed, seconds: (performance.now() - start) / 1000 })
      self.postMessage({ type: 'progress', done: replications.length, total })
    } })
    const results = p.configurations.flatMap((_, i) => p.fleets.map((fleet) =>
      analyzeFleet(replications.filter((r) => r.configuration === i && r.fleet === fleet))))
    self.postMessage({ type: 'done', seeds, replications, results, timings })
  } catch (error) {
    self.postMessage({ type: 'error', message: (error as Error).message })
  }
}
