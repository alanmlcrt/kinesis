import test from 'node:test'
import assert from 'node:assert/strict'
import { aisleLayout, DEFAULT_LAYOUT, editLayout, layoutFloor, layoutMetrics, parseConfiguration, parseLayout, regularLayout, validateLayout, type AisleSpec, type Layout } from './layout.ts'
import { createSim, step } from './sim.ts'
import { runReplication, validateCampaign } from './campaign.ts'

const spec: AisleSpec = { width: 48, depth: 32, levels: 4, block: 12, aisle: 1, cross: 0, front: 0, stations: 4, sides: 1, fill: 100, storage: 'random', generation: 'classic' }

test('classique : emprise bloquée, accès par la gauche et même capacité de stockage', () => {
  const classic = aisleLayout(spec), modern = aisleLayout({ ...spec, generation: '2025+' })
  const a = createSim(1, 72, classic), b = createSim(1, 72, modern)
  assert.deepEqual(a.floor, layoutFloor(classic))
  assert.deepEqual(layoutMetrics(classic), layoutMetrics(modern))
  assert.equal(a.floor.filter((k) => k === 'blocked').length, classic.racks.length)
  for (const { x, z } of classic.racks) {
    assert.equal(a.floor[z * a.width + x], 'column')
    assert.equal(a.floor[z * a.width + x - 1], 'lane', 'allée d’accès')
    assert.equal(a.floor[z * a.width + x + 1], 'blocked', 'passage sous le stockage interdit')
    assert.equal(b.floor[z * b.width + x + 1], 'lane', 'passage 2025+ conservé')
  }
})

test('génération : anciens plans compatibles, configuration et plans nommés sérialisables', () => {
  assert.deepEqual(parseLayout(DEFAULT_LAYOUT), DEFAULT_LAYOUT)
  const layout = aisleLayout(spec), config = { version: 1, seed: 0xffffffff, count: 72, layout }
  assert.deepEqual(parseConfiguration(JSON.parse(JSON.stringify(config))), config)
  const parsed = parseLayout(JSON.parse(JSON.stringify(layout)))
  assert.deepEqual(parsed, layout)
  assert.notEqual(parsed.racks, layout.racks)
  assert.throws(() => parseLayout({ ...layout, generation: 'unknown' }), /Génération/)
  assert.throws(() => parseLayout({ ...layout, generation: null }), /Génération/)
  const bays = validateLayout(layout)
  assert.throws(() => parseConfiguration({ ...config, count: bays + 1 }), new RegExp(`${bays} baies`))
})

test('génération et édition classiques : validation, transversales et stations sur deux côtés', () => {
  // Les dimensions doivent être refusées avant de construire de très grands tableaux.
  for (const generation of ['classic', '2025+'] as const) for (const bad of [{ width: 1e9 }, { depth: 1e9 }, { width: 14 }, { depth: 66 }]) {
    assert.throws(() => aisleLayout({ ...spec, generation, ...bad }), /largeur 16–80/)
  }
  const plan = aisleLayout({ ...spec, block: 2, aisle: 5, cross: 3, sides: 2, stations: 5, front: 4 })
  assert.equal(plan.generation, 'classic')
  assert.ok(validateLayout(plan) > 0)
  const floor = layoutFloor(plan)
  for (const x of new Set(plan.racks.map((p) => p.x))) {
    assert.equal(floor[13 * plan.width + x + 1], 'lane', 'transversale entre les travées')
  }
  const regular = regularLayout(16, 16, 1, 1, 8, 1, 1, 'near-station', 'classic')
  assert.equal(regular.generation, 'classic')
  assert.throws(() => editLayout(regular, 'station', 2, 2), /chevauchent/)
  assert.equal(editLayout(regular, 'rack', 8, 2).generation, 'classic')
})

test('classique : déterminisme, variation de graine et reprise JSON', () => {
  const layout = regularLayout(16, 16, 2, 3, 3, 2, 37, 'random', 'classic')
  const a = createSim(0, 20, layout), b = createSim(0, 20, layout), other = createSim(7, 20, layout)
  assert.notDeepEqual(a.robots.map((r) => r.home), other.robots.map((r) => r.home))
  for (let i = 0; i < 1200; i++) { step(a); step(b) }
  assert.deepEqual(a, b)
  const copy = JSON.parse(JSON.stringify(a))
  for (let i = 0; i < 200; i++) { step(a); step(copy) }
  assert.deepEqual(a, copy)
})

test('campagne classique : même protocole et réplication conforme au moteur', () => {
  const classic = regularLayout(16, 16, 2, 3, 2, 2, 100, 'random', 'classic')
  const modern: Layout = { ...classic, generation: '2025+' }
  validateCampaign({ configurations: [{ name: 'Classique', layout: classic }, { name: '2025+', layout: modern }], base: 'capacity', fleets: [10], replications: 2, seconds: 400, seed: 1 })
  const result = runReplication(classic, 10, 3, 400), s = createSim(3, 10, classic)
  for (let i = 0; i < 4000; i++) step(s)
  assert.equal(result.served.reduce((a, b) => a + b, 0), s.robots.reduce((n, r) => n + r.visits, 0))
  assert.equal(result.lost.reduce((a, b) => a + b, 0), s.lostSteps)
  assert.equal(result.free.reduce((a, b) => a + b, 0), s.freeSteps)
})
