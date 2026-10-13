import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

export async function checkLab({ browser, PAGE }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const capture = (name) => page.screenshot({ path: fileURLToPath(new URL(`./lab-${name}.png`, import.meta.url)) })
  try {
    await page.goto(PAGE.split('#')[0])
    await page.getByRole('heading', { name: 'Concevoir l’entrepôt' }).waitFor()
    await page.waitForFunction(() => !!window.kinesis)
    assert.equal(await page.evaluate(() => window.kinesis.sim.tick), 0)
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => window.kinesis.sim.tick), 0, 'atelier lancé sans action')
    await capture('workshop')
    // Concevoir est un écran, pas une fenêtre : appliquer mène à Simuler, en pause à t = 0, puis lancement explicite.
    await page.getByRole('button', { name: 'Appliquer le plan →' }).click()
    await page.locator('#tab-simulation[aria-selected=true]').waitFor()
    assert.equal(await page.evaluate(() => [document.activeElement.id, window.kinesis.sim.tick].join()), 'tab-simulation,0')
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.tick > 5)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const paused = await page.evaluate(() => window.kinesis.sim.tick)
    await page.locator('.live-instruments > summary').click()
    await page.locator('.instrument-picker summary').click()
    for (const label of ['Temps perdu / trajet libre', 'Cycle moyen terminé', 'Bacs servis']) await page.getByLabel(label, { exact: true }).check()
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => window.kinesis.sim.tick), paused)
    assert.equal(await page.locator('.live-chart').count(), 4)
    assert.equal(await page.locator('[data-metric=cycle]').textContent(), '— s')
    await page.locator('.instrument-picker summary').click()
    await page.locator('.robot-inspector summary').click()
    await page.locator('[name=inspect-robot]').selectOption('0')
    await page.getByText('Position moteur', { exact: true }).waitFor()
    const expectedPosition = await page.evaluate(() => { const r = window.kinesis.sim.robots[0]; return `(${r.x}, ${r.z}) · N${r.level}` })
    assert.equal(await page.locator('.robot-stats dd').first().textContent(), expectedPosition)
    // Vrai clic sur une instance 3D : projection de sa matrice de rendu, aucun état écrit.
    await page.locator('.live-instruments > summary').click()
    await page.getByRole('button', { name: 'Désélectionner' }).click()
    await page.locator('.robot-inspector summary').click()
    const point = await page.evaluate(() => {
      const { mesh } = window.kinesis, camera = window.kinesisView.camera
      const matrix = camera.matrixWorld.clone(), pos = camera.position.clone()
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); pos.setFromMatrixPosition(matrix); pos.y += .3; pos.project(camera)
        const box = document.querySelector('.simulation-space canvas').getBoundingClientRect()
        const x = box.x + (pos.x + 1) * box.width / 2, y = box.y + (1 - pos.y) * box.height / 2
        if (x > 335 && x < box.width - 335 && y > 150 && y < box.height - 160) return { x, y }
      }
      throw new Error('aucun robot dans la zone visible')
    })
    await page.mouse.click(point.x, point.y)
    await page.waitForFunction(() => document.querySelector('.robot-inspector summary').textContent.startsWith('Robot R'))
    await capture('robot')
    await page.locator('.live-instruments > summary').click()
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.getByRole('button', { name: '10×', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.robots.some((r) => r.returns > 0), undefined, { timeout: 30000 })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.waitForTimeout(400)
    // Traînée du robot sélectionné : historique non vide, un repère par nœud engagé restant.
    const trail = await page.evaluate(() => {
      const id = Number(document.querySelector('.robot-inspector summary').textContent.match(/R(\d+)/)[1]) - 1
      const r = window.kinesis.sim.robots[id], scene = window.kinesisView.scene
      return { dots: scene.getObjectByName('trail').count, marks: scene.getObjectByName('trail-ahead').count, ahead: Math.min(r.pathLength - r.pathIndex, 256) }
    })
    assert.ok(trail.dots > 1, `traînée vide (${trail.dots})`)
    assert.equal(trail.marks, trail.ahead)
    const stats = await page.evaluate(() => {
      const s = window.kinesis.sim, returns = s.robots.reduce((n, r) => n + r.returns, 0)
      return { mean: s.robots.reduce((n, r) => n + r.cycleSteps, 0) * .1 / returns, served: s.robots.reduce((n, r) => n + r.visits, 0), time: s.tick * .1 }
    })
    const fmt = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
    assert.equal(await page.locator('[data-metric=cycle]').textContent(), `${fmt(stats.mean)} s`)
    assert.equal(await page.locator('[data-metric=served]').textContent(), `${fmt(stats.served)} bacs`)
    await page.locator('.robot-inspector summary').click()
    await capture('live')
    await page.getByRole('button', { name: '1×', exact: true }).click()
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const times = [], start = performance.now(); let previous = start
      const frame = (now) => {
        times.push(now - previous); previous = now
        if (now - start < 2000) requestAnimationFrame(frame)
        else { times.sort((a, b) => a - b); resolve({ fps: times.length * 1000 / (now - start), p95: times[Math.floor(times.length * .95)], max: times.at(-1) }) }
      }
      requestAnimationFrame(frame)
    }))
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.locator('.instrument-picker summary').click()
    for (const label of ['Débit cumulé', 'Temps perdu / trajet libre', 'Cycle moyen terminé', 'Bacs servis']) await page.getByLabel(label, { exact: true }).uncheck()
    assert.equal(await page.locator('.live-chart').count(), 0)
    await page.getByText('Activez un instrument pour suivre son évolution.').waitFor()
    await page.getByRole('tab', { name: '01 · Concevoir' }).click()
    const tick = await page.evaluate(() => window.kinesis.sim.tick)
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => window.kinesis.sim.tick), tick)
    await page.getByRole('tab', { name: '01 · Concevoir' }).press('End')
    await page.locator('.editor').waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Construire', exact: true }).click()
    await page.getByRole('button', { name: 'Appliquer le plan →' }).click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.robot-inspector summary').textContent(), 'Inspecter un robot')
    await page.locator('.live-instruments > summary').click()
    await page.locator('.instrument-picker summary').click()
    await page.getByLabel('Cycle moyen terminé', { exact: true }).check()
    assert.equal(await page.locator('[data-metric=cycle]').textContent(), '— s')
    await page.locator('.instrument-picker summary').click()
    await page.locator('.live-instruments > summary').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('tab', { name: '01 · Concevoir' }).click()
    await capture('mobile-workshop')
    assert.equal(await page.locator('.studio').evaluate((e) => e.scrollWidth <= e.clientWidth), true)
    await page.getByRole('button', { name: 'Appliquer le plan →' }).click()
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.locator('.robot-inspector summary').click()
    await page.locator('[name=inspect-robot]').selectOption('0')
    await capture('mobile-robot')
    await page.getByRole('button', { name: 'Désélectionner' }).click()
    await page.locator('.live-instruments > summary').click()
    await capture('mobile-live')
    const box = await page.locator('.live-lab').boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 390)
    // Lecture puis Pause peut laisser passer une image : comparer au tick relevé, pas à 0.
    const before = await page.evaluate(() => window.kinesis.sim.tick)
    await page.goto(`${PAGE.split('#')[0]}#analyser`)
    await page.locator('#campaign-title').waitFor()
    await page.waitForFunction(() => !!window.kinesis)
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => window.kinesis.sim.tick), before, 'Analyser a fait avancer le moteur')
    assert.deepEqual(errors, [])
    console.log('Laboratoire : atelier en pause, lancement, clic 3D, fiche robot, quatre courbes conformes au moteur, navigation clavier, redémarrage et mobile vérifiés')
    console.log(`Courbes actives, 20 robots, 1×, 2 s, un seul run : ${frames.fps.toFixed(1)} images/s, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms`)
    return { stats, frames, errors }
  } finally { await page.close() }
}
