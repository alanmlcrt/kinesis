import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Line, LineBasicMaterial, Object3D, PMREMGenerator, type Mesh, type InstancedMesh, type PerspectiveCamera } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { type OrbitControls as OrbitControl } from 'three/addons/controls/OrbitControls.js'
import { binParts, PALETTE, rackParts, robotParts, stationParts } from './scene/assets.ts'
import { binPosition, createSim, DT, LEVEL_HEIGHT, elevation, surfaceLevel, robotPosition, step, type State } from './sim/sim.ts'
import { validateLayout, profileLabel, type Layout } from './sim/layout.ts'
import { Editor } from './Editor.tsx'
import { CongestionPanel, HeatLayer } from './Congestion.tsx'
import { Campaign } from './Campaign.tsx'
import { GEOMETRY } from './sim/geometry.ts'
import { DEFAULT_CONTROL } from './sim/control.ts'
import { loadConfiguration, saveConfiguration } from './preferences.ts'
import { LiveLab } from './Lab.tsx'

const SPEEDS = [1, 2, 5, 10]
const MAX_STEPS_PER_FRAME = 100 // au-delà (onglet en arrière-plan), on lâche le retard

declare global {
  interface Window {
    kinesis?: { sim: State; mesh: InstancedMesh; bins: InstancedMesh; robotMeshes: InstancedMesh[]; binMeshes: InstancedMesh[]; geometry: typeof GEOMETRY }
    kinesisView: RootState
  }
}
// Lu par useFrame, écrit par les boutons : hors state React pour ne pas re-rendre à chaque image.
const clock = { playing: location.hash === '#simulation' && !matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, acc: 0, resumed: true }

