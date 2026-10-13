export type Point = { x: number; z: number }
export type Layout = {
  profile?: 'skypod' | 'lifts' | 'autostore'
  lifts?: Point[]; liftSteps?: number
  generation?: '2025+' | 'classic'
  width: number; depth: number; levels: number; fill: number; storage: 'random' | 'near-station'
  racks: Point[]; stations: Point[]
}

export const DEFAULT_LAYOUT: Layout = {
  width: 48, depth: 32, levels: 4, fill: 100, storage: 'random',
  racks: [8, 18, 28, 38].flatMap((x) => Array.from({ length: 16 }, (_, i) => ({ x: x - 2, z: 8 + i }))),
  stations: [8, 18, 28, 38].map((x) => ({ x, z: 28 })),
}

export function regularLayout(width: number, depth: number, rows: number, bays: number,
  levels: number, stationCount: number, fill = 100, storage: Layout['storage'] = 'random', generation?: Layout['generation']): Layout {
  if (![rows, bays, stationCount].every(Number.isInteger) || rows < 1 || rows > 12 || bays < 1 || bays > 60 ||
      stationCount < 1 || stationCount > 12) throw new RangeError('Choisir 1–12 rangées et stations, et 1–60 travées.')
  // Première allée en x = 4 : le bord gauche reste joignable même si les rayonnages bloquent le sol.
  // Rangées et stations réparties sur toute la largeur (écarts pairs arrondis), dernière rangée en x = largeur − 4.
  const spread = (count: number, from: number, to: number) => Array.from({ length: count }, (_, i) => from + Math.round(i * (to - from) / Math.max(1, count - 1) / 2) * 2)
  if (rows > 1 && (width - 8) / (rows - 1) < 4 || bays + 5 > depth) {
    throw new RangeError('Le sol est trop petit pour ces rangées ou travées. Agrandir le sol ou réduire le stockage.')
  }
  const racks = spread(rows, 4, width - 4).flatMap((x) => Array.from({ length: bays }, (_, j) => ({ x, z: 2 + j })))
  if (stationCount > 1 && (width - 2) / (stationCount - 1) < 2) throw new RangeError('Pas assez de place pour les stations.')
  const layout = { width, depth, levels, fill, storage, racks, ...(generation ? { generation } : {}),
    stations: spread(stationCount, 0, width - 2).map((x) => ({ x, z: depth - 2 })) }
  validateLayout(layout)
  return layout
}

// Implantation par allées (étape 7b) : remplit le sol au maximum pour une structure d'allées donnée.
// Dans un bloc, les rangées sont serrées (une seule voie entre elles, passage sous les racks).
export type AisleSpec = {
  profile?: Layout['profile']; lifts?: Point[]; liftSteps?: number
  generation?: Layout['generation']
  width: number; depth: number; levels: number
  block: number      // rangées par bloc, 1–12
  aisle: number      // cases libres entre deux blocs : 1, 3, 5, 7 ou 9
  cross: number      // travées entre deux allées transversales (0 : aucune)
  front: number      // cases libres entre le stockage et les stations : 0, 2, 4, 6 ou 8
  stations: number; sides: 1 | 2; fill: number; storage: Layout['storage']
}

