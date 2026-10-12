import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIGURATION_KEY, loadConfiguration, loadPlans, PLANS_KEY, saveConfiguration, savePlans } from './preferences.ts'
import { DEFAULT_LAYOUT, PRESETS, type Configuration } from './sim/layout.ts'

function storage(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  const fake = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) } }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return { values, fake }
}

test('sans sauvegarde : configuration par défaut valide et aucun écrit', (t) => {
  const { values } = storage(t), result = loadConfiguration()
  assert.deepEqual(result, { configuration: { version: 1, seed: 1, count: 20, layout: DEFAULT_LAYOUT }, warning: '' })
  assert.equal(values.size, 0)
})

test('sauvegarde puis lecture : graine, flotte, plan et copies indépendantes', (t) => {
  storage(t)
  const configuration: Configuration = { version: 1, seed: 0xffffffff, count: 37, layout: structuredClone(PRESETS.large) }
  assert.equal(saveConfiguration(configuration), '')
  const first = loadConfiguration()
  assert.equal(first.warning, '')
  assert.deepEqual(first.configuration, configuration)
  configuration.layout.racks[0].x = 100
  first.configuration.layout.stations[0].x = 100
  assert.notEqual(loadConfiguration().configuration.layout.racks[0].x, 100)
  assert.notEqual(loadConfiguration().configuration.layout.stations[0].x, 100)
})

test('sauvegardes invalides et lecture refusée : repli sans écrasement', (t) => {
  const { values, fake } = storage(t)
  for (const data of ['{invalid', '{"version":2}', 'null', JSON.stringify({ version: 1, seed: 1, count: 301, layout: PRESETS.dense })]) {
    values.set(CONFIGURATION_KEY, data)
    const result = loadConfiguration()
    assert.match(result.warning, /illisible/)
    assert.deepEqual(result.configuration, { version: 1, seed: 1, count: 20, layout: DEFAULT_LAYOUT })
    assert.equal(values.get(CONFIGURATION_KEY), data)
  }
  fake.getItem = () => { throw new Error('SecurityError') }
  assert.match(loadConfiguration().warning, /inaccessible/)
})

test('écriture refusée ou configuration invalide : avertissement sans perte de la sauvegarde', (t) => {
  const { values, fake } = storage(t)
  const valid: Configuration = { version: 1, seed: 0, count: 20, layout: DEFAULT_LAYOUT }
  assert.equal(saveConfiguration(valid), '')
  const saved = values.get(CONFIGURATION_KEY)
  assert.match(saveConfiguration({ ...valid, count: 0 }), /échoué/)
  assert.equal(values.get(CONFIGURATION_KEY), saved)
  fake.setItem = () => { throw new Error('QuotaExceededError') }
  assert.match(saveConfiguration({ ...valid, count: 100 }), /échoué/)
  assert.equal(values.get(CONFIGURATION_KEY), saved)
})

test('plans nommés : aller-retour, entrées invalides ignorées, stockage refusé', (t) => {
  const { values, fake } = storage(t)
  assert.deepEqual(loadPlans(), { plans: [], warning: '' })
  const plans = [{ name: 'A', layout: structuredClone(PRESETS.dense) }, { name: 'B', layout: structuredClone(DEFAULT_LAYOUT) }]
  assert.equal(savePlans(plans), '')
  assert.deepEqual(loadPlans(), { plans, warning: '' })
  values.set(PLANS_KEY, JSON.stringify([...plans, { name: 'A', layout: DEFAULT_LAYOUT }, { name: 'C', layout: { width: 3 } }, { name: '', layout: DEFAULT_LAYOUT }]))
  const partial = loadPlans()
  assert.deepEqual(partial.plans.map((p) => p.name), ['A', 'B'])
  assert.match(partial.warning, /illisibles/)
  values.set(PLANS_KEY, '{oops')
  assert.deepEqual(loadPlans().plans, [])
  fake.setItem = () => { throw new Error('quota') }
  assert.match(savePlans(plans), /échoué/)
  assert.equal(values.get(PLANS_KEY), '{oops', 'sauvegarde existante écrasée')
  assert.throws(() => JSON.parse(values.get(PLANS_KEY)!))
})
