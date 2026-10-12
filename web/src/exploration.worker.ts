import { runReplication } from './sim/campaign.ts'
import type { explorationJobs } from './sim/exploration.ts'

self.onmessage = (e: MessageEvent<ReturnType<typeof explorationJobs>[number]>) => {
  try {
    const j = e.data
    self.postMessage({ type: 'done', replication: runReplication(j.layout, j.fleet, j.seed, j.seconds, j.configuration) })
  } catch (e) { self.postMessage({ type: 'error', message: (e as Error).message }) }
}