export function aisleLayout(a: AisleSpec): Layout {
  if (!Number.isInteger(a.block) || a.block < 1 || a.block > 12) throw new RangeError('Choisir 1 à 12 rangées par bloc.')
  if (![1, 3, 5, 7, 9].includes(a.aisle)) throw new RangeError('Largeur d’allée : 1, 3, 5, 7 ou 9 cases.')
  if (!Number.isInteger(a.cross) || a.cross < 0 || a.cross > 24) throw new RangeError('Allées transversales : 0 (aucune) à 24 travées.')
  if (![0, 2, 4, 6, 8].includes(a.front)) throw new RangeError('Allée devant les stations : 0, 2, 4, 6 ou 8 cases.')
  if (a.sides !== 1 && a.sides !== 2) throw new RangeError('Stations sur 1 ou 2 côtés.')
  if (!Number.isInteger(a.stations) || a.stations < a.sides || a.stations > 12) throw new RangeError(`Choisir ${a.sides} à 12 stations.`)
  if (!Number.isInteger(a.width) || a.width < 16 || a.width > 80 || !Number.isInteger(a.depth) || a.depth < 16 || a.depth > 64 || a.width % 2 || a.depth % 2) {
    throw new RangeError('Le sol doit avoir des dimensions paires : largeur 16–80, profondeur 16–64 cellules.')
  }
  const xs: number[] = []
  // Dans un bloc : rayonnages dos à dos, jointifs (pas de 3) ; en classique, une cellule pleine entre eux (pas de 4).
  const pitch = a.generation === 'classic' ? 4 : 3
  for (let x = 4, i = 0; x <= a.width - 4; x += ++i % a.block ? pitch : 3 + a.aisle) xs.push(x)
  const zs: number[] = []
  const first = a.sides === 2 ? 2 + a.front : 2, last = a.depth - 4 - a.front
  // Une allée transversale = une ligne laissée libre après au moins `cross` travées, sur une ligne
  // impaire : c'est une voie de circulation continue de la grille.
  for (let z = first, n = 0; z <= last; z++) {
    if (a.cross && n >= a.cross && z % 2) { n = 0; continue }
    zs.push(z); n++
  }
  const racks = xs.flatMap((x) => zs.map((z) => ({ x, z })))
  if (!racks.length) throw new RangeError('Aucune travée ne tient : agrandir le sol ou réduire les allées.')
  if (racks.length > 2500) throw new RangeError(`${racks.length} travées : 2 500 au plus. Réduire le sol ou élargir les allées.`)
  const place = (count: number, z: number) => {
    const stride = Math.floor((a.width - 2) / Math.max(1, count - 1) / 2) * 2
    if (count > 1 && stride < 2) throw new RangeError('Pas assez de place pour les stations.')
    return Array.from({ length: count }, (_, i) => ({ x: i * stride, z }))
  }
  const top = a.sides === 2 ? Math.floor(a.stations / 2) : 0
  const layout = { width: a.width, depth: a.depth, levels: a.levels, fill: a.fill, storage: a.storage, racks, ...(a.generation ? { generation: a.generation } : {}),
    ...(a.profile ? { profile: a.profile, lifts: a.lifts, liftSteps: a.liftSteps } : {}),
    stations: [...place(top, 0).slice(0, top), ...place(a.stations - top, a.depth - 2)] }
  validateLayout(layout)
  return layout
}

