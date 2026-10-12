// TypeScript pur. Géométrie illustrative, dimensions et durées non calibrées Exotec.
import { DEFAULT_LAYOUT, layoutFloor, validateFleet, validateLayout, validateSeed, type Layout, type Floor } from './layout.ts'
import { DEFAULT_CONTROL, moveSteps, nodeOf, route, search, validateControl, type Control, type ControlStats } from './control.ts'
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
export type Column = { cell: number; owner: number }
// side : −1 rayonnage à gauche de l'allée de grimpe, +1 à droite, 0 pile AutoStore.
export type Bin = { id: number; column: number; level: number; side: number; carrier: number; reservedBy: number; bufferBy: number; bufferLevel: number }
export type Robot = {
  id: number; x: number; z: number; level: number; home: number; station: number
  phase: Phase; progress: number; bin: number; column: number; returns: number; visits: number
  cycleStart: number; cycleSteps: number
  path: number[]; pathLength: number; pathIndex: number
  // Trajet en cours pour le temps perdu : départ, cases parcourues, trajet voulu refusé.
  legFrom: number; legMoved: number; legSteps: number; blocked: boolean; goal: number
  targetBin: number; job: 'serve' | 'dig' | 'restore'; displaced: number[]; dropBuffer: boolean
}
export type State = {
  width: number; depth: number; levels: number; layout: Layout; seed: number; rng: number; tick: number
  robots: Robot[]; columns: Column[]; bins: Bin[]; stations: number[]
  // Les cases de service sont des baies : on ne les traverse pas pour rejoindre une autre baie.
  floor: Floor[]
  occupied: number[]; reserved: number[]; parent: number[]; queue: number[]
  // Temps perdu en pas, par case et par niveau (index level * cellules + case) ; totaux du run.
  lost: number[]; lostSteps: number; freeSteps: number
  control: Control; controlStats: ControlStats
  lifts: { cell: number; owner: number }[]; stacks: number[][]; buffers: number[][]
}

// Skypod : un robot en hauteur libère sa cellule au sol ; un autre robot peut passer dessous.
export const onGround = (s: State, r: Robot) => r.level === 0 || s.layout.profile === 'lifts' || s.layout.profile === 'autostore'
export const surfaceLevel = (s: State) => s.layout.profile === 'autostore' ? s.levels + 1 : 0
export const elevation = (s: State, level: number) => s.layout.profile === 'autostore' ? Math.max(0, level - 1) * .5 : level * LEVEL_HEIGHT
const stockNode = (s: State, b: Bin) => s.columns[b.column].cell + (s.layout.profile === 'lifts' ? b.level * s.width * s.depth : 0)
const lostNode = (s: State, node: number) => s.layout.profile === 'autostore' ? surfaceLevel(s) * s.width * s.depth + node : node
const handleSteps = (s: State, r: Robot, b: Bin) => s.layout.profile === 'autostore' ? HANDLING_STEPS + (s.levels + 1 - (r.phase === 'put' ? r.dropBuffer ? s.buffers[r.id].length + 1 : s.stacks[b.column].length + 1 : b.bufferBy === -1 ? b.level : b.bufferLevel)) * STEPS_PER_LEVEL : HANDLING_STEPS

