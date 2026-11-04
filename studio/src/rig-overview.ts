import {
  AmbientLight, Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight,
  Float32BufferAttribute, GridHelper, Group, LineBasicMaterial, LineSegments, Mesh,
  MeshStandardMaterial, Scene, Vector3,
} from 'three'
import type { Material, PerspectiveCamera } from 'three'
import { makeBlade } from './blade'
import { fieldOfView, TUBE_LENGTH } from './model'
import type { StudioState } from './model'

export interface RigColors {
  background: string; table: string; steel: string; camera: string;
  left: string; right: string; grid: string; guide: string
}

export function frameRigCamera(camera: PerspectiveCamera, points: Vector3[]) {
  const center = new Box3().setFromPoints(points).getCenter(new Vector3()), direction = new Vector3(1, -1.35, 0.95).normalize()
  camera.up.set(0, 0, 1)
  camera.position.copy(center).add(direction)
  camera.lookAt(center)
  const inverse = camera.quaternion.clone().invert()
  const local = points.map(point => point.clone().sub(center).applyQuaternion(inverse))
  const vertical = Math.tan(camera.fov * Math.PI / 360) * 0.88, horizontal = vertical * camera.aspect
  // Fit both frustum sides, accounting for depth, instead of enclosing empty corners of one large box.
  const fitAxis = (axis: 'x' | 'y', tangent: number) => {
    const upper = Math.max(...local.map(p => p[axis] + p.z * tangent))
    const lower = Math.min(...local.map(p => p[axis] - p.z * tangent))
    return { center: (upper + lower) / 2, distance: (upper - lower) / (2 * tangent) }
  }
  const x = fitAxis('x', horizontal), y = fitAxis('y', vertical)
  const distance = Math.max(x.distance, y.distance, ...local.map(p => p.z + camera.near))
  center.add(new Vector3(x.center, y.center, 0).applyQuaternion(camera.quaternion))
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
  return center
}

