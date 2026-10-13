import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyzeFleet, runReplication } from '../src/sim/campaign.ts'

export async function checkControl({ page, measure }) {
  const layout = await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout))
  const wasPaused = await page.getByRole('button', { name: 'Lecture', exact: true }).count() === 1
  if (wasPaused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  const dialog = page.locator('section[aria-labelledby="campaign-title"]')
  const open = () => page.locator('#tab-analyser').click()
  await open()
  await dialog.getByRole('checkbox', { name: 'Comparer trajet entier / fenêtre glissante' }).check()
  const fill = async (fields) => { for (const [name, value] of Object.entries(fields)) await dialog.locator(`[name="${name}"]`).fill(value) }
  await fill({ fleets: '2, 4', replications: '2', seconds: '800', seed: '3' })
  const start = () => dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).click()
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Choisir capacité ou emprise égale' }).waitFor()
  await dialog.getByRole('radio', { name: 'Emprise au sol égale', exact: true }).check()
  await dialog.getByRole('checkbox', { name: 'Compact · 8 rangées' }).check()
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Choisir un seul plan' }).waitFor()
  await dialog.getByRole('checkbox', { name: 'Compact · 8 rangées' }).uncheck()
  await fill({ 'control-horizon': '33' }); await start()
  await dialog.getByRole('alert').filter({ hasText: 'Pilotage' }).waitFor()
  await fill({ 'control-horizon': '8', seed: '' }); await start()
  await dialog.getByRole('alert').filter({ hasText: 'Remplir tous' }).waitFor()
  await fill({ seed: '3' })
  assert.equal(await dialog.getByRole('alert').count(), 0, 'erreur périmée après correction du champ')
  await page.screenshot({ path: fileURLToPath(new URL('./control-settings.png', import.meta.url)) })
  const live = new Set()
  const track = (w) => { if (w.url().includes('campaign.worker')) { live.add(w); w.on('close', () => live.delete(w)) } }
  page.on('worker', track)
  const stopped = async () => {
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="campaign-title"] progress'))
    const deadline = Date.now() + 10000
    while (live.size && Date.now() < deadline) await page.waitForTimeout(100)
    assert.equal(live.size, 0)
  }
  await fill({ seconds: '86400' }); await start()
  await page.waitForFunction(() => Number(document.querySelector('[aria-labelledby="campaign-title"] progress')?.value) >= 4, null, { timeout: 60000 })
  assert.equal(live.size, 1)
  const during = await measure(.5)
  assert.ok(during.p95 < 100, 'interface gelée pendant le calcul') // Analyser met la scène en pause
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click()
  await stopped()
  assert.equal(await dialog.getByRole('button', { name: /Exporter/ }).count(), 0)
  // Erreur du Worker récupérable : aucun résultat partiel et reprise possible.
  await page.evaluate(() => {
    window.originalWorker = window.Worker
    window.Worker = class extends window.originalWorker {
      constructor(...args) { super(...args); setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'Erreur de pilotage simulée' })), 50) }
    }
  })
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Erreur de pilotage simulée' }).waitFor()
  await stopped()
  await page.evaluate(() => { window.Worker = window.originalWorker; delete window.originalWorker })
  await fill({ seconds: '800' }); await start()
  await dialog.getByRole('heading', { name: 'Coût de calcul du pilotage' }).waitFor({ timeout: 60000 })
  await stopped()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Exporter/ }).click()])
  const data = JSON.parse(await readFile(await download.path(), 'utf8'))
  const p = data.manifeste.parametres, configs = p.configurations
  assert.equal(configs.length, 2)
  assert.deepEqual(configs[0].layout, configs[1].layout)
  assert.deepEqual(configs.map((c) => c.control.method), ['whole', 'window'])
  assert.equal(p.base, 'footprint')
  const timings = data.manifeste.pilotage.dureesReplications
  assert.equal(timings.length, 8)
  assert.ok(timings.every((r) => Number.isFinite(r.seconds) && r.seconds > 0))
  for (const r of data.replications) {
    assert.deepEqual(r, runReplication(configs[r.configuration].layout, r.fleet, r.seed, p.seconds, r.configuration, configs[r.configuration].control))
    assert.ok(r.controlStats.operations <= r.controlStats.searches * configs[r.configuration].control.budget)
    assert.equal(timings.filter((t) => t.configuration === r.configuration && t.fleet === r.fleet && t.seed === r.seed).length, 1)
  }
  for (const r of data.resultats) {
    assert.deepEqual(r, analyzeFleet(data.replications.filter((v) => v.configuration === r.configuration && v.fleet === r.fleet)))
    const row = dialog.locator('table').last().locator('tbody tr').nth(r.configuration * p.fleets.length + p.fleets.indexOf(r.fleet))
    const reps = data.replications.filter((v) => v.configuration === r.configuration && v.fleet === r.fleet)
    const total = reps.reduce((n, v) => n + v.controlStats.operations, 0)
    assert.equal((await row.locator('td').nth(1).innerText()).replace(/\s/g, ''), String(total))
  }
  const show = async () => dialog.evaluate((e) => {
    e.scrollTop = 0
    const body = e.querySelector('.campaign-body'), heading = [...body.querySelectorAll('h2')].find((h) => h.textContent === 'Coût de calcul du pilotage')
    body.scrollTop += heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 24
  })
  await show()
  await page.screenshot({ path: fileURLToPath(new URL('./control.png', import.meta.url)) })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
  await dialog.evaluate((e) => { e.scrollTop = 0; e.querySelector('.campaign-body').scrollTop = 0 })
  await page.screenshot({ path: fileURLToPath(new URL('./control-settings-mobile.png', import.meta.url)) })
  await show()
  await page.screenshot({ path: fileURLToPath(new URL('./control-mobile.png', import.meta.url)) })
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-simulation')
  await page.setViewportSize({ width: 1280, height: 800 })
  await open()
  await dialog.getByRole('checkbox', { name: 'Comparer trajet entier / fenêtre glissante' }).check()
  await dialog.getByRole('radio', { name: 'Capacité de stockage égale', exact: true }).check()
  await fill({ fleets: '2', replications: '2', seconds: '86400' })
  await dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Annuler')
  await page.keyboard.press('Escape')
  await stopped()
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-simulation')
  assert.equal(await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout)), layout)
  // Analyser met déjà la simulation en pause : restaurer l'état initial seulement si elle tourne.
  if (wasPaused && await page.getByRole('button', { name: 'Pause', exact: true }).count()) await page.getByRole('button', { name: 'Pause', exact: true }).click()
  page.off('worker', track)
  console.log(`Pilotage vérifié : 8 réplications identiques à Node, budget/export/annulation/erreur/focus/mobile ; scène ${during.fps.toFixed(1)} images/s, p95 ${during.p95.toFixed(1)} ms`)
  return { during, params: p, results: data.resultats, operations: data.replications.map((r) => ({ configuration: r.configuration, fleet: r.fleet, seed: r.seed, ...r.controlStats })), timings }
}
