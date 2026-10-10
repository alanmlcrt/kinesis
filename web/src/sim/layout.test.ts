import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAYOUT, editLayout, parseConfiguration, PRESETS, regularLayout, validateLayout, type Layout } from './layout.ts'
import { GEOMETRY, LEVEL_HEIGHT } from './geometry.ts'
import { createSim, step } from './sim.ts'

test('plans prédéfinis et personnalisés : tailles, stockage et cycles sans collision', () => {
  for (const layout of [PRESETS.demo, PRESETS.dense, PRESETS.large, regularLayout(24, 20, 3, 4, 2, 2, 45)]) {
    const s = createSim(7, 20, layout)
    assert.equal(s.columns.length, layout.racks.length)
    assert.equal(s.bins.length, Math.max(1, Math.floor(layout.racks.length * layout.levels * layout.fill / 100)))
    assert.equal(s.stations.length, layout.stations.length)
    assert.equal(s.floor.length, layout.width * layout.depth)
    for (let i = 0; i < 20000 && !s.robots.every((r) => r.returns > 0); i++) {
      step(s)
      const occupied = new Set<number>()
      for (const r of s.robots) {
        const cell = r.z * s.width + r.x
        assert.ok(!occupied.has(cell)); occupied.add(cell)
        assert.equal(s.occupied[cell], r.id)
        assert.notEqual(s.floor[cell], 'blocked')
        assert.ok(r.level >= 0 && r.level <= layout.levels)
        if (r.level > 0) assert.equal(s.columns[r.column].cell, cell)
        if (r.pathIndex < r.pathLength) assert.equal(s.reserved[r.path[r.pathIndex]], r.id)
      }
    }
    assert.ok(s.robots.every((r) => r.returns > 0), 'cycle incomplet sur un plan configurable')
  }
})

test('configuration reçue : versions, valeurs invalides et copie indépendante', () => {
  const valid = { version: 1, seed: 0xffffffff, count: 20, layout: DEFAULT_LAYOUT }
  const parsed = parseConfiguration(JSON.parse(JSON.stringify(valid)))
  assert.deepEqual(parsed, valid)
  assert.notEqual(parsed.layout.racks, DEFAULT_LAYOUT.racks)
  const bad: unknown[] = [null, [], 'plan', {}, { ...valid, version: 2 }, { ...valid, seed: -1 },
    { ...valid, seed: 2 ** 32 }, { ...valid, count: '20' }, { ...valid, layout: null },
    { ...valid, layout: { ...DEFAULT_LAYOUT, racks: [null] } },
    { ...valid, layout: { ...DEFAULT_LAYOUT, width: '48' } },
    { ...valid, layout: { ...DEFAULT_LAYOUT, fill: NaN } }]
  for (const value of bad) assert.throws(() => parseConfiguration(value), RangeError)
  assert.equal(Object.isFrozen(PRESETS.dense.racks[0]), true)
  assert.throws(() => editLayout(DEFAULT_LAYOUT, 'unknown' as 'rack', 2, 2), /inconnu/)
})

test('enveloppes compatibles avec la maille, les passages et le premier niveau', () => {
  assert.ok(GEOMETRY.robotHalfWidth + GEOMETRY.guideOffset + .09 < 1)
  assert.ok(GEOMETRY.robotHalfDepth + GEOMETRY.guideOffset + .085 < 1)
  assert.ok(GEOMETRY.binHalfDepth < GEOMETRY.guideOffset - .04)
  const loadedTop = GEOMETRY.robotCenterY + GEOMETRY.carriedBinOffsetY + GEOMETRY.binTopY
  assert.ok(loadedTop < LEVEL_HEIGHT + GEOMETRY.shelfOffsetY - .12)
})