function random(s: State): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function createSim(seed: number, count = 20, layout: Layout = DEFAULT_LAYOUT, control: Control = DEFAULT_CONTROL): State {
  validateControl(control)
  if (layout.profile === 'lifts' && control.method !== 'whole' && control.horizon * STEPS_PER_CELL < layout.liftSteps!) throw new RangeError('Horizon trop court pour une transition d’ascenseur.')
  validateSeed(seed)
  const capacity = validateLayout(layout)
  validateFleet(count, capacity)
  // Copie canonique : l'édition d'un brouillon ne peut pas modifier un run en cours.
  const plan: Layout = { ...layout, racks: layout.racks.map((p) => ({ ...p })).sort((a, b) => a.x - b.x || a.z - b.z),
    stations: layout.stations.map((p) => ({ ...p })).sort((a, b) => a.x - b.x || a.z - b.z),
    ...(layout.lifts ? { lifts: layout.lifts.map((p) => ({ ...p })).sort((a, b) => a.x - b.x || a.z - b.z) } : {}) }
  const { width, depth, levels } = plan, cells = width * depth
  const floor = layoutFloor(plan), nodes = floor.length
  const s: State = { width, depth, levels, layout: plan, seed, rng: seed, tick: 0, robots: [], columns: [], bins: [], stations: [],
    floor, occupied: Array(nodes).fill(-1), reserved: Array(nodes).fill(-1), parent: Array(nodes).fill(-1), queue: Array(nodes).fill(0),
    lost: Array((levels + (plan.profile === 'autostore' ? 2 : 1)) * cells).fill(0), lostSteps: 0, freeSteps: 0, control: { ...control }, controlStats: { operations: 0, searches: 0, exhausted: 0 },
    lifts: (plan.lifts ?? []).map((p) => ({ cell: p.z * width + p.x, owner: -1 })), stacks: [], buffers: [] }
  for (const { x, z } of plan.racks) {
      const cell = z * width + x
      const column = s.columns.length
      s.columns.push({ cell, owner: -1 })
      // Skypod : le robot grimpe entre deux rayonnages face à face et sert un bac de chaque côté.
      for (const side of plan.profile === 'autostore' ? [0] : [-1, 1]) for (let level = 1; level <= levels; level++) {
        s.bins.push({ id: s.bins.length, column, level, side, carrier: -1, reservedBy: -1, bufferBy: -1, bufferLevel: 0 })
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
  s.stacks = s.columns.map((_, column) => s.bins.filter((b) => b.column === column).map((b) => b.id))
  if (plan.profile === 'autostore') for (const stack of s.stacks) stack.forEach((id, i) => { s.bins[id].level = i + 1 })
  for (const { x, z } of plan.stations) {
    const station = z * width + x
    s.stations.push(station)
  }
  const starts = s.floor.slice(0, cells).flatMap((kind, c) => kind === 'parking' ? [c] : [])
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1))
    ;[starts[i], starts[j]] = [starts[j], starts[i]]
  }
  for (let id = 0; id < count; id++) {
    const home = starts[id], x = home % width
    s.robots.push({ id, x, z: (home - x) / width, home, station: s.stations[id % s.stations.length],
      level: surfaceLevel(s), phase: 'idle', progress: 0, bin: -1, column: -1, returns: 0, visits: 0, cycleStart: 0, cycleSteps: 0,
      path: Array(nodes).fill(0), pathLength: 0, pathIndex: 0, legFrom: home, legMoved: 0, legSteps: 0, blocked: false, goal: home,
      targetBin: -1, job: 'serve', displaced: [], dropBuffer: false })
    s.buffers.push([])
    s.occupied[home] = id
  }
  return s
}

function phase(r: Robot, next: Phase): void { r.phase = next; r.progress = 0 }

// Fin de trajet : le détour (cases parcourues au-delà du trajet libre) est imputé à la case de départ.
function arrive(s: State, r: Robot): void {
  const to = nodeOf(s, r)
  let free = 0
  if (r.legFrom !== to && search(s, r.legFrom, to, false)) for (let c = to; c !== r.legFrom; c = s.parent[c]) free += moveSteps(s, s.parent[c], c)
  // Un passage par la baie peut être plus court que le trajet libre sur allées : pas de temps perdu négatif.
  const detour = Math.max(0, r.legSteps - free)
  s.lost[lostNode(s, r.legFrom)] += detour
  s.lostSteps += detour
  s.freeSteps += free
  r.legFrom = to
  r.legMoved = 0
  r.legSteps = 0
  r.blocked = false
}

// Trajet voulu : un refus (ou un repli vers la baie) ouvre une attente comptée comme temps perdu.
function want(s: State, r: Robot, ok: boolean): boolean { r.blocked ||= !ok; return ok }

