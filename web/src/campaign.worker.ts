// Calcul de la campagne hors du fil d'affichage : l'interface et la scène restent fluides.
import { analyzeFleet, replicationSeeds, runReplication, validateCampaign, type CampaignParams, type Replication } from './sim/campaign.ts'

self.onmessage = (e: MessageEvent<CampaignParams>) => {
  const p = e.data
  try {
    validateCampaign(p)
    const seeds = replicationSeeds(p.seed, p.replications), replications: Replication[] = []
    const total = p.fleets.length * seeds.length
    for (const fleet of p.fleets) for (const seed of seeds) {
      replications.push(runReplication(p.layout, fleet, seed, p.seconds))
      self.postMessage({ type: 'progress', done: replications.length, total })
    }
    const results = p.fleets.map((fleet) => analyzeFleet(replications.filter((r) => r.fleet === fleet)))
    self.postMessage({ type: 'done', seeds, replications, results })
  } catch (error) {
    self.postMessage({ type: 'error', message: (error as Error).message })
  }
}