// Modèles par technologie, générés à la taille du sol choisie par l'utilisateur.
export type Architecture = 'skypod' | 'classic' | 'lifts' | 'autostore'
export const TEMPLATES: { id: string; architecture: Architecture; name: string; purpose: string }[] = [
  { id: 'skypod-dense', architecture: 'skypod', name: 'Densité maximale', purpose: 'Rayonnages dos à dos sans case vide ; les robots passent sous les rayonnages.' },
  { id: 'skypod-balanced', architecture: 'skypod', name: 'Équilibré', purpose: 'Blocs de 4 allées, transversales régulières : stock et circulation.' },
  { id: 'skypod-flow', architecture: 'skypod', name: 'Débit prioritaire', purpose: 'Allées par paires, larges couloirs, stations des deux côtés.' },
  { id: 'classic-back', architecture: 'classic', name: 'Rayonnages dos à dos', purpose: 'Une allée de grimpe par paire de rayonnages ; on circule par les allées.' },
  { id: 'classic-cross', architecture: 'classic', name: 'Avec transversales', purpose: 'Allées coupées par des transversales, stations des deux côtés.' },
  { id: 'lifts-balanced', architecture: 'lifts', name: 'Étages et gaines', purpose: 'Blocs d’allées par étage, deux gaines d’ascenseur près des stations.' },
  { id: 'autostore-grid', architecture: 'autostore', name: 'Grille pleine', purpose: 'Piles sur toute la grille, ports en bordure ; robots au sommet.' },
  { id: 'autostore-two', architecture: 'autostore', name: 'Ports des deux côtés', purpose: 'Grille pleine, ports répartis sur deux bords pour équilibrer les flux.' },
]
export function templateLayout(id: string, width: number, depth: number, levels: number, stations: number): Layout {
  const base = { width, depth, levels, fill: 100, storage: 'random' as const }
  const aisles = (spec: Pick<AisleSpec, 'block' | 'aisle' | 'cross' | 'front' | 'sides'>, generation?: Layout['generation']) =>
    aisleLayout({ ...base, ...spec, stations: Math.max(spec.sides, stations), generation })
  if (id === 'skypod-dense') return aisles({ block: 12, aisle: 1, cross: 0, front: 2, sides: 1 })
  if (id === 'skypod-balanced') return aisles({ block: 4, aisle: 3, cross: 10, front: 2, sides: 1 })
  if (id === 'skypod-flow') return aisles({ block: 2, aisle: 5, cross: 6, front: 4, sides: 2 })
  if (id === 'classic-back') return aisles({ block: 2, aisle: 3, cross: 0, front: 2, sides: 1 }, 'classic')
  if (id === 'classic-cross') return aisles({ block: 2, aisle: 3, cross: 8, front: 2, sides: 2 }, 'classic')
  if (id === 'lifts-balanced') return withProfile(aisles({ block: 4, aisle: 3, cross: 10, front: 2, sides: 1 }), 'lifts')
  if (id === 'autostore-grid' || id === 'autostore-two') {
    // Une pile par emplacement pair, sur toute la grille hors bordures et rangée des ports.
    const sides = id === 'autostore-two' ? 2 : 1, top = sides === 2 ? 4 : 2, racks: Point[] = []
    for (let x = 2; x <= width - 3; x++) for (let z = top; z <= depth - 4; z++) racks.push({ x, z })
    if (racks.length > 2500) throw new RangeError(`${racks.length} piles : 2 500 au plus. Réduire le sol.`)
    const place = (count: number, z: number) => Array.from({ length: count }, (_, i) => ({ x: Math.floor(i * (width - 2) / Math.max(1, count - 1) / 2) * 2, z }))
    const n = Math.max(sides, stations), first = sides === 2 ? Math.floor(n / 2) : 0
    const layout: Layout = { ...base, racks, stations: [...place(first, 0), ...place(n - first, depth - 2)], profile: 'autostore' }
    validateLayout(layout)
    return layout
  }
  throw new RangeError('Modèle inconnu.')
}

// Une travée couvre 3 cases : rayonnage, allée de grimpe, rayonnage (brevet Exotec US11208264B2).
// Sol libre : part du sol sans stockage au-dessus (allées, stations, bordures). Hypothèse du modèle.
export const TRAVEE_CELLS = 3
export function layoutMetrics(layout: Layout) {
  const area = layout.width * layout.depth
  return { slots: storageSlots(layout), area, freeShare: 1 - (layout.profile === 'autostore' ? 1 : TRAVEE_CELLS) * layout.racks.length / area, fleet: validateLayout(layout) }
}

export const PRESETS = {
  demo: DEFAULT_LAYOUT,
  dense: regularLayout(48, 32, 8, 24, 4, 4),
  large: regularLayout(64, 40, 10, 30, 6, 6),
}

for (const plan of Object.values(PRESETS)) {
  for (const point of [...plan.racks, ...plan.stations]) Object.freeze(point)
  Object.freeze(plan.racks); Object.freeze(plan.stations); Object.freeze(plan)
}

// Positions permises pour une travée (son allée) ou une pile : bordure libre autour du stockage, rangée des stations en bas.
export function rackBounds(l: Layout) { return { x0: 2, x1: l.width - (l.profile === 'autostore' ? 3 : 4), z0: 2, z1: l.depth - 4 } }

