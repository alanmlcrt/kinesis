import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { fileURLToPath } from 'node:url'
import { regularLayout } from '../src/sim/layout.ts'

export async function checkRemaining({ browser, page, PAGE, measure, assertRenderedPlan, errors }) {
  const report = { editor: [], speeds: [], stress: [], touch: [], browsers: [], camera: false }
  const open = () => page.getByRole('button', { name: 'Construire', exact: true }).click()
  const editor = page.locator('.editor')
  const apply = () => editor.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
  const close = () => editor.getByRole('button', { name: 'Fermer', exact: true }).click()
  const fields = async (values, target = editor) => {
    for (const [label, value] of Object.entries(values)) await target.getByLabel(label, { exact: true }).fill(String(value))
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await open()
  for (const [label, invalid, valid] of [['Niveaux', '', 4], ['Remplissage (%)', 101, 100], ['Robots', 1.5, 20]]) {
    await fields({ [label]: invalid }); await apply()
    await editor.getByRole('alert').waitFor()
    assert.equal(await page.evaluate(() => window.kinesis.sim.columns.length), 32)
    await fields({ [label]: valid })
  }
  await close(); report.editor.push('champs vides/hors limite/fractionnaires refusés')

  await open()
  const undo = editor.getByRole('button', { name: 'Annuler la modification', exact: true })
  assert.equal(await undo.isDisabled(), true)
  await fields({ X: 0, Z: 0 })
  for (let i = 0; i < 55; i++) {
    await editor.getByRole('button', { name: i % 2 === 0 ? 'Station' : 'Effacer', exact: true }).click()
    await editor.getByRole('button', { name: 'Utiliser l’outil' }).click()
    assert.equal(await editor.locator('.plan-station').count(), i % 2 === 0 ? 5 : 4)
  }
  for (let i = 0; i < 50; i++) {
    await undo.click()
    assert.equal(await editor.locator('.plan-station').count(), i % 2 === 0 ? 4 : 5)
  }
  assert.equal(await undo.isDisabled(), true)
  assert.equal(await page.evaluate(() => window.kinesis.sim.stations.length), 4)
  await close(); report.editor.push('50 annulations avec assertions du brouillon après chaque action')

  await open()
  await fields({ 'Largeur (cellules)': 16, 'Profondeur (cellules)': 16, Rangées: 1,
    'Travées / rangée': 1, Stations: 1, Niveaux: 1, 'Remplissage (%)': 100, Robots: 1 })
  await editor.getByRole('button', { name: 'Générer le plan' }).click()
  await editor.getByRole('button', { name: 'Effacer', exact: true }).click()
  await fields({ X: 2, Z: 2 }); await editor.getByRole('button', { name: 'Utiliser l’outil' }).click()
  await editor.getByRole('alert').filter({ hasText: '1 à 256' }).waitFor()
  assert.equal(await editor.locator('.plan-rack').count(), 1)
  await fields({ X: 0, Z: 14 }); await editor.getByRole('button', { name: 'Utiliser l’outil' }).click()
  await editor.getByRole('alert').filter({ hasText: '1 à 12' }).waitFor()
  assert.equal(await editor.locator('.plan-station').count(), 1)
  await editor.getByRole('button', { name: 'Station', exact: true }).click()
  await fields({ X: 14, Z: 0 }); await editor.locator('svg.plan').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await editor.getByLabel('X', { exact: true }).inputValue(), '14')
  await page.keyboard.press('ArrowUp')
  assert.equal(await editor.getByLabel('Z', { exact: true }).inputValue(), '0')
  await page.keyboard.press('Space')
  assert.equal(await editor.locator('.plan-station').count(), 2)
  await close(); report.editor.push('dernier rack/station protégés, bornes du curseur et placement Espace')

  await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  for (const speed of [1, 2, 5, 10]) {
    await page.getByRole('button', { name: `${speed}×`, exact: true }).click()
    const sample = await page.evaluate(async () => {
      const tick = window.kinesis.sim.tick, start = performance.now()
      await new Promise((resolve) => setTimeout(resolve, 500))
      return { ticks: window.kinesis.sim.tick - tick, seconds: (performance.now() - start) / 1000 }
    })
    assert.ok(Math.abs(sample.ticks - speed * sample.seconds / .1) <= 2, `vitesse ${speed}× : ${JSON.stringify(sample)}`)
    report.speeds.push({ speed, ...sample })
  }
  await open(); await editor.getByLabel('Configuration prédéfinie').selectOption('dense')
  await fields({ Robots: 20 }); await apply()
  await page.waitForFunction(() => window.kinesis.sim.columns.length === 80 && window.kinesis.sim.tick > 0)
  assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await assertRenderedPlan(); report.editor.push('application pendant la lecture conserve la lecture')

  for (const [preset, count] of [['dense', 220], ['large', 300], ['maximum', 300]]) {
    await open()
    if (preset !== 'maximum') await editor.getByLabel('Configuration prédéfinie').selectOption(preset)
    else {
      await fields({ 'Largeur (cellules)': 80, 'Profondeur (cellules)': 64, Rangées: 12,
        'Travées / rangée': 20, Stations: 12, Niveaux: 8, 'Remplissage (%)': 100 })
      await editor.getByRole('button', { name: 'Générer le plan' }).click()
    }
    await fields({ Robots: count }); await apply()
    await page.getByRole('button', { name: '10×', exact: true }).click()
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.bins.some((b) => b.carrier !== -1), null, { timeout: 30000 })
    await page.getByRole('button', { name: '1×', exact: true }).click()
    const stats = await measure(5)
    assert.equal(stats.count, count); assert.ok(stats.totalMove > 0 && stats.binMove > 0)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await assertRenderedPlan()
    report.stress.push({ preset, bins: await page.evaluate(() => window.kinesis.sim.bins.length), ...stats })
    await page.screenshot({ path: fileURLToPath(new URL(`./stress-${preset}.png`, import.meta.url)) })
    console.log(`stress ${preset}/${count} robots : ${stats.fps.toFixed(1)} images/s, p95 ${stats.p95.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms`)
  }

  const camera = await page.evaluate(() => ({ position: window.kinesisView.camera.position.toArray(), tick: window.kinesis.sim.tick }))
  await page.mouse.move(560, 310); await page.mouse.down()
  await page.mouse.move(700, 370, { steps: 8 }); await page.mouse.up()
  await page.waitForFunction((position) => window.kinesisView.camera.position.toArray().some((value, i) => Math.abs(value - position[i]) > .1), camera.position)
  const distance = await page.evaluate(() => { const view = window.kinesisView.get(); return view.camera.position.distanceTo(view.controls.target) })
  await page.mouse.wheel(0, -200)
  await page.waitForFunction((distance) => { const view = window.kinesisView.get(); return view.camera.position.distanceTo(view.controls.target) < distance - .1 }, distance)
  await page.setViewportSize({ width: 900, height: 600 })
  await page.waitForFunction(() => { const view = window.kinesisView.get(); return view.size.width === 900 && view.size.height === 600 })
  await assertRenderedPlan()
  assert.equal(await page.evaluate(() => window.kinesis.sim.tick), camera.tick, 'caméra/redimensionnement ont avancé le moteur en pause')
  await page.setViewportSize({ width: 1280, height: 800 })
  report.camera = true

  const touch = await browser.newContext({ hasTouch: true, isMobile: true, reducedMotion: 'reduce', viewport: { width: 360, height: 640 } })
  const mobile = await touch.newPage()
  mobile.on('pageerror', (error) => errors.push(error.message))
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    await mobile.goto(PAGE); await mobile.waitForFunction(() => window.kinesis?.mesh.count === 20)
    for (const viewport of [{ width: 360, height: 640 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
      await mobile.setViewportSize(viewport)
      await mobile.getByRole('button', { name: 'Construire', exact: true }).tap()
      const panel = mobile.locator('.editor')
      assert.equal(await mobile.evaluate(() => document.activeElement.id), 'editor-title')
      assert.ok(await panel.evaluate((element) => {
        const r = element.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      }))
      await panel.getByLabel('X', { exact: true }).fill('0'); await panel.getByLabel('Z', { exact: true }).fill('0')
      await panel.getByRole('button', { name: 'Station', exact: true }).tap()
      await panel.getByRole('button', { name: 'Utiliser l’outil' }).tap()
      assert.equal(await panel.locator('.plan-station').count(), 5)
      await mobile.screenshot({ path: fileURLToPath(new URL(`./touch-${viewport.width}x${viewport.height}.png`, import.meta.url)) })
      await panel.getByRole('button', { name: 'Appliquer et redémarrer' }).tap()
      await mobile.waitForFunction(() => window.kinesis.sim.stations.length === 5)
      await mobile.reload(); await mobile.waitForFunction(() => window.kinesis?.sim.stations.length === 5)
      assert.equal(await mobile.getByRole('button', { name: 'Lecture', exact: true }).count(), 1)
      // Revenir au plan initial pour le prochain format d'écran.
      await mobile.getByRole('button', { name: 'Construire', exact: true }).tap()
      await mobile.getByLabel('Configuration prédéfinie').selectOption('demo')
      await mobile.getByRole('button', { name: 'Appliquer et redémarrer' }).tap()
      await mobile.waitForFunction(() => window.kinesis.sim.stations.length === 4)
      report.touch.push(viewport)
    }
  } finally { await touch.close() }

  for (const [name, launch] of [['Edge', () => chromium.launch({ channel: 'msedge' })], ['Firefox', () => firefox.launch()]]) {
    const engine = await launch()
    try {
      const probe = await engine.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
      probe.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
      probe.on('console', (message) => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`) })
      const configuration = { version: 1, seed: 0xffffffff, count: 1, layout: regularLayout(16, 16, 1, 1, 1, 1) }
      await probe.addInitScript((configuration) => {
        if (!localStorage.getItem('kinesis.configuration.v1')) localStorage.setItem('kinesis.configuration.v1', JSON.stringify(configuration))
      }, configuration)
      await probe.goto(PAGE); await probe.waitForFunction(() => window.kinesis?.mesh.count === 1)
      assert.equal(await probe.evaluate(() => window.kinesis.sim.seed), 0xffffffff)
      await probe.getByRole('button', { name: '10×', exact: true }).click()
      await probe.getByRole('button', { name: 'Lecture', exact: true }).click()
      await probe.waitForFunction(() => window.kinesis.sim.robots[0].returns > 0, null, { timeout: 30000 })
      await probe.getByRole('button', { name: 'Pause', exact: true }).click()
      const tick = await probe.evaluate(() => window.kinesis.sim.tick)
      await probe.waitForTimeout(150)
      assert.equal(await probe.evaluate(() => window.kinesis.sim.tick), tick)
      await probe.getByRole('button', { name: 'Construire', exact: true }).click()
      await fields({ Niveaux: 3, 'Remplissage (%)': 50, Robots: 2 }, probe.locator('.editor'))
      await probe.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
      await probe.waitForFunction(() => window.kinesis.mesh.count === 2)
      await probe.reload(); await probe.waitForFunction(() => window.kinesis?.mesh.count === 2)
      assert.equal(await probe.evaluate(() => window.kinesis.sim.seed), 0xffffffff)
      assert.equal(await probe.evaluate(() => window.kinesis.sim.levels), 3)
      assert.equal(await probe.evaluate(() => window.kinesis.sim.bins.length), 1)
      await probe.screenshot({ path: fileURLToPath(new URL(`./browser-${name.toLowerCase()}.png`, import.meta.url)) })
      report.browsers.push({ name, version: engine.version(), cycle: true, pause: true, seedAndPlanRestored: true })
    } finally { await engine.close() }
  }
  return report
}
