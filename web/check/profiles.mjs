import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Matrix4, Vector3 } from 'three'
import { binPosition, robotPosition, step } from '../src/sim/sim.ts'
import { GEOMETRY } from '../src/sim/geometry.ts'
import { runReplication } from '../src/sim/campaign.ts'
import { resetPlan } from './plans.mjs'

export async function checkProfiles({ page, measure }) {
  const paused = await page.getByRole('button', { name: 'Lecture', exact: true }).count() === 1
  if (paused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  const editor = page.locator('[aria-labelledby="editor-title"]'), reports = []
  const open = () => page.getByRole('button', { name: 'Construire', exact: true }).click()
  const apply = () => editor.getByRole('button', { name: 'Appliquer le plan →', exact: true }).click()
  const shot = (name) => page.screenshot({ path: fileURLToPath(new URL(`./${name}.png`, import.meta.url)) })
  for (const profile of ['skypod', 'lifts', 'autostore']) {
    await open()
    await editor.locator(`[name=\"architecture\"][value=\"${profile}\"]`).check()
    await editor.locator('.regular-settings summary').click()
    for (const [name, value] of Object.entries({ width: '16', depth: '16', rows: '2', bays: '3', stations: '2', levels: '3', robots: '4' })) await editor.locator(`[name="${name}"]`).fill(value)
    await editor.getByRole('button', { name: 'Générer le plan', exact: true }).click()
    if (profile === 'lifts') {
      await editor.locator('[name="lift-duration"]').fill('7'); await apply()
      await editor.getByRole('alert').filter({ hasText: 'multiple de 5' }).waitFor()
      await editor.locator('[name="lift-duration"]').fill('20')
      await editor.getByRole('button', { name: 'Ascenseur', exact: true }).click()
      await editor.locator('[data-cell="0,2"]').click()
      assert.equal(await editor.locator('.plan text').filter({ hasText: /^L$/ }).count(), 3)
      await editor.getByRole('button', { name: 'Annuler la modification', exact: true }).click()
      assert.equal(await editor.locator('.plan text').filter({ hasText: /^L$/ }).count(), 2)
      await editor.locator('[name="lift-duration"]').fill('20')
    }
    await editor.locator('[name="plan-save-name"]').fill(`Profil ${profile}`)
    await editor.getByRole('button', { name: 'Enregistrer pour comparer', exact: true }).click()
    await editor.getByRole('status').filter({ hasText: `Profil ${profile}` }).waitFor()
    if (profile !== 'skypod') {
      await editor.locator('[name="architecture"]').first().scrollIntoViewIfNeeded()
      await shot(`${profile}-editor`)
      await page.setViewportSize({ width: 390, height: 844 })
      assert.ok(await editor.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
      await editor.locator('[name="architecture"]').first().scrollIntoViewIfNeeded()
      await shot(`${profile}-editor-mobile`)
      await page.setViewportSize({ width: 1280, height: 800 })
    }
    await apply()
    await page.waitForFunction((p) => window.kinesis?.sim.layout.profile === p && window.kinesis.mesh.count === 4, profile)
    if (profile === 'skypod') continue
    if (await page.getByRole('button', { name: 'Lecture', exact: true }).count()) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.getByRole('button', { name: '10×', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.robots.some((r) => r.pathIndex < r.pathLength))
    const stats = await measure(2)
    assert.ok(stats.totalMove > 0, 'La mesure doit couvrir une flotte en mouvement')
    await page.waitForFunction(() => window.kinesis.sim.robots.every((r) => r.returns >= 2), null, { timeout: 60000 })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const snapshot = await page.evaluate(() => {
      const k = window.kinesis, a = new Float32Array(k.mesh.count * 16), b = new Float32Array(k.bins.count * 16)
      a.set(k.mesh.instanceMatrix.array); b.set(k.bins.instanceMatrix.array)
      return { sim: JSON.parse(JSON.stringify(k.sim)), robots: [...a], bins: [...b], geometries: window.kinesisView.gl.info.memory.geometries, textures: window.kinesisView.gl.info.memory.textures,
        structures: window.kinesisView.scene.getObjectByName('profile-structure')?.count,
        structureMatrices: [...window.kinesisView.scene.getObjectByName('profile-structure').instanceMatrix.array],
        rack: !!window.kinesisView.scene.getObjectByName('rack-0'), heatY: window.kinesisView.scene.getObjectByName('lost-time').position.y }
    })
    const { sim } = snapshot, matrix = new Matrix4(), position = new Vector3()
    for (const [items, matrices, fn] of [[sim.robots, snapshot.robots, robotPosition], [sim.bins, snapshot.bins, binPosition]]) {
      for (let i = 0; i < items.length; i++) {
        const p = { x: 0, y: 0, z: 0 }; fn(sim, items[i], p)
        position.setFromMatrixPosition(matrix.fromArray(matrices, i * 16))
        assert.ok(Math.hypot(position.x - p.x + sim.width / 2 - .5, position.y - p.y, position.z - p.z + sim.depth / 2 - .5) < .31, 'moteur/rendu')
      }
    }
    assert.ok(snapshot.structures > 0); assert.equal(snapshot.rack, profile !== 'autostore')
    if (profile === 'autostore') {
      assert.equal(snapshot.heatY, 1.504); assert.ok(sim.robots.every((r) => r.level === 4))
      // Le bac doit pouvoir traverser l'ouverture : aucun rail ne coupe son puits vertical.
      for (const c of sim.columns) for (let i = 0; i < snapshot.structures; i++) {
        const a = snapshot.structureMatrices, o = i * 16
        const dx = Math.abs(a[o + 12] - (c.cell % sim.width - sim.width / 2 + .5))
        const dz = Math.abs(a[o + 14] - (Math.floor(c.cell / sim.width) - sim.depth / 2 + .5))
        assert.ok(dx >= GEOMETRY.binHalfWidth + a[o] / 2 || dz >= GEOMETRY.binHalfDepth + a[o + 10] / 2, 'Grille intersectant le puits du bac')
      }
    }
    await shot(profile)
    await page.setViewportSize({ width: 390, height: 844 }); await shot(`${profile}-mobile`)
    await page.setViewportSize({ width: 1280, height: 800 })
    // Reprise depuis la sauvegarde, pas d'ancien profil conservé dans la scène.
    for (let i = 0; i < 3; i++) {
      await open(); await apply()
      await page.waitForTimeout(100)
      const memory = await page.evaluate(() => window.kinesisView.gl.info.memory)
      assert.deepEqual([memory.geometries, memory.textures], [snapshot.geometries, snapshot.textures], 'Ressources instables après remplacement du profil')
    }
    await page.reload(); await page.waitForFunction((p) => window.kinesis?.sim.layout.profile === p, profile)
    const saved = await page.evaluate(() => window.kinesis.sim.layout)
    assert.deepEqual(saved, sim.layout)
    const fresh = await page.evaluate(() => JSON.parse(JSON.stringify(window.kinesis.sim)))
    for (let i = 0; i < 6000; i++) step(fresh)
    assert.ok(fresh.robots.every((r) => r.returns >= 2))
    reports.push({ profile, stats, cycles: sim.robots.map((r) => r.returns), resources: [snapshot.geometries, snapshot.textures] })
  }
  await page.getByRole('button', { name: 'Mesurer', exact: true }).click()
  const dialog = page.locator('[aria-labelledby="campaign-title"]')
  await dialog.getByRole('checkbox', { name: 'Plan appliqué', exact: true }).uncheck()
  for (const profile of ['skypod', 'lifts', 'autostore']) await dialog.getByRole('checkbox', { name: `Profil ${profile}`, exact: true }).check()
  for (const [name, value] of Object.entries({ fleets: '2', replications: '2', seconds: '800', seed: '3' })) await dialog.locator(`[name="${name}"]`).fill(value)
  await dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Choisir une base' }).waitFor()
  // AutoStore : un bac par pile et par niveau, Skypod/ascenseurs : deux par travée ; capacités différentes à plan égal.
  await dialog.getByRole('radio', { name: 'Capacité de stockage égale', exact: true }).check()
  await dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Capacités différentes' }).waitFor()
  await dialog.getByRole('radio', { name: 'Emprise au sol égale', exact: true }).check()
  await dialog.getByRole('button', { name: 'Lancer la campagne', exact: true }).click()
  await dialog.getByRole('button', { name: /Exporter/ }).waitFor({ timeout: 60000 })
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Exporter/ }).click()])
  const data = JSON.parse(await readFile(await download.path(), 'utf8')), params = data.manifeste.parametres
  assert.equal(params.configurations.length, 3); assert.equal(data.replications.length, 6)
  for (const r of data.replications) assert.deepEqual(r, runReplication(params.configurations[r.configuration].layout, r.fleet, r.seed, params.seconds, r.configuration))
  await shot('profiles-compare')
  await page.setViewportSize({ width: 390, height: 844 }); await shot('profiles-compare-mobile')
  await page.setViewportSize({ width: 1280, height: 800 })
  for (const profile of ['skypod', 'lifts', 'autostore']) await dialog.getByRole('button', { name: `Supprimer Profil ${profile}`, exact: true }).click()
  await page.keyboard.press('Escape')
  await resetPlan(page)
  await page.waitForFunction(() => window.kinesis?.mesh.count === 20)
  await page.getByRole('button', { name: '1×', exact: true }).click()
  if (paused && await page.getByRole('button', { name: 'Pause', exact: true }).count()) await page.getByRole('button', { name: 'Pause', exact: true }).click()
  if (!paused && await page.getByRole('button', { name: 'Lecture', exact: true }).count()) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  console.log(`Profils vérifiés : cycles, rendu, reprise, éditeur/mobile ; 6 réplications Worker identiques à Node ; ${JSON.stringify(reports)}`)
  return { reports, params, results: data.resultats }
}