export function validateLayout(layout: Layout): number {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new RangeError('Plan invalide : objet de configuration requis.')
  const { width, depth, levels, fill, racks, stations } = layout
  if (layout.profile !== undefined && !['skypod', 'lifts', 'autostore'].includes(layout.profile)) throw new RangeError('Profil d’architecture inconnu.')
  if (layout.profile !== 'lifts' && (layout.lifts !== undefined || layout.liftSteps !== undefined)) throw new RangeError('Les gaines et leur durée concernent uniquement le profil ascenseurs.')
  if (layout.profile && layout.profile !== 'skypod' && layout.generation !== undefined) throw new RangeError('La génération concerne uniquement Skypod.')
  if (layout.generation !== undefined && layout.generation !== '2025+' && layout.generation !== 'classic') throw new RangeError('Génération Skypod inconnue.')
  if (!Number.isInteger(width) || width < 16 || width > 80 || width % 2 ||
      !Number.isInteger(depth) || depth < 16 || depth > 64 || depth % 2) {
    throw new RangeError('Le sol doit avoir des dimensions paires : largeur 16–80, profondeur 16–64 cellules.')
  }
  if (!Number.isInteger(levels) || levels < 1 || levels > 8) throw new RangeError('Choisir 1 à 8 niveaux.')
  if (!Number.isInteger(fill) || fill < 1 || fill > 100) throw new RangeError('Le remplissage doit être entre 1 et 100 %.')
  if (layout.storage !== 'random' && layout.storage !== 'near-station') throw new RangeError('Mode de rangement inconnu.')
  if (!Array.isArray(racks) || racks.length < 1 || racks.length > 2500) throw new RangeError('Le plan doit contenir 1 à 2 500 travées de stockage.')
  if (!Array.isArray(stations) || stations.length < 1 || stations.length > 12) throw new RangeError('Le plan doit contenir 1 à 12 stations.')
  const used = new Set<number>(), bounds = rackBounds(layout)
  for (const [kind, points] of [['rack', racks], ['station', stations]] as const) for (const p of points) {
    // Travées sur toutes les lignes (rangées continues) ; stations aux emplacements pairs.
    // AutoStore : grille pleine, une pile sur toute cellule.
    // Travées sur toute colonne hors classique : rayonnages dos à dos sans case vide (passage sous les racks).
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.z) || !(kind === 'rack' && layout.generation !== 'classic') && p.x % 2 || kind !== 'rack' && p.z % 2 ||
        p.x < 0 || p.z < 0 || p.x > width - 2 || p.z > depth - 2 ||
        kind === 'rack' && (p.x < bounds.x0 || p.x > bounds.x1 || p.z < bounds.z0 || p.z > bounds.z1)) {
      throw new RangeError('Placement hors du sol ou hors des emplacements pairs autorisés.')
    }
    // Travée Skypod : rayonnage à gauche (x − 1), allée de grimpe (x), rayonnage à droite (x + 1).
    const cells = kind === 'rack' && layout.profile !== 'autostore' ? [p.z * width + p.x - 1, p.z * width + p.x, p.z * width + p.x + 1] : [p.z * width + p.x]
    for (const cell of cells) {
      if (used.has(cell)) throw new RangeError('Deux équipements se chevauchent. Libérer leur emplacement avant de les placer.')
      used.add(cell)
    }
  }
  if (layout.profile === 'lifts') {
    if (!Array.isArray(layout.lifts) || layout.lifts.length < 1 || layout.lifts.length > 8 || !Number.isInteger(layout.liftSteps) || layout.liftSteps! < 5 || layout.liftSteps! > 100 || layout.liftSteps! % 5) {
      throw new RangeError('Ascenseurs : 1 à 8 gaines, durée par niveau de 5 à 100 pas, multiple de 5 (pas = 0,1 s).')
    }
    for (const p of layout.lifts) {
      // Travées sur toutes les lignes (rangées continues) ; stations aux emplacements pairs.
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.z) || p.x % 2 || p.z % 2 || p.x < 0 || p.z < 0 || p.x >= width || p.z >= depth) throw new RangeError('Placement de gaine invalide : coordonnées paires à l’intérieur du plan.')
      const c = p.z * width + p.x
      if (used.has(c)) throw new RangeError('Une gaine chevauche un équipement ou une autre gaine.')
      used.add(c)
    }
  }
  const floor = layoutFloor(layout), first = stations[0].z * width + stations[0].x
  const seen = new Set([first]), queue = [first]
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]
    for (const n of floorNeighbors(layout, c)) {
      if (n < 0 || seen.has(n) || floor[n] === 'blocked') continue
      seen.add(n)
      if (floor[n] === 'lane' || floor[n] === 'lift' || floor[n] === 'column' && layout.profile !== 'lifts') queue.push(n)
    }
  }
  for (let c = 0; c < floor.length; c++) if (floor[c] !== 'lane' && floor[c] !== 'blocked' && !seen.has(c)) {
    throw new RangeError(`Plan inaccessible : ${floor[c] === 'column' ? 'colonne' : floor[c] === 'station' ? 'station' : 'baie'} (${c % width}, ${Math.floor(c / width)}). Libérer une allée.`)
  }
  return floor.slice(0, width * depth).filter((kind) => kind === 'parking').length
}

