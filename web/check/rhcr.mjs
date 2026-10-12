import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runReplication } from '../src/sim/campaign.ts'

export async function checkRhcr({ page, measure }) {
  const layout = await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout))
  const wasPaused = await page.getByRole('button', { name: 'Lecture', exact: true }).count() === 1
  if (!wasPaused) await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByLabel('Pilotage', { exact: true }).selectOption('rhcr')
  await page.waitForFunction(() => window.kinesis.sim.control.method === 'rhcr' && window.kinesis.sim.tick === 0)
  const snapshot = await page.evaluate(() => JSON.stringify(window.kinesis.sim))
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => JSON.stringify(window.kinesis.sim)), snapshot)
  await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  const live = await measure(2)
  assert.ok(live.totalMove > 0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.screenshot({ path: fileURLToPath(new URL('./rhcr-live.png', import.meta.url)) })
  const fleets = []
  for (const fleet of [100, 300]) {
    await page.getByLabel('Robots', { exact: true }).first().selectOption(String(fleet))
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    const stats = await measure(2)
    assert.ok(stats.totalMove > 0)
    fleets.push({ fleet, ...stats })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
  }
  await page.getByLabel('Robots', { exact: true }).first().selectOption('20')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: fileURLToPath(new URL('./rhcr-live-mobile.png', import.meta.url)) })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Mesurer', exact: true }).click()
  const dialog = page.locator('section[aria-labelledby="campaign-title"]')
  await dialog.getByRole('checkbox', { name: 'Comparer trajet entier / fenêtre glissante' }).check()
  const rolling = dialog.getByRole('checkbox', { name: 'RHCR priorisé : replanifier au premier arrêt sûr' })
  await rolling.focus(); await page.keyboard.press('Space'); assert.equal(await rolling.isChecked(), true)
  await dialog.getByRole('radio', { name: 'Emprise au sol égale', exact: true }).check()
  for (const [name, value] of Object.entries({ fleets: '2', replications: '2', seconds: '800', seed: '3' })) await dialog.locator(`[name="${name}"]`).fill(value)
  await page.screenshot({ path: fileURLToPath(new URL('./rhcr-settings.png', import.meta.url)) })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
  await page.screenshot({ path: fileURLToPath(new URL('./rhcr-mobile.png', import.meta.url)) })
  await page.setViewportSize({ width: 1280, height: 800 })
  await dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).click()
  await dialog.getByRole('heading', { name: 'Coût de calcul du pilotage' }).waitFor({ timeout: 60000 })
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Exporter/ }).click()])
  const data = JSON.parse(await readFile(await download.path(), 'utf8'))
  const p = data.manifeste.parametres
  assert.deepEqual(p.configurations.map((c) => c.control.method), ['whole', 'rhcr'])
  assert.ok(data.manifeste.solveur.includes('non validé'))
  for (const r of data.replications) assert.deepEqual(r, runReplication(p.configurations[r.configuration].layout, r.fleet, r.seed, p.seconds, r.configuration, p.configurations[r.configuration].control))
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'open-campaign')
  assert.equal(await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout)), layout)
  await page.getByLabel('Pilotage', { exact: true }).selectOption('whole')
  await page.waitForFunction(() => window.kinesis.sim.control.method === 'whole')
  if (!wasPaused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  console.log(`RHCR navigateur : quatre réplications conformes à Node ; ${live.fps.toFixed(1)} images/s, p95 ${live.p95.toFixed(1)} ms`)
  return { live, fleets, params: p, results: data.resultats }
}
