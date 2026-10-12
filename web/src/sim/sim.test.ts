import { test } from 'node:test'
import assert from 'node:assert/strict'
import { binPosition, createSim, DT, LEVEL_HEIGHT, robotPosition, step, type State, onGround } from './sim.ts'

function run(seed: number, count: number, ticks: number): State {
  const s = createSim(seed, count)
  for (let i = 0; i < ticks; i++) step(s)
  return s
}

test('déterminisme pas à pas et variation des graines', () => {
  const a = createSim(42), b = createSim(42)
  for (let i = 0; i < 1000; i++) {
    step(a); step(b)
    assert.deepEqual(a, b)
  }
  assert.notDeepEqual(run(1, 20, 1000).robots, run(2, 20, 1000).robots)
})

for (const count of [20, 100, 300]) test(`${count} robots : aucun conflit au sol ou en colonne, réservations libérées`, () => {
  const out = { x: 0, y: 0, z: 0 }
  for (const seed of [1, 7]) {
    const s = createSim(seed, count)
    const previous = s.robots.map((r) => ({ x: r.x, y: 0.2, z: r.z }))
    for (let tick = 0; tick < 5000; tick++) {
      step(s)
      const cells = new Set<number>(), expected = new Map<number, number>(), columns = new Set<number>()
      for (const r of s.robots) {
        const c = r.z * s.width + r.x
        assert.ok(c >= 0 && c < s.floor.length)
        assert.notEqual(s.floor[c], 'blocked')
        if (onGround(s, r)) {
          assert.ok(!cells.has(c), 'collision au sol ou à la base de colonne')
          cells.add(c)
          assert.equal(s.occupied[c], r.id)
        }
        robotPosition(s, r, out)
        assert.ok(Math.hypot(out.x - previous[r.id].x, out.y - previous[r.id].y, out.z - previous[r.id].z) <= 2 * DT + 1e-9, 'saut de position')
        Object.assign(previous[r.id], out)
        if (out.y > 0.2 + 1e-9) {
          assert.notEqual(r.column, -1, 'montée sans colonne')
          assert.equal(s.columns[r.column].cell, c, 'montée hors du chemin déclaré')
          assert.equal(s.columns[r.column].owner, r.id)
          assert.ok(!columns.has(r.column), 'deux robots dans une colonne')
          columns.add(r.column)
          assert.equal(out.x, r.x)
          assert.equal(out.z, r.z)
        }
        for (let i = r.pathIndex; i < r.pathLength; i++) {
          const next = r.path[i]
          assert.ok(!expected.has(next), 'réservation double')
          assert.equal(s.occupied[next], -1, 'destination occupée')
          assert.notEqual(s.floor[next], 'blocked')
          if (i < r.pathLength - 1) assert.ok(s.floor[next] === 'lane' || s.floor[next] === 'column', 'traversée d’une baie')
          expected.set(next, r.id)
        }
      }
      for (let c = 0; c < s.floor.length; c++) {
        assert.equal(s.reserved[c], expected.get(c) ?? -1, 'réservation oubliée')
        if (!cells.has(c)) assert.equal(s.occupied[c], -1, 'occupation oubliée')
      }
      for (let i = 0; i < s.columns.length; i++) {
        const owner = s.columns[i].owner
        if (owner !== -1) assert.equal(s.robots[owner].column, i)
      }
    }
    assert.ok(s.robots.some((r) => r.returns > 0), 'aucun cycle complet')
  }
})

