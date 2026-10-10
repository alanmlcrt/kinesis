import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DataTexture, NearestFilter, SRGBColorSpace } from 'three'
import { DT, LEVEL_HEIGHT, type State } from './sim/sim.ts'

// Échelle séquentielle viridis (perceptuellement uniforme, lisible par les daltoniens).
export const VIRIDIS = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725']
const STOPS = VIRIDIS.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
const REFRESH = .25 // s réelles : chiffres et cartes à 4 Hz, pas à chaque image

function viridis(t: number, out: Uint8Array | Uint8ClampedArray, o: number): void {
  const f = Math.min(1, t) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(f)), k = f - i
  for (let c = 0; c < 3; c++) out[o + c] = STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * k
}

// Maximum sur tous les niveaux : une même couleur vaut la même durée d'une coupe à l'autre.
function maxLost(s: State): number {
  let max = 0
  for (let i = 0; i < s.lost.length; i++) if (s.lost[i] > max) max = s.lost[i]
  return max
}

// Champ du niveau choisi en texture : une seule surface, mise à jour à 4 Hz.
export function HeatLayer({ sim, level }: { sim: State; level: number }) {
  const texture = useMemo(() => {
    const t = new DataTexture(new Uint8Array(sim.width * sim.depth * 4), sim.width, sim.depth)
    t.magFilter = t.minFilter = NearestFilter
    t.colorSpace = SRGBColorSpace
    return t
  }, [sim])
  useLayoutEffect(() => () => texture.dispose(), [texture])
  const wait = useRef(REFRESH)
  useEffect(() => { wait.current = REFRESH }, [level])
  useFrame((_, delta) => {
    if ((wait.current += delta) < REFRESH) return
    wait.current = 0
    const data = texture.image.data as Uint8Array, max = maxLost(sim), cells = sim.width * sim.depth
    for (let z = 0; z < sim.depth; z++) for (let x = 0; x < sim.width; x++) {
      const v = sim.lost[level * cells + z * sim.width + x], o = ((sim.depth - 1 - z) * sim.width + x) * 4
      viridis(max ? v / max : 0, data, o)
      data[o + 3] = v > 0 ? 220 : 0
    }
    texture.needsUpdate = true
  })
  return <mesh name="lost-time" rotation={[-Math.PI / 2, 0, 0]} position={[0, level * LEVEL_HEIGHT + .004, 0]} renderOrder={1}>
    <planeGeometry args={[sim.width, sim.depth]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </mesh>
}

const seconds = (steps: number) => (steps * DT).toLocaleString('fr-FR', { maximumFractionDigits: 1 })

// Coupe 2D du niveau choisi pour lire les valeurs, et indicateurs du run en cours.
export function CongestionPanel({ sim, level, onLevel }: { sim: State; level: number; onLevel: (l: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null!)
  const live = useRef<HTMLParagraphElement>(null!)
  const scale = useRef<HTMLSpanElement>(null!)
  const peak = useRef<HTMLParagraphElement>(null!)
  const probe = useRef<HTMLParagraphElement>(null!)
  const cell = useRef(-1)
  useEffect(() => {
    const ctx = canvas.current.getContext('2d')!
    const image = ctx.createImageData(sim.width, sim.depth)
    const cells = sim.width * sim.depth
    const draw = () => {
      const max = maxLost(sim)
      let top = -1
      for (let c = 0; c < cells; c++) {
        const v = sim.lost[level * cells + c], o = c * 4
        if (v > 0) { viridis(v / max, image.data, o); if (top === -1 || v > sim.lost[level * cells + top]) top = c }
        else {
          // Repères neutres : chemins de grimpe et stations, pour s'orienter sans valeur.
          const kind = sim.floor[c], g = kind === 'column' ? 70 : kind === 'station' ? 110 : 22
          image.data[o] = image.data[o + 1] = image.data[o + 2] = g
        }
        image.data[o + 3] = 255
      }
      ctx.putImageData(image, 0, 0)
      const hours = sim.tick * DT / 3600, tasks = sim.robots.reduce((n, r) => n + r.visits, 0)
      const share = sim.freeSteps ? Math.round(sim.lostSteps / sim.freeSteps * 100) : 0
      live.current.textContent = `t = ${seconds(sim.tick)} s · débit ${hours ? Math.round(tasks / hours).toLocaleString('fr-FR') : 0} bacs/h ` +
        `(${tasks} servis) · temps perdu ${seconds(sim.lostSteps)} s, ${share} % du trajet libre`
      scale.current.textContent = `${seconds(max)} s`
      peak.current.textContent = top === -1 ? `Aucun temps perdu à ce niveau${level ? ' : la colonne est réservée avant la montée.' : '.'}`
        : `Maximum : case (${top % sim.width}, ${Math.floor(top / sim.width)}), ${seconds(sim.lost[level * cells + top])} s`
      probe.current.textContent = cell.current === -1 ? 'Survoler la coupe pour lire une case.'
        : `Case (${cell.current % sim.width}, ${Math.floor(cell.current / sim.width)}) : ${seconds(sim.lost[level * cells + cell.current])} s`
    }
    draw()
    const timer = setInterval(draw, REFRESH * 1000)
    return () => clearInterval(timer)
  }, [sim, level])
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = canvas.current.getBoundingClientRect()
    const x = Math.floor((e.clientX - box.left) / box.width * sim.width), z = Math.floor((e.clientY - box.top) / box.height * sim.depth)
    cell.current = x >= 0 && x < sim.width && z >= 0 && z < sim.depth ? z * sim.width + x : -1
  }
  return (
    // Replié sur téléphone pour laisser la scène visible.
    <details className="congestion" open={matchMedia('(min-width: 701px)').matches}>
      <summary>Où ça bloque</summary>
      <p className="meta">Un seul run · solveur non validé · chauffe incluse</p>
      <p ref={live} aria-live="off" />
      <div role="group" aria-label="Niveau de la coupe" className="seg">
        {Array.from({ length: sim.levels + 1 }, (_, l) =>
          <button key={l} aria-pressed={l === level} onClick={() => onLevel(l)}>{l === 0 ? 'Sol' : `N${l}`}</button>)}
      </div>
      <h2>Temps perdu, {level === 0 ? 'sol' : `niveau ${level}`}</h2>
      <canvas ref={canvas} width={sim.width} height={sim.depth} className="cut"
        style={{ aspectRatio: `${sim.width} / ${sim.depth}` }} aria-label={`Coupe du temps perdu par case, ${level === 0 ? 'sol' : `niveau ${level}`}`}
        role="img" onPointerMove={point} onPointerLeave={() => { cell.current = -1 }} />
      <div className="scale">
        <span>0 s</span>
        <span className="ramp" style={{ background: `linear-gradient(90deg, ${VIRIDIS.join(', ')})` }} />
        <span ref={scale} />
      </div>
      <p ref={peak} />
      <p ref={probe} className="meta" />
      <p className="meta">Attente après un refus (trajet, colonne ou bac occupé), plus détour au-delà du trajet libre (imputé à la case de départ). Cumul depuis le début du run.</p>
    </details>
  )
}