export function floorNeighbors(layout: Layout, node: number): number[] {
  const cells = layout.width * layout.depth, cell = node % cells, x = cell % layout.width, z = Math.floor(cell / layout.width)
  const out = [x + 1 < layout.width ? node + 1 : -1, x > 0 ? node - 1 : -1,
    z + 1 < layout.depth ? node + layout.width : -1, z > 0 ? node - layout.width : -1]
  if (layout.profile === 'lifts' && layout.lifts?.some((p) => p.z * layout.width + p.x === cell)) {
    out.push(node >= cells ? node - cells : -1, node < layout.levels * cells ? node + cells : -1)
  }
  return out
}

export const profileLabel = (layout: Layout) => layout.profile === 'lifts' ? 'Ascenseurs' : layout.profile === 'autostore' ? 'AutoStore' : `Skypod ${layout.generation === 'classic' ? 'classique' : '2025+'}`
export function withProfile(layout: Layout, profile: NonNullable<Layout['profile']>, lifts?: Point[], liftSteps = 15): Layout {
  const next = parseLayout(layout)
  delete next.lifts; delete next.liftSteps
  next.profile = profile
  if (profile !== 'skypod') delete next.generation
  if (profile === 'lifts') {
    const floor = layoutFloor({ ...next, profile: 'skypod' })
    const free = floor.flatMap((kind, cell) => kind === 'parking' ? [{ x: cell % next.width, z: Math.floor(cell / next.width) }] : [])
    next.lifts = lifts?.map((p) => ({ ...p })) ?? [free[0], free[Math.min(free.length - 1, next.width / 2 - 1)]]
    next.liftSteps = liftSteps
  }
  validateLayout(next)
  return next
}

export type Floor = 'lane' | 'parking' | 'column' | 'station' | 'blocked' | 'lift'

// Même graphe pour la validation et le moteur. L'accès de grimpe reste une baie en bord d'allée.
export function layoutFloor(layout: Layout): Floor[] {
  const { width, depth } = layout
  const floor: Floor[] = Array.from({ length: width * depth }, (_, c) =>
    c % width % 2 === 0 && Math.floor(c / width) % 2 === 0 ? 'parking' : 'lane')
  for (const { x, z } of layout.racks) {
    // Travée : allée de grimpe (x) entre deux rayonnages (x ± 1) ; rayonnages bloqués au sol en classique.
    // Hors classique, sous un rayonnage on circule mais on ne stationne pas (allée de grimpe sur colonne impaire).
    if (layout.profile !== 'autostore') floor[z * width + x - 1] = floor[z * width + x + 1] = layout.generation === 'classic' ? 'blocked' : 'lane'
    floor[z * width + x] = 'column'
  }
  // Classique : deux rayonnages dos à dos (x + 1 et x + 3) sont jointifs ; la cellule entre eux est pleine.
  if (layout.generation === 'classic') for (const { x, z } of layout.racks) {
    if (x + 4 < width && layout.racks.some((p) => p.x === x + 4 && p.z === z)) floor[z * width + x + 2] = 'blocked'
  }
  for (const { x, z } of layout.stations) floor[z * width + x] = 'station'
  if (layout.profile === 'lifts') {
    for (const { x, z } of layout.lifts ?? []) floor[z * width + x] = 'lift'
    const ground = [...floor]
    for (let level = 1; level <= layout.levels; level++) floor.push(...ground.map((kind) => kind === 'parking' || kind === 'station' ? 'lane' : kind))
  }
  return floor
}

