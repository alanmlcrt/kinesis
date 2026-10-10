// TypeScript pur. Géométrie illustrative, dimensions et durées non calibrées Exotec.
import { DEFAULT_LAYOUT, validateFleet, validateLayout, validateSeed, type Layout } from './layout.ts'
import { GEOMETRY, LEVEL_HEIGHT } from './geometry.ts'
export { LEVEL_HEIGHT } from './geometry.ts'
export const DT = 0.1
export const STEPS_PER_CELL = 5
export const STEPS_PER_LEVEL = 10
export const HANDLING_STEPS = 8
export const ENGAGEMENT_STEPS = 5

export type Phase = 'idle' | 'toRack' | 'engageTake' | 'upTake' | 'take' | 'downTake' |
  'bufferToStation' | 'toStation' | 'service' | 'bufferToReturn' | 'toReturn' |
  'engagePut' | 'upPut' | 'put' | 'downPut' | 'home'
export type Position = { x: number; y: number; z: number }
export type Column = { cell: number; stockX: number; stockZ: number; owner: number }
export type Bin = { id: number; column: number; level: number; carrier: number; reservedBy: number }
export type Robot = {
  id: number; x: number; z: number; level: number; home: number; station: number
  phase: Phase; progress: number; bin: number; column: number; returns: number; visits: number
  path: number[]; pathLength: number; pathIndex: number
  // Trajet en cours pour le temps perdu : départ, cases parcourues, trajet voulu refusé.
  legFrom: number; legMoved: number; blocked: boolean
}
export type State = {
  width: number; depth: number; levels: number; layout: Layout; seed: number; rng: number; tick: number
  robots: Robot[]; columns: Column[]; bins: Bin[]; stations: number[]
  // Les cases de service sont des baies : on ne les traverse pas pour rejoindre une autre baie.
  floor: ('lane' | 'parking' | 'column' | 'station' | 'blocked')[]
  occupied: number[]; reserved: number[]; parent: number[]; queue: number[]
  // Temps perdu en pas, par case et par niveau (index level * cellules + case) ; totaux du run.
  lost: number[]; lostSteps: number; freeSteps: number
}

function random(s: State): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function createSim(seed: number, count = 20, layout: Layout = DEFAULT_LAYOUT): State {
  validateSeed(seed)
  const capacity = validateLayout(layout)
  validateFleet(count, capacity)
  // Copie canonique : l'édition d'un brouillon ne peut pas modifier un run en cours.
  const plan: Layout = { ...layout, racks: layout.racks.map((p) => ({ ...p })).sort((a, b) => a.x - b.x || a.z - b.z),
    stations: layout.stations.map((p) => ({ ...p })).sort((a, b) => a.x - b.x || a.z - b.z) }
  const { width, depth, levels } = plan, cells = width * depth
  const s: State = { width, depth, levels, layout: plan, seed, rng: seed, tick: 0, robots: [], columns: [], bins: [], stations: [],
    floor: Array.from({ length: cells }, (_, c) => c % width % 2 === 0 && Math.floor(c / width) % 2 === 0 ? 'parking' : 'lane'),
    occupied: Array(cells).fill(-1), reserved: Array(cells).fill(-1), parent: Array(cells).fill(-1), queue: Array(cells).fill(0),
    lost: Array((levels + 1) * cells).fill(0), lostSteps: 0, freeSteps: 0 }
  for (const { x, z } of plan.racks) {
      const cell = z * width + x
      const column = s.columns.length
      s.columns.push({ cell, stockX: x + GEOMETRY.stockOffsetX, stockZ: z, owner: -1 })
      s.floor[cell] = 'column'
      s.floor[z * width + x + GEOMETRY.supportOffsetX] = 'blocked'
      for (let level = 1; level <= levels; level++) {
        s.bins.push({ id: s.bins.length, column, level, carrier: -1, reservedBy: -1 })
      }
  }
  if (plan.fill < 100) {
    const selected = s.bins.map((b) => b.id)
    if (plan.storage === 'random') for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(random(s) * (i + 1)); [selected[i], selected[j]] = [selected[j], selected[i]]
    }
    else {
      // Proximité géométrique des stations, sans prétendre optimiser le trafic.
      const distance = (id: number) => {
        const b = s.bins[id], p = plan.racks[b.column]
        return Math.min(...plan.stations.map((station) => Math.abs(p.x - station.x) + Math.abs(p.z - station.z)))
      }
      selected.sort((a, b) => distance(a) - distance(b) || s.bins[a].level - s.bins[b].level || a - b)
    }
    const keep = new Set(selected.slice(0, Math.max(1, Math.floor(selected.length * plan.fill / 100))))
    s.bins = s.bins.filter((b) => keep.has(b.id)).map((b, id) => ({ ...b, id }))
  }
  for (const { x, z } of plan.stations) {
    const station = z * width + x
    s.stations.push(station)
    s.floor[station] = 'station'
  }
  const starts = s.floor.flatMap((kind, c) => kind === 'parking' ? [c] : [])
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1))
    ;[starts[i], starts[j]] = [starts[j], starts[i]]
  }
  for (let id = 0; id < count; id++) {
    const home = starts[id], x = home % width
    s.robots.push({ id, x, z: (home - x) / width, home, station: s.stations[id % s.stations.length],
      level: 0, phase: 'idle', progress: 0, bin: -1, column: -1, returns: 0, visits: 0,
      path: Array(cells).fill(0), pathLength: 0, pathIndex: 0, legFrom: home, legMoved: 0, blocked: false })
    s.occupied[home] = id
  }
  return s
}

