import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Object3D, PMREMGenerator, type InstancedMesh, type PerspectiveCamera } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { type OrbitControls as OrbitControl } from 'three/addons/controls/OrbitControls.js'
import { binParts, PALETTE, rackParts, robotParts, stationParts } from './scene/assets.ts'
import { binPosition, createSim, DT, LEVEL_HEIGHT, robotPosition, step, type State } from './sim/sim.ts'
import { validateLayout, type Layout } from './sim/layout.ts'
import { Editor } from './Editor.tsx'
import { CongestionPanel, HeatLayer } from './Congestion.tsx'
import { GEOMETRY } from './sim/geometry.ts'
import { loadConfiguration, saveConfiguration } from './preferences.ts'

const SPEEDS = [1, 2, 5, 10]
const MAX_STEPS_PER_FRAME = 100 // au-delà (onglet en arrière-plan), on lâche le retard

declare global {
  interface Window {
    kinesis?: { sim: State; mesh: InstancedMesh; bins: InstancedMesh; robotMeshes: InstancedMesh[]; binMeshes: InstancedMesh[]; geometry: typeof GEOMETRY }
    kinesisView: RootState
  }
}
// Lu par useFrame, écrit par les boutons : hors state React pour ne pas re-rendre à chaque image.
const clock = { playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, acc: 0 }

function Robots({ sim }: { sim: State }) {
  const mesh = useRef<InstancedMesh>(null!)
  const bins = useRef<InstancedMesh>(null!)
  const bodies = useRef<InstancedMesh[]>([])
  const tubs = useRef<InstancedMesh[]>([])
  const buffers = useMemo(() => {
    const prev = sim.robots.map((r) => ({ x: r.x, y: GEOMETRY.robotCenterY, z: r.z }))
    const cur = sim.robots.map((r) => ({ x: r.x, y: GEOMETRY.robotCenterY, z: r.z }))
    const binPrev = sim.bins.map((b) => { const p = { x: 0, y: 0, z: 0 }; binPosition(sim, b, p); return p })
    const binCur = binPrev.map((p) => ({ ...p }))
    return { prev, cur, binPrev, binCur, transform: new Object3D() }
  }, [sim])
  useLayoutEffect(() => {
    const snapshot = { sim, mesh: mesh.current, bins: bins.current, robotMeshes: bodies.current, binMeshes: tubs.current, geometry: GEOMETRY }
    window.kinesis = snapshot
    return () => { if (window.kinesis === snapshot) delete window.kinesis }
  }, [sim])

  useFrame((_, delta) => {
    if (clock.playing) clock.acc += delta * clock.speed
    let n = 0
    while (clock.acc >= DT && n++ < MAX_STEPS_PER_FRAME) {
      for (let i = 0; i < sim.robots.length; i++) robotPosition(sim, sim.robots[i], buffers.prev[i])
      for (let i = 0; i < sim.bins.length; i++) binPosition(sim, sim.bins[i], buffers.binPrev[i])
      step(sim)
      clock.acc -= DT
    }
    if (clock.acc >= DT) clock.acc = 0
    // Interpolation d'affichage entre les deux derniers pas (seule logique côté rendu).
    const a = clock.acc / DT
    for (let i = 0; i < sim.robots.length; i++) {
      const prev = buffers.prev[i], cur = buffers.cur[i]
      robotPosition(sim, sim.robots[i], cur)
      buffers.transform.position.set(
        prev.x + (cur.x - prev.x) * a - sim.width / 2 + 0.5,
        prev.y + (cur.y - prev.y) * a,
        prev.z + (cur.z - prev.z) * a - sim.depth / 2 + 0.5,
      )
      buffers.transform.updateMatrix()
      for (let j = 0; j < bodies.current.length; j++) bodies.current[j].setMatrixAt(i, buffers.transform.matrix)
    }
    for (let j = 0; j < bodies.current.length; j++) bodies.current[j].instanceMatrix.needsUpdate = true
    for (let i = 0; i < sim.bins.length; i++) {
      const prev = buffers.binPrev[i], cur = buffers.binCur[i]
      binPosition(sim, sim.bins[i], cur)
      buffers.transform.position.set(
        prev.x + (cur.x - prev.x) * a - sim.width / 2 + 0.5,
        prev.y + (cur.y - prev.y) * a,
        prev.z + (cur.z - prev.z) * a - sim.depth / 2 + 0.5,
      )
      buffers.transform.updateMatrix()
      for (let j = 0; j < tubs.current.length; j++) tubs.current[j].setMatrixAt(i, buffers.transform.matrix)
    }
    for (let j = 0; j < tubs.current.length; j++) tubs.current[j].instanceMatrix.needsUpdate = true
  })

  return (
    <>
    {robotParts.map((p, i) => <instancedMesh key={i} args={[p.geometry, p.material, sim.robots.length]}
      frustumCulled={false} castShadow={i === 0} receiveShadow
      ref={(m) => { bodies.current[i] = m!; if (i === 0) {
        mesh.current = m!
      } }} />)}
    {binParts.map((p, i) => <instancedMesh key={i} args={[p.geometry, p.material, sim.bins.length]}
      frustumCulled={false} castShadow={i === 0} receiveShadow
      ref={(m) => { tubs.current[i] = m!; if (i === 0) {
        bins.current = m!
      } }} />)}
    </>
  )
}

