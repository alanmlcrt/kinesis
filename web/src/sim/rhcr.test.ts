import test from 'node:test'
import assert from 'node:assert/strict'
import { rollingWindow, type Graph } from './rhcr.ts'
import { createSim, step, type State, onGround } from './sim.ts'
import { DEFAULT_CONTROL, nodeOf, route } from './control.ts'
import { DEFAULT_LAYOUT, regularLayout, withProfile } from './layout.ts'
import { runReplication } from './campaign.ts'

const control = { ...DEFAULT_CONTROL, method: 'rhcr' as const }
function safety(s: State) {
  const nodes = s.robots.filter((r) => onGround(s, r)).map((r) => nodeOf(s, r))
  assert.equal(new Set(nodes).size, nodes.length)
  for (const r of s.robots) {
    const node = nodeOf(s, r)
    if (onGround(s, r)) assert.equal(s.occupied[node], r.id)
    if (r.pathIndex < r.pathLength && r.path[r.pathIndex] !== node) {
      assert.equal(s.reserved[r.path[r.pathIndex]], r.id)
      assert.equal(s.occupied[r.path[r.pathIndex]], -1)
    }
  }
  assert.equal(s.lost.reduce((a, b) => a + b, 0), s.lostSteps)
  assert.ok(s.controlStats.operations <= s.controlStats.searches * control.budget)
  for (const b of s.bins) if (b.carrier !== -1) assert.equal(s.robots[b.carrier].bin, b.id)
}

test('RHCR: window w executed for h only; synchronous conflicts, edge swaps, deterministic fallback', () => {
  const graph: Graph = [[1, 3], [0, 2, 4], [1, 5], [0, 4], [1, 3, 5], [2, 4]]
  const agents = [{ node: 0, goal: 2 }, { node: 2, goal: 0 }]
  let operations = 0
  for (let epoch = 0; epoch < 20 && agents.some((a) => a.node !== a.goal); epoch++) {
    const r = rollingWindow(graph, agents, 8, 1, 10000, epoch)
    assert.deepEqual(r, rollingWindow(graph, structuredClone(agents), 8, 1, 10000, epoch))
    assert.ok(r.paths.every((p) => p.length === 2))
    assert.notEqual(r.paths[0][1], r.paths[1][1])
    assert.ok(!(r.paths[0][0] === r.paths[1][1] && r.paths[1][0] === r.paths[0][1]))
    agents.forEach((a, i) => { a.node = r.paths[i][1] }); operations += r.operations
  }
  assert.ok(agents.every((a) => a.node === a.goal)); assert.ok(operations > 0)
  assert.throws(() => rollingWindow(graph, agents, 2, 3, 100), /Invalid/)
  assert.throws(() => rollingWindow(graph, [{ node: 0, goal: 2 }, { node: 0, goal: 3 }], 2, 1, 100), /Invalid/)
  const stalled = rollingWindow([[1], [0]], [{ node: 0, goal: 1 }, { node: 1, goal: 0 }], 2, 1, 100)
  assert.deepEqual(stalled.paths, [[0, 0], [1, 1]])
})

test('RHCR warehouse: tail discarded, goal retained, exhausted budget safe', () => {
  const s = createSim(3, 1, regularLayout(16, 16, 2, 3, 2, 2), control), r = s.robots[0]
  const goal = s.columns[0].cell
  assert.equal(route(s, r, goal, 'toRack'), true)
  assert.equal(r.pathLength, 1); assert.equal(r.goal, goal)
  const small = createSim(3, 20, DEFAULT_LAYOUT, { ...control, budget: 100 })
  for (let i = 0; i < 100; i++) { step(small); safety(small) }
  assert.ok(small.controlStats.exhausted > 0)
})

for (const profile of ['skypod', 'lifts', 'autostore'] as const) test(`RHCR ${profile}: cycles, conservation, determinism, JSON resume, campaign`, () => {
  const layout = withProfile(regularLayout(16, 16, 2, 3, 2, 2), profile)
  const s = createSim(3, 4, layout, control), copy = structuredClone(s)
  for (let t = 0; t < 20000 && !s.robots.every((r) => r.returns >= 2); t++) {
    step(s); step(copy); safety(s)
    if (t % 100 === 0) assert.deepEqual(s, copy)
  }
  assert.ok(s.robots.every((r) => r.returns >= 2), JSON.stringify(s.robots.map((r) => [r.phase, r.returns])))
  const a: State = JSON.parse(JSON.stringify(s))
  for (let t = 0; t < 200; t++) { step(s); step(a); safety(a) }
  assert.deepEqual(s, a)
  const rep = runReplication(layout, 4, 3, 400, 0, control), node = createSim(3, 4, layout, control)
  for (let t = 0; t < 4000; t++) step(node)
  assert.equal(rep.served.reduce((a, b) => a + b, 0), node.robots.reduce((a, r) => a + r.visits, 0))
  assert.deepEqual(rep.controlStats, node.controlStats)
})

test('RHCR: 300 robots safe across profiles; slow lift cannot be cut mid-edge', () => {
  for (const profile of ['skypod', 'lifts', 'autostore'] as const) {
    const layout = withProfile(DEFAULT_LAYOUT, profile)
    const s = createSim(1, 300, layout, control)
    for (let t = 0; t < 300; t++) { step(s); safety(s) }
  }
  const layout = { ...withProfile(DEFAULT_LAYOUT, 'lifts'), liftSteps: 100 }
  assert.throws(() => createSim(1, 1, layout, control), /Horizon/)
  const s = createSim(1, 1, layout, { ...control, horizon: 32 })
  for (let t = 0; t < 8000 && !s.robots[0].returns; t++) { step(s); safety(s) }
  assert.ok(s.robots[0].returns)
})
