import test from 'node:test'
import assert from 'node:assert/strict'
import { aisleLayout, regularLayout, validateLayout, type Layout } from './layout.ts'
import { binPosition, createSim, robotPosition, step, type Phase, type State, onGround } from './sim.ts'
import { GEOMETRY } from './geometry.ts'

// Vérifier les tableaux complets, pas seulement les cellules pointées par les robots.
function assertState(s: State): void {
  const occupied = Array(s.floor.length).fill(-1), reserved = Array(s.floor.length).fill(-1)
  const carriers = new Set<number>(), slots = new Set<string>()
  for (const r of s.robots) {
    const cell = r.z * s.width + r.x
    assert.ok(Number.isInteger(r.x) && r.x >= 0 && r.x < s.width)
    assert.ok(Number.isInteger(r.z) && r.z >= 0 && r.z < s.depth)
    assert.ok(Number.isInteger(r.level) && r.level >= 0 && r.level <= s.levels)
    assert.notEqual(s.floor[cell], 'blocked')
    // Un robot en hauteur a libéré sa cellule au sol (passage dessous possible).
    if (onGround(s, r)) { assert.equal(occupied[cell], -1, 'collision'); occupied[cell] = r.id }
    if (r.column !== -1) assert.equal(s.columns[r.column].owner, r.id)
    if (r.level > 0) assert.equal(s.columns[r.column].cell, cell, 'vertical hors colonne')
    let previous = cell
    for (let i = r.pathIndex; i < r.pathLength; i++) {
      const next = r.path[i]
      assert.ok(Number.isInteger(next) && next >= 0 && next < s.floor.length)
      assert.equal(Math.abs(next % s.width - previous % s.width) +
        Math.abs(Math.floor(next / s.width) - Math.floor(previous / s.width)), 1, 'trajet non adjacent')
      assert.equal(reserved[next], -1, 'réservation double')
      assert.equal(s.occupied[next], -1, 'trajet occupé')
      assert.notEqual(s.floor[next], 'blocked')
      if (i < r.pathLength - 1) assert.ok(s.floor[next] === 'lane' || s.floor[next] === 'column', 'transit hors voie')
      reserved[next] = r.id; previous = next
    }
  }
  assert.deepEqual(s.occupied, occupied, 'occupation résiduelle')
  assert.deepEqual(s.reserved, reserved, 'réservation résiduelle')
  for (const [id, column] of s.columns.entries()) {
    if (column.owner !== -1) assert.equal(s.robots[column.owner].column, id)
  }
  for (const [id, b] of s.bins.entries()) {
    assert.equal(b.id, id)
    assert.ok(b.column >= 0 && b.column < s.columns.length && b.level >= 1 && b.level <= s.levels)
    const slot = `${b.column}:${b.level}:${b.side}`
    assert.ok(!slots.has(slot), 'emplacement de bac dupliqué'); slots.add(slot)
    if (b.reservedBy !== -1) assert.equal(s.robots[b.reservedBy].bin, id)
    if (b.carrier !== -1) {
      assert.ok(!carriers.has(b.carrier), 'deux bacs sur un robot'); carriers.add(b.carrier)
      assert.equal(b.reservedBy, b.carrier)
      assert.equal(s.robots[b.carrier].bin, id)
    }
  }
}

const edge: Layout = { ...regularLayout(16, 16, 1, 1, 8, 1, 1),
  racks: [{ x: 12, z: 12 }], stations: [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 0, z: 14 }, { x: 14, z: 14 }] }