type Placement = [number, number, number, number, number, number]

function Structure({ placements, color, sim }: { placements: Placement[]; color: string; sim: State }) {
  const mesh = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const transform = new Object3D()
    for (let i = 0; i < placements.length; i++) {
      const [x, y, z, w, h, d] = placements[i]
      transform.position.set(x - sim.width / 2 + 0.5, y, z - sim.depth / 2 + 0.5)
      transform.scale.set(w, h, d)
      transform.updateMatrix()
      mesh.current.setMatrixAt(i, transform.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [placements, sim])
  return <instancedMesh ref={mesh} args={[undefined, undefined, placements.length]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color={color} roughness={0.8} />
  </instancedMesh>
}

function StaticAsset({ parts, cells, sim, name }: { parts: typeof robotParts; cells: number[]; sim: State; name: string }) {
  const meshes = useRef<InstancedMesh[]>([])
  useLayoutEffect(() => {
    const transform = new Object3D()
    for (let i = 0; i < cells.length; i++) {
      transform.position.set(cells[i] % sim.width - sim.width / 2 + .5, 0,
        Math.floor(cells[i] / sim.width) - sim.depth / 2 + .5)
      transform.updateMatrix()
      for (const mesh of meshes.current) mesh.setMatrixAt(i, transform.matrix)
    }
    for (const mesh of meshes.current) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() }
  }, [cells, sim])
  return <>{parts.map((p, i) => <instancedMesh key={i} name={`${name}-${i}`} ref={(m) => { meshes.current[i] = m! }}
    args={[p.geometry, p.material, cells.length]} castShadow={i === 0} receiveShadow />)}</>
}

function Warehouse({ sim }: { sim: State }) {
  const rackAssets = useMemo(() => rackParts(sim.levels * LEVEL_HEIGHT + GEOMETRY.rackTopOffsetY, sim.levels, LEVEL_HEIGHT), [sim.levels])
  useLayoutEffect(() => () => {
    for (const part of rackAssets) { part.geometry.dispose(); part.material.dispose() }
  }, [rackAssets])
  const structure = useMemo(() => {
    const parking: Placement[] = []
    for (const r of sim.robots) for (const dx of [-.40, .40]) {
      parking.push([r.x + dx, .005, r.z, .018, .01, .78])
      parking.push([r.x, .005, r.z + dx, .78, .01, .018])
    }
    return { columns: sim.columns.map((c) => c.cell), parking }
  }, [sim])
  return <>
    <StaticAsset parts={rackAssets} cells={structure.columns} sim={sim} name="rack" />
    <StaticAsset parts={stationParts} cells={sim.stations} sim={sim} name="station" />
    <Structure placements={structure.parking} color={PALETTE.section} sim={sim} />
  </>
}

function StudioLight({ sim }: { sim: State }) {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = generator.fromScene(room, .04)
    scene.environment = target.texture
    scene.environmentIntensity = .65
    room.dispose()
    generator.dispose()
    return () => { scene.environment = null; target.dispose() }
  }, [gl, scene])
  return <>
    <hemisphereLight args={[PALETTE.sky, PALETTE.ground, .65]} />
    <directionalLight position={[-sim.width / 4, 36, sim.depth / 3]} intensity={2.4} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-sim.width * .7} shadow-camera-right={sim.width * .7}
      shadow-camera-top={sim.depth} shadow-camera-bottom={-sim.depth} shadow-camera-near={1} shadow-camera-far={120}
      shadow-bias={-.0002} shadow-normalBias={.025} />
    <directionalLight position={[14, 10, -12]} intensity={1.1} color={PALETTE.sky} />
  </>
}

function CameraFit({ sim }: { sim: State }) {
  const { camera, controls, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as PerspectiveCamera
    const targetY = sim.levels * LEVEL_HEIGHT / 3
    const radius = Math.hypot(sim.width / 2, sim.depth / 2, targetY)
    const halfFov = Math.min(cam.fov * Math.PI / 360, Math.atan(Math.tan(cam.fov * Math.PI / 360) * size.width / size.height))
    const distance = radius / Math.sin(halfFov) * .78
    camera.position.set(distance * .59, targetY + distance * .51, distance * .63)
    // Le cadrage est un choix de présentation, indépendant des règles de circulation.
    const orbit = controls as OrbitControl | null
    if (orbit) { orbit.target.set(0, targetY, 0); orbit.update() }
    else camera.lookAt(0, targetY, 0)
  }, [sim, camera, controls, size.width, size.height])
  return null
}

