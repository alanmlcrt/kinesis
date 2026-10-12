import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeFleet, runReplication, type FleetResult } from './campaign.ts'
import { analyzeExploration, explorationJobs, explorationPlans, saturation, type ExplorationParams } from './exploration.ts'

const p: ExplorationParams = { spec: { width: 24, depth: 20, levels: 2, fill: 100, storage: 'random', stations: 2, sides: 1, block: 1, aisle: 1, cross: 0, front: 2 },
  blocks: [1], aisles: [1, 5], base: 'footprint', fleets: [8, 2, 4], replications: 2, seconds: 400, seed: 3 }

test('Famille à emprise égale, géométrie et capacité variables, deux générations', () => {
  for (const generation of ['2025+', 'classic'] as const) {
    const plans = explorationPlans({ ...p, spec: { ...p.spec, generation } })
    assert.equal(plans.length, 2)
    assert.ok(plans.every((c) => c.layout.width === 24 && c.layout.depth === 20 && c.layout.generation === generation))
    assert.ok(plans[0].layout.racks.length > plans[1].layout.racks.length)
  }
  const dedup = explorationPlans({ ...p, blocks: [1, 12], aisles: [1, 5] })
  assert.equal(dedup.length, 2, 'combinaisons identiques dédoublonnées')
  assert.throws(() => explorationPlans({ ...p, blocks: [12] }), /deux plans distincts/)
})

test('Exploration refuse bases, listes, géométries et flottes invalides sans tronquer', () => {
  for (const change of [{ base: null }, { blocks: [] }, { blocks: [1, 1] }, { aisles: [2] }, { blocks: [13] },
    { blocks: [1, 2, 3, 4], aisles: [1, 3, 5, 7, 9] }, { fleets: [300] }, { fleets: [2, 2] }, { replications: 1 },
    { seconds: 399 }, { seed: -1 }]) assert.throws(() => explorationPlans({ ...p, ...change } as ExplorationParams))
  assert.throws(() => explorationPlans({ ...p, spec: { ...p.spec, width: 1e9 } }), /largeur/)
})

function fake(fleet: number, mean: number, detected = true): FleetResult {
  return { configuration: 0, fleet, detected, warmupSeconds: 0, replicationWarmupSeconds: [0, 0], throughput: [mean, mean],
    lostRatio: [0, 0], meanThroughput: { mean, half: 0 }, meanLostRatio: { mean: 0, half: 0 } }
}
test('Seuil descriptif : plateau, tri, deux points suivants et chauffe requise', () => {
  assert.equal(saturation([fake(60, 100), fake(10, 60), fake(20, 95), fake(40, 98)]), 20)
  assert.equal(saturation([fake(10, 90), fake(20, 95), fake(40, 100)]), null)
  assert.equal(saturation([fake(10, 100), fake(20, 94), fake(40, 100)]), null)
  assert.equal(saturation([fake(10, 100), fake(20, 100), fake(40, 100, false)]), null)
  assert.equal(saturation([fake(10, 0), fake(20, 0), fake(40, 0)]), null)
  assert.equal(saturation([]), null)
})

test('Résultats indépendants de l’ordre de fin, export analysable et réplications complètes', () => {
  const jobs = explorationJobs(p)
  assert.equal(jobs.length, 12)
  const reps = jobs.map((j) => runReplication(j.layout, j.fleet, j.seed, j.seconds, j.configuration))
  const a = analyzeExploration(p, reps), b = analyzeExploration(p, [...reps].reverse())
  assert.deepEqual(a, b)
  assert.deepEqual(a.results[0], analyzeFleet(reps.filter((r) => r.configuration === 0 && r.fleet === 2)))
  assert.deepEqual(runReplication(jobs[0].layout, jobs[0].fleet, jobs[0].seed, jobs[0].seconds), reps[0])
  assert.throws(() => analyzeExploration(p, reps.slice(1)), /incomplète/)
  assert.throws(() => analyzeExploration(p, [reps[0], ...reps.slice(0, -1)]), /double/)
  assert.ok(a.rows.some((r) => r.front))
})
