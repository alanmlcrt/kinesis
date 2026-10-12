// Pilotage des trajets : le moteur conserve tâches, colonnes, bacs et durées.
import type { State, Robot, Phase } from './sim.ts'
import { STEPS_PER_CELL, onGround } from './sim.ts'
import { floorNeighbors } from './layout.ts'
import { windowSearch } from './rhcr.ts'

export type Control = { method: 'whole' | 'window' | 'rhcr'; horizon: number; budget: number }
export const DEFAULT_CONTROL: Control = { method: 'whole', horizon: 8, budget: 100000 }
export type ControlStats = { operations: number; searches: number; exhausted: number }
export function validateControl(c: Control): void {
  if (!c || !['whole', 'window', 'rhcr'].includes(c.method) || !Number.isInteger(c.horizon) || c.horizon < 2 || c.horizon > 32 ||
      !Number.isInteger(c.budget) || c.budget < 100 || c.budget > 1000000) {
    throw new RangeError('Pilotage : méthode entière ou fenêtre, horizon de 2 à 32 déplacements, budget de 100 à 1000000 opérations par recherche.')
  }
}

export function neighbors(s: State, c: number): number[] {
  return floorNeighbors(s.layout, c)
}
export const nodeOf = (s: State, r: Robot) => r.z * s.width + r.x + (s.layout.profile === 'lifts' ? r.level * s.width * s.depth : 0)
export const moveSteps = (s: State, from: number, to: number) => s.layout.profile === 'lifts' && Math.abs(to - from) === s.width * s.depth ? s.layout.liftSteps! : STEPS_PER_CELL
// Skypod : l'allée de grimpe se traverse au sol, même pendant qu'un robot grimpe au-dessus.
const transit = (s: State, n: number) => s.floor[n] === 'lane' || s.floor[n] === 'lift' || s.floor[n] === 'column' && s.layout.profile !== 'lifts'
const shaftFree = (s: State, n: number, id: number) => !s.lifts.some((l) => l.cell === n % (s.width * s.depth) && l.owner !== -1 && l.owner !== id)

// BFS libre également utilisé par le moteur pour mesurer les détours.
export function search(s: State, from: number, to: number, robots: boolean, spend = () => true): boolean {
  if (s.layout.profile === 'lifts') return weightedSearch(s, from, to, robots, spend)
  s.parent.fill(-1); s.parent[from] = from; s.queue[0] = from
  let length = 1
  for (let i = 0; i < length && s.parent[to] === -1; i++) {
    const c = s.queue[i]
    for (const n of neighbors(s, c)) {
      if (!spend()) return false
      if (n < 0 || s.parent[n] !== -1 || s.floor[n] === 'blocked' ||
          (n !== to && !transit(s, n)) || robots && (s.occupied[n] !== -1 || s.reserved[n] !== -1)) continue
      s.parent[n] = c; s.queue[length++] = n
    }
  }
  return s.parent[to] !== -1
}

// A* à poids entiers : distance Manhattan 3D, même coût vertical que dans le moteur.
function weightedSearch(s: State, from: number, to: number, robots: boolean, spend: () => boolean): boolean {
  const cells = s.width * s.depth
  const id = s.occupied[from]
  // Aucun parcours horizontal ne peut remplacer une transition verticale verrouillée.
  // Évite de parcourir tous les étages à chaque essai d'une grande flotte en attente.
  if (robots && Math.floor(from / cells) !== Math.floor(to / cells) && !s.lifts.some((l) => l.owner === -1 || l.owner === id)) return false
  const heuristic = (n: number) => (Math.abs(n % s.width - to % s.width) + Math.abs(Math.floor(n % cells / s.width) - Math.floor(to % cells / s.width))) * STEPS_PER_CELL + Math.abs(Math.floor(n / cells) - Math.floor(to / cells)) * s.layout.liftSteps!
  const distances = new Float64Array(s.floor.length).fill(Infinity), buckets: number[][] = []
  buckets[heuristic(from)] = [from]
  s.parent.fill(-1); s.parent[from] = from; distances[from] = 0
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost]
    if (!bucket) continue
    for (const c of bucket) {
      if (distances[c] + heuristic(c) !== cost) continue
      if (c === to) return true
      for (const n of neighbors(s, c)) {
        if (!spend()) return false
        if (n < 0 || s.floor[n] === 'blocked' || n !== to && !transit(s, n) ||
            robots && (s.occupied[n] !== -1 && s.occupied[n] !== id || s.reserved[n] !== -1 && s.reserved[n] !== id || !shaftFree(s, n, id))) continue
        const next = distances[c] + moveSteps(s, c, n)
        if (next >= distances[n]) continue
        distances[n] = next; s.parent[n] = c
        ;(buckets[next + heuristic(n)] ??= []).push(n)
      }
    }
  }
  return false
}