const cases = [
  { name: 'un bac, toutes les baies occupées', seed: 0, plan: regularLayout(16, 16, 1, 1, 1, 1), count: 61 },
  { name: 'stock en bordure, huit niveaux, stations aux coins', seed: 0xffffffff, plan: edge, count: 12 },
  { name: 'stock rare près des stations', seed: 42, plan: regularLayout(24, 20, 4, 6, 3, 3, 1, 'near-station'), count: 40 },
  { name: 'stock partiel aléatoire', seed: 123456789, plan: regularLayout(32, 24, 5, 7, 2, 4, 37), count: 20 },
  { name: 'classique dense, toutes les baies occupées', seed: 0, plan: aisleLayout({ width: 48, depth: 32, levels: 4, block: 12, aisle: 1, cross: 0, front: 0, stations: 4, sides: 1, fill: 100, storage: 'random', generation: 'classic' }), count: 72 },
  { name: 'classique, transversales et deux côtés', seed: 0xffffffff, plan: aisleLayout({ width: 24, depth: 20, levels: 3, block: 2, aisle: 3, cross: 2, front: 2, stations: 3, sides: 2, fill: 37, storage: 'random', generation: 'classic' }), count: 20 },
  { name: 'classique, huit niveaux et stock rare', seed: 42, plan: regularLayout(16, 16, 1, 1, 8, 1, 1, 'near-station', 'classic'), count: 12 },
]

for (const { name, seed, plan, count } of cases) test(`invariants sur deux cycles : ${name}`, () => {
  assert.ok(count <= validateLayout(plan))
  const s = createSim(seed, count, plan), out = { x: 0, y: 0, z: 0 }
  const robots = s.robots.map((r) => { const p = { ...out }; robotPosition(s, r, p); return p })
  const bins = s.bins.map((b) => { const p = { ...out }; binPosition(s, b, p); return p })
  for (let tick = 0; tick < 100000 && !s.robots.every((r) => r.returns >= 2); tick++) {
    step(s); assertState(s)
    for (const r of s.robots) {
      robotPosition(s, r, out)
      assert.ok(Math.hypot(out.x - robots[r.id].x, out.y - robots[r.id].y, out.z - robots[r.id].z) <= .2 + 1e-9)
      Object.assign(robots[r.id], out)
    }
    for (const b of s.bins) {
      binPosition(s, b, out)
      assert.ok(Math.hypot(out.x - bins[b.id].x, out.y - bins[b.id].y, out.z - bins[b.id].z) <= .2 + 1e-9)
      assert.ok(out.y >= GEOMETRY.robotCenterY + GEOMETRY.carriedBinOffsetY - 1e-9)
      Object.assign(bins[b.id], out)
    }
  }
  assert.ok(s.robots.every((r) => r.returns >= 2), 'robot sans deux cycles complets')
})

test('reprise JSON pendant chaque phase observée, y compris les replis', () => {
  const s = createSim(0, 20, regularLayout(16, 16, 2, 3, 2, 1, 25))
  const phases = new Set<Phase>()
  for (let tick = 0; tick < 15000 && phases.size < 16; tick++) {
    for (const r of s.robots) if (!phases.has(r.phase)) {
      const first = JSON.parse(JSON.stringify(s)) as State, second = structuredClone(s)
      for (let i = 0; i < 50; i++) { step(first); step(second); assertState(first) }
      assert.deepEqual(first, second, `reprise différente en phase ${r.phase}`)
      phases.add(r.phase)
    }
    step(s)
  }
  assert.deepEqual([...phases].sort(), ['idle', 'toRack', 'engageTake', 'upTake', 'take', 'downTake',
    'bufferToStation', 'toStation', 'service', 'bufferToReturn', 'toReturn', 'engagePut', 'upPut', 'put', 'downPut', 'home'].sort())
})

test('l’ordre des équipements du plan ne change pas le run', () => {
  const plan = regularLayout(32, 24, 4, 6, 3, 3, 40)
  const first = createSim(0xffffffff, 12, plan)
  const second = createSim(0xffffffff, 12, { ...plan, racks: [...plan.racks].reverse(), stations: [...plan.stations].reverse() })
  for (let i = 0; i < 500; i++) { step(first); step(second) }
  assert.deepEqual(first, second)
})
