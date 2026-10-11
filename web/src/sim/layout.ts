import { GEOMETRY } from './geometry.ts'
export type Point = { x: number; z: number }
export type Layout = {
  width: number; depth: number; levels: number; fill: number; storage: 'random' | 'near-station'
  racks: Point[]; stations: Point[]
}

export const DEFAULT_LAYOUT: Layout = {
  width: 48, depth: 32, levels: 4, fill: 100, storage: 'random',
  racks: [8, 18, 28, 38].flatMap((x) => Array.from({ length: 8 }, (_, i) => ({ x: x - 2, z: 8 + i * 2 }))),
  stations: [8, 18, 28, 38].map((x) => ({ x, z: 28 })),
}

export function regularLayout(width: number, depth: number, rows: number, bays: number,
  levels: number, stationCount: number, fill = 100, storage: Layout['storage'] = 'random'): Layout {
  if (![rows, bays, stationCount].every(Number.isInteger) || rows < 1 || rows > 12 || bays < 1 || bays > 24 ||
      stationCount < 1 || stationCount > 12) throw new RangeError('Choisir 1–12 rangées et stations, et 1–24 travées.')
  const stride = Math.floor((width - 6) / Math.max(1, rows - 1) / 2) * 2
  if (rows > 1 && stride < 4 || bays * 2 + 6 > depth) {
    throw new RangeError('Le sol est trop petit pour ces rangées ou travées. Agrandir le sol ou réduire le stockage.')
  }
  const racks = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: bays }, (_, j) => ({ x: 2 + i * stride, z: 2 + j * 2 }))).flat()
  const stationStride = Math.floor((width - 2) / Math.max(1, stationCount - 1) / 2) * 2
  if (stationCount > 1 && stationStride < 2) throw new RangeError('Pas assez de place pour les stations.')
  const layout = { width, depth, levels, fill, storage, racks,
    stations: Array.from({ length: stationCount }, (_, i) => ({ x: i * stationStride, z: depth - 2 })) }
  validateLayout(layout)
  return layout
}

export const PRESETS = {
  demo: DEFAULT_LAYOUT,
  dense: regularLayout(48, 32, 8, 10, 4, 4),
  large: regularLayout(64, 40, 10, 12, 6, 6),
}

for (const plan of Object.values(PRESETS)) {
  for (const point of [...plan.racks, ...plan.stations]) Object.freeze(point)
  Object.freeze(plan.racks); Object.freeze(plan.stations); Object.freeze(plan)
}

export function validateLayout(layout: Layout): number {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new RangeError('Plan invalide : objet de configuration requis.')
  const { width, depth, levels, fill, racks, stations } = layout
  if (!Number.isInteger(width) || width < 16 || width > 80 || width % 2 ||
      !Number.isInteger(depth) || depth < 16 || depth > 64 || depth % 2) {
    throw new RangeError('Le sol doit avoir des dimensions paires : largeur 16–80, profondeur 16–64 cellules.')
  }
  if (!Number.isInteger(levels) || levels < 1 || levels > 8) throw new RangeError('Choisir 1 à 8 niveaux.')
  if (!Number.isInteger(fill) || fill < 1 || fill > 100) throw new RangeError('Le remplissage doit être entre 1 et 100 %.')
  if (layout.storage !== 'random' && layout.storage !== 'near-station') throw new RangeError('Mode de rangement inconnu.')
  if (!Array.isArray(racks) || racks.length < 1 || racks.length > 256) throw new RangeError('Le plan doit contenir 1 à 256 travées de stockage.')
  if (!Array.isArray(stations) || stations.length < 1 || stations.length > 12) throw new RangeError('Le plan doit contenir 1 à 12 stations.')
  const used = new Set<number>()
  for (const [kind, points] of [['rack', racks], ['station', stations]] as const) for (const p of points) {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.z) || p.x % 2 || p.z % 2 ||
        p.x < 0 || p.z < 0 || p.x > width - 2 || p.z > depth - 2 ||
        kind === 'rack' && (p.x < 2 || p.x > width - 4 || p.z < 2 || p.z > depth - 4)) {
      throw new RangeError('Placement hors du sol ou hors des emplacements pairs autorisés.')
    }
    const cells = kind === 'rack' ? [p.z * width + p.x, p.z * width + p.x + GEOMETRY.supportOffsetX] : [p.z * width + p.x]
    for (const cell of cells) {
      if (used.has(cell)) throw new RangeError('Deux équipements se chevauchent. Libérer leur emplacement avant de les placer.')
      used.add(cell)
    }
  }
  // Les lignes impaires restent libres : chaque baie rejoint le même réseau de circulation.
  return width * depth / 4 - used.size
}

export function editLayout(layout: Layout, tool: 'rack' | 'station' | 'erase', x: number, z: number): Layout {
  validateLayout(layout)
  if (!['rack', 'station', 'erase'].includes(tool)) throw new RangeError('Outil de placement inconnu.')
  if (!Number.isInteger(x) || !Number.isInteger(z) || x % 2 || z % 2 || x < 0 || z < 0 || x >= layout.width || z >= layout.depth) {
    throw new RangeError('Choisir des coordonnées paires à l’intérieur du sol.')
  }
  const next: Layout = { ...layout, racks: layout.racks.map((p) => ({ ...p })), stations: layout.stations.map((p) => ({ ...p })) }
  if (tool === 'erase') {
    next.racks = next.racks.filter((p) => p.z !== z || p.x !== x && p.x + GEOMETRY.supportOffsetX !== x)
    next.stations = next.stations.filter((p) => p.x !== x || p.z !== z)
  } else next[tool === 'rack' ? 'racks' : 'stations'].push({ x, z })
  validateLayout(next)
  return next
}

export type Configuration = { version: 1; seed: number; count: number; layout: Layout }

export function validateSeed(seed: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('La graine doit être un entier entre 0 et 4294967295.')
}

export function validateFleet(count: number, capacity: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 300) throw new RangeError('Choisir une flotte de 1 à 300 robots.')
  if (count > capacity) throw new RangeError(`Ce plan offre ${capacity} baies pour les robots. Réduire la flotte ou agrandir le sol.`)
}

export function parseConfiguration(value: unknown): Configuration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Configuration sauvegardée invalide.')
  const data = value as Record<string, unknown>
  if (data.version !== 1) throw new RangeError('Version de configuration non prise en charge.')
  const layout = parseLayout(data.layout)
  validateSeed(data.seed as number); validateFleet(data.count as number, validateLayout(layout))
  return { version: 1, seed: data.seed as number, count: data.count as number, layout }
}

// Ne conserver que les données connues, jamais les autres propriétés d'un JSON reçu.
export function parseLayout(value: unknown): Layout {
  const plan = value as Layout
  validateLayout(plan)
  return { width: plan.width, depth: plan.depth, levels: plan.levels, fill: plan.fill, storage: plan.storage,
    racks: plan.racks.map(({ x, z }) => ({ x, z })), stations: plan.stations.map(({ x, z }) => ({ x, z })) }
}

// Bases de normalisation : emplacements de stockage (travées × niveaux) et emprise au sol (cases).
export const storageSlots = (layout: Layout) => layout.racks.length * layout.levels
export const footprint = (layout: Layout) => layout.width * layout.depth