// Réservations espace-temps des préfixes engagés. Source ET destination restent occupées
// pendant le transit : pas de croisement d'arêtes, ni de suivi à distance nulle.
function windowPath(s: State, r: Robot, goal: number, spend: () => boolean): number[] | null {
  const cells = s.floor.length, horizon = s.control.horizon, ticks = horizon * STEPS_PER_CELL
  const from = nodeOf(s, r), distances = new Int32Array(cells).fill(-1), open = [goal]
  distances[goal] = 0
  if (s.control.method === 'rhcr') {
    const buckets: number[][] = [[goal]]
    for (let cost = 0; cost < buckets.length; cost++) for (const c of buckets[cost] ?? []) {
      if (distances[c] !== cost) continue
      for (const n of neighbors(s, c)) {
        if (!spend()) return null
        if (n < 0 || n !== from && !transit(s, n)) continue
        const next = cost + moveSteps(s, c, n) / STEPS_PER_CELL
        if (distances[n] !== -1 && distances[n] <= next) continue
        distances[n] = next; (buckets[next] ??= []).push(n)
      }
    }
  } else for (let i = 0; i < open.length; i++) for (const n of neighbors(s, open[i])) {
      if (!spend()) return null
      if (n < 0 || distances[n] !== -1 || (n !== from && !transit(s, n))) continue
      distances[n] = distances[open[i]] + 1; open.push(n)
  }
  const reservations = Array.from({ length: ticks + 1 }, () => new Set<number>())
  for (const other of s.robots) if (other.id !== r.id && onGround(s, other)) {
    let cell = nodeOf(s, other), index = other.pathIndex, progress = other.progress
    for (let t = 0; t <= ticks; t++) {
      if (!spend()) return null
      reservations[t].add(cell)
      if (index < other.pathLength) {
        reservations[t].add(other.path[index])
        if (++progress === moveSteps(s, cell, other.path[index])) { cell = other.path[index++]; progress = 0 }
      }
    }
  }
  const parents = new Map<number, number>([[from, -1]]), queue = [from]
  const distance = (c: number) => distances[c % cells] < 0 ? Infinity : distances[c % cells]
  // Ne jamais s'arrêter sur un accès de grimpe traversé : le robot au-dessus doit pouvoir redescendre.
  const terminalSafe = (key: number) => {
    if (key % cells !== goal && s.floor[key % cells] === 'column') return false
    for (let t = Math.floor(key / cells) * STEPS_PER_CELL; t <= ticks; t++) {
      if (!spend() || reservations[t].has(key % cells)) return false
    }
    return true
  }
  if (s.control.method === 'rhcr') {
    const path = windowSearch({ from, goal, nodes: cells, horizon,
      neighbors: (c) => neighbors(s, c).filter((n) => n >= 0 && s.floor[n] !== 'blocked' && (n === goal || n === from || transit(s, n)) && shaftFree(s, n, r.id)).map((n) => ({ to: n, duration: moveSteps(s, c, n) / STEPS_PER_CELL })),
      distance: (c) => distances[c] < 0 ? Infinity : distances[c], spend,
      terminal: (c, t) => terminalSafe(t * cells + c),
      safe: (c, n, begin, end) => {
        for (let t = begin * STEPS_PER_CELL; t <= end * STEPS_PER_CELL; t++) {
          if (!spend() || reservations[t].has(c) || reservations[t].has(n)) return false
        }
        return true
      } })
    if (!path) return null
    // Adaptive execution period: discard the tail at the first safely holdable node.
    // An elevator edge is indivisible. Never stop in the way of a committed path.
    let time = 0, previous = from
    for (let i = 0; i < path.length; i++) {
      time += moveSteps(s, previous, path[i]) / STEPS_PER_CELL; previous = path[i]
      if (terminalSafe(time * cells + previous)) return path.slice(0, i + 1)
    }
    return path
  }
  let best = from
  planning: for (let i = 0; i < queue.length; i++) {
    const key = queue[i], c = key % cells, time = Math.floor(key / cells)
    if (c === goal && best % cells === goal) break
    if (time === horizon) continue
    for (const n of [...neighbors(s, c), c]) {
      if (!spend()) break planning
      if (n < 0 || s.floor[n] === 'blocked' || (n !== goal && n !== from && !transit(s, n)) || !shaftFree(s, n, r.id)) continue
      const duration = moveSteps(s, c, n) / STEPS_PER_CELL
      if (time + duration > horizon) continue
      const next = (time + duration) * cells + n
      if (parents.has(next)) continue
      let safe = true
      for (let t = time * STEPS_PER_CELL; t <= (time + duration) * STEPS_PER_CELL; t++) {
        if (!spend()) break planning
        if (reservations[t].has(c) || reservations[t].has(n)) { safe = false; break }
      }
      if (!safe) continue
      parents.set(next, key); queue.push(next)
      if (distance(next) < distance(best) && terminalSafe(next)) best = next
    }
  }
  // Le dernier sommet est tenu indéfiniment, comme une baie : les autres plans peuvent
  // dépendre du préfixe, jamais d'un départ futur encore inconnu.
  if (best === from) return null
  const path: number[] = []
  for (let k = best; parents.get(k) !== -1; k = parents.get(k)!) path.push(k % cells)
  path.reverse()
  return path
}

export function route(s: State, r: Robot, to: number, phase: Phase): boolean {
  const from = nodeOf(s, r)
  if (from === to) return false
  let used = 0, exhausted = false
  s.controlStats.searches++
  const spend = () => {
    if (used === s.control.budget) { exhausted = true; return false }
    used++; return true
  }
  let path: number[] | null = null
  if (s.control.method === 'whole') {
    if ((s.occupied[to] === -1 || s.occupied[to] === r.id) && s.reserved[to] === -1 && search(s, from, to, true, spend)) {
      path = []
      for (let c = to; c !== from; c = s.parent[c]) path.push(c)
      path.reverse()
    }
  } else path = windowPath(s, r, to, spend)
  s.controlStats.operations += used
  s.controlStats.exhausted += Number(exhausted)
  if (!path) return false
  for (const lift of s.lifts) if (path.some((n) => n % (s.width * s.depth) === lift.cell)) lift.owner = r.id
  for (let i = 0; i < path.length; i++) r.path[i] = path[i]
  if (s.control.method === 'whole') for (const c of path) s.reserved[c] = r.id
  else if (path[0] !== from) s.reserved[path[0]] = r.id
  r.goal = to; r.pathLength = path.length; r.pathIndex = 0; r.phase = phase; r.progress = 0
  return true
}
