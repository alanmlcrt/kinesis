// Windowed prioritized search shared by the warehouse adapter and MAPF validation.
// No wall clock: exhaustion and tie breaking are reproducible.
export type Edge = { to: number; duration: number }
export type WindowProblem = {
  from: number; goal: number; nodes: number; horizon: number
  neighbors: (node: number) => Edge[]
  distance: (node: number) => number
  safe: (from: number, to: number, begin: number, end: number) => boolean
  terminal: (node: number, time: number) => boolean
  spend: () => boolean
}

export function windowSearch(p: WindowProblem): number[] | null {
  const parent = new Map<number, number>([[p.from, -1]])
  const heap: { key: number; score: number; order: number }[] = []
  let order = 0
  const less = (a: typeof heap[number], b: typeof heap[number]) => a.score < b.score || a.score === b.score && a.order < b.order
  const push = (key: number) => {
    const entry = { key, score: Math.floor(key / p.nodes) + p.distance(key % p.nodes), order: order++ }
    let i = heap.length; heap.push(entry)
    while (i && less(entry, heap[(i - 1) >> 1])) { heap[i] = heap[(i - 1) >> 1]; i = (i - 1) >> 1 }
    heap[i] = entry
  }
  const pop = () => {
    const first = heap[0], last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++
        if (!less(heap[child], last)) break
        heap[i] = heap[child]; i = child
      }
      heap[i] = last
    }
    return first.key
  }
  push(p.from)
  let best = p.from
  while (heap.length) {
    if (!p.spend()) break
    const key = pop(), node = key % p.nodes, time = Math.floor(key / p.nodes)
    if (p.distance(node) < p.distance(best % p.nodes) && p.terminal(node, time)) best = key
    if (node === p.goal && best % p.nodes === p.goal) break
    if (time === p.horizon) continue
    for (const edge of [...p.neighbors(node), { to: node, duration: 1 }]) {
      if (!p.spend()) break
      const nextTime = time + edge.duration, next = nextTime * p.nodes + edge.to
      if (nextTime > p.horizon || parent.has(next) || !p.safe(node, edge.to, time, nextTime)) continue
      parent.set(next, key); push(next)
    }
  }
  if (best === p.from) return null
  const path: number[] = []
  for (let k = best; parent.get(k) !== -1; k = parent.get(k)!) path.push(k % p.nodes)
  return path.reverse()
}

export type Graph = number[][]
export type Agent = { node: number; goal: number }

export function distances(graph: Graph, goal: number): number[] {
  // Benchmark graphs can have directed edges.
  const reverse: Graph = graph.map(() => [])
  graph.forEach((edges, from) => edges.forEach((to) => reverse[to].push(from)))
  const d = graph.map(() => Infinity), queue = [goal]; d[goal] = 0
  for (let i = 0; i < queue.length; i++) for (const n of reverse[queue[i]]) if (d[n] === Infinity) { d[n] = d[queue[i]] + 1; queue.push(n) }
  return d
}

// RHCR: solve a window w, execute only h ticks, then discard the tail and replan.
// Prioritized solver with stationary fallback; incomplete, without optimality guarantee.
export function rollingWindow(graph: Graph, agents: Agent[], horizon: number, period: number, budget: number, epoch = 0, heuristics?: number[][]) {
  if (!Number.isInteger(horizon) || horizon < 2 || horizon > 32 || !Number.isInteger(period) || period < 1 || period > horizon || !Number.isInteger(budget) || budget < 100 || budget > 1000000 || !Number.isInteger(epoch) || epoch < 0) throw new RangeError('Invalid RHCR parameters')
  if (!graph.length || graph.some((edges) => edges.some((n) => !Number.isInteger(n) || n < 0 || n >= graph.length)) || agents.some((a) => !Number.isInteger(a.node) || !Number.isInteger(a.goal) || !graph[a.node] || !graph[a.goal]) || new Set(agents.map((a) => a.node)).size !== agents.length) throw new RangeError('Invalid MAPF graph or agents')
  const paths = agents.map((a) => Array(horizon + 1).fill(a.node) as number[])
  const occupied = Array.from({ length: horizon + 1 }, () => new Map<number, number>())
  const edges = Array.from({ length: horizon + 1 }, () => new Map<number, number>())
  const adjust = (table: Map<number, number>, key: number, delta: number) => {
    const value = (table.get(key) ?? 0) + delta
    if (value) table.set(key, value); else table.delete(key)
  }
  const reserve = (path: number[], delta: number) => {
    for (let t = 0; t <= horizon; t++) {
      adjust(occupied[t], path[t], delta)
      if (t) adjust(edges[t], path[t - 1] * graph.length + path[t], delta)
    }
  }
  paths.forEach((p) => reserve(p, 1))
  let operations = 0, exhausted = 0
  for (let priority = 0; priority < agents.length; priority++) {
    const id = (priority + epoch) % agents.length, a = agents[id], d = heuristics?.[id] ?? distances(graph, a.goal)
    if (d.length !== graph.length || d[a.goal] !== 0) throw new RangeError('Invalid RHCR distances')
    let used = 0, hit = false
    const spend = () => { if (used === budget) { hit = true; return false }; used++; return true }
    reserve(paths[id], -1)
    const safe = (from: number, to: number, begin: number, end: number) => {
      return spend() && !occupied[end].has(to) && !edges[end].has(to * graph.length + from)
    }
    const terminal = (node: number, time: number) => {
      for (let t = time; t <= horizon; t++) if (!spend() || occupied[t].has(node)) return false
      return true
    }
    const path = windowSearch({ from: a.node, goal: a.goal, nodes: graph.length, horizon, neighbors: (n) => graph[n].map((to) => ({ to, duration: 1 })), distance: (n) => d[n], safe, terminal, spend })
    if (path) for (let t = 1; t <= horizon; t++) paths[id][t] = path[Math.min(t - 1, path.length - 1)]
    reserve(paths[id], 1)
    operations += used; exhausted += Number(hit)
  }
  return { paths: paths.map((p) => p.slice(0, period + 1)), operations, exhausted }
}
