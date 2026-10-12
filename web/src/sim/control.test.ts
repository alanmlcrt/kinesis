import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONTROL, route, validateControl } from './control.ts'
import { createSim, robotPosition, step, type State, onGround } from './sim.ts'
import { regularLayout, DEFAULT_LAYOUT, PRESETS } from './layout.ts'
import { runReplication, validateCampaign } from './campaign.ts'

const windowControl = { ...DEFAULT_CONTROL, method: 'window' as const }

function invariant(s: State): void {
  const cells = new Set<number>(), reserved = Array(s.floor.length).fill(-1)
  for (const r of s.robots) {
    const c = r.z * s.width + r.x
    // Un robot en hauteur a libéré sa cellule au sol ; il possède sa colonne.
    if (onGround(s, r)) { assert.ok(!cells.has(c), 'collision'); cells.add(c); assert.equal(s.occupied[c], r.id) }
    else assert.equal(s.columns[r.column].owner, r.id)
    assert.notEqual(s.floor[c], 'blocked')
    if (r.level) assert.equal(s.columns[r.column].cell, c)
    if (r.column !== -1) assert.equal(s.columns[r.column].owner, r.id)
    let previous = c
    for (let i = r.pathIndex; i < r.pathLength; i++) {
      const next = r.path[i]
      assert.ok(Math.abs(next % s.width - previous % s.width) + Math.abs(Math.floor(next / s.width) - Math.floor(previous / s.width)) <= 1)
      assert.notEqual(s.floor[next], 'blocked'); previous = next
    }
    if (r.pathIndex < r.pathLength && r.path[r.pathIndex] !== c) {
      const next = r.path[r.pathIndex]
      assert.equal(reserved[next], -1); assert.equal(s.occupied[next], -1)
      reserved[next] = r.id
    }
  }
  assert.equal(s.occupied.filter((id) => id !== -1).length, s.robots.filter((r) => onGround(s, r)).length)
  assert.deepEqual(s.reserved, reserved)
  assert.equal(s.lost.reduce((a, b) => a + b, 0), s.lostSteps)
  for (const b of s.bins) if (b.carrier !== -1) {
    assert.equal(s.robots[b.carrier].bin, b.id); assert.equal(b.reservedBy, b.carrier)
  }
}

test('pilotage : paramètres refusés à la frontière de simulation et de campagne', () => {
  for (const bad of [{ method: 'bad' }, { horizon: 0 }, { horizon: 33 }, { horizon: NaN }, { budget: 99 }, { budget: 1e6 + 1 }, { budget: 1.5 }]) {
    const control = { ...DEFAULT_CONTROL, ...bad } as typeof DEFAULT_CONTROL
    assert.throws(() => validateControl(control), /Pilotage/)
    assert.throws(() => createSim(1, 2, DEFAULT_LAYOUT, control), /Pilotage/)
    assert.throws(() => validateCampaign({ configurations: [{ name: 'Test', layout: DEFAULT_LAYOUT, control }], base: null, fleets: [2], replications: 2, seconds: 400, seed: 1 }), /Pilotage/)
  }
})

for (const generation of ['2025+', 'classic'] as const) test(`fenêtre ${generation} : deux cycles, continuité, réservations, déterminisme et reprise`, () => {
  const layout = regularLayout(16, 16, 2, 3, 2, 2, 100, 'random', generation)
  // Rangées décalées du bord : un mur classique continu contre le couloir de bordure
  // bloque la fenêtre (aucune garantie de progrès, limite documentée dans VALIDATION.md).
  const s = createSim(3, 4, layout, windowControl), copy = createSim(3, 4, layout, windowControl)
  const positions = s.robots.map((r) => { const out = { x: 0, y: 0, z: 0 }; robotPosition(s, r, out); return out })
  const phases = new Set<string>()
  for (let i = 0; i < 8000 && !s.robots.every((r) => r.returns >= 2); i++) {
    step(s); step(copy); invariant(s); assert.deepEqual(s, copy)
    for (const r of s.robots) {
      const out = { x: 0, y: 0, z: 0 }; robotPosition(s, r, out)
      assert.ok(Math.hypot(out.x - positions[r.id].x, out.y - positions[r.id].y, out.z - positions[r.id].z) <= .2 + 1e-9)
      positions[r.id] = out
      if (!phases.has(r.phase)) {
        phases.add(r.phase)
        const a = JSON.parse(JSON.stringify(s)) as State, b = structuredClone(s)
        for (let t = 0; t < 10; t++) { step(a); step(b); invariant(a) }
        assert.deepEqual(a, b)
      }
    }
  }
  assert.ok(s.robots.every((r) => r.returns >= 2))
  assert.ok(phases.has('upTake') && phases.has('put') && phases.has('service'))
  assert.ok(s.controlStats.searches > 4 && s.controlStats.operations > 0)
})