function Controls({ count, onCount, sim, onEdit, error }: { count: number; onCount: (n: number) => void; sim: State; onEdit: () => void; error: string }) {
  const [playing, setPlaying] = useState(clock.playing)
  const [speed, setSpeed] = useState(clock.speed)
  return (
    <section className="panel" aria-label="Commandes de simulation">
      <button onClick={() => setPlaying((previous) => (clock.playing = !previous))}>{playing ? 'Pause' : 'Lecture'}</button>
      <div role="group" aria-label="Vitesse" className="seg">
        {SPEEDS.map((v) => (
          <button key={v} aria-pressed={v === speed} onClick={() => setSpeed((clock.speed = v))}>
            {v}×
          </button>
        ))}
      </div>
      <label htmlFor="fleet">Robots</label>
      <select id="fleet" name="fleet" value={count} onChange={(e) => onCount(Number(e.target.value))}>
        {Array.from(new Set([20, 100, 300, count])).sort((a, b) => a - b).map((n) =>
          <option key={n} value={n} disabled={n > validateLayout(sim.layout)}>{n}</option>)}
      </select>
      <span className="meta">graine {sim.seed}</span>
      <button id="open-editor" onClick={onEdit}>Construire</button>
      {error && <p role="alert" className="error">{error}</p>}
      <details className="meta">
        <summary>Skypod 2025+ · modèle illustratif</summary>
        <p>{sim.levels} niveaux · {sim.columns.length} chemins de grimpe · {sim.bins.length} bacs · {sim.stations.length} stations.</p>
        <p>Circulation sous racks. Baies d’attente et trajets réservés entièrement.</p>
        <p>Un robot par colonne. Dimensions et durées non calibrées Exotec.</p>
      </details>
    </section>
  )
}

function App() {
  const initial = useRef<ReturnType<typeof loadConfiguration> | null>(null)
  if (!initial.current) initial.current = loadConfiguration()
  const active = useRef<State | null>(null)
  if (!active.current) {
    const c = initial.current.configuration
    active.current = createSim(c.seed, c.count, c.layout)
  }
  const sim = active.current
  const [count, setCount] = useState(initial.current.configuration.count)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [cut, setCut] = useState(0)
  const level = Math.min(cut, sim.levels)
  const [error, setError] = useState(initial.current.warning)
  const closeEditor = () => { setEditing(false); document.getElementById('open-editor')?.focus() }
  const apply = (layout: Layout, n: number) => {
    const next = createSim(sim.seed, n, layout)
    active.current = next
    clock.acc = 0
    const warning = saveConfiguration({ version: 1, seed: next.seed, count: n, layout: next.layout })
    setCount(n); setRevision((v) => v + 1); setError(warning)
    // Le focus ne revient sur « Construire » que si l'éditeur était ouvert, pas depuis le choix de flotte.
    if (editing) closeEditor()
  }
  const changeCount = (n: number) => {
    try { apply(sim.layout, n) } catch (e) { setError((e as Error).message) }
  }
  return (
  <>
    <Canvas shadows camera={{ position: [31, 27, 33], fov: 45 }} dpr={[1, 2]}
      onCreated={(view) => { window.kinesisView = view }}>
      <StudioLight sim={sim} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.018, 0]} receiveShadow>
        <planeGeometry args={[sim.width, sim.depth]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={.87} metalness={.12} />
      </mesh>
      <Grid
        args={[sim.width, sim.depth]}
        cellSize={1}
        sectionSize={4}
        cellColor={PALETTE.cell}
        cellThickness={0.4}
        sectionColor={PALETTE.section}
        sectionThickness={0.65}
        fadeDistance={150}
      />
      {/* Un propriétaire unique pour remplacer toutes les instances du run. */}
      <group key={revision} name="warehouse">
        <Warehouse sim={sim} />
        <Robots sim={sim} />
        <HeatLayer sim={sim} level={level} />
      </group>
      <OrbitControls makeDefault enableDamping target={[0, 2, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />
      <CameraFit sim={sim} />
    </Canvas>
    <CongestionPanel key={revision} sim={sim} level={level} onLevel={setCut} />
    <Controls count={count} onCount={changeCount} sim={sim} onEdit={() => setEditing(true)} error={error} />
    {editing && <Editor layout={sim.layout} count={count} onApply={apply} onClose={closeEditor} />}
  </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