function finishCycle(s: State, r: Robot): void {
  if (s.layout.profile === 'autostore') {
    s.columns[r.column].owner = -1
    for (const id of [r.targetBin, ...r.displaced]) s.bins[id].reservedBy = -1
    r.column = -1; r.targetBin = -1; r.displaced.length = 0
  }
  r.cycleSteps += s.tick + 1 - r.cycleStart; r.cycleStart = s.tick + 1
  r.returns++; r.bin = -1; phase(r, 'idle')
}

// Séquence de stock, partagée avec les phases de déplacement/manutention du moteur.
function autoPickup(s: State, r: Robot, restoring: boolean): void {
  r.job = restoring ? 'restore' : s.stacks[r.column].at(-1) === r.targetBin ? 'serve' : 'dig'
  r.bin = restoring ? s.buffers[r.id].at(-1)! : s.stacks[r.column].at(-1)!
  s.bins[r.bin].reservedBy = r.id; r.dropBuffer = false; phase(r, 'toRack')
}

function putAuto(s: State, r: Robot, b: Bin): void {
  b.carrier = -1
  if (r.dropBuffer) {
    b.bufferBy = r.id; b.bufferLevel = s.buffers[r.id].length + 1
    s.buffers[r.id].push(b.id); r.displaced.push(b.id)
    autoPickup(s, r, false)
  } else {
    b.bufferBy = -1; b.bufferLevel = 0; b.level = s.stacks[b.column].length + 1
    s.stacks[b.column].push(b.id)
    if (s.buffers[r.id].length) autoPickup(s, r, true)
    else phase(r, 'home')
  }
}