export class RigOverviewScene {
  readonly scene = new Scene()
  readonly table = new Group()
  readonly cameraRig = new Group()
  readonly blade: Mesh<BufferGeometry, MeshStandardMaterial>
  readonly tubes = [0, 1].map(() => new Mesh(new CylinderGeometry(1, 1, 1, 32),
    new MeshStandardMaterial({ roughness: 0.45 })))
  readonly coverage = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(48), 3)),
    new LineBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }))
  private box = new BoxGeometry(1, 1, 1)
  private tableMaterial = new MeshStandardMaterial({ roughness: 0.85 })
  private cameraMaterial = new MeshStandardMaterial({ roughness: 0.6 })
  private lensMaterial = new MeshStandardMaterial({ roughness: 0.2, metalness: 0.5 })
  private top = new Mesh(this.box, this.tableMaterial)
  private legs = Array.from({ length: 4 }, () => new Mesh(this.box, this.cameraMaterial))
  private grid = new GridHelper(4, 40)
  private tubeColors = [new Color(), new Color()]
  private definition = ''
  private state: StudioState

  constructor(state: StudioState) {
    this.state = state
    this.blade = new Mesh(makeBlade(state.blade.definition), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }))
    this.definition = JSON.stringify(state.blade.definition)
    this.table.name = 'Moving table'; this.blade.name = 'Nihonto'; this.cameraRig.name = 'Photographic camera'
    this.table.add(this.top, ...this.legs, this.blade)
    const body = new Mesh(this.box, this.cameraMaterial)
    body.scale.set(0.14, 0.095, 0.075); body.position.z = 0.095
    const finder = new Mesh(this.box, this.cameraMaterial)
    finder.scale.set(0.045, 0.035, 0.02); finder.position.z = 0.1425
    const lens = new Mesh(new CylinderGeometry(0.035, 0.035, 0.06, 32), this.lensMaterial)
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.03
    this.cameraRig.add(body, finder, lens)
    this.tubes.forEach((tube, i) => { tube.name = i === 0 ? 'Left tube' : 'Right tube'; tube.rotation.z = Math.PI / 2 })
    this.grid.rotation.x = Math.PI / 2
    this.grid.material.vertexColors = false
    this.grid.material.transparent = true; this.grid.material.opacity = 0.35; this.grid.material.depthWrite = false
    const ambient = new AmbientLight(); ambient.intensity = 1.8
    const key = new DirectionalLight(); key.intensity = 3; key.position.set(0.4, -1, 2)
    this.scene.add(this.table, this.cameraRig, ...this.tubes, this.coverage, this.grid, ambient, key)
    this.update(state)
  }

  update(state: StudioState) {
    this.state = state
    const definition = JSON.stringify(state.blade.definition)
    if (definition !== this.definition) {
      this.blade.geometry.dispose()
      this.blade.geometry = makeBlade(state.blade.definition)
      this.definition = definition
    }
    const bounds = this.blade.geometry.boundingBox!, center = bounds.getCenter(new Vector3())
    const length = bounds.max.x - bounds.min.x + 0.2, width = Math.max(0.22, bounds.max.y - bounds.min.y + 0.12)
    this.top.scale.set(length, width, 0.025)
    this.top.position.set(center.x, center.y, bounds.min.z - 0.0125)
    this.legs.forEach((leg, i) => {
      leg.scale.set(0.025, 0.025, 0.2)
      leg.position.set(center.x + (i % 2 ? 1 : -1) * (length / 2 - 0.045),
        center.y + (i < 2 ? 1 : -1) * (width / 2 - 0.045), bounds.min.z - 0.125)
    })
    this.grid.position.z = bounds.min.z - 0.225
    this.table.position.set(state.blade.x / 1000, state.blade.y / 1000, 0)
    this.cameraRig.position.set(0, 0, state.camera.height / 1000)
    this.tubes.forEach((tube, i) => {
      const light = state.lights[i]
      tube.position.set(light.x / 1000, light.y / 1000, light.height / 1000)
      tube.scale.set(state.diameter / 2000, TUBE_LENGTH / 1000, state.diameter / 2000)
      tube.material.color.copy(this.tubeColors[i]).multiplyScalar(light.enabled ? 1 : 0.35)
      tube.material.emissive.copy(this.tubeColors[i])
      tube.material.emissiveIntensity = light.enabled ? light.brightness / 200 : 0
    })
    const fov = fieldOfView(state.camera), w = fov.width / 2000, h = fov.height / 2000
    const corners = [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]]
    const vertices = corners.flatMap((corner, i) => [...corner, ...corners[(i + 1) % 4], 0, 0, state.camera.height / 1000, ...corner])
    for (let i = 0; i < vertices.length; i += 3) {
      this.coverage.geometry.attributes.position.setXYZ(i / 3, vertices[i], vertices[i + 1], vertices[i + 2])
    }
    this.coverage.geometry.attributes.position.needsUpdate = true
    this.coverage.geometry.computeBoundingSphere()
    this.scene.updateMatrixWorld(true)
  }

  setColors(colors: RigColors) {
    this.scene.background = new Color(colors.background)
    this.tableMaterial.color.set(colors.table)
    this.cameraMaterial.color.set(colors.camera)
    this.lensMaterial.color.set(colors.background)
    this.blade.material.color.set(colors.steel)
    this.tubeColors[0].set(colors.left); this.tubeColors[1].set(colors.right)
    this.grid.material.color.set(colors.grid)
    this.coverage.material.color.set(colors.guide)
    this.update(this.state)
  }

  viewPoints() {
    const points: Vector3[] = []
    for (const root of [this.table, this.cameraRig, ...this.tubes]) root.traverse(object => {
      if (!(object instanceof Mesh)) return
      const bounds = new Box3().setFromObject(object)
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) points.push(new Vector3(x, y, z))
      }
    })
    return points
  }

  dispose() {
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>()
    this.scene.traverse(object => {
      if (object instanceof Mesh || object instanceof LineSegments) {
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      }
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    this.scene.clear()
  }
}
