import { BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GEOMETRY } from '../sim/geometry.ts'

// Assets locaux : aucune requête réseau, et une géométrie partagée par matériau.
export const PALETTE = {
  shell: '#e2e5e7', rubber: '#20262c', steel: '#a8b3be', rack: '#65717c',
  bin: '#7395a7', rim: '#a0bac7', accent: '#235f8c', floor: '#d5dde2',
  background: '#f1f4f6', sky: '#f6f8fa', ground: '#7d8b97', cell: '#aebbc5', section: '#8597a5',
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, radius = 0) {
  // Les très petits détails n'ont pas besoin de centaines de triangles de chanfrein.
  const g = radius >= .012 ? new RoundedBoxGeometry(w, h, d, radius >= .04 ? 2 : 1, radius)
    : new BoxGeometry(w, h, d).toNonIndexed()
  return g.translate(x, y, z)
}

function cylinder(radius: number, length: number, x: number, y: number, z: number, axis: 'x' | 'y' = 'y') {
  const g = new CylinderGeometry(radius, radius, length, 16).toNonIndexed()
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  return g.translate(x, y, z)
}

function merge(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  return g
}

function part(geometry: BufferGeometry, color: string, roughness: number, metalness = 0) {
  return { geometry, material: new MeshStandardMaterial({ color, roughness, metalness }) }
}

function identification(label: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = PALETTE.shell; ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = PALETTE.rubber
  ctx.font = 'bold 30px system-ui'; ctx.fillText(label, 20, 42)
  // Motif d'identification décoratif, sans identifiant métier fictif.
  for (let x = 20, i = 0; x < 480; i++) {
    const width = 2 + (i * 7 % 5)
    ctx.fillRect(x, 58, width, 50); x += width + 3 + i % 3
  }
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 4
  return new MeshStandardMaterial({ map, roughness: .72 })
}

export const robotParts = (() => {
  const shell = [box(.64, .24, .65, 0, .035, 0, .055)]
  const dark = [box(.67, .10, .68, 0, -.115, 0, .025), box(.46, .025, .46, 0, .166, 0, .012)]
  const metal = [box(.06, .035, .51, -.19, .21), box(.06, .035, .51, .19, .21)]
  const light = [box(.27, .018, .009, 0, .048, .327, .004)]
  // Roues motrices, moyeux, capteurs, pare-chocs et guides de préhension.
  for (const x of [-.305, .305]) for (const z of [-.22, .22]) {
    dark.push(cylinder(.094, .065, x, -.10, z, 'x'))
    metal.push(cylinder(.042, .069, x, -.10, z, 'x'))
    shell.push(box(.055, .14, .13, x, .01, z, .015))
  }
  for (const z of [-.332, .332]) {
    dark.push(box(.34, .036, .02, 0, -.057, z, .01))
    dark.push(box(.075, .038, .014, -.22, .07, z, .009), box(.075, .038, .014, .22, .07, z, .009))
  }
  for (const x of [-.322, .322]) for (let z = -.10; z <= .10; z += .04) {
    dark.push(box(.008, .012, .026, x, .025, z))
  }
  metal.push(cylinder(.055, .018, 0, .194, -.10))
  dark.push(cylinder(.037, .028, 0, .205, -.10))
  const label = new PlaneGeometry(.20, .05).rotateX(-Math.PI / 2).translate(0, .183, .16)
  return [part(merge(shell), PALETTE.shell, .32), part(merge(dark), PALETTE.rubber, .72),
    part(merge(metal), PALETTE.steel, .29, .75), part(merge(light), PALETTE.accent, .28),
    { geometry: label, material: identification('KINESIS') }]
})()

