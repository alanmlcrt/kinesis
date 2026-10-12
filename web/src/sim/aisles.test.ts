import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aisleLayout, layoutMetrics, type AisleSpec } from './layout.ts'
import { createSim, step } from './sim.ts'

const base: AisleSpec = { width: 48, depth: 32, levels: 4, block: 2, aisle: 3, cross: 0, front: 2, stations: 4, sides: 1, fill: 100, storage: 'random' }

test('implantation par allées : géométrie des rangées, allées transversales, stations', () => {
  const dense = aisleLayout({ ...base, block: 12, aisle: 1, front: 0 })
  assert.deepEqual([...new Set(dense.racks.map((r) => r.x))], [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42])
  // Blocs de 2 rangées : pas de 4 dans le bloc, 3 + allée entre blocs.
  assert.deepEqual([...new Set(aisleLayout(base).racks.map((r) => r.x))], [2, 6, 12, 16, 22, 26, 32, 36, 42])
  const crossed = aisleLayout({ ...base, cross: 3 })
  const zs = [...new Set(crossed.racks.map((r) => r.z))]
  assert.deepEqual(zs.slice(0, 6), [2, 3, 4, 6, 7, 8], 'une position libre toutes les 3 travées')
  assert.ok(Math.max(...aisleLayout(base).racks.map((r) => r.z)) <= 32 - 4 - 2, 'allée devant les stations')
  const two = aisleLayout({ ...base, sides: 2, stations: 5, front: 4 })
  assert.deepEqual(two.stations.map((s) => s.z).sort(), [0, 0, 30, 30, 30])
  assert.equal(Math.min(...two.racks.map((r) => r.z)), 6)
})

test('mesures : emplacements, sol libre, flotte possible', () => {
  const l = aisleLayout({ ...base, block: 12, aisle: 1, front: 0 }), m = layoutMetrics(l)
  assert.equal(l.racks.length, 11 * 27, 'rangées continues')
  assert.equal(m.slots, 11 * 27 * 4)
  assert.equal(m.area, 48 * 32)
  assert.equal(m.freeShare, 1 - 2 * 297 / 1536)
  // Plus d'allées : moins d'emplacements, plus de sol libre.
  const sparse = layoutMetrics(aisleLayout({ ...base, block: 1, aisle: 9 }))
  assert.ok(sparse.slots < m.slots && sparse.freeShare > m.freeShare && sparse.fleet > m.fleet)
})

test('réglages refusés', () => {
  for (const bad of [{ block: 0 }, { block: 13 }, { aisle: 2 }, { aisle: 11 }, { cross: -1 }, { cross: 25 }, { front: 3 }, { front: 10 },
    { sides: 3 }, { stations: 0 }, { sides: 2, stations: 1 }, { stations: 13 }, { width: 47 }, { width: 80, depth: 64, block: 12, aisle: 1, front: 0 }]) {
    assert.throws(() => aisleLayout({ ...base, ...bad } as AisleSpec), RangeError, JSON.stringify(bad))
  }
})

// Chaque colonne et chaque station joignables depuis une station par les voies, puis cycles complets.
for (const spec of [{ block: 12, aisle: 1, front: 0 }, { block: 3, aisle: 1, cross: 4, front: 0 }, { block: 2, aisle: 5, sides: 2, stations: 6, front: 2 }] as Partial<AisleSpec>[]) {
  test(`plan par allées ${JSON.stringify(spec)} : accès et cycles`, () => {
    const layout = aisleLayout({ ...base, ...spec }), fleet = Math.min(60, layoutMetrics(layout).fleet)
    const s = createSim(3, fleet, layout)
    const seen = new Set([s.stations[0]]), queue = [s.stations[0]]
    while (queue.length) {
      const c = queue.pop()!, x = c % s.width
      for (const n of [x + 1 < s.width ? c + 1 : -1, x > 0 ? c - 1 : -1, c + s.width < s.floor.length ? c + s.width : -1, c - s.width]) {
        if (n < 0 || seen.has(n) || s.floor[n] === 'blocked') continue
        seen.add(n)
        if (s.floor[n] === 'lane') queue.push(n) // on ne traverse que les voies, comme le moteur
      }
    }
    for (const col of s.columns) assert.ok(seen.has(col.cell), `colonne ${col.cell} inaccessible`)
    for (const st of s.stations) assert.ok(seen.has(st), `station ${st} inaccessible`)
    for (let i = 0; i < 20000 && s.robots.some((r) => r.returns < 1); i++) step(s)
    assert.ok(s.robots.every((r) => r.returns >= 1), 'un robot n’a pas fini son cycle')
  })
}