test('budget épuisé : attente sûre et reproductible, pas de réservation résiduelle', () => {
  for (const method of ['whole', 'window'] as const) {
    const s = createSim(0, 20, PRESETS.large, { ...windowControl, method, budget: 100 })
    for (let i = 0; i < 100; i++) step(s)
    assert.equal(s.controlStats.operations, s.controlStats.searches * 100)
    assert.equal(s.controlStats.exhausted, s.controlStats.searches)
    assert.ok(s.robots.every((r) => r.pathLength === 0))
    assert.ok(s.reserved.every((id) => id === -1))
    assert.ok(s.lostSteps > 0)
  }
  const s = createSim(1, 1, regularLayout(16, 16, 2, 3, 2, 2), { ...windowControl, budget: 1000 })
  step(s)
  assert.equal(s.controlStats.exhausted, 1)
  assert.ok(s.robots[0].pathLength > 0, 'préfixe sûr conservé malgré épuisement')
  for (let i = 0; i < 100; i++) { step(s); invariant(s) }
  assert.ok(s.controlStats.operations <= s.controlStats.searches * 1000)
})

test('attente planifiée sur une colonne : verrou conservé et temps perdu compté une fois', () => {
  const s = createSim(1, 1, DEFAULT_LAYOUT, windowControl), r = s.robots[0], col = s.columns[0]
  s.occupied[r.home] = -1
  Object.assign(r, { x: col.cell % s.width, z: Math.floor(col.cell / s.width), column: 0, bin: 0,
    goal: col.cell, phase: 'toRack', pathLength: 1, pathIndex: 0, legFrom: col.cell })
  r.path[0] = col.cell; s.occupied[col.cell] = r.id; col.owner = r.id; s.bins[0].reservedBy = r.id
  for (let i = 0; i < 5; i++) { step(s); invariant(s); assert.equal(col.owner, r.id) }
  assert.equal(r.phase, 'engageTake')
  assert.equal(s.lostSteps, 5)
  assert.equal(r.legMoved, 0)
})

test('horizons aux bornes : trajectoires bornées et reprise sans conflit', () => {
  for (const horizon of [2, 32]) {
    const s = createSim(7, 20, DEFAULT_LAYOUT, { ...windowControl, horizon })
    for (let t = 0; t < 200; t++) {
      step(s); invariant(s)
      assert.ok(s.robots.every((r) => r.pathLength <= horizon))
    }
    assert.ok(s.controlStats.operations <= s.controlStats.searches * s.control.budget)
  }
})

test('fenêtre : un transit engagé libère sa source dans le futur, face-à-face refusé', () => {
  const s = createSim(1, 2, DEFAULT_LAYOUT, windowControl)
  // Couloir de test : deux robots, second engagé vers la droite, départ du premier en dessous.
  s.floor.fill('blocked'); s.occupied.fill(-1); s.reserved.fill(-1)
  for (const c of [10, 11, 12, 13, 14, 58]) s.floor[c] = 'lane'
  const [a, b] = s.robots
  Object.assign(a, { x: 10, z: 1, home: 58, goal: 58 })
  Object.assign(b, { x: 10, z: 0, home: 10, goal: 14 })
  s.occupied[58] = a.id; s.occupied[10] = b.id
  b.path[0] = 11; b.path[1] = 12; b.path[2] = 13; b.path[3] = 14
  b.pathLength = 4; b.phase = 'home'; s.reserved[11] = b.id
  assert.equal(route(s, a, 12, 'home'), true)
  assert.equal(a.path[0], 58, 'attente temporelle nécessaire')
  assert.ok(a.path.slice(0, a.pathLength).includes(10), 'source future traversable')
  for (let i = 0; i < 15; i++) { step(s); invariant(s) }
  assert.ok(a.legMoved > 0)
})

test('campagne : séries et opérations identiques au moteur, méthodes actuelles conservées', () => {
  const layout = regularLayout(16, 16, 2, 3, 2, 2)
  const result = runReplication(layout, 4, 3, 400, 1, windowControl), s = createSim(3, 4, layout, windowControl)
  for (let i = 0; i < 4000; i++) step(s)
  assert.deepEqual(result.controlStats, s.controlStats)
  assert.equal(result.served.reduce((a, b) => a + b, 0), s.robots.reduce((a, r) => a + r.visits, 0))
  assert.equal(result.lost.reduce((a, b) => a + b, 0), s.lostSteps)
  const whole = runReplication(layout, 4, 3, 400, 0, DEFAULT_CONTROL)
  const old = runReplication(layout, 4, 3, 400)
  const { controlStats, ...series } = whole
  assert.deepEqual(series, old)
  assert.ok(controlStats!.operations > 0)
})

test('fenêtre : flotte de 300 robots, réservations et occupations sûres', () => {
  const s = createSim(0xffffffff, 300, DEFAULT_LAYOUT, windowControl)
  for (let i = 0; i < 300; i++) { step(s); invariant(s) }
})
