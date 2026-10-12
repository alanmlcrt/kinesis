import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSim, step } from './sim.ts'
import { withProfile, DEFAULT_LAYOUT } from './layout.ts'

test('durée cumulée des cycles : frontières exactes, trois profils, reprise et déterminisme', () => {
  for (const profile of ['skypod', 'lifts', 'autostore'] as const) {
    const s = createSim(1, 1, withProfile(DEFAULT_LAYOUT, profile))
    let completed = 0, last = 0
    for (let i = 0; i < 20000 && completed < 2; i++) {
      step(s)
      const r = s.robots[0]
      if (r.returns > completed) {
        assert.equal(r.returns, completed + 1)
        assert.equal(r.cycleSteps, s.tick)
        assert.equal(r.cycleStart, s.tick)
        assert.ok(r.cycleSteps > last)
        last = r.cycleSteps; completed++
      }
    }
    assert.equal(completed, 2, profile)
    const restored = JSON.parse(JSON.stringify(s)), twin = createSim(1, 1, withProfile(DEFAULT_LAYOUT, profile))
    for (let i = 0; i < s.tick; i++) step(twin)
    assert.deepEqual(twin, s)
    for (let i = 0; i < 500; i++) { step(s); step(restored) }
    assert.deepEqual(restored, s)
  }
})