// BFS avec espace de travail réutilisé. Réserver le trajet complet évite les face-à-face.
// shortcut: baies d'attente et trajets réservés entièrement, remplacer à l'étape 9.
// robots = false : trajet libre, sur le même sol mais sans aucun autre robot.
function search(s: State, from: number, to: number, robots: boolean): boolean {
  s.parent.fill(-1)
  s.parent[from] = from
  s.queue[0] = from
  let length = 1
  for (let i = 0; i < length && s.parent[to] === -1; i++) {
    const c = s.queue[i], x = c % s.width, z = Math.floor(c / s.width)
    for (let direction = 0; direction < 4; direction++) {
      const n = direction === 0 ? (x + 1 < s.width ? c + 1 : -1) :
        direction === 1 ? (x > 0 ? c - 1 : -1) :
        direction === 2 ? (z + 1 < s.depth ? c + s.width : -1) : (z > 0 ? c - s.width : -1)
      if (n < 0 || s.parent[n] !== -1 || s.floor[n] === 'blocked' ||
          (n !== to && s.floor[n] !== 'lane') || robots && (s.occupied[n] !== -1 || s.reserved[n] !== -1)) continue
      s.parent[n] = c
      s.queue[length++] = n
    }
  }
  return s.parent[to] !== -1
}

function route(s: State, r: Robot, to: number, phase: Phase): boolean {
  const from = r.z * s.width + r.x
  if (from === to) return false // aucun trajet nul laissé dans une phase de déplacement
  if (s.occupied[to] !== -1 && s.occupied[to] !== r.id || s.reserved[to] !== -1) return false
  if (!search(s, from, to, true)) return false
  let length = 0
  for (let c = to; c !== from; c = s.parent[c]) r.path[length++] = c
  for (let i = 0; i < Math.floor(length / 2); i++) {
    const c = r.path[i]
    r.path[i] = r.path[length - i - 1]
    r.path[length - i - 1] = c
  }
  for (let i = 0; i < length; i++) s.reserved[r.path[i]] = r.id
  r.pathLength = length
  r.pathIndex = 0
  r.phase = phase
  r.progress = 0
  return true
}

function phase(r: Robot, next: Phase): void { r.phase = next; r.progress = 0 }

// Fin de trajet : le détour (cases parcourues au-delà du trajet libre) est imputé à la case de départ.
function arrive(s: State, r: Robot): void {
  const to = r.z * s.width + r.x
  let free = 0
  if (r.legFrom !== to && search(s, r.legFrom, to, false)) for (let c = to; c !== r.legFrom; c = s.parent[c]) free++
  // Un passage par la baie peut être plus court que le trajet libre sur allées : pas de temps perdu négatif.
  const detour = Math.max(0, r.legMoved - free) * STEPS_PER_CELL
  s.lost[r.legFrom] += detour
  s.lostSteps += detour
  s.freeSteps += free * STEPS_PER_CELL
  r.legFrom = to
  r.legMoved = 0
  r.blocked = false
}

// Trajet voulu : un refus (ou un repli vers la baie) ouvre une attente comptée comme temps perdu.
function want(s: State, r: Robot, ok: boolean): boolean { r.blocked ||= !ok; return ok }