export function editLayout(layout: Layout, tool: 'rack' | 'station' | 'lift' | 'erase', x: number, z: number): Layout {
  validateLayout(layout)
  if (!['rack', 'station', 'lift', 'erase'].includes(tool)) throw new RangeError('Outil de placement inconnu.')
  const fine = tool === 'erase' || tool === 'rack' && (layout.generation !== 'classic' || layout.profile === 'autostore')
  if (!Number.isInteger(x) || !Number.isInteger(z) || x % 2 && !fine || (tool === 'station' || tool === 'lift') && z % 2 || x < 0 || z < 0 || x >= layout.width || z >= layout.depth) {
    throw new RangeError('Choisir des coordonnées paires à l’intérieur du sol (une travée peut aussi occuper une ligne impaire).')
  }
  const next: Layout = { ...layout, racks: layout.racks.map((p) => ({ ...p })), stations: layout.stations.map((p) => ({ ...p })), ...(layout.lifts ? { lifts: layout.lifts.map((p) => ({ ...p })) } : {}) }
  if (tool === 'erase') {
    // La gomme retire l'équipement qui couvre la cellule : une travée occupe x − 1 à x + 1.
    next.racks = next.racks.filter((p) => p.z !== z || Math.abs(p.x - x) > (layout.profile === 'autostore' ? 0 : 1))
    next.stations = next.stations.filter((p) => p.x !== x || p.z !== z)
    if (next.lifts) next.lifts = next.lifts.filter((p) => p.x !== x || p.z !== z)
  } else if (tool === 'lift') {
    if (next.profile !== 'lifts') throw new RangeError('Choisir le profil ascenseurs avant de placer une gaine.')
    next.lifts!.push({ x, z })
  } else next[tool === 'rack' ? 'racks' : 'stations'].push({ x, z })
  validateLayout(next)
  return next
}

// Redimensionne le sol depuis la matrice : ce qui se trouve au-delà du stockage suit le bord droit ou bas
// (stations et gaines gardent leur distance au bord) ; ce qui sort du sol est retiré.
export function resizeLayout(layout: Layout, width: number, depth: number): Layout {
  const maxX = Math.max(...layout.racks.map((p) => p.x + 2)), maxZ = Math.max(...layout.racks.map((p) => p.z + 1))
  const edge = (p: Point) => ({ x: p.x > maxX ? p.x + width - layout.width : p.x, z: p.z > maxZ ? p.z + depth - layout.depth : p.z })
  const inside = (p: Point) => p.x >= 0 && p.z >= 0 && p.x <= width - 2 && p.z <= depth - 2
  const next: Layout = { ...layout, width, depth, racks: layout.racks.filter((p) => p.x <= width - 4 && p.z <= depth - 4).map((p) => ({ ...p })),
    stations: layout.stations.map(edge).filter(inside), ...(layout.lifts ? { lifts: layout.lifts.map(edge).filter(inside) } : {}) }
  validateLayout(next)
  return next
}

export type Configuration = { version: 1; seed: number; count: number; layout: Layout; method?: 'whole' | 'window' | 'rhcr' }

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
  if (data.method !== undefined && !['whole', 'window', 'rhcr'].includes(data.method as string)) throw new RangeError('Méthode de pilotage inconnue.')
  return { version: 1, seed: data.seed as number, count: data.count as number, layout, ...(data.method ? { method: data.method as Configuration['method'] } : {}) }
}

// Ne conserver que les données connues, jamais les autres propriétés d'un JSON reçu.
export function parseLayout(value: unknown): Layout {
  const plan = value as Layout
  validateLayout(plan)
  return { width: plan.width, depth: plan.depth, levels: plan.levels, fill: plan.fill, storage: plan.storage,
    ...(plan.profile ? { profile: plan.profile } : {}),
    ...(plan.lifts ? { lifts: plan.lifts.map(({ x, z }) => ({ x, z })), liftSteps: plan.liftSteps } : {}),
    ...(plan.generation ? { generation: plan.generation } : {}),
    racks: plan.racks.map(({ x, z }) => ({ x, z })), stations: plan.stations.map(({ x, z }) => ({ x, z })) }
}

// Bases de normalisation : emplacements de stockage (travées × niveaux) et emprise au sol (cases).
// Deux bacs par niveau et par travée Skypod/ascenseurs (un de chaque côté), un par pile AutoStore.
export const storageSlots = (layout: Layout) => layout.racks.length * layout.levels * (layout.profile === 'autostore' ? 1 : 2)
export const footprint = (layout: Layout) => layout.width * layout.depth
