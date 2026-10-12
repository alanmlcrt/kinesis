import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAYOUT, editLayout, floorNeighbors, layoutFloor, layoutMetrics, parseLayout, regularLayout, withProfile } from './layout.ts'
import { binPosition, createSim, robotPosition, step, type State, onGround } from './sim.ts'
import { DEFAULT_CONTROL, moveSteps, nodeOf } from './control.ts'
import { runReplication, validateCampaign } from './campaign.ts'

const base = regularLayout(16, 16, 2, 3, 3, 2)
const point = () => ({ x: 0, y: 0, z: 0 })
function invariant(s: State) {
  const nodes = new Set<number>(), carriers = new Set<number>()
  for (const r of s.robots) {
    const node = nodeOf(s, r)
    if (onGround(s, r)) { assert.ok(!nodes.has(node)); nodes.add(node); assert.equal(s.occupied[node], r.id) }
    else assert.equal(s.columns[r.column].owner, r.id)
    assert.notEqual(s.floor[node], 'blocked')
    if (r.pathIndex < r.pathLength) {
      const next = r.path[r.pathIndex]
      assert.ok(next === node || floorNeighbors(s.layout, node).includes(next))
      assert.ok(s.occupied[next] === -1 || s.occupied[next] === r.id)
      assert.ok(s.reserved[next] === -1 || s.reserved[next] === r.id)
      assert.ok(r.progress < moveSteps(s, node, next))
    }
    for (const lift of s.lifts) if (node % (s.width * s.depth) === lift.cell) assert.equal(lift.owner, r.id)
  }
  for (let n = 0; n < s.occupied.length; n++) if (s.occupied[n] !== -1) assert.equal(nodeOf(s, s.robots[s.occupied[n]]), n)
  for (const b of s.bins) {
    if (b.carrier !== -1) {
      assert.ok(!carriers.has(b.carrier)); carriers.add(b.carrier)
      assert.equal(s.robots[b.carrier].bin, b.id)
      assert.equal(b.reservedBy, b.carrier)
    }
    const p = point(); binPosition(s, b, p)
    assert.ok(Object.values(p).every(Number.isFinite))
  }
  if (s.layout.profile === 'autostore') {
    const ids: number[] = s.bins.filter((b) => b.carrier !== -1).map((b) => b.id)
    s.stacks.forEach((stack, column) => stack.forEach((id, i) => {
      const b = s.bins[id]; assert.equal(b.column, column); assert.equal(b.level, i + 1)
      assert.equal(b.carrier, -1); assert.equal(b.bufferBy, -1); ids.push(id)
    }))
    s.buffers.forEach((stack, owner) => {
      assert.ok(stack.length < s.levels)
      stack.forEach((id, i) => { const b = s.bins[id]; assert.equal(b.bufferBy, owner); assert.equal(b.bufferLevel, i + 1); assert.equal(b.carrier, -1); ids.push(id) })
    })
    assert.deepEqual(ids.sort((a, b) => a - b), s.bins.map((b) => b.id))
  }
  assert.equal(s.lost.reduce((a, b) => a + b, 0), s.lostSteps)
}

test('profils : plans indépendants, conservation JSON, validation et édition des gaines', () => {
  const lifts = withProfile(base, 'lifts'), auto = withProfile(lifts, 'autostore')
  assert.deepEqual(parseLayout(JSON.parse(JSON.stringify(lifts))), lifts)
  assert.equal(auto.generation, undefined); assert.equal(auto.lifts, undefined)
  assert.equal(layoutFloor(lifts).length, 4 * 256)
  assert.equal(layoutMetrics(auto).freeShare, 1 - 6 / 256)
  assert.equal(layoutMetrics(auto).slots, layoutMetrics(lifts).slots)
  assert.deepEqual(editLayout(editLayout(auto, 'rack', 4, 2), 'erase', 4, 2).racks, auto.racks, 'Effacer une pile ne retire pas sa voisine')
  const added = editLayout(lifts, 'lift', 0, 2)
  assert.equal(added.lifts!.length, 3); assert.equal(lifts.lifts!.length, 2)
  assert.equal(editLayout(added, 'erase', 0, 2).lifts!.length, 2)
  assert.throws(() => editLayout(auto, 'lift', 0, 2))
  for (const change of [{ lifts: [] }, { lifts: [base.racks[0]] }, { lifts: [lifts.lifts![0], lifts.lifts![0]] }, { liftSteps: 0 }, { liftSteps: 7 }, { liftSteps: 105 }, { generation: 'classic' }]) assert.throws(() => parseLayout({ ...lifts, ...change }))
  assert.throws(() => parseLayout({ ...auto, liftSteps: 15 }))
  assert.throws(() => parseLayout({ ...base, profile: 'other' }))
})