export function step(s: State): void {
  let round = Infinity
  for (const r of s.robots) if (r.returns < round) round = r.returns
  // Priorité fixe par identifiant, essais de départ espacés et décalés entre robots.
  for (const r of s.robots) {
    if (r.blocked && r.pathIndex === r.pathLength) {
      s.lost[r.level * s.width * s.depth + r.z * s.width + r.x]++
      s.lostSteps++
    }
    if (r.pathIndex < r.pathLength) {
      if (++r.progress < STEPS_PER_CELL) continue
      const from = r.z * s.width + r.x, to = r.path[r.pathIndex++]
      s.occupied[from] = -1
      s.reserved[to] = -1
      s.occupied[to] = r.id
      r.x = to % s.width
      r.z = Math.floor(to / s.width)
      r.progress = 0
      r.legMoved++
      if (r.column !== -1 && s.columns[r.column].cell === from) {
        s.columns[r.column].owner = -1
        r.column = -1
      }
      if (r.pathIndex === r.pathLength) {
        if (r.phase === 'toRack') { arrive(s, r); phase(r, 'engageTake') }
        else if (r.phase === 'toReturn') { arrive(s, r); phase(r, 'engagePut') }
        else if (r.phase === 'toStation') { arrive(s, r); phase(r, 'service') }
        else if (r.phase === 'bufferToStation') phase(r, 'toStation')
        else if (r.phase === 'bufferToReturn') phase(r, 'toReturn')
        else if (r.phase === 'home') { arrive(s, r); r.returns++; r.bin = -1; phase(r, 'idle') }
      }
      continue
    }
    const b = r.bin === -1 ? undefined : s.bins[r.bin]
    if (r.phase === 'upTake' || r.phase === 'upPut' || r.phase === 'downTake' || r.phase === 'downPut') {
      if (++r.progress < STEPS_PER_LEVEL) continue
      const up = r.phase === 'upTake' || r.phase === 'upPut'
      r.level += up ? 1 : -1
      r.progress = 0
      if (up && r.level === b!.level) phase(r, r.phase === 'upTake' ? 'take' : 'put')
      else if (!up && r.level === 0) phase(r, r.phase === 'downTake' ? 'bufferToStation' : 'home')
    } else if (r.phase === 'engageTake' || r.phase === 'engagePut') {
      if (++r.progress === ENGAGEMENT_STEPS) phase(r, r.phase === 'engageTake' ? 'upTake' : 'upPut')
    } else if (r.phase === 'take' || r.phase === 'put') {
      if (++r.progress < HANDLING_STEPS) continue
      if (r.phase === 'take') { b!.carrier = r.id; phase(r, 'downTake') }
      else { b!.carrier = -1; b!.reservedBy = -1; phase(r, 'downPut') }
    } else if (r.phase === 'service') {
      if (++r.progress === HANDLING_STEPS) { r.visits++; phase(r, 'bufferToReturn') }
    } else if (s.tick % 10 === r.id % 10) {
      if (r.phase === 'idle') {
        if (r.returns > round) continue // chaque robot finit son cycle avant de réaffecter les premiers
        const bin = s.bins[(r.id + r.returns * 31) % s.bins.length]
        const col = s.columns[bin.column]
        if (want(s, r, bin.reservedBy === -1 && bin.carrier === -1 && col.owner === -1 && route(s, r, col.cell, 'toRack'))) {
          r.bin = bin.id
          r.column = bin.column
          bin.reservedBy = r.id
          col.owner = r.id
        }
      } else if (r.phase === 'toReturn') {
        const col = s.columns[b!.column]
        if (want(s, r, col.owner === -1 && route(s, r, col.cell, 'toReturn'))) { col.owner = r.id; r.column = b!.column }
      } else if (r.phase === 'toStation') want(s, r, route(s, r, r.station, 'toStation'))
      else if (r.phase === 'bufferToStation') {
        // Libérer la colonne via le trajet direct ; la baie reste un repli si la station est indisponible.
        if (!want(s, r, route(s, r, r.station, 'toStation'))) route(s, r, r.home, 'bufferToStation')
      } else if (r.phase === 'bufferToReturn') {
        const col = s.columns[b!.column]
        if (want(s, r, col.owner === -1 && route(s, r, col.cell, 'toReturn'))) { col.owner = r.id; r.column = b!.column }
        else route(s, r, r.home, 'bufferToReturn')
      } else if (r.phase === 'home') want(s, r, route(s, r, r.home, 'home'))
    }
  }
  s.tick++
}

// Positions physiques continues en unités de simulation ; interpolation entre pas côté rendu.
export function robotPosition(s: State, r: Robot, out: Position): void {
  out.x = r.x; out.z = r.z; out.y = r.level * LEVEL_HEIGHT + GEOMETRY.robotCenterY
  if (r.pathIndex < r.pathLength) {
    const c = r.path[r.pathIndex], f = r.progress / STEPS_PER_CELL
    out.x += (c % s.width - r.x) * f
    out.z += (Math.floor(c / s.width) - r.z) * f
  } else if (r.phase === 'upTake' || r.phase === 'upPut') out.y += LEVEL_HEIGHT * r.progress / STEPS_PER_LEVEL
  else if (r.phase === 'downTake' || r.phase === 'downPut') out.y -= LEVEL_HEIGHT * r.progress / STEPS_PER_LEVEL
}

export function binPosition(s: State, b: Bin, out: Position): void {
  const col = s.columns[b.column]
  const handler = b.reservedBy === -1 ? undefined : s.robots[b.reservedBy]
  if (b.carrier !== -1) {
    robotPosition(s, s.robots[b.carrier], out)
    out.y += GEOMETRY.carriedBinOffsetY
  } else { out.x = col.stockX; out.z = col.stockZ; out.y = b.level * LEVEL_HEIGHT + GEOMETRY.robotCenterY + GEOMETRY.carriedBinOffsetY }
  if (handler?.phase === 'take' || handler?.phase === 'put') {
    const f = handler.progress / HANDLING_STEPS
    const x = col.cell % s.width
    out.x = handler.phase === 'take' ? col.stockX + (x - col.stockX) * f : x + (col.stockX - x) * f
  }
}
