import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeFleet, interval, mser5, pareto, peak, replicationSeeds, runReplication, validateCampaign, WINDOW_STEPS, type FleetResult } from './campaign.ts'
import { createSim, step } from './sim.ts'
import { DEFAULT_LAYOUT, PRESETS, regularLayout } from './layout.ts'

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
    { configuration: 0, fleet: 4, seed: 1, served: [...Array(10).fill(0), ...steady], lost: Array(110).fill(2), free: Array(110).fill(4) },
    { configuration: 0, fleet: 4, seed: 2, served: [...Array(20).fill(0), ...steady.slice(10)], lost: Array(110).fill(1), free: Array(110).fill(4) },
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

const demo = { name: 'Démo', layout: DEFAULT_LAYOUT }, dense = { name: 'Compact', layout: PRESETS.dense }
const large = { name: 'Étendu', layout: PRESETS.large }

test('paramètres de campagne refusés', () => {
  const ok = { configurations: [demo], base: null, fleets: [20, 50], replications: 5, seconds: 3600, seed: 1 }
  validateCampaign(ok)
  for (const bad of [{ fleets: [] }, { fleets: [20, 20] }, { fleets: [0] }, { fleets: [100000] }, { replications: 1 },
    { replications: 31 }, { replications: 2.5 }, { seconds: 100 }, { seconds: 1e6 }, { seed: -1 },
    { configurations: [] }, { configurations: [demo, dense, large, { ...demo, name: 'D' }], base: 'pareto' },
    { base: 'pareto' }, { configurations: [demo, { ...demo }], base: 'pareto' }, { configurations: [demo, { ...dense, name: ' ' }], base: 'pareto' }]) {
    assert.throws(() => validateCampaign({ ...ok, ...bad } as never), RangeError, JSON.stringify(bad).slice(0, 80))
  }
})

test('base de normalisation : obligatoire pour comparer, vérifiée sur les plans', () => {
  const p = { fleets: [20], replications: 2, seconds: 3600, seed: 1 }
  assert.throws(() => validateCampaign({ ...p, configurations: [demo, dense], base: null }), /base de normalisation/)
  // Démo et Compact : même emprise 48 × 32, capacités 256 et 768 emplacements.
  validateCampaign({ ...p, configurations: [demo, dense], base: 'footprint' })
  assert.throws(() => validateCampaign({ ...p, configurations: [demo, dense], base: 'capacity' }), /Démo 256, Compact 768/)
  assert.throws(() => validateCampaign({ ...p, configurations: [demo, large], base: 'footprint' }), /Emprises différentes/)
  validateCampaign({ ...p, configurations: [demo, dense, large], base: 'pareto' })
  validateCampaign({ ...p, configurations: [demo, { name: 'Démo bis', layout: { ...DEFAULT_LAYOUT, fill: 50 } }], base: 'capacity' })
  const small = { name: 'Petit', layout: regularLayout(16, 16, 1, 2, 1, 1) }
  assert.throws(() => validateCampaign({ ...p, fleets: [100], configurations: [demo, small], base: 'pareto' }), /^RangeError: Petit :/)
})

test('front de Pareto et débit maximal mesuré', () => {
  assert.deepEqual(pareto([
    { slots: 128, area: 1536, throughput: 400 }, { slots: 320, area: 1536, throughput: 380 },
    { slots: 128, area: 1536, throughput: 300 }, { slots: 720, area: 2560, throughput: NaN }, { slots: 320, area: 2560, throughput: 380 },
  ]), [true, true, false, false, false])
  const r = (fleet: number, mean: number, detected = true) => ({ fleet, detected, meanThroughput: { mean, half: 1 } }) as FleetResult
  assert.equal(peak([r(10, 100), r(50, 300), r(100, 500, false), r(150, 280)])!.fleet, 50)
  assert.equal(peak([r(10, 100, false)]), undefined)
})
