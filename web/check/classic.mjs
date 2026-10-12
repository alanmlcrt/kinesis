import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyzeFleet, runReplication } from '../src/sim/campaign.ts'

export async function checkClassic({ page, measure, assertRenderedPlan }) {
  const editor = page.locator('section[aria-labelledby="editor-title"]')
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  const generation = { value: () => editor.locator('[name="architecture"]:checked').inputValue(), el: editor.locator('[name="architecture"]').first(),
    select: (g) => editor.locator(`[name="architecture"][value="${g === '2025+' ? 'skypod' : g}"]`).check() }
  await editor.locator('[data-preset="dense"]').click()
  await editor.locator('[name="architecture"][value="skypod"]').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await generation.value(), 'classic', 'choix de génération au clavier')
  await editor.locator('[name="width"]').fill('1000000000')
  assert.equal(await editor.locator('[name="width"]').getAttribute('aria-invalid'), 'true', 'largeur hors bornes non signalée')
  await editor.locator('svg.plan[aria-label^="Plan 48 par 32"]').waitFor()
  await editor.locator('[name="width"]').fill('48')
  await editor.locator('.plan-metrics').filter({ hasText: '768 emplacements · sol libre 75 % · 284 robots au plus' }).waitFor()
  await generation.el.scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('./editor-classic.png', import.meta.url)) })
  const save = async (name) => {
    await editor.locator('[name="plan-save-name"]').fill(name)
    await editor.getByRole('button', { name: 'Enregistrer pour comparer' }).click()
    await editor.getByRole('status').filter({ hasText: `Plan « ${name} » enregistré` }).waitFor()
  }
  await save('Classique')
  await generation.select('2025+')
  await save('2025+')
  await editor.getByRole('button', { name: 'Annuler la modification' }).click()
  assert.equal(await generation.value(), 'classic', 'annulation restaure la génération')
  // Erreur de placement récupérable : l'accès d'une travée n'est pas un emplacement de station.
  await editor.getByRole('button', { name: 'Station', exact: true }).click()
  await editor.locator('[data-cell="2,2"]').click()
  await editor.getByRole('alert').filter({ hasText: 'chevauchent' }).waitFor()
  const unchanged = await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout))
  await editor.getByLabel('Robots', { exact: true }).fill('301')
  await editor.getByRole('button', { name: 'Appliquer le plan →' }).click()
  await editor.getByRole('alert').filter({ hasText: '1 à 300 robots' }).waitFor()
  assert.equal(await page.evaluate(() => JSON.stringify(window.kinesis.sim.layout)), unchanged)
  await editor.getByLabel('Robots', { exact: true }).fill('72')
  await editor.getByRole('button', { name: 'Appliquer le plan →' }).click()
  await page.waitForFunction(() => window.kinesis.sim.layout.generation === 'classic' && window.kinesis.mesh.count === 72)
  await assertRenderedPlan()
  await page.reload()
  await page.waitForFunction(() => window.kinesis?.sim.layout.generation === 'classic' && window.kinesis.mesh.count === 72)
  if (await page.getByRole('button', { name: 'Lecture', exact: true }).count()) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  await page.getByRole('button', { name: '10×', exact: true }).click()
  await page.waitForFunction(() => window.kinesis.sim.bins.some((b) => b.carrier !== -1), null, { timeout: 30000 })
  await page.getByRole('button', { name: '1×', exact: true }).click()
  const stats = await measure(5)
  assert.ok(stats.totalMove > 0 && stats.binMove > 0, 'cycle classique affiché immobile')
  await assertRenderedPlan()
  const congestion = page.locator('details.congestion')
  if (await congestion.getAttribute('open') !== null) await congestion.locator('summary').click()
  await page.screenshot({ path: fileURLToPath(new URL('./layout-classic.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await measure(.5)
  assert.equal(paused.totalMove + paused.binMove, 0)
  // Matrices du marquage au sol conformes exactement aux cases bloquées du moteur.
  const marked = await page.evaluate(() => {
    const { sim } = window.kinesis, mesh = window.kinesisView.scene.getObjectByName('blocked-floor')
    const cells = sim.floor.flatMap((kind, c) => kind === 'blocked' ? [c] : [])
    if (!mesh || mesh.count !== cells.length) throw new Error('Emprise classique absente/dupliquée')
    for (const [i, c] of cells.entries()) {
      const a = mesh.instanceMatrix.array, o = i * 16
      if (a[o] !== 1 || a[o + 10] !== 1 || Math.abs(a[o + 5] - .06) > 1e-6 ||
          Math.abs(a[o + 12] - (c % sim.width - sim.width / 2 + .5)) > 1e-6 ||
          Math.abs(a[o + 14] - (Math.floor(c / sim.width) - sim.depth / 2 + .5)) > 1e-6) throw new Error('Emprise différente du moteur')
    }
    return cells.length
  })
  assert.equal(marked, 192)
  const memory = () => page.evaluate(() => ({ ...window.kinesisView.gl.info.memory }))
  const classicMemory = await memory()
  assert.ok(await page.locator('.panel summary').textContent().then((s) => s.includes('classique')))
  await page.getByRole('button', { name: 'Mesurer', exact: true }).click()
  const dialog = page.locator('section[aria-labelledby="campaign-title"]')
  const box = (name) => dialog.getByRole('checkbox', { name, exact: true })
  await box('Plan appliqué').uncheck()
  await box('Classique').check(); await box('2025+').check()
  await dialog.getByRole('radio', { name: 'Capacité de stockage égale' }).check()
  for (const [name, value] of Object.entries({ fleets: '20', replications: '2', seconds: '800', seed: '3' })) await dialog.locator(`[name="${name}"]`).fill(value)
  await dialog.getByRole('button', { name: 'Lancer la campagne' }).click()
  await dialog.locator('table').nth(1).locator('tbody tr').nth(1).waitFor({ timeout: 60000 })
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Exporter/ }).click()])
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  const configurations = exported.manifeste.parametres.configurations
  assert.deepEqual(configurations.map((c) => c.layout.generation), ['classic', '2025+'])
  for (const r of exported.replications) {
    assert.deepEqual(r, runReplication(configurations[r.configuration].layout, r.fleet, r.seed, 800, r.configuration), 'Worker différent du moteur Node')
  }
  assert.deepEqual(exported.resultats, [0, 1].map((c) => analyzeFleet(exported.replications.filter((r) => r.configuration === c))))
  await dialog.locator('.legend-list').scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('./campaign-classic.png', import.meta.url)) })
  for (const name of ['Classique', '2025+']) await dialog.getByRole('button', { name: `Supprimer ${name}` }).click()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  assert.equal(await generation.value(), 'classic')
  assert.ok(await editor.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'éditeur classique déborde sur mobile')
  await generation.el.scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('./editor-classic-mobile.png', import.meta.url)) })
  await editor.locator('svg.plan').scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('./editor-classic-plan-mobile.png', import.meta.url)) })
  await generation.select('2025+')
  await editor.getByRole('button', { name: 'Appliquer le plan →' }).click()
  await page.waitForFunction(() => window.kinesis.sim.layout.generation === '2025+')
  await measure(.2)
  assert.equal(await page.evaluate(() => Boolean(window.kinesisView.scene.getObjectByName('blocked-floor'))), false, 'emprise classique résiduelle')
  const modernMemory = await memory()
  for (const next of ['classic', '2025+']) {
    await page.getByRole('button', { name: 'Construire', exact: true }).click()
    await generation.select(next)
    await editor.getByRole('button', { name: 'Appliquer le plan →' }).click()
    await page.waitForFunction((g) => window.kinesis.sim.layout.generation === g, next)
    await measure(.2)
    assert.deepEqual(await memory(), next === 'classic' ? classicMemory : modernMemory, 'ressources GPU accumulées au changement de génération')
  }
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  await page.locator(`[data-preset=\"${'demo'}\"]`).click()
  await editor.getByLabel('Robots', { exact: true }).fill('20')
  await editor.getByRole('button', { name: 'Appliquer le plan →' }).click()
  await page.waitForFunction(() => window.kinesis.mesh.count === 20 && window.kinesis.sim.columns.length === 64)
  await page.setViewportSize({ width: 1280, height: 800 })
  console.log(`Classique vérifié : clavier, annulation, erreurs, persistance, emprise, pause, comparaison/export Worker–Node, mobile, ressources GPU stables ; 72 robots, ${stats.fps.toFixed(1)} images/s, p95 ${stats.p95.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms`)
  return { ...stats, marked, classicMemory, modernMemory, configurations: configurations.map((c) => ({ name: c.name, generation: c.layout.generation })) }
}