export function step(s: State): void {
  const cells = s.width * s.depth, auto = s.layout.profile === 'autostore', lift = s.layout.profile === 'lifts', direct = auto || lift
  let round = Infinity
  for (const r of s.robots) if (r.returns < round) round = r.returns
  // Priorité fixe par identifiant, essais de départ espacés et décalés entre robots.
  for (const r of s.robots) {
    if (r.blocked && r.pathIndex === r.pathLength) {
      s.lost[r.level * s.width * s.depth + r.z * s.width + r.x]++
      s.lostSteps++
    }
    if (r.pathIndex < r.pathLength) {
      const from = nodeOf(s, r), duration = moveSteps(s, from, r.path[r.pathIndex])
      if (r.path[r.pathIndex] === from) {
        s.lost[lostNode(s, from)]++; s.lostSteps++
      }
      if (++r.progress < duration) continue
      const to = r.path[r.pathIndex++]
      s.occupied[from] = -1
      s.reserved[to] = -1
      s.occupied[to] = r.id
      r.x = to % s.width
      r.z = Math.floor(to % cells / s.width)
      if (s.layout.profile === 'lifts') r.level = Math.floor(to / cells)
      r.progress = 0
      if (from !== to) { r.legMoved++; r.legSteps += duration }
      if (s.control.method !== 'whole' && r.pathIndex < r.pathLength && r.path[r.pathIndex] !== to) s.reserved[r.path[r.pathIndex]] = r.id
      // Colonne libérée en la quittant après le travail ; la traverser en chemin ne la libère pas.
      if (!auto && from !== to && r.column !== -1 && r.phase !== 'toRack' && r.phase !== 'toReturn' && s.columns[r.column].cell === from % cells) {
        s.columns[r.column].owner = -1
        r.column = -1
      }
      if (r.pathIndex === r.pathLength) for (const lift of s.lifts) if (lift.owner === r.id && lift.cell !== to % cells) lift.owner = -1
      if (r.pathIndex === r.pathLength && to === r.goal) {
        if (r.phase === 'toRack') { arrive(s, r); phase(r, direct ? 'take' : 'engageTake') }
        else if (r.phase === 'toReturn') { arrive(s, r); phase(r, direct ? 'put' : 'engagePut') }
        else if (r.phase === 'toStation') { arrive(s, r); phase(r, 'service') }
        else if (r.phase === 'bufferToStation') phase(r, 'toStation')
        else if (r.phase === 'bufferToReturn') phase(r, 'toReturn')
        else if (r.phase === 'home') { arrive(s, r); finishCycle(s, r) }
      }
      continue
    }
    if (s.control.method !== 'whole' && nodeOf(s, r) !== r.goal) {
      want(s, r, route(s, r, r.goal, r.phase))
      continue
    }
    const b = r.bin === -1 ? undefined : s.bins[r.bin]
    if (r.phase === 'upTake' || r.phase === 'upPut' || r.phase === 'downTake' || r.phase === 'downPut') {
      if (++r.progress < STEPS_PER_LEVEL) continue
      const up = r.phase === 'upTake' || r.phase === 'upPut', cell = s.columns[r.column].cell
      // Redescendre au sol seulement si la cellule est libre et hors de tout trajet engagé.
      if (!up && r.level === 1 && (s.occupied[cell] !== -1 || s.reserved[cell] !== -1 ||
          s.robots.some((o) => o !== r && o.path.slice(o.pathIndex, o.pathLength).includes(cell)))) {
        r.progress--; s.lost[r.level * cells + cell]++; s.lostSteps++
        continue
      }
      r.level += up ? 1 : -1
      r.progress = 0
      if (up && r.level === 1) s.occupied[cell] = -1
      if (!up && r.level === 0) s.occupied[cell] = r.id
      if (up && r.level === b!.level) phase(r, r.phase === 'upTake' ? 'take' : 'put')
      else if (!up && r.level === 0) phase(r, r.phase === 'downTake' ? 'bufferToStation' : 'home')
    } else if (r.phase === 'engageTake' || r.phase === 'engagePut') {
      if (++r.progress === ENGAGEMENT_STEPS) phase(r, r.phase === 'engageTake' ? 'upTake' : 'upPut')
    } else if (r.phase === 'take' || r.phase === 'put') {
      if (++r.progress < handleSteps(s, r, b!)) continue
      if (r.phase === 'take') {
        if (auto) {
          const stack = b!.bufferBy === -1 ? s.stacks[b!.column] : s.buffers[b!.bufferBy]
          if (stack.pop() !== b!.id) throw new Error('Prise hors du sommet de la pile.')
          b!.bufferBy = -1; b!.bufferLevel = 0; r.dropBuffer = r.job === 'dig'
        }
        b!.carrier = r.id; phase(r, direct ? auto && r.job !== 'serve' ? 'bufferToReturn' : 'bufferToStation' : 'downTake')
      } else if (auto) putAuto(s, r, b!)
      else { b!.carrier = -1; b!.reservedBy = -1; phase(r, direct ? 'home' : 'downPut') }
    } else if (r.phase === 'service') {
      if (++r.progress === HANDLING_STEPS) { r.visits++; phase(r, 'bufferToReturn') }
    } else if (s.tick % 10 === r.id % 10) {
      if (r.phase === 'idle') {
        if (r.returns > round) continue // chaque robot finit son cycle avant de réaffecter les premiers
        const bin = s.bins[(r.id + r.returns * 31) % s.bins.length]
        const col = s.columns[bin.column]
        if (want(s, r, bin.reservedBy === -1 && bin.carrier === -1 && (lift || col.owner === -1) && route(s, r, stockNode(s, bin), 'toRack'))) {
          r.targetBin = bin.id
          r.bin = auto ? s.stacks[bin.column].at(-1)! : bin.id
          r.job = r.bin === bin.id ? 'serve' : 'dig'
          r.column = bin.column
          bin.reservedBy = r.id
          s.bins[r.bin].reservedBy = r.id
          if (!lift) col.owner = r.id
        }
      } else if (auto && r.phase === 'toRack') {
        const target = r.job === 'restore' ? r.home : stockNode(s, b!)
        if (nodeOf(s, r) === target) { arrive(s, r); phase(r, 'take') }
        else want(s, r, route(s, r, target, 'toRack'))
      } else if (r.phase === 'toReturn') {
        const col = s.columns[b!.column]
        const target = auto && r.dropBuffer ? r.home : stockNode(s, b!)
        if (want(s, r, (lift || col.owner === -1 || col.owner === r.id) && route(s, r, target, 'toReturn'))) { if (!lift) col.owner = r.id; r.column = b!.column }
      } else if (r.phase === 'toStation') want(s, r, route(s, r, r.station, 'toStation'))
      else if (r.phase === 'bufferToStation') {
        // Libérer la colonne via le trajet direct ; la baie reste un repli si la station est indisponible.
        if (!want(s, r, route(s, r, r.station, 'toStation'))) route(s, r, r.home, 'bufferToStation')
      } else if (r.phase === 'bufferToReturn') {
        const col = s.columns[b!.column]
        const target = auto && r.dropBuffer ? r.home : stockNode(s, b!)
        if (want(s, r, (lift || col.owner === -1 || col.owner === r.id) && route(s, r, target, 'toReturn'))) { if (!lift) col.owner = r.id; r.column = b!.column }
        else route(s, r, r.home, 'bufferToReturn')
      } else if (r.phase === 'home') want(s, r, route(s, r, r.home, 'home'))
    }
  }
  s.tick++
}

