import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeFleet, interval, mser5, replicationSeeds, runReplication, validateCampaign, WINDOW_STEPS } from './campaign.ts'
import { createSim, step } from './sim.ts'
import { DEFAULT_LAYOUT } from './layout.ts'

test('graines de réplication : déterministes, distinctes, 32 bits, propres à la graine de campagne', () => {
  const a = replicationSeeds(1, 30)
  assert.deepEqual(a, replicationSeeds(1, 30))
  assert.equal(new Set(a).size, 30)
  assert.ok(a.every((s) => Number.isInteger(s) && s >= 0 && s <= 4294967295))
  assert.notDeepEqual(a, replicationSeeds(2, 30))
  assert.deepEqual(replicationSeeds(1, 5), a.slice(0, 5))
})

test('MSER-5 : transitoire écarté, série stationnaire intacte, dérive non détectée', () => {
  const steady = Array.from({ length: 200 }, (_, i) => 1 + i % 2)
  assert.deepEqual(mser5([...Array(20).fill(0), ...steady]), { windows: 20, detected: true })
  assert.deepEqual(mser5(steady), { windows: 0, detected: true })
  assert.equal(mser5(Array.from({ length: 200 }, (_, i) => i)).detected, false)
  // Régression : deux derniers lots égaux ne doivent pas faire écarter presque toute la série.
  const noisy = Array.from({ length: 200 }, (_, i) => (i * 7919 % 13) % 4)
  noisy.splice(190, 10, ...Array(10).fill(2))
  const cut = mser5(noisy)
  assert.ok(cut.windows <= 100, `troncature en fin de série : ${cut.windows}`)
})

test('intervalle de confiance à 95 % (Student)', () => {
  const { mean, half } = interval([1, 2, 3, 4, 5])
  assert.equal(mean, 3)
  assert.ok(Math.abs(half - 2.776 * Math.sqrt(2.5 / 5)) < 1e-12)
  assert.ok(Math.abs(interval([10, 12]).half - 12.706 * 1) < 1e-12)
})

test('réplication : déterministe et identique au moteur pas à pas', () => {
  const rep = runReplication(DEFAULT_LAYOUT, 50, 7, 600)
  assert.deepEqual(rep, runReplication(DEFAULT_LAYOUT, 50, 7, 600))
  assert.equal(rep.served.length, 600 / (WINDOW_STEPS * .1))
  const s = createSim(7, 50, DEFAULT_LAYOUT)
  for (let i = 0; i < 6000; i++) step(s)
  const total = (a: number[]) => a.reduce((x, v) => x + v, 0)
  assert.equal(total(rep.served), s.robots.reduce((x, r) => x + r.visits, 0))
  assert.equal(total(rep.lost), s.lostSteps)
  assert.equal(total(rep.free), s.freeSteps)
})

test('analyse d’une flotte : chauffe commune la plus longue, débit et ratio après chauffe', () => {
  const steady = Array.from({ length: 100 }, (_, i) => 1 + i % 2)
  const reps = [
    { fleet: 4, seed: 1, served: [...Array(10).fill(0), ...steady], lost: Array(110).fill(2), free: Array(110).fill(4) },
    { fleet: 4, seed: 2, served: [...Array(20).fill(0), ...steady.slice(10)], lost: Array(110).fill(1), free: Array(110).fill(4) },
  ]
  const r = analyzeFleet(reps)
  assert.deepEqual(r.replicationWarmupSeconds, [100, 200])
  assert.equal(r.warmupSeconds, 200)
  assert.ok(r.detected)
  // 90 fenêtres après 20 : 45 de 1 et 45 de 2 = 135 bacs en 900 s.
  assert.deepEqual(r.throughput, [540, 540])
  assert.deepEqual(r.lostRatio, [.5, .25])
  assert.equal(r.meanThroughput.half, 0)
})

test('paramètres de campagne refusés', () => {
  const ok = { layout: DEFAULT_LAYOUT, fleets: [20, 50], replications: 5, seconds: 3600, seed: 1 }
  validateCampaign(ok)
  for (const bad of [{ fleets: [] }, { fleets: [20, 20] }, { fleets: [0] }, { fleets: [100000] }, { replications: 1 },
    { replications: 31 }, { replications: 2.5 }, { seconds: 100 }, { seconds: 1e6 }, { seed: -1 }]) {
    assert.throws(() => validateCampaign({ ...ok, ...bad }), RangeError, JSON.stringify(bad))
  }
})