export const binParts = (() => {
  // Bac réellement creux : fond, parois, poignées traversantes et lèvre empilable.
  const walls = [box(.62, .035, .67, 0, -.205, 0, .009)]
  const ribs: BufferGeometry[] = []
  for (const x of [-.305, .305]) walls.push(box(.035, .40, .65, x, .012, 0, .009))
  for (const z of [-.332, .332]) {
    walls.push(box(.59, .235, .035, 0, -.07, z, .008))
    walls.push(box(.59, .055, .035, 0, .193, z, .009))
    for (const x of [-.21, .21]) walls.push(box(.17, .10, .035, x, .115, z, .007))
    ribs.push(box(.65, .028, .055, 0, .218, z, .008))
    for (const x of [-.25, -.13, .13, .25]) ribs.push(box(.018, .32, .018, x, -.025, z * 1.055, .004))
    ribs.push(box(.13, .045, .003, 0, -.095, z * 1.06))
  }
  for (const x of [-.305, .305]) {
    ribs.push(box(.055, .028, .65, x, .218, 0, .008))
    for (const z of [-.24, -.12, 0, .12, .24]) ribs.push(box(.018, .32, .018, x * 1.07, -.025, z, .004))
  }
  const labels = [new PlaneGeometry(.15, .045).toNonIndexed().translate(0, -.095, .354),
    new PlaneGeometry(.15, .045).toNonIndexed().rotateY(Math.PI).translate(0, -.095, -.354)]
  return [part(merge(walls), PALETTE.bin, .58), part(merge(ribs), PALETTE.rim, .43),
    { geometry: merge(labels), material: identification('BAC / BIN') }]
})()

export function rackParts(height: number, levels: number, spacing: number) {
  const uprights: BufferGeometry[] = [], shelves: BufferGeometry[] = [], fittings: BufferGeometry[] = []
  // Profils pliés en C, pieds ancrés et dents des rails : pas de piliers pleins.
  // Montants : guides de la colonne d'accès, puis bord extérieur de la cellule de stockage.
  for (const x of [-GEOMETRY.guideOffset, GEOMETRY.guideOffset, GEOMETRY.stockOffsetX + GEOMETRY.guideOffset]) for (const z of [-GEOMETRY.guideOffset, GEOMETRY.guideOffset]) {
    uprights.push(box(.075, height, .024, x, height / 2, z))
    for (const dx of [-.032, .032]) uprights.push(box(.012, height, .07, x + dx, height / 2, z + .028))
    fittings.push(box(.18, .035, .17, x, .02, z, .008))
    for (const dz of [-.055, .055]) fittings.push(cylinder(.014, .015, x, .045, z + dz))
    if (x < 1) for (let y = .22; y < height; y += .14) fittings.push(box(.055, .025, .025, x, y, z - .026))
  }
  for (let level = 1; level <= levels; level++) {
    const y = level * spacing + GEOMETRY.shelfOffsetY
    shelves.push(box(.86, .045, .9, 1, y, 0))
    for (const z of [-.43, .43]) shelves.push(box(.86, .12, .035, 1, y - .05, z))
    for (const z of [-.25, .25]) fittings.push(box(.82, .025, .045, 1, y + .035, z))
    for (const z of [-.47, .47]) uprights.push(box(1.94, .09, .06, .5, y - .11, z))
  }
  for (const z of [-.47, .47]) uprights.push(box(2, .10, .07, .5, height, z))
  return [part(merge(uprights), PALETTE.rack, .42, .65), part(merge(shelves), PALETTE.rack, .57, .5),
    part(merge(fittings), PALETTE.steel, .35, .78)]
}

export const stationParts = (() => {
  // Le pad reste sous les roues ; les rouleaux sont latéraux, hors de l'enveloppe du robot.
  const body = [box(.92, .003, .92, 0, .0015, 0)]
  const rollers: BufferGeometry[] = []
  for (const x of [-.43, .43]) body.push(box(.035, .09, .88, x, .075, 0, .008))
  for (const x of [-.395, .395]) for (let z = -.35; z <= .35; z += .1) rollers.push(cylinder(.023, .05, x, .055, z, 'x'))
  return [part(merge(body), PALETTE.accent, .4, .35), part(merge(rollers), PALETTE.steel, .3, .8)]
})()
