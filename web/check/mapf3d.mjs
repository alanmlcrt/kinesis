// Official archives, downloaded 2026-10-11. No synthetic map replaces the benchmark.
import { readFile, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { cpus, platform } from 'node:os'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { rollingWindow, distances } from '../src/sim/rhcr.ts'

function unzip(buffer) {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--
  assert.ok(end >= 0, 'ZIP directory missing')
  let offset = buffer.readUInt32LE(end + 16)
  const files = new Map()
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50)
    const method = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28), name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString()
    const local = buffer.readUInt32LE(offset + 42)
    assert.equal(buffer.readUInt32LE(local), 0x04034b50)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const compressed = buffer.subarray(start, start + size)
    assert.ok(method === 0 || method === 8, 'Unsupported ZIP compression')
    const data = method === 8 ? inflateRawSync(compressed) : compressed
    assert.equal(data.length, buffer.readUInt32LE(offset + 24))
    if (name.endsWith('.csv') && !name.startsWith('__MACOSX/')) files.set(name, data.toString())
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  return files
}
function rows(text, header) {
  const lines = text.trim().split(/\r?\n/)
  assert.equal(lines.shift(), header)
  return lines.map((line) => line.split(','))
}
export function importGraph(nodes, edges) {
  const coordinates = rows(nodes, 'NodeId,X,Y,Z').map((r) => r.map(Number))
  assert.ok(coordinates.every((r) => r.length === 4 && r.every(Number.isSafeInteger)))
  const ids = new Map(coordinates.map((r, i) => [r[0], i]))
  assert.equal(ids.size, coordinates.length)
  const graph = coordinates.map(() => [])
  for (const [a, b, both] of rows(edges, 'nodeFrom,nodeTo,bidirectional')) {
    const from = ids.get(Number(a)), to = ids.get(Number(b))
    assert.ok(from !== undefined && to !== undefined && ['true', 'false'].includes(both))
    const x = coordinates[from], y = coordinates[to]
    assert.equal(Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) + Math.abs(x[3] - y[3]), 1, 'Official edge must have unit length')
    graph[from].push(to); if (both === 'true') graph[to].push(from)
  }
  return { graph, ids }
}
function independentSafety(graph, paths) {
  for (let t = 0; t < paths[0].length; t++) {
    const occupied = new Set()
    for (const path of paths) {
      assert.ok(!occupied.has(path[t]), 'Vertex collision'); occupied.add(path[t])
      if (t) assert.ok(path[t] === path[t - 1] || graph[path[t - 1]].includes(path[t]), 'Off-graph move')
    }
    if (t) for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) assert.ok(!(paths[a][t] === paths[b][t - 1] && paths[b][t] === paths[a][t - 1]), 'Edge swap')
  }
}
export async function checkMapf() {
  const maps = await readFile(new URL('./mapf3d/maps.zip', import.meta.url))
  const scenarios = await readFile(new URL('./mapf3d/scens.zip', import.meta.url))
  const source = { url: 'https://mapf-16a81affbd82.herokuapp.com/', downloaded: '2026-10-11', mapsSha256: createHash('sha256').update(maps).digest('hex'), scenariosSha256: createHash('sha256').update(scenarios).digest('hex') }
  const files = unzip(maps), scens = unzip(scenarios), imports = [], results = []
  const horizon = 8, period = 1, budget = 100000, limit = 160
  for (const [name, text] of [...files].filter(([n]) => n.endsWith('_Nodes.csv')).sort()) {
    const map = name.split('/').at(-1).replace('_Nodes.csv', '')
    const { graph, ids } = importGraph(text, files.get(name.replace('_Nodes.csv', '_Edges.csv')))
    const seeds = [...scens].filter(([n]) => n.includes(`/${map}/`)).sort()
    assert.equal(seeds.length, 10)
    let stationary = 0, count = 0
    for (const [, scenario] of seeds) for (const [id, from, goal] of rows(scenario, 'agentId,startNodeId,goalNodeId')) {
      assert.ok(Number.isSafeInteger(Number(id)) && ids.has(Number(from)) && ids.has(Number(goal)))
      stationary += Number(from === goal); count++
    }
    imports.push({ map, nodes: graph.length, scenarios: seeds.length, pairs: count, stationary })
    // Actual nonzero path on every official graph; compare to independent BFS bound.
    const starts = rows(seeds[0][1], 'agentId,startNodeId,goalNodeId').slice(0, 20).map((r) => ids.get(Number(r[1])))
    const lone = [{ node: starts[0], goal: starts[1] }], lower = distances(graph, lone[0].goal)[lone[0].node]
    assert.ok(Number.isFinite(lower) && lower > 0)
    let ticks = 0
    const singleDistances = [distances(graph, lone[0].goal)]
    while (lone[0].node !== lone[0].goal && ticks <= lower * 2) {
      const r = rollingWindow(graph, lone, horizon, period, budget, ticks, singleDistances)
      independentSafety(graph, r.paths); lone[0].node = r.paths[0][1]; ticks++
    }
    assert.equal(ticks, lower, `Single-agent shortest route ${map}`)
    // Fleet probes: smallest and base map, 3 independent official start seeds.
    if (!['25_5_2_5_2_1', '50_10_5_10_5_2'].includes(map)) continue
    for (const seed of [0, 1, 2]) for (const fleet of [20, 100, 300]) {
      const csv = seeds.find(([n]) => n.endsWith(`Seed${seed}.csv`))[1]
      const positions = rows(csv, 'agentId,startNodeId,goalNodeId').slice(0, fleet).map((r) => ids.get(Number(r[1])))
      assert.equal(new Set(positions).size, fleet)
      // Explicit derived scenario: cyclic permutation of official starting cells.
      const agents = positions.map((node, i) => ({ node, goal: positions[(i + 1) % fleet] }))
      let operations = 0, exhausted = 0, reached = 0, moved = 0, epoch = 0
      const firstArrival = agents.map(() => null), begin = performance.now()
      const heuristics = agents.map((a) => distances(graph, a.goal))
      for (; epoch < limit && reached < fleet; epoch++) {
        const r = rollingWindow(graph, agents, horizon, period, budget, epoch, heuristics)
        independentSafety(graph, r.paths); operations += r.operations; exhausted += r.exhausted
        agents.forEach((a, i) => {
          moved += Number(a.node !== r.paths[i][1]); a.node = r.paths[i][1]
          if (a.node === a.goal && firstArrival[i] === null) firstArrival[i] = epoch + 1
        })
        reached = agents.filter((a) => a.node === a.goal).length
      }
      const seconds = (performance.now() - begin) / 1000
      const result = { map, seed, fleet, ticks: epoch, reached, moved, firstArrival, operations, exhausted, seconds }
      results.push(result); console.log(`MAPF ${map} seed=${seed} robots=${fleet}: ${reached}/${fleet}, ${seconds.toFixed(3)} s, ${operations} operations`)
    }
  }
  assert.equal(imports.length, 15)
  const result = { source, protocol: { horizon, period, budget, limit, scenario: 'DERIVED: goals are next agent start, cyclic permutation; official downloaded pairs retained in import audit', unit: 'One unit edge per tick, vertex and edge-swap conflicts', status: 'Partial validation, no completeness/optimality or reproduction of paper results' }, machine: { node: process.version, platform: platform(), cpu: cpus()[0].model }, imports, results }
  await writeFile(new URL('./mapf3d/results.json', import.meta.url), JSON.stringify(result, null, 2))
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkMapf()