function Robots({ sim, onSelect }: { sim: State; onSelect: (id: number) => void }) {
  const mesh = useRef<InstancedMesh>(null!)
  const bins = useRef<InstancedMesh>(null!)
  const bodies = useRef<InstancedMesh[]>([])
  const tubs = useRef<InstancedMesh[]>([])
  const buffers = useMemo(() => {
    const prev = sim.robots.map((r) => { const p = { x: 0, y: 0, z: 0 }; robotPosition(sim, r, p); return p })
    const cur = sim.robots.map((r) => { const p = { x: 0, y: 0, z: 0 }; robotPosition(sim, r, p); return p })
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
    // Retour dans Simuler : la boucle était arrêtée, le premier écart couvre tout le temps passé ailleurs.
    if (clock.resumed) { clock.resumed = false; delta = 0 }
    if (clock.playing) clock.acc += delta * clock.speed
    // Plafond en pas et en temps (20 ms) : un pilotage coûteux (RHCR, 300 robots ≈ 80 ms/pas mesuré)
    // ralentit la simulation au lieu de geler la page ; le retard est abandonné.
    let n = 0
    const until = performance.now() + 20
    while (clock.acc >= DT && n++ < MAX_STEPS_PER_FRAME && (n === 1 || performance.now() < until)) {
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
      onClick={(event) => { if (event.instanceId !== undefined && event.delta < 5) { event.stopPropagation(); onSelect(event.instanceId) } }}
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

function Selection({ sim, selected }: { sim: State; selected: number | null }) {
  const ring = useRef<Mesh>(null!)
  const position = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])
  useFrame(() => {
    ring.current.visible = selected !== null && !!sim.robots[selected]
    if (selected === null || !sim.robots[selected]) return
    robotPosition(sim, sim.robots[selected], position)
    ring.current.position.set(position.x - sim.width / 2 + .5, position.y - GEOMETRY.robotCenterY + .025, position.z - sim.depth / 2 + .5)
  })
  return <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
    <ringGeometry args={[.55, .68, 32]} /><meshBasicMaterial color={PALETTE.accent} depthWrite={false} />
  </mesh>
}

// Robot sélectionné : positions passées échantillonnées dans l'état du moteur (traînée qui
// s'efface) et trajet engagé restant, lu tel quel dans r.path (affichage seulement).
// Dessinés par-dessus la scène : au sol, racks et bacs les masqueraient.
const TRAIL = 240, AHEAD = 256
const trailColor = new Color(), floorColor = new Color(PALETTE.floor), accentColor = new Color(PALETTE.accent)
function Trail({ sim, selected }: { sim: State; selected: number | null }) {
  const dots = useRef<InstancedMesh>(null!)
  const marks = useRef<InstancedMesh>(null!)
  const memo = useMemo(() => ({ trail: new Float32Array(TRAIL * 3), head: 0, count: 0, robot: -1, p: { x: 0, y: 0, z: 0 }, transform: new Object3D(),
    line: new Line(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array((AHEAD + 1) * 3), 3)), new LineBasicMaterial({ color: PALETTE.accent, depthTest: false })) }), [sim])
  useEffect(() => () => { memo.line.geometry.dispose(); (memo.line.material as LineBasicMaterial).dispose() }, [memo])
  memo.transform.rotation.x = -Math.PI / 2 // disques et anneaux à plat
  useLayoutEffect(() => {
    for (let i = 0; i < TRAIL; i++) dots.current.setColorAt(i, accentColor)
  }, [sim])
  useFrame(() => {
    const r = selected === null ? undefined : sim.robots[selected], m = memo, t = m.transform, line = m.line
    dots.current.visible = marks.current.visible = line.visible = !!r
    if (!r) return
    if (m.robot !== r.id) { m.robot = r.id; m.count = 0 }
    const ox = -sim.width / 2 + .5, oz = -sim.depth / 2 + .5
    robotPosition(sim, r, m.p)
    const last = (m.head + TRAIL - 1) % TRAIL * 3
    if (m.count === 0 || Math.abs(m.trail[last] - m.p.x) + Math.abs(m.trail[last + 1] - m.p.y) + Math.abs(m.trail[last + 2] - m.p.z) > .15) {
      m.trail[m.head * 3] = m.p.x; m.trail[m.head * 3 + 1] = m.p.y; m.trail[m.head * 3 + 2] = m.p.z
      m.head = (m.head + 1) % TRAIL; m.count = Math.min(m.count + 1, TRAIL)
    }
    for (let k = 0; k < m.count; k++) {
      const j = (m.head + TRAIL - 1 - k) % TRAIL * 3, f = 1 - k / TRAIL
      t.position.set(m.trail[j] + ox, m.trail[j + 1] - GEOMETRY.robotCenterY + .03, m.trail[j + 2] + oz)
      t.scale.setScalar(.35 + .65 * f); t.updateMatrix()
      dots.current.setMatrixAt(k, t.matrix)
      dots.current.setColorAt(k, trailColor.copy(floorColor).lerp(accentColor, f))
    }
    dots.current.count = m.count
    dots.current.instanceMatrix.needsUpdate = true
    dots.current.instanceColor!.needsUpdate = true
    // Trajet futur : de la position affichée jusqu'au dernier nœud engagé.
    const cells = sim.width * sim.depth, positions = line.geometry.attributes.position as BufferAttribute
    positions.setXYZ(0, m.p.x + ox, m.p.y - GEOMETRY.robotCenterY + .04, m.p.z + oz)
    const ahead = Math.min(r.pathLength - r.pathIndex, AHEAD)
    for (let k = 0; k < ahead; k++) {
      const c = r.path[r.pathIndex + k]
      const y = elevation(sim, sim.layout.profile === 'lifts' ? Math.floor(c / cells) : r.level) + .04
      positions.setXYZ(k + 1, c % sim.width + ox, y, Math.floor(c % cells / sim.width) + oz)
      t.position.set(c % sim.width + ox, y, Math.floor(c % cells / sim.width) + oz)
      t.scale.setScalar(1); t.updateMatrix()
      marks.current.setMatrixAt(k, t.matrix)
    }
    positions.needsUpdate = true
    line.geometry.setDrawRange(0, ahead > 0 ? ahead + 1 : 0)
    marks.current.count = ahead
    marks.current.instanceMatrix.needsUpdate = true
  })
  return <>
    <instancedMesh name="trail" ref={dots} args={[undefined, undefined, TRAIL]} frustumCulled={false} visible={false} renderOrder={10}>
      <circleGeometry args={[.09, 12]} /><meshBasicMaterial depthTest={false} />
    </instancedMesh>
    <instancedMesh name="trail-ahead" ref={marks} args={[undefined, undefined, AHEAD]} frustumCulled={false} visible={false} renderOrder={11}>
      <ringGeometry args={[.16, .24, 24]} /><meshBasicMaterial color={PALETTE.accent} depthTest={false} side={DoubleSide} />
    </instancedMesh>
    <primitive object={memo.line} frustumCulled={false} visible={false} renderOrder={11} />
  </>
}

