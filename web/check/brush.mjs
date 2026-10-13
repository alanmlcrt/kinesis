// Pinceau de Concevoir : trait rapide sans trou, travée centrée sous le pointeur, clic droit = gomme,
// zone remplie jusqu'au bord droit, survol d'un grand plan sans redessiner la grille.
import assert from 'node:assert/strict'

export async function checkBrush({ browser, PAGE }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(PAGE.replace('#simulation', '#concevoir'))
  const plan = page.locator('svg.plan')
  await plan.waitFor()
  // Coordonnées du plan (cellules) → pixels de l'écran.
  const at = (x, z) => plan.evaluate((svg, [x, z]) => { const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y } }, [x, z])
  const racks = () => page.locator('.plan-rack').count()
  const xs = () => page.evaluate(() => [...document.querySelectorAll('.plan-rack > rect:not(.plan-stock)')].map((r) => Math.round(Number(r.getAttribute('x')))))
  const drag = async (from, to, button = 'left', steps = 1) => {
    const a = await at(...from), b = await at(...to)
    await page.mouse.move(a.x, a.y); await page.mouse.down({ button }); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up({ button })
  }
  // Plan de départ : 4 rangées de 16 travées en x = 6, 16, 26, 36 (lignes 8 à 23).
  assert.equal(await racks(), 64)

  // Zone au clic droit : gomme les rangées 16, 26, 36 en un geste, outil Travée conservé.
  await page.getByRole('button', { name: 'Zone', exact: true }).click()
  await drag([14.5, 0.5], [47.5, 27.5], 'right', 4)
  assert.equal(await racks(), 16, 'zone au clic droit : gomme incomplète')
  assert.equal(await page.getByRole('button', { name: 'Travée', exact: true }).getAttribute('aria-pressed'), 'true')

  // Zone de la colonne 8 au bord droit : rayonnages jointifs (pas de 3), calés pour atteindre x = 44 (plus de colonne vide à droite).
  await drag([8.5, 2.5], [47.5, 5.5], 'left', 4)
  assert.equal(await racks(), 16 + 12 * 4, 'zone : nombre de travées')
  assert.equal(Math.max(...await xs()), 44, 'zone : la dernière allée doit toucher la bordure droite')

  // Trait rapide en un seul mouvement : aucune ligne sautée, annulé en une fois.
  await page.getByRole('button', { name: 'Point', exact: true }).click()
  const before = await racks()
  await drag([10.5, 10.5], [10.5, 20.5], 'left', 1)
  assert.equal(await racks(), before + 11, 'trait rapide : lignes sautées')
  await page.getByRole('button', { name: 'Annuler la modification', exact: true }).click()
  assert.equal(await racks(), before, 'un trait doit s’annuler en une fois')

  // Travée centrée sous le pointeur : en 2025+, l'allée va dans la cellule visée, 11 (emprise 10 à 12).
  const p = await at(11.8, 24.5)
  await page.mouse.move(p.x, p.y)
  assert.equal(await page.locator('.plan-ghost').getAttribute('x'), '10', 'fantôme non centré sous le pointeur')
  await page.mouse.down(); await page.mouse.up()
  assert.ok((await xs()).includes(11), 'travée posée ailleurs que sous le pointeur')
  // Clic droit sur un rayonnage (cellule 12) : retire la travée entière.
  const n = await racks(), q = await at(12.5, 24.5)
  await page.mouse.click(q.x, q.y, { button: 'right' })
  assert.equal(await racks(), n - 1, 'clic droit sur un rayonnage sans effet')

  // Grand plan (80 × 64, densité maximale) : survol de 60 positions, temps relevé.
  await page.getByLabel('Largeur (cellules)').fill('80')
  await page.getByLabel('Profondeur (cellules)').fill('64')
  await page.locator('svg.plan[aria-label^="Plan 80 par 64."]').waitFor()
  await page.locator('[data-preset="skypod-dense"]').click()
  const start = await at(1, 1), end = await at(78, 62)
  const t0 = Date.now()
  await page.mouse.move(start.x, start.y); await page.mouse.move(end.x, end.y, { steps: 60 })
  const hover = (Date.now() - t0) / 60
  assert.deepEqual(errors, [])
  await page.close()
  return { hoverMs: Math.round(hover * 10) / 10 }
}
