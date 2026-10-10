import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSim, step, type State } from './sim.ts'

// Arrivée à la station : nombre de pas écoulés à cet instant.
function untilService(s: State): number {
  while (s.robots[0].phase !== 'service') step(s)
  return s.tick
}

// Un même robot seul, avec et sans obstruction forcée : temps perdu = durée réelle − durée libre.
for (const [name, blockHome] of [['attente sur place', true], ['repli par la baie', false]] as const) {
  test(`temps perdu d'un trajet bloqué (${name})`, () => {
    const free = createSim(3, 1), blocked = createSim(3, 1)
    while (blocked.robots[0].phase !== 'bufferToStation') { step(free); step(blocked) }
    const r = blocked.robots[0], column = r.z * blocked.width + r.x
    blocked.reserved[r.station] = 99
    if (blockHome) blocked.reserved[r.home] = 99
    for (let i = 0; i < 40; i++) step(blocked)
    blocked.reserved[r.station] = -1
    blocked.reserved[r.home] = -1
    const expected = untilService(blocked) - untilService(free)
    assert.equal(free.lostSteps, 0, 'un robot seul ne perd rien')
    assert.ok(expected > 0)
    assert.equal(blocked.lostSteps, expected)
    // Détour imputé à la case de départ, attente à la case où le robot attend.
    if (blockHome) assert.equal(blocked.lost[column], expected)
    else {
      assert.ok(blocked.lost[column] > 0 && blocked.lost[r.home] > 0)
      assert.equal(blocked.lost[column] + blocked.lost[r.home], expected)
    }
    assert.equal(blocked.freeSteps, free.freeSteps)
  })
}

test('cumul par case = total, positif, attentes au sol uniquement dans ce modèle', () => {
  for (const count of [1, 300]) {
    const s = createSim(1, count), cells = s.width * s.depth
    for (let i = 0; i < 4000; i++) step(s)
    assert.equal(s.lost.reduce((a, v) => a + v, 0), s.lostSteps)
    assert.ok(s.lost.every((v) => v >= 0))
    // Les colonnes sont acquises avant la montée : aucune attente en hauteur.
    assert.ok(s.lost.slice(cells).every((v) => v === 0))
    assert.ok(s.freeSteps > 0)
    if (count === 1) assert.equal(s.lostSteps, 0)
    else assert.ok(s.lostSteps > 0, 'la flotte dense se gêne')
  }
})
