import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runReplication } from '../src/sim/campaign.ts'
import { analyzeExploration, explorationPlans } from '../src/sim/exploration.ts'

export async function checkExploration({ page, measure }) {
  const active = await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout))
  const wasPaused = await page.getByRole('button', { name: 'Lecture', exact: true }).count() === 1
  if (wasPaused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  const dialog = page.locator('section[aria-labelledby="exploration-title"]')
  const open = async () => {
    await page.getByRole('button', { name: 'Mesurer', exact: true }).click()
    await page.getByRole('button', { name: 'Explorer densité / débit', exact: true }).click()
    assert.equal(await page.evaluate(() => document.activeElement.id), 'exploration-title')
  }
  await open()
  const fill = async (fields) => { for (const [name, value] of Object.entries(fields)) await dialog.locator(`[name="explore-${name}"]`).fill(value) }
  const start = () => dialog.getByRole('button', { name: 'Lancer l’exploration', exact: true }).click()
  // Scroll only the panel body: scrollIntoView may also scroll its hidden outer box.
  const showChart = () => dialog.evaluate((e) => {
    e.scrollTop = 0
    const body = e.querySelector('.campaign-body'), chart = body.querySelector('.chart')
    body.scrollTop += chart.getBoundingClientRect().top - body.getBoundingClientRect().top - 120
  })
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Accepter la base' }).waitFor()
  await dialog.getByRole('checkbox', { name: 'Comparer à emprise au sol égale' }).check()
  await fill({ blocks: '1, 2', aisles: '1, 5, 9', fleets: '300', replications: '2', seconds: '800', seed: '3' })
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Bloc 1' }).waitFor()
  await fill({ fleets: '2, 4, 8', seed: '' }); await start()
  await dialog.getByRole('alert').filter({ hasText: 'Remplir tous' }).waitFor()
  await fill({ seed: '3' })
  await dialog.getByRole('button', { name: 'Vérifier les plans', exact: true }).click()
  await dialog.getByRole('status').filter({ hasText: '5 plans valides' }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('./exploration-settings.png', import.meta.url)) })
  const live = new Set(), created = []
  const track = (w) => { if (w.url().includes('exploration.worker')) { live.add(w); created.push(w); w.on('close', () => live.delete(w)) } }
  page.on('worker', track)
  const waitStopped = async () => {
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="exploration-title"] progress'))
    const deadline = Date.now() + 10000
    while (live.size && Date.now() < deadline) await page.waitForTimeout(100)
    assert.equal(live.size, 0, 'Workers non terminés après arrêt')
  }
  // Real parallel computation progresses, then cancellation discards results.
  await fill({ seconds: '86400' }); await start()
  await page.waitForFunction(() => Number(document.querySelector('[aria-labelledby="exploration-title"] progress')?.value) > 0, null, { timeout: 60000 })
  assert.equal(live.size, 2, 'deux Workers réellement actifs')
  const during = await measure(.5)
  assert.ok(during.totalMove > 0, 'scène figée pendant le calcul parallèle')
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click()
  await waitStopped()
  assert.equal(await dialog.getByRole('button', { name: /Exporter/ }).count(), 0)
  // A recoverable Worker error terminates both workers without an export.
  await page.evaluate(() => {
    window.originalWorker = window.Worker
    window.Worker = class extends window.originalWorker {
      constructor(...args) { super(...args); setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'Erreur de contrôle' })), 50) }
    }
  })
  await start()
  await dialog.getByRole('alert').filter({ hasText: 'Erreur de contrôle' }).waitFor()
  await waitStopped()
  await page.evaluate(() => { window.Worker = window.originalWorker; delete window.originalWorker })
  await fill({ seconds: '800' }); await start()
  await dialog.locator('table tbody tr').nth(1).waitFor({ timeout: 60000 })
  await waitStopped()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Exporter/ }).click()])
  const data = JSON.parse(await readFile(await download.path(), 'utf8'))
  const p = data.manifeste.exploration, analysis = analyzeExploration(p, data.replications)
  assert.equal(data.manifeste.format, 'kinesis-exploration-1')
  assert.equal(data.manifeste.workers, 2)
  assert.deepEqual(data.manifeste.parametres.configurations, explorationPlans(p))
  assert.equal(data.manifeste.parametres.base, 'footprint')
  assert.match(data.manifeste.baseNormalisation, /Emprise au sol égale/)
  assert.equal(data.manifeste.saturation.fractionDuMaximum, .95)
  assert.deepEqual(data.resultats, analysis.results)
  assert.deepEqual(data.manifeste.configurations.map((r) => [r.surLeFront, r.seuilSaturationObserve]), analysis.rows.map((r) => [r.front, r.saturation]))
  for (const r of data.replications) assert.deepEqual(r, runReplication(analysis.rows[r.configuration].layout, r.fleet, r.seed, p.seconds, r.configuration), 'réplication Worker différente de Node')
  assert.equal(await dialog.locator('table').first().locator('tbody tr').count(), analysis.rows.length)
  for (const [i, row] of analysis.rows.entries()) {
    const text = await dialog.locator('table').first().locator('tbody tr').nth(i).textContent()
    assert.ok(text.includes(String(row.slots)))
    assert.ok(text.includes(row.saturation === null ? 'non identifié' : String(row.saturation)))
  }
  await showChart()
  await page.screenshot({ path: fileURLToPath(new URL('./exploration.png', import.meta.url)) })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'exploration déborde en mobile')
  await dialog.evaluate((e) => { e.scrollTop = 0; e.querySelector('.campaign-body').scrollTop = 0 })
  await page.screenshot({ path: fileURLToPath(new URL('./exploration-settings-mobile.png', import.meta.url)) })
  await showChart()
  await page.screenshot({ path: fileURLToPath(new URL('./exploration-mobile.png', import.meta.url)) })
  await dialog.getByRole('button', { name: 'Retour aux campagnes', exact: true }).click()
  assert.equal(await page.evaluate(() => document.activeElement.id), 'campaign-title')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'open-campaign')
  await open()
  await dialog.getByRole('checkbox', { name: 'Comparer à emprise au sol égale' }).check()
  await start()
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Annuler', 'focus conservé au lancement')
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 0, 'Échap ferme pendant le calcul')
  await waitStopped()
  assert.equal(await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout)), active, 'exploration modifie la scène')
  await page.setViewportSize({ width: 1280, height: 800 })
  if (wasPaused) await page.getByRole('button', { name: 'Pause', exact: true }).click()
  page.off('worker', track)
  console.log(`Exploration vérifiée : deux Workers, annulation/erreur/fermeture, reprise, base/flotte refusées, export Node identique, Pareto/seuil, mobile ; calcul p95 ${during.p95.toFixed(1)} ms`)
  return { during, workersCreated: created.length, plans: analysis.rows.map((r) => ({ name: r.name, slots: r.slots, front: r.front, saturation: r.saturation })), replications: data.replications.length }
}