test('prise et dépôt au bon niveau, conservation des bacs et passage sous racks', () => {
  const s = createSim(1)
  const out = { x: 0, y: 0, z: 0 }, previous = s.bins.map((b) => {
    const p = { x: 0, y: 0, z: 0 }; binPosition(s, b, p); return p
  })
  let takes = 0, puts = 0, underRack = false
  for (let tick = 0; tick < 15000; tick++) {
    const carriers = s.bins.map((b) => b.carrier)
    step(s)
    const carried = new Set<number>()
    for (const b of s.bins) {
      const handler = b.reservedBy === -1 ? undefined : s.robots[b.reservedBy]
      if (handler?.phase === 'take' || handler?.phase === 'put') {
        assert.equal(handler.level, b.level)
        assert.equal(handler.column, b.column)
        assert.equal(handler.z * s.width + handler.x, s.columns[b.column].cell)
      }
      if (b.carrier !== -1) {
        assert.ok(!carried.has(b.carrier), 'robot portant deux bacs')
        carried.add(b.carrier)
        assert.equal(s.robots[b.carrier].bin, b.id)
        assert.equal(b.reservedBy, b.carrier)
      }
      if (carriers[b.id] !== b.carrier) {
        const r = s.robots[b.carrier === -1 ? carriers[b.id] : b.carrier]
        assert.equal(r.level, b.level)
        assert.equal(r.column, b.column)
        assert.equal(r.phase, b.carrier === -1 ? 'downPut' : 'downTake')
        if (b.carrier === -1) puts++; else takes++
      }
      binPosition(s, b, out)
      assert.ok(Math.hypot(out.x - previous[b.id].x, out.y - previous[b.id].y, out.z - previous[b.id].z) <= 2 * DT + 1e-9, 'téléportation du bac')
      Object.assign(previous[b.id], out)
      assert.equal(out.y >= 0.65 - 1e-9, true)
    }
    for (const r of s.robots) {
      if (r.level === 0 && r.pathIndex < r.pathLength && r.z >= 7 && r.z <= 23 &&
          [5, 7, 15, 17, 25, 27, 35, 37].includes(r.x) && s.floor[r.z * s.width + r.x] === 'lane') underRack = true
    }
  }
  assert.ok(takes > 0 && puts > 0)
  assert.ok(underRack, 'aucun passage sous rack')
  assert.equal(s.bins.length, 512)
  assert.equal(new Set(s.bins.map((b) => b.id)).size, 512)
  assert.ok(s.robots.every((r) => r.returns > 0), 'un robot n’a jamais fini son cycle')
})

test('état sérialisable et reprise déterministe', () => {
  const s = run(7, 20, 300)
  const copy = JSON.parse(JSON.stringify(s)) as State
  for (let i = 0; i < 300; i++) { step(s); step(copy) }
  assert.deepEqual(s, copy)
})

test('100 et 300 robots finissent tous un cycle sans famine', () => {
  for (const count of [100, 300]) {
    const s = createSim(1, count)
    for (let i = 0; i < 60000 && !s.robots.every((r) => r.returns > 0); i++) step(s)
    assert.ok(s.robots.every((r) => r.returns > 0), 'robot bloqué ou jamais servi')
  }
})

test('validation des paramètres et dégagement sous le premier niveau', () => {
  for (const [seed, count] of [[1.5, 20], [1, 0], [1, 301], [1, 20.5]]) {
    assert.throws(() => createSim(seed, count), RangeError)
  }
  assert.ok(LEVEL_HEIGHT + 0.335 > 0.2 + 0.45 + 0.225, 'bac chargé trop haut pour passer sous la tablette')
})

test('trajets directs colonne-station-colonne sans détour imposé par la baie', () => {
  const s = createSim(1, 1)
  let outbound = false, inbound = false
  for (let tick = 0; tick < 5000 && s.robots[0].returns === 0; tick++) {
    const r = s.robots[0], previousPhase = r.phase
    step(s)
    if (previousPhase === 'bufferToStation' && r.phase === 'toStation' && r.pathLength > 0) {
      outbound = true; assert.equal(r.path[r.pathLength - 1], r.station)
      assert.ok(!r.path.slice(0, r.pathLength).includes(r.home))
    }
    if (previousPhase === 'bufferToReturn' && r.phase === 'toReturn' && r.pathLength > 0) {
      inbound = true; assert.equal(r.path[r.pathLength - 1], s.columns[s.bins[r.bin].column].cell)
      assert.ok(!r.path.slice(0, r.pathLength).includes(r.home))
    }
  }
  assert.ok(outbound && inbound)
  assert.equal(s.robots[0].returns, 1)
})