type Placement = [number, number, number, number, number, number]

function Structure({ placements, color, sim, name }: { placements: Placement[]; color: string; sim: State; name?: string }) {
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
  return <instancedMesh name={name} ref={mesh} args={[undefined, undefined, placements.length]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color={color} roughness={0.8} />
  </instancedMesh>
}

function StaticAsset({ parts, cells, sim, name }: { parts: typeof robotParts; cells: number[]; sim: State; name: string }) {
  const meshes = useRef<InstancedMesh[]>([])
  useLayoutEffect(() => {
    const transform = new Object3D()
    for (let i = 0; i < cells.length; i++) {
      transform.position.set(cells[i] % sim.width - sim.width / 2 + .5, elevation(sim, surfaceLevel(sim)),
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
      parking.push([r.x + dx, elevation(sim, surfaceLevel(sim)) + .005, r.z, .018, .01, .78])
      parking.push([r.x, elevation(sim, surfaceLevel(sim)) + .005, r.z + dx, .78, .01, .018])
    }
    const blocked: Placement[] = []
    if (sim.layout.generation === 'classic') for (let c = 0; c < sim.floor.length; c++) if (sim.floor[c] === 'blocked') {
      blocked.push([c % sim.width, .03, Math.floor(c / sim.width), 1, .06, 1])
    }
    const profile: Placement[] = []
    if (sim.layout.profile === 'autostore') {
      const h = elevation(sim, surfaceLevel(sim))
      for (let x = 0; x < sim.width; x++) profile.push([x - .5, h - .02, (sim.depth - 1) / 2, .025, .04, sim.depth])
      for (let z = 0; z < sim.depth; z++) profile.push([(sim.width - 1) / 2, h - .02, z - .5, sim.width, .04, .025])
      for (const c of sim.columns) for (const dx of [-.43, .43]) for (const dz of [-.43, .43]) profile.push([c.cell % sim.width + dx, h / 2, Math.floor(c.cell / sim.width) + dz, .035, h, .035])
    } else if (sim.layout.profile === 'lifts') {
      const h = elevation(sim, sim.levels) + .6
      for (const lift of sim.layout.lifts!) for (const dx of [-.44, .44]) for (const dz of [-.44, .44]) profile.push([lift.x + dx, h / 2, lift.z + dz, .06, h, .06])
      for (let l = 1; l <= sim.levels; l++) {
        const y = elevation(sim, l) - .04
        for (let x = 0; x < sim.width; x++) profile.push([x, y, (sim.depth - 1) / 2, .025, .04, sim.depth])
        for (let z = 0; z < sim.depth; z++) profile.push([(sim.width - 1) / 2, y, z, sim.width, .04, .025])
      }
    }
    return { columns: sim.columns.map((c) => c.cell), parking, blocked, profile }
  }, [sim])
  return <>
    {sim.layout.profile !== 'autostore' && <StaticAsset parts={rackAssets} cells={structure.columns} sim={sim} name="rack" />}
    {structure.profile.length > 0 && <Structure placements={structure.profile} color={PALETTE.cell} sim={sim} name="profile-structure" />}
    <StaticAsset parts={stationParts} cells={sim.stations} sim={sim} name="station" />
    <Structure placements={structure.parking} color={PALETTE.section} sim={sim} />
    {structure.blocked.length > 0 && <Structure placements={structure.blocked} color={PALETTE.rack} sim={sim} name="blocked-floor" />}
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
    const targetY = elevation(sim, sim.layout.profile === 'autostore' ? surfaceLevel(sim) : sim.levels) / 3
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
      <div className="control-group" role="group" aria-label="Lecture et vitesse">
      <button onClick={() => setPlaying((previous) => (clock.playing = !previous))}>{playing ? 'Pause' : 'Lecture'}</button>
      <div role="group" aria-label="Vitesse" className="seg">
        {SPEEDS.map((v) => (
          <button key={v} aria-pressed={v === speed} onClick={() => setSpeed((clock.speed = v))}>
            {v}×
          </button>
        ))}
      </div>
      </div>
      <div className="control-group" role="group" aria-label="Flotte">
      <label htmlFor="fleet">Robots</label>
      <select id="fleet" name="fleet" value={count} onChange={(e) => onCount(Number(e.target.value))}>
        {Array.from(new Set([20, 100, 300, count])).sort((a, b) => a - b).map((n) =>
          <option key={n} value={n} disabled={n > validateLayout(sim.layout)}>{n}</option>)}
      </select>
      <span className="meta">graine {sim.seed}</span>
      </div>
      <div className="control-group" role="group" aria-label="Entrepôt">
      <button id="open-editor" onClick={onEdit}>Construire</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <details className="meta">
        <summary>{profileLabel(sim.layout)} · modèle illustratif</summary>
        <p>{sim.levels} niveaux · {sim.columns.length} colonnes de stockage · {sim.bins.length} bacs · {sim.stations.length} stations.</p>
        {(!sim.layout.profile || sim.layout.profile === 'skypod') && <>
          <p>{sim.layout.generation === 'classic' ? 'Emprise des racks bloquée ; accès par les allées.' : 'Circulation sous racks.'} Baies d’attente · {sim.control.method === 'whole' ? 'trajets réservés entièrement' : sim.control.method === 'rhcr' ? 'replanification au premier arrêt sûr' : 'préfixes engagés'}.</p>
          <p>Un robot par colonne. Dimensions et durées non calibrées Exotec.</p></>}
        {sim.layout.profile === 'lifts' && <p>{sim.lifts.length} gaines · un robot par gaine · {sim.layout.liftSteps! * DT} s / niveau. Gaine réservée pendant le trajet ; accès direct aux bacs.</p>}
        {sim.layout.profile === 'autostore' && <p>Robots au sommet, creusage par le dessus, puits temporaire privé, restitution de la pile. Ports abstraits, durées non calibrées.</p>}
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
    active.current = createSim(c.seed, c.count, c.layout, { ...DEFAULT_CONTROL, method: c.method ?? (c.layout.generation === 'classic' ? 'whole' : 'rhcr'), horizon: Math.max(DEFAULT_CONTROL.horizon, (c.layout.liftSteps ?? 5) / 5) })
  }
  const sim = active.current
  const [count, setCount] = useState(initial.current.configuration.count)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState(['simulation', 'analyser'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'concevoir')
  const [selected, setSelected] = useState<number | null>(null)
  const navigate = (next: string) => {
    setTab(next); location.hash = next
    setMeasuring(next === 'analyser')
    if (next !== 'simulation') { clock.playing = false; clock.resumed = true }
  }
  useEffect(() => {
    const changed = () => {
      const requested = location.hash.slice(1)
      const next = ['concevoir', 'simulation', 'analyser'].includes(requested) ? requested : 'concevoir'
      setTab(next); setMeasuring(next === 'analyser')
      if (next !== 'simulation') { clock.playing = false; clock.resumed = true }
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  const [cut, setCut] = useState(surfaceLevel(sim))
  const [measuring, setMeasuring] = useState(location.hash === '#analyser')
  const closeCampaign = () => {
    setMeasuring(false)
    if (tab === 'analyser') { navigate('simulation'); document.getElementById('tab-simulation')?.focus() }
    else document.getElementById('open-campaign')?.focus()
  }
  const level = Math.min(cut, sim.levels + (sim.layout.profile === 'autostore' ? 1 : 0))
  const [error, setError] = useState(initial.current.warning)
  const apply = (layout: Layout, n: number, method = sim.control.method) => {
    const next = createSim(sim.seed, n, layout, { ...sim.control, method, horizon: Math.max(sim.control.horizon, (layout.liftSteps ?? 5) / 5) })
    active.current = next
    setSelected(null)
    clock.acc = 0
    const warning = saveConfiguration({ version: 1, seed: next.seed, count: n, layout: next.layout, method })
    setCut(surfaceLevel(next)); setCount(n); setRevision((v) => v + 1); setError(warning)
  }
  const changeCount = (n: number) => {
    try { apply(sim.layout, n) } catch (e) { setError((e as Error).message) }
  }
  return (
  <>
    <header className="lab-header"><a className="lab-brand" href="#concevoir">KINESIS <span>warehouse lab</span></a>
      <nav role="tablist" aria-label="Espaces du laboratoire">
        {['concevoir', 'simulation', 'analyser'].map((name, i) => <button key={name} id={`tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`space-${name}`} tabIndex={tab === name ? 0 : -1}
          onClick={() => navigate(name)} onKeyDown={(e) => {
            const names = ['concevoir', 'simulation', 'analyser']
            const index = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1
            if (index >= 0) { e.preventDefault(); navigate(names[index]); document.getElementById(`tab-${names[index]}`)?.focus() }
          }}>{['01 · Concevoir', '02 · Simuler', '03 · Analyser'][i]}</button>)}
      </nav>
    </header>
    <div id="space-simulation" role="tabpanel" aria-labelledby="tab-simulation" className="simulation-space" style={{ visibility: tab === 'simulation' ? 'visible' : 'hidden' }}>
    {/* Hors de Simuler, la scène cachée ne se redessine plus : Concevoir et Analyser gardent toute la machine. */}
    <Canvas shadows camera={{ position: [31, 27, 33], fov: 45 }} dpr={[1, 2]} frameloop={tab === 'simulation' ? 'always' : 'never'}
      onCreated={(view) => { window.kinesisView = view }}>
      <color attach="background" args={[PALETTE.background]} />
      <StudioLight sim={sim} />
      <mesh name="warehouse-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -.018, 0]} receiveShadow>
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
        <Robots sim={sim} onSelect={setSelected} />
        <Selection sim={sim} selected={selected} />
        <Trail sim={sim} selected={selected} />
        <HeatLayer sim={sim} level={level} />
      </group>
      <OrbitControls makeDefault enableDamping target={[0, 2, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />
      <CameraFit sim={sim} />
    </Canvas>
    <LiveLab key={`lab-${revision}`} sim={sim} selected={selected} onSelect={setSelected} />
    <CongestionPanel key={`congestion-${revision}`} sim={sim} level={level} onLevel={setCut} />
    <Controls key={tab} count={count} onCount={changeCount} sim={sim} onEdit={() => navigate('concevoir')}
      error={error} />
    </div>
    {tab === 'concevoir' && <div id="space-concevoir" role="tabpanel" aria-labelledby="tab-concevoir">
      <Editor key={revision} layout={sim.layout} count={count} method={sim.control.method} onApply={(layout, n, method) => { apply(layout, n, method); navigate('simulation'); document.getElementById('tab-simulation')?.focus() }} />
      {error && <p className="workshop-error error" role="alert">{error}</p>}</div>}
    {tab === 'analyser' && <div id="space-analyser" role="tabpanel" aria-labelledby="tab-analyser" />}
    {measuring && <Campaign layout={sim.layout} onClose={closeCampaign} />}
  </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