// Positions physiques continues en unités de simulation ; interpolation entre pas côté rendu.
export function robotPosition(s: State, r: Robot, out: Position): void {
  out.x = r.x; out.z = r.z; out.y = elevation(s, r.level) + GEOMETRY.robotCenterY
  if (r.pathIndex < r.pathLength) {
    const c = r.path[r.pathIndex], cells = s.width * s.depth, f = r.progress / moveSteps(s, nodeOf(s, r), c)
    out.x += (c % s.width - r.x) * f
    out.z += (Math.floor(c % cells / s.width) - r.z) * f
    if (s.layout.profile === 'lifts') out.y += (elevation(s, Math.floor(c / cells)) - elevation(s, r.level)) * f
  } else if (r.phase === 'upTake' || r.phase === 'upPut') out.y += LEVEL_HEIGHT * r.progress / STEPS_PER_LEVEL
  else if (r.phase === 'downTake' || r.phase === 'downPut') out.y -= LEVEL_HEIGHT * r.progress / STEPS_PER_LEVEL
}

export function binPosition(s: State, b: Bin, out: Position): void {
  const col = s.columns[b.column]
  const handler = b.reservedBy === -1 ? undefined : s.robots[b.reservedBy]
  if (b.carrier !== -1) {
    robotPosition(s, s.robots[b.carrier], out)
    out.y += GEOMETRY.carriedBinOffsetY
  } else {
    const home = b.bufferBy === -1 ? -1 : s.robots[b.bufferBy].home
    out.x = home === -1 ? col.cell % s.width + b.side * GEOMETRY.stockOffsetX : home % s.width
    out.z = home === -1 ? Math.floor(col.cell / s.width) : Math.floor(home / s.width)
    out.y = s.layout.profile === 'autostore' ? elevation(s, b.bufferBy === -1 ? b.level : b.bufferLevel) + .25 : b.level * LEVEL_HEIGHT + GEOMETRY.robotCenterY + GEOMETRY.carriedBinOffsetY
  }
  if (handler?.bin === b.id && (handler.phase === 'take' || handler.phase === 'put')) {
    if (s.layout.profile === 'autostore') {
      const f = handler.progress / handleSteps(s, handler, b)
      const carriedY = elevation(s, handler.level) + GEOMETRY.robotCenterY + GEOMETRY.carriedBinOffsetY
      if (handler.phase === 'take') out.y += (carriedY - out.y) * f
      else {
        const level = handler.dropBuffer ? s.buffers[handler.id].length + 1 : s.stacks[b.column].length + 1
        out.y += (elevation(s, level) + .25 - out.y) * f
      }
      return
    }
    const f = handler.progress / HANDLING_STEPS
    const x = col.cell % s.width, stock = x + b.side * GEOMETRY.stockOffsetX
    out.x = handler.phase === 'take' ? stock + (x - stock) * f : x + (stock - x) * f
  }
}
