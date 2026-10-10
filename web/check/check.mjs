// Vérification dans le navigateur : erreurs console, cadence mesurée, capture.
// Sert le build (`npm run build` d'abord) avec `vite preview`, l'ouvre dans Chromium.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { checkRemaining } from './remaining.mjs'

const SECONDS = 5

// Processus Node possédé par ce check, port attribué par l'OS : aucun serveur existant testé par erreur.
const server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
  'preview', '--host', '127.0.0.1', '--port', '0', '--strictPort'], { windowsHide: true })
let browser
try {
  const PAGE = await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error('vite preview ne répond pas')), 15000)
    server.stdout.on('data', (chunk) => {
      output += chunk.toString()
      // Vite colore sa sortie sous Windows même vers un tube : codes ANSI retirés avant lecture du port.
      const url = output.replace(/\x1b\[[0-9;]*m/g, '').match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]
      if (url) { clearTimeout(timeout); resolve(url) }
    })
    server.stderr.on('data', (chunk) => { output += chunk.toString() })
    server.once('error', (error) => { clearTimeout(timeout); reject(error) })
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Vite arrêté (${code}) : ${output.slice(-2000)}`)) })
  })
  assert.equal((await fetch(PAGE)).status, 200)
  const icon = await fetch(new URL('favicon.svg', PAGE))
  assert.equal(icon.status, 200, 'icône du navigateur absente du build')
  assert.match(icon.headers.get('content-type') ?? '', /image\/svg\+xml/)

  // GPU réel si possible ; le moteur de rendu effectivement utilisé est relevé plus bas.
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('requestfailed', (request) => errors.push(`requête échouée : ${request.url()} (${request.failure()?.errorText})`))

  const assertRenderedPlan = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => {
      const { sim, robotMeshes, binMeshes, geometry } = window.kinesis
      const { scene } = window.kinesisView
      const checkInstances = (meshes, count) => {
        for (const mesh of meshes) {
          if (mesh.count !== count) throw new Error('Nombre d’instances différent du moteur')
          for (let i = 0; i < count * 16; i++) {
            if (!Number.isFinite(mesh.instanceMatrix.array[i])) throw new Error('Matrice d’instance non finie')
          }
        }
      }
      checkInstances(robotMeshes, sim.robots.length); checkInstances(binMeshes, sim.bins.length)
      for (const parts of [robotMeshes, binMeshes]) for (const mesh of parts.slice(1)) {
        const expected = parts[0].instanceMatrix.array, actual = mesh.instanceMatrix.array
        for (let i = 0; i < expected.length; i++) {
          if (actual[i] !== expected[i]) throw new Error('Pièces d’un robot/bac désynchronisées')
        }
      }
      for (const [name, cells] of [['rack', sim.columns.map((c) => c.cell)], ['station', sim.stations]]) {
        const meshes = []
        scene.traverse((object) => { if (object.name.startsWith(`${name}-`)) meshes.push(object) })
        if (meshes.length !== (name === 'rack' ? 3 : 2)) throw new Error('Équipement absent ou dupliqué')
        checkInstances(meshes, cells.length)
        for (const mesh of meshes) for (const [i, cell] of cells.entries()) {
          const a = mesh.instanceMatrix.array, offset = i * 16
          if (Math.abs(a[offset + 12] - (cell % sim.width - sim.width / 2 + .5)) > 1e-5 ||
              a[offset + 13] !== 0 || Math.abs(a[offset + 14] - (Math.floor(cell / sim.width) - sim.depth / 2 + .5)) > 1e-5) {
            throw new Error('Position de rack/station différente du plan')
          }
        }
      }
      for (const r of sim.robots) {
        const a = robotMeshes[0].instanceMatrix.array, offset = r.id * 16
        // Jusqu’à une case depuis la position discrète pendant le transit, plus 0,2 d’interpolation.
        if (Math.abs(a[offset + 12] - (r.x - sim.width / 2 + .5)) > 1.2 ||
            Math.abs(a[offset + 14] - (r.z - sim.depth / 2 + .5)) > 1.2 ||
            a[offset + 13] < geometry.robotCenterY - 1e-5) throw new Error('Robot affiché hors de sa position simulée')
      }
    })
  }

  await page.goto(PAGE)
  await page.waitForSelector('canvas')
  await page.waitForTimeout(1000) // laisse passer le premier rendu
  await assertRenderedPlan()
  const geometry = await page.evaluate(() => {
    const { geometry: g, robotMeshes, binMeshes } = window.kinesis
    const bounds = (meshes) => meshes.map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox })
    const robots = bounds(robotMeshes), bins = bounds(binMeshes), eps = 1e-5
    for (const b of robots) {
      if (b.min.x < -g.robotHalfWidth - eps || b.max.x > g.robotHalfWidth + eps ||
          b.min.z < -g.robotHalfDepth - eps || b.max.z > g.robotHalfDepth + eps) throw new Error('Asset robot hors enveloppe')
    }
    const robotFloor = g.robotCenterY + Math.min(...robots.map((b) => b.min.y))
    const supportTop = g.robotCenterY + Math.max(...robots.map((b) => b.max.y))
    const binBottom = g.robotCenterY + g.carriedBinOffsetY + Math.min(...bins.map((b) => b.min.y))
    if (robotFloor < -eps || Math.abs(supportTop - binBottom) > eps) throw new Error('Support du bac ou contact au sol incohérent')
    for (const b of bins) {
      if (b.min.x < -g.binHalfWidth - eps || b.max.x > g.binHalfWidth + eps ||
          b.min.z < -g.binHalfDepth - eps || b.max.z > g.binHalfDepth + eps ||
          b.min.y < g.binBottomY - eps || b.max.y > g.binTopY + eps) throw new Error('Asset bac hors enveloppe')
    }
    for (const name of ['station-0', 'station-1']) {
      const p = window.kinesisView.scene.getObjectByName(name).geometry.attributes.position
      for (let i = 0; i < p.count; i += 3) {
        const minX = Math.min(p.getX(i), p.getX(i + 1), p.getX(i + 2)), maxX = Math.max(p.getX(i), p.getX(i + 1), p.getX(i + 2))
        const minZ = Math.min(p.getZ(i), p.getZ(i + 1), p.getZ(i + 2)), maxZ = Math.max(p.getZ(i), p.getZ(i + 1), p.getZ(i + 2))
        const maxY = Math.max(p.getY(i), p.getY(i + 1), p.getY(i + 2))
        if (maxY > robotFloor + eps && minX < g.robotHalfWidth && maxX > -g.robotHalfWidth &&
            minZ < g.robotHalfDepth && maxZ > -g.robotHalfDepth) throw new Error('Station intersectant l’enveloppe du robot')
      }
    }
    return { robotFloor, supportTop, binBottom, robotParts: robots.length, binParts: bins.length }
  })

  // Mesure image par image : cadence et déplacement de toutes les instances.
  const measure = (seconds) => page.evaluate((seconds) => new Promise((resolve) => {
    const mesh = window.kinesis?.mesh
    const matrices = mesh?.instanceMatrix.array
    const previous = matrices ? new Float32Array(matrices) : null
    const binMatrices = window.kinesis?.bins?.instanceMatrix.array
    const previousBins = binMatrices ? new Float32Array(binMatrices) : null
    const dts = [], moves = []
    let last, maxMove = 0, binMove = 0
    const end = performance.now() + seconds * 1000
    const tick = (t) => {
      if (last !== undefined) dts.push(t - last)
      if (matrices && last !== undefined) {
        let total = 0
        for (let i = 0; i < mesh.count; i++) {
          const offset = i * 16
          const move = Math.hypot(matrices[offset + 12] - previous[offset + 12],
            matrices[offset + 13] - previous[offset + 13], matrices[offset + 14] - previous[offset + 14])
          total += move
          maxMove = Math.max(maxMove, move)
        }
        moves.push(total)
      }
      if (binMatrices && last !== undefined) {
        for (let i = 0; i < binMatrices.length; i++) binMove += Math.abs(binMatrices[i] - previousBins[i])
      }
      if (matrices) previous.set(matrices)
      if (binMatrices) previousBins.set(binMatrices)
      last = t
      if (t < end) return requestAnimationFrame(tick)
      const mean = dts.reduce((a, d) => a + d, 0) / dts.length
      const sorted = [...dts].sort((a, b) => a - b)
      resolve({
        frames: dts.length, fps: 1000 / mean, p95: sorted[Math.floor(dts.length * 0.95)], max: sorted.at(-1),
        robot: !!mesh, count: mesh?.count, instanced: mesh?.isInstancedMesh,
        still: moves.filter((m) => m === 0).length, maxMove,
        totalMove: moves.reduce((a, m) => a + m, 0), binMove, meanDt: mean,
        drawCalls: window.kinesisView.gl.info.render.calls,
        triangles: window.kinesisView.gl.info.render.triangles,
      })
    }
    requestAnimationFrame(tick)
  }), seconds)

  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'inconnu'
  })
  const results = []
  console.log(`rendu WebGL : ${renderer}; 1280×800; graine 1; vitesse 1×; un seul run par flotte, solveur non validé`)
  for (const count of [20, 100, 300]) {
    await page.getByLabel('Robots', { exact: true }).selectOption(String(count))
    await page.waitForFunction((n) => window.kinesis?.mesh?.count === n, count)
    await page.getByRole('button', { name: '10×', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.bins.some((b) => b.carrier !== -1), null, { timeout: 30000 })
    await page.getByRole('button', { name: '1×', exact: true }).click()
    // La mesure inclut un cycle 3D actif ; aucun protocole de débit scientifique ici.
    const stats = await measure(SECONDS)
    assert.equal(stats.count, count)
    assert.equal(stats.instanced, true)
    assert.ok(stats.totalMove > 0, 'flotte bloquée')
    assert.ok(stats.binMove > 0, 'aucun bac en mouvement pendant la mesure')
    // Tolérance 3× à 2 cases/s : useFrame et la sonde rAF ne s'exécutent pas au même instant.
    assert.ok(stats.maxMove <= 6 * stats.max / 1000 + 0.01, `saut dans le rendu interpolé : ${JSON.stringify(stats)}`)
    await page.screenshot({ path: fileURLToPath(new URL(`./scene-${count}.png`, import.meta.url)) })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const paused = await measure(1)
    assert.equal(paused.totalMove, 0, 'la flotte bouge en pause')
    assert.equal(paused.binMove, 0, 'les bacs bougent en pause')
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    results.push(stats)
    console.log(`flotte : ${count} robots`)
    console.log(`cadence         : ${stats.fps.toFixed(1)} images/s sur ${SECONDS} s (${stats.frames} images)`)
    console.log(`durée d'image   : p95 ${stats.p95.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms`)
    console.log(`flotte (1×)     : déplacement individuel max ${stats.maxMove.toFixed(3)} case/image`)
    console.log(`flotte en pause : déplacement total ${paused.totalMove.toFixed(3)} case sur 1 s`)
  }
  await page.getByRole('button', { name: '10×', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '10×', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.ok((await measure(1)).totalMove > 0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByLabel('Robots', { exact: true }).selectOption('20')
  await page.waitForFunction(() => window.kinesis?.mesh?.count === 20)
  assert.equal((await measure(0.5)).totalMove, 0, 'changement de flotte en pause')
  // Cycle 3D réel via les commandes de lecture ; aucun step injecté dans la page.
  await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  await page.waitForFunction(() => window.kinesis.sim.robots.some((r) => r.phase === 'upTake'), null, { timeout: 30000, polling: 'raf' })
  await page.screenshot({ path: fileURLToPath(new URL('./climbing.png', import.meta.url)) })
  // À 10×, la prise ne dure que 80 ms : observer et cliquer dans le même tour du navigateur.
  await page.waitForFunction(() => {
    if (!window.kinesis.sim.robots.some((r) => r.phase === 'take' && r.progress > 0)) return false
    const pause = Array.from(document.querySelectorAll('.panel button')).find((button) => button.textContent === 'Pause')
    if (!pause) return false
    pause.click()
    return true
  }, null, { timeout: 30000, polling: 'raf' })
  await page.getByRole('button', { name: 'Lecture', exact: true }).waitFor()
  const transfer = await page.evaluate(() => {
    const { sim, bins, mesh } = window.kinesis
    const r = sim.robots.find((r) => r.phase === 'take')
    if (!r) return null
    return { robot: r.id, bin: r.bin, level: r.level, progress: r.progress,
      robotY: mesh.instanceMatrix.array[r.id * 16 + 13], binY: bins.instanceMatrix.array[r.bin * 16 + 13],
      columns: sim.columns.length, bins: bins.count }
  })
  assert.ok(transfer && transfer.level > 0 && transfer.robotY > 0.2 && transfer.binY > transfer.robotY)
  assert.equal(transfer.columns, 32)
  assert.equal(transfer.bins, 128)
  await page.evaluate((robotId) => {
    const { sim } = window.kinesis, r = sim.robots[robotId]
    const { camera, controls } = window.kinesisView.get()
    window.kinesisSavedView = { position: camera.position.toArray(), target: controls.target.toArray() }
    const x = r.x - sim.width / 2 + 0.5, z = r.z - sim.depth / 2 + 0.5
    camera.position.set(x - 5, 8, z + 8)
    controls.target.set(x + 0.5, 3, z)
    controls.update()
  }, transfer.robot)
  await page.waitForTimeout(100)
  await page.screenshot({ path: fileURLToPath(new URL('./transfer.png', import.meta.url)) })
  const transferPause = await measure(0.5)
  assert.equal(transferPause.totalMove + transferPause.binMove, 0, 'transfert non figé en pause')
  // Vues rapprochées des vrais assets du run, pour contrôler les détails et les intersections.
  await page.evaluate((robotId) => {
    const { camera, controls } = window.kinesisView.get(), { mesh, bins, sim } = window.kinesis
    const r = sim.robots[robotId], a = bins.instanceMatrix.array, offset = r.bin * 16
    const x = a[offset + 12], y = a[offset + 13], z = a[offset + 14]
    camera.position.set(x - 1.6, y + 1.1, z + 1.7)
    controls.target.set(x, y, z); controls.update()
    const floorRobot = sim.robots.find((r) => r.level === 0 && r.bin === -1)
    window.kinesisFloorRobot = floorRobot?.id ?? robotId
  }, transfer.robot)
  await page.waitForTimeout(100)
  await page.screenshot({ path: fileURLToPath(new URL('./bin-detail.png', import.meta.url)) })
  await page.evaluate(() => {
    const { camera, controls } = window.kinesisView.get(), { mesh } = window.kinesis
    const a = mesh.instanceMatrix.array, offset = window.kinesisFloorRobot * 16
    const x = a[offset + 12], y = a[offset + 13], z = a[offset + 14]
    camera.position.set(x - 1.2, y + .85, z + 1.3)
    controls.target.set(x, y + .05, z); controls.update()
  })
  await page.waitForTimeout(100)
  await page.screenshot({ path: fileURLToPath(new URL('./robot-detail.png', import.meta.url)) })
  await page.evaluate(() => {
    const { camera, controls } = window.kinesisView.get(), saved = window.kinesisSavedView
    camera.position.fromArray(saved.position)
    controls.target.fromArray(saved.target)
    controls.update()
  })
  await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  await page.waitForFunction(() => window.kinesis.sim.robots.some((r) => r.returns > 0), null, { timeout: 30000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const completed = await page.evaluate(() => window.kinesis.sim.robots.filter((r) => r.returns > 0).length)
  assert.ok(completed > 0)
  console.log('Cycle 3D vérifié : montée, transfert latéral figé en pause, station et remise en stock')
  const layouts = []
  for (const [preset, columns, levels, stations] of [['dense', 80, 4, 4], ['large', 120, 6, 6]]) {
    await page.getByRole('button', { name: 'Construire', exact: true }).click()
    await page.getByLabel('Configuration prédéfinie').selectOption(preset)
    await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
    await page.waitForFunction(({ columns, levels }) => window.kinesis.sim.columns.length === columns && window.kinesis.sim.levels === levels, { columns, levels })
    assert.equal(await page.evaluate(() => window.kinesis.sim.stations.length), stations)
    assert.equal(await page.getByRole('button', { name: 'Lecture', exact: true }).count(), 1, 'appliquer conserve la pause')
    await page.getByRole('button', { name: 'Lecture', exact: true }).click()
    await page.waitForFunction(() => window.kinesis.sim.bins.some((b) => b.carrier !== -1), null, { timeout: 30000 })
    await page.getByRole('button', { name: '1×', exact: true }).click()
    const stats = await measure(SECONDS)
    assert.ok(stats.totalMove > 0 && stats.binMove > 0)
    layouts.push({ preset, columns, levels, stations, ...stats })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.screenshot({ path: fileURLToPath(new URL(`./layout-${preset}.png`, import.meta.url)) })
    console.log(`plan ${preset} : ${columns} travées, ${levels} niveaux, ${stats.fps.toFixed(1)} images/s, p95 ${stats.p95.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms`)
    await page.getByRole('button', { name: '10×', exact: true }).click()
  }
  // Brouillon, erreur récupérable, génération et placement clavier puis application réelle.
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  await page.getByLabel('Configuration prédéfinie').selectOption('demo')
  await page.getByLabel('Largeur (cellules)').fill('50')
  await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
  await page.getByRole('alert').filter({ hasText: 'Générer le plan' }).waitFor()
  assert.equal(await page.evaluate(() => window.kinesis.sim.columns.length), 120)
  await page.getByLabel('Configuration prédéfinie').selectOption('demo') // recharger le même preset doit fonctionner
  await page.getByLabel('Largeur (cellules)').fill('16')
  await page.getByLabel('Rangées', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Générer le plan' }).click()
  await page.getByRole('alert').filter({ hasText: 'trop petit' }).waitFor()
  assert.equal(await page.evaluate(() => window.kinesis.sim.columns.length), 120, 'un brouillon a modifié le run')
  await page.getByLabel('Largeur (cellules)').fill('32')
  await page.getByLabel('Profondeur (cellules)').fill('24')
  await page.getByLabel('Rangées', { exact: true }).fill('3')
  await page.getByLabel('Travées / rangée').fill('5')
  await page.getByLabel('Stations', { exact: true }).fill('2')
  await page.getByLabel('Niveaux', { exact: true }).fill('3')
  await page.getByLabel('Remplissage (%)').fill('50')
  await page.getByLabel('Rangement initial').selectOption('near-station')
  await page.getByLabel('Robots', { exact: true }).last().fill('17')
  await page.getByRole('button', { name: 'Générer le plan' }).click()
  await page.getByRole('button', { name: 'Effacer', exact: true }).click()
  const plan = page.locator('svg.plan')
  await plan.focus()
  await page.keyboard.press('Enter') // enlève la travée (2, 2)
  await page.getByRole('button', { name: 'Station', exact: true }).click()
  await plan.focus()
  await page.keyboard.press('Enter') // station au même emplacement libéré
  await page.getByRole('button', { name: 'Travée', exact: true }).click()
  await plan.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter') // chevauchement avec la travée suivante
  await page.getByRole('alert').filter({ hasText: 'chevauchent' }).waitFor()
  await page.getByLabel('X', { exact: true }).fill('6')
  await page.getByLabel('Z', { exact: true }).fill('14')
  await page.getByRole('button', { name: 'Utiliser l’outil' }).click()
  // Pointer sur une case du plan : ajouter puis retirer une travée sans changer le run.
  await page.locator('.plan-cell').nth(7 * 16 + 5).click()
  await page.getByRole('button', { name: 'Effacer', exact: true }).click()
  await page.locator('.plan-cell').nth(7 * 16 + 5).click()
  await page.getByRole('button', { name: 'Annuler la modification', exact: true }).click()
  await page.locator('.plan-cell').nth(7 * 16 + 5).click() // effacer à nouveau, après annulation
  await page.screenshot({ path: fileURLToPath(new URL('./editor.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
  await page.waitForFunction(() => window.kinesis.sim.width === 32 && window.kinesis.mesh.count === 17)
  await assertRenderedPlan()
  assert.equal(await page.evaluate(() => window.kinesis.sim.columns.length), 15)
  assert.equal(await page.evaluate(() => window.kinesis.sim.stations.length), 3)
  assert.equal(await page.evaluate(() => window.kinesis.sim.bins.length), 22)
  assert.equal(await page.evaluate(() => window.kinesis.sim.tick), 0)
  assert.equal(await page.getByLabel('Robots', { exact: true }).inputValue(), '17')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForFunction(() => window.kinesis?.mesh.count === 17)
  assert.equal(await page.evaluate(() => window.kinesis.sim.width), 32)
  assert.equal(await page.evaluate(() => window.kinesis.sim.bins.length), 22)
  assert.equal(await page.evaluate(() => window.kinesis.sim.tick), 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '10×', exact: true }).click()
  await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  await page.waitForFunction(() => window.kinesis.sim.robots.some((r) => r.returns > 0), null, { timeout: 30000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.locator('.editor').evaluate((p) => {
    const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
  }))
  await page.screenshot({ path: fileURLToPath(new URL('./editor-mobile.png', import.meta.url)) })
  await page.locator('svg.plan').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Station', exact: true }).click()
  await page.getByLabel('X', { exact: true }).fill('0')
  await page.getByLabel('Z', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Utiliser l’outil' }).click()
  assert.equal(await page.evaluate(() => window.kinesis.sim.stations.length), 3, 'édition mobile appliquée sans validation')
  await page.screenshot({ path: fileURLToPath(new URL('./editor-mobile-plan.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  await page.getByLabel('Configuration prédéfinie').selectOption('demo')
  await page.getByLabel('Robots', { exact: true }).last().fill('20')
  await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
  await page.waitForFunction(() => window.kinesis.mesh.count === 20)
  console.log('Éditeur vérifié : presets, génération, placement/effacement clavier, erreurs, brouillon isolé, niveaux, rangement, flotte personnalisée et cycle complet')
  await page.locator('.panel summary').focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.panel details').getAttribute('open'), '')
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.panel details').getAttribute('open'), null)
  await page.getByLabel('Robots', { exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.kinesis?.mesh?.count === 100)
  // Régression : changer la flotte au clavier laisse le focus sur le choix de flotte, l'éditeur reste fermé.
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fleet', 'focus déplacé par le choix de flotte')
  assert.equal(await page.locator('.editor').count(), 0, 'éditeur ouvert par le choix de flotte')
  // Étape 4 : temps perdu calculé par le moteur, carte 3D et coupe 2D identiques au moteur.
  const wasPaused = await page.getByRole('button', { name: 'Lecture', exact: true }).count() === 1
  if (wasPaused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  await page.getByRole('button', { name: '10×', exact: true }).click()
  await page.waitForFunction(() => window.kinesis.sim.lostSteps > 0 && window.kinesis.sim.tick > 1500, null, { timeout: 30000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: '1×', exact: true }).click()
  await page.waitForTimeout(600) // deux rafraîchissements à 4 Hz
  const congestion = await page.evaluate(() => {
    const { sim } = window.kinesis, cells = sim.width * sim.depth
    const layer = window.kinesisView.scene.getObjectByName('lost-time'), data = layer.material.map.image.data
    const ctx = document.querySelector('.cut').getContext('2d'), cut = ctx.getImageData(0, 0, sim.width, sim.depth).data
    let max = 0, top = 0, nonzero = 0
    for (let c = 0; c < cells; c++) {
      const v = sim.lost[c]
      if (v > max) { max = v; top = c }
      const o = ((sim.depth - 1 - Math.floor(c / sim.width)) * sim.width + c % sim.width) * 4
      if ((data[o + 3] > 0) !== (v > 0)) throw new Error('Texture 3D différente du moteur')
      if (v > 0) nonzero++
    }
    const o3 = ((sim.depth - 1 - Math.floor(top / sim.width)) * sim.width + top % sim.width) * 4
    const rgb = (a, o) => Array.from(a.slice(o, o + 3))
    if (sim.lost.reduce((a, v) => a + v, 0) !== sim.lostSteps) throw new Error('Cumul par case différent du total')
    return { tick: sim.tick, robots: sim.robots.length, lostSteps: sim.lostSteps, freeSteps: sim.freeSteps, nonzero, max, top,
      layerY: layer.position.y, top3d: rgb(data, o3), top2d: rgb(cut, top * 4), text: document.querySelector('.congestion').innerText }
  })
  assert.deepEqual(congestion.top3d, [253, 231, 37], 'case maximale non jaune (viridis) en 3D')
  assert.deepEqual(congestion.top2d, [253, 231, 37], 'case maximale non jaune (viridis) dans la coupe')
  assert.ok(congestion.nonzero > 0 && Math.abs(congestion.layerY) < .01)
  for (const label of ['Un seul run', 'solveur non validé', 'chauffe incluse', 'bacs/h', '% du trajet libre', 'Temps perdu, sol']) {
    assert.ok(congestion.text.includes(label), `mention absente : ${label}`)
  }
  const maxText = `${(congestion.max * .1).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`
  assert.ok(congestion.text.includes(`case (${congestion.top % 48}, ${Math.floor(congestion.top / 48)}), ${maxText}`), 'maximum affiché différent du moteur')
  const cut = await page.locator('.cut').boundingBox()
  await page.mouse.move(cut.x + (congestion.top % 48 + .5) * cut.width / 48, cut.y + (Math.floor(congestion.top / 48) + .5) * cut.height / 32)
  await page.locator('.congestion').getByText(`Case (${congestion.top % 48}, ${Math.floor(congestion.top / 48)}) : ${maxText}`).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('./congestion.png', import.meta.url)) })
  await page.getByRole('button', { name: 'N2', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.locator('.congestion h2').getByText('Temps perdu, niveau 2').waitFor()
  await page.locator('.congestion').getByText('Aucun temps perdu à ce niveau : la colonne est réservée avant la montée.').waitFor()
  assert.ok(Math.abs(await page.evaluate(() => window.kinesisView.scene.getObjectByName('lost-time').position.y) - 2 * 1.4) < .01, 'coupe 3D au mauvais niveau')
  await page.screenshot({ path: fileURLToPath(new URL('./congestion-level.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Sol', exact: true }).click()
  const pausedLost = await page.evaluate(() => window.kinesis.sim.lostSteps)
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.kinesis.sim.lostSteps), pausedLost, 'temps perdu modifié en pause')
  if (!wasPaused) await page.getByRole('button', { name: 'Lecture', exact: true }).click()
  console.log(`Temps perdu vérifié : ${congestion.robots} robots, ${congestion.tick} pas, ${congestion.lostSteps} pas perdus / ${congestion.freeSteps} pas libres, ${congestion.nonzero} cases`)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.locator('.panel').evaluate((p) => {
    const r = p.getBoundingClientRect()
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
  }), 'panneau hors écran sur mobile')
  await page.locator('.congestion summary').click()
  await page.screenshot({ path: fileURLToPath(new URL('./mobile.png', import.meta.url)) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForFunction(() => window.kinesis?.mesh?.count === 100)
  assert.equal((await measure(0.5)).totalMove, 0, 'lecture automatique malgré mouvement réduit')
  assert.equal(await page.locator('.congestion').getAttribute('open'), null, 'temps perdu déplié par défaut sur téléphone')
  await page.locator('.congestion summary').focus()
  await page.keyboard.press('Enter')
  assert.ok(await page.evaluate(() => {
    const a = document.querySelector('.panel').getBoundingClientRect(), b = document.querySelector('.congestion').getBoundingClientRect()
    return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= a.top
  }), 'panneau du temps perdu hors écran ou superposé aux commandes sur mobile')
  await page.screenshot({ path: fileURLToPath(new URL('./congestion-mobile.png', import.meta.url)) })
  await page.keyboard.press('Enter')
  const resourceCounts = []
  const textureCounts = []
  for (const preset of ['dense', 'large', 'demo', 'large', 'demo']) {
    await page.getByRole('button', { name: 'Construire', exact: true }).click()
    await page.getByLabel('Configuration prédéfinie').selectOption(preset)
    await page.getByLabel('Robots', { exact: true }).last().fill('20')
    await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
    await page.waitForTimeout(100)
    await assertRenderedPlan()
    resourceCounts.push(await page.evaluate(() => window.kinesisView.gl.info.memory.geometries))
    textureCounts.push(await page.evaluate(() => window.kinesisView.gl.info.memory.textures))
    assert.equal(await page.evaluate(() => {
      let racks = 0
      window.kinesisView.scene.traverse((object) => { if (object.name === 'rack-0') racks++ })
      return racks
    }), 1, 'anciens racks encore présents après remplacement du plan')
  }
  assert.equal(resourceCounts[1], resourceCounts[3], 'géométries accumulées à chaque modification')
  assert.equal(resourceCounts[2], resourceCounts[4], 'géométries accumulées sur retour au plan initial')
  assert.equal(textureCounts[1], textureCounts[3], 'textures accumulées à chaque modification')
  assert.equal(textureCounts[2], textureCounts[4], 'textures accumulées sur retour au plan initial')
  await page.getByRole('button', { name: 'Construire', exact: true }).click()
  await page.getByLabel('Configuration prédéfinie').selectOption('dense')
  const saved = await page.evaluate(() => localStorage.getItem('kinesis.configuration.v1'))
  await page.getByLabel('Robots', { exact: true }).last().fill('300')
  await page.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
  await page.getByRole('alert').filter({ hasText: '220 baies' }).waitFor()
  assert.equal(await page.evaluate(() => window.kinesis.sim.columns.length), 32, 'plan invalide appliqué')
  assert.equal(await page.evaluate(() => localStorage.getItem('kinesis.configuration.v1')), saved, 'sauvegarde écrasée par un plan invalide')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Construire', exact: true }).waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => document.activeElement.id), 'open-editor', 'focus non restauré après fermeture')
  // Données invalides ou stockage refusé : l'app doit continuer à fonctionner et prévenir l'utilisateur.
  for (const failure of ['corrupt', 'unsupported', 'read-denied', 'denied']) {
    const probe = await browser.newPage()
    probe.on('pageerror', (error) => errors.push(error.message))
    probe.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await probe.addInitScript((failure) => {
      if (failure === 'corrupt') localStorage.setItem('kinesis.configuration.v1', '{invalid-json')
      else if (failure === 'unsupported') localStorage.setItem('kinesis.configuration.v1', '{"version":2}')
      else if (failure === 'read-denied') Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new Error('Storage disabled') } })
      else Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('Storage disabled') } })
    }, failure)
    await probe.goto(PAGE)
    await probe.waitForFunction(() => window.kinesis?.mesh?.count === 20)
    if (failure !== 'denied') {
      await probe.getByRole('alert').filter({ hasText: 'illisible' }).waitFor()
      if (failure !== 'read-denied') assert.equal(await probe.evaluate(() => localStorage.getItem('kinesis.configuration.v1')),
        failure === 'corrupt' ? '{invalid-json' : '{"version":2}', 'sauvegarde invalide écrasée au chargement')
    }
    else {
      await probe.getByRole('button', { name: 'Construire', exact: true }).click()
      await probe.getByLabel('Configuration prédéfinie').selectOption('dense')
      await probe.getByRole('button', { name: 'Appliquer et redémarrer' }).click()
      await probe.waitForFunction(() => window.kinesis.sim.columns.length === 80)
      await probe.getByRole('alert').filter({ hasText: 'sauvegarde locale a échoué' }).waitFor()
    }
    await probe.close()
  }
  const additional = await checkRemaining({ browser, page, PAGE, measure, assertRenderedPlan, errors })
  assert.deepEqual(errors, [], 'erreurs console')
  await writeFile(fileURLToPath(new URL('./results.json', import.meta.url)), JSON.stringify({
    date: new Date().toISOString(), renderer, viewport: { width: 1280, height: 800 }, seed: 1,
    speed: 1, seconds: SECONDS, status: 'un seul run par flotte, solveur non validé',
    results, layouts, geometry, resourceCounts, textureCounts, additional, scenario: { transfer, completed }, congestion: { ...congestion, text: undefined }, errors,
  }, null, 2))
  console.log(`erreurs console : ${errors.length}`)
  console.log('captures : web/check/scene-{20,100,300}.png, climbing.png, transfer.png, robot-detail.png, bin-detail.png, layout-{dense,large}.png, editor*.png, congestion*.png, mobile.png; résultats : web/check/results.json')
} finally {
  await browser?.close()
  if (server.exitCode === null) await new Promise((resolve) => {
    server.once('close', resolve)
    server.kill()
  })
}