for (const profile of ['lifts', 'autostore'] as const) for (const method of ['whole', 'window'] as const) {
  test(`${profile}/${method} : deux cycles, exclusivité, bacs, positions et reprise déterministe`, () => {
    const s = createSim(3, 4, withProfile(base, profile), { ...DEFAULT_CONTROL, method, budget: 1000000 })
    const stacks = structuredClone(s.stacks), seen = new Set<string>()
    let lifted = false, dug = false
    const previous = s.robots.map((r) => { const p = point(); robotPosition(s, r, p); return p })
    for (let n = 0; n < 30000 && !s.robots.every((r) => r.returns >= 2); n++) {
      step(s); invariant(s)
      s.robots.forEach((r, i) => {
        const p = point(); robotPosition(s, r, p)
        assert.ok(Math.hypot(p.x - previous[i].x, p.y - previous[i].y, p.z - previous[i].z) <= .281)
        Object.assign(previous[i], p)
        lifted ||= r.level > 0 && profile === 'lifts'
        dug ||= r.job === 'dig' && r.dropBuffer
        if (!seen.has(r.phase)) {
          seen.add(r.phase)
          const copy = JSON.parse(JSON.stringify(s)) as State, copy2 = JSON.parse(JSON.stringify(s)) as State
          for (let j = 0; j < 15; j++) { step(copy); step(copy2) }
          assert.deepEqual(copy, copy2)
        }
      })
    }
    assert.ok(s.robots.every((r) => r.returns === 2 && r.phase === 'idle'), `${profile}/${method}: cycles incomplets à ${s.tick}`)
    assert.ok(s.lifts.every((l) => l.owner === -1))
    if (profile === 'lifts') assert.ok(lifted)
    else { assert.ok(dug); assert.deepEqual(s.stacks, stacks); assert.ok(s.buffers.every((b) => !b.length)); assert.ok(s.bins.every((b) => b.reservedBy === -1)) }
    assert.ok(s.freeSteps > 0)
  })
}

test('AutoStore : extraction profonde avant service, un seul bac animé, remplissage sans trous', () => {
  const s = createSim(1, 1, withProfile({ ...base, levels: 8 }, 'autostore'))
  let depth = 0, takeSeen = false
  for (let n = 0; n < 30000 && !s.robots[0].returns; n++) {
    const r = s.robots[0]
    if (r.phase === 'take' && r.progress > 0 && r.job === 'dig') {
      takeSeen = true
      const target = s.bins[r.targetBin], p = point(); binPosition(s, target, p)
      assert.equal(p.y, .25)
      assert.equal(r.visits, 0)
    }
    depth = Math.max(depth, s.buffers[0].length)
    step(s); invariant(s)
  }
  assert.equal(depth, 7); assert.ok(takeSeen); assert.equal(s.robots[0].returns, 1)
  for (const fill of [1, 33, 99]) {
    const a = createSim(7, 2, withProfile({ ...base, fill }, 'autostore'))
    const b = createSim(7, 2, withProfile({ ...base, fill }, 'autostore'))
    assert.deepEqual(a, b); invariant(a)
    for (let i = 0; i < 6000; i++) { step(a); invariant(a) }
    assert.ok(a.robots.every((r) => r.returns > 0))
  }
})

test('ascenseurs : accès indépendants aux bacs de la même colonne sur deux étages', () => {
  const s = createSim(3, 2, withProfile(base, 'lifts'))
  step(s); step(s)
  assert.ok(s.robots.every((r) => r.phase === 'toRack'))
  assert.equal(s.bins[s.robots[0].bin].column, s.bins[s.robots[1].bin].column)
  assert.notEqual(s.robots[0].goal, s.robots[1].goal)
  assert.notEqual(s.bins[s.robots[0].bin].level, s.bins[s.robots[1].bin].level)
  for (let i = 0; i < 5000 && !s.robots.every((r) => r.returns); i++) { step(s); invariant(s) }
  assert.ok(s.robots.every((r) => r.returns > 0))
})

test('ascenseurs : vitesse verticale, gaine unique lente et horizon refusé', () => {
  const plan = withProfile({ ...base, levels: 8 }, 'lifts', [{ x: 0, z: 0 }], 100)
  const s = createSim(7, 2, plan)
  for (let i = 0; i < 30000 && !s.robots.every((r) => r.returns > 0); i++) { step(s); invariant(s) }
  assert.ok(s.robots.every((r) => r.returns > 0))
  assert.throws(() => createSim(7, 2, plan, { ...DEFAULT_CONTROL, method: 'window', horizon: 2 }), /Horizon/)
  assert.throws(() => validateCampaign({ configurations: [{ name: 'L', layout: plan, control: { ...DEFAULT_CONTROL, method: 'window' } }], base: null, fleets: [2], replications: 2, seconds: 800, seed: 3 }), /Horizon/)
})

test('profils à 300 robots : sécurité, conservation et budgets', () => {
  for (const profile of ['lifts', 'autostore'] as const) {
    const s = createSim(1, 300, withProfile(DEFAULT_LAYOUT, profile))
    for (let i = 0; i < 5000; i++) { step(s); invariant(s) }
    assert.ok(s.robots.some((r) => r.visits > 0))
    assert.ok(s.controlStats.operations <= s.controlStats.searches * s.control.budget)
  }
})

test('campagnes : trois profils, bases explicites et réplications déterministes', () => {
  const configurations = (['skypod', 'lifts', 'autostore'] as const).map((profile) => ({ name: profile, layout: withProfile(base, profile) }))
  const p = { configurations, base: 'capacity' as const, fleets: [2], replications: 2, seconds: 800, seed: 3 }
  validateCampaign(p); validateCampaign({ ...p, base: 'footprint' })
  assert.throws(() => validateCampaign({ ...p, base: null }))
  for (const c of configurations) assert.deepEqual(runReplication(c.layout, 2, 3, 800), runReplication(c.layout, 2, 3, 800))
})
