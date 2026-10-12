// Plans des contrôles : modèles par technologie et valeurs attendues calculées par le moteur.
import { layoutFloor, layoutMetrics, templateLayout } from '../src/sim/layout.ts'

export function expected(id, width = 48, depth = 32, levels = 4, stations = 4) {
  const layout = templateLayout(id, width, depth, levels, stations)
  return { layout, columns: layout.racks.length, blocked: layoutFloor(layout).filter((k) => k === 'blocked').length, ...layoutMetrics(layout) }
}

// Dans Concevoir : sol à la taille voulue, puis modèle (généré sur ce sol).
export async function usePlan(target, id, width = 48, depth = 32) {
  await target.getByLabel('Largeur (cellules)').fill(String(width))
  await target.getByLabel('Profondeur (cellules)').fill(String(depth))
  await target.locator(`svg.plan[aria-label^="Plan ${width} par ${depth}."]`).waitFor()
  await target.locator(`[data-preset="${id}"]`).click()
}

// Plan de départ (aucune configuration enregistrée), 20 robots, Simuler en pause à t = 0.
export async function resetPlan(page) {
  await page.evaluate(() => localStorage.removeItem('kinesis.configuration.v1'))
  await page.goto(page.url().split('#')[0] + '#concevoir')
  await page.reload()
  await page.waitForFunction(() => window.kinesis?.sim.columns.length === 64 && window.kinesis.mesh.count === 20)
  await page.locator('#tab-simulation').click()
}