test('plans denses et limites : flotte maximale compatible, réservations et vertical cohérents', () => {
  for (const plan of [PRESETS.dense, { ...PRESETS.large, fill: 15 }, regularLayout(80, 64, 12, 20, 8, 12, 15)]) {
    const s = createSim(7, Math.min(300, validateLayout(plan)), plan)
    for (let tick = 0; tick < 100000 && !s.robots.every((r) => r.returns > 0); tick++) {
      step(s)
      const occupied = new Set<number>()
      for (const r of s.robots) {
        const cell = r.z * s.width + r.x
        assert.ok(!occupied.has(cell)); occupied.add(cell)
        assert.equal(s.occupied[cell], r.id)
        assert.notEqual(s.floor[cell], 'blocked')
        if (r.level > 0) assert.equal(s.columns[r.column].owner, r.id)
        if (r.pathIndex < r.pathLength) assert.equal(s.reserved[r.path[r.pathIndex]], r.id)
      }
    }
    assert.ok(s.robots.every((r) => r.returns > 0), 'famine ou blocage sur un plan dense')
    const copy = JSON.parse(JSON.stringify(s))
    for (let i = 0; i < 20; i++) { step(s); step(copy) }
    assert.deepEqual(s, copy)
  }
})

test('remplissage à graine fixe, proximité des stations et isolation du brouillon', () => {
  const plan = regularLayout(32, 24, 4, 6, 3, 3, 35)
  const a = createSim(1, 20, plan), b = createSim(1, 20, plan)
  for (let i = 0; i < 500; i++) { step(a); step(b) }
  assert.deepEqual(a, b)
  assert.notDeepEqual(a.bins.map((b) => [b.column, b.level]), createSim(2, 20, plan).bins.map((b) => [b.column, b.level]))
  const near = createSim(1, 20, { ...plan, storage: 'near-station' })
  const distance = (column: number) => Math.min(...plan.stations.map((p) => Math.abs(plan.racks[column].x - p.x) + Math.abs(plan.racks[column].z - p.z)))
  const occupied = new Set(near.bins.map((b) => `${b.column}-${b.level}`))
  const max = Math.max(...near.bins.map((b) => distance(b.column)))
  for (let col = 0; col < plan.racks.length; col++) for (let level = 1; level <= plan.levels; level++) {
    if (!occupied.has(`${col}-${level}`)) assert.ok(distance(col) >= max)
  }
  plan.racks[0].x = 100
  assert.notEqual(a.layout.racks[0].x, 100)
})

test('édition de travée/station et contrôle des chevauchements, bordures et capacité', () => {
  const initial = structuredClone(DEFAULT_LAYOUT)
  const added = editLayout(initial, 'rack', 2, 2)
  assert.equal(added.racks.length, initial.racks.length + 1)
  assert.equal(initial.racks.length, 32)
  assert.throws(() => editLayout(added, 'station', 4, 2), /chevauchent/)
  assert.throws(() => editLayout(added, 'rack', 4, 2), /chevauchent/)
  assert.throws(() => editLayout(initial, 'rack', 46, 2), /hors/)
  assert.throws(() => editLayout(initial, 'station', 3, 2), /paires/)
  assert.throws(() => editLayout(initial, 'erase', 3, 2), /paires/)
  const removed = editLayout(added, 'erase', 4, 2)
  assert.deepEqual(removed, initial)
  const station = editLayout(initial, 'station', 0, 0)
  assert.equal(station.stations.length, 5)
  assert.equal(createSim(1, 20, station).floor[0], 'station')
  const small = regularLayout(16, 16, 1, 2, 1, 1)
  assert.throws(() => createSim(1, 100, small), /baies/)
  for (const patch of [{ width: 17 }, { depth: 100 }, { levels: 0 }, { fill: 0 }, { racks: [] }, { stations: [] }]) {
    assert.throws(() => validateLayout({ ...initial, ...patch } as Layout), RangeError)
  }
  assert.throws(() => regularLayout(16, 16, 8, 20, 4, 1), /trop petit/)
})
