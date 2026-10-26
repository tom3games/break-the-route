// 画面の入口。タイトル（裏でCPUの追跡のデモ）→ ガレージ → 警察と犯人 → 結果。
// 物理と追跡の判定は shared/ のものをそのまま使い、ここは描画・入力・音・画面遷移だけを持つ。
import * as THREE from 'three'
import { GAME, CARS, UPGRADES, PAINTS, DESTRUCT, CHASE, buildStats } from '../shared/config.js'
import { createWorld, FALL_SEC, terrain } from '../shared/track.js'
import { Chase, mulberry, COP_PAINT, ROBBER_PAINT, blast } from '../shared/chase.js'
import { createNav } from '../shared/citynav.js'
import { speedOf } from '../shared/physics.js'
import { createDriver, drive, planRoute } from '../shared/ai.js'
import { buildScene, propGeometry } from './scene.js'
import { CarModel, ProcCar, loadCarModel } from './carmodel.js'
import { FX } from './fx.js'
import { Audio } from './audio.js'
import { Input } from './input.js'
import { t, applyI18n, setLang, getLang, placeText } from './i18n.js'
import { loadProfile, saveProfile, buyUpgrade, sellUpgrade } from './save.js'
import { HUD, drawFullMap, ICON_COP, ICON_ROBBER } from './hud.js'
import { loadSky, makeComposer, setAniso } from './look.js'
import { Q, LOW } from './quality.js'
import { Online } from './online.js'
import { Touch } from './touch.js'

const $ = id => document.getElementById(id)
const STEP = GAME.step

// ---------------------------------------------------------------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.setPixelRatio(Q.pixelRatio)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
setAniso(renderer)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
$('view').appendChild(renderer.domElement)

const scene = new THREE.Scene()
// 霞（遠くが空の色に溶ける）。色は空の地平線付近に合わせる
scene.fog = new THREE.FogExp2(0xc9d6e2, 0.0016)
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2)
sun.userData.dir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize()
sun.castShadow = true
sun.shadow.mapSize.set(Q.shadow, Q.shadow)
const SH = Q.shadowRange
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 })
sun.shadow.normalBias = 0.04
sun.shadow.bias = -0.0004
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x6a5a48, 1.9)
scene.add(hemi)
// 実写の空が読めたら、空で照らし、太陽をその向きへ回す（読めないうちは単色の空と半球光）
scene.background = new THREE.Color(0xa9c4e0)
loadSky(renderer, scene, sun, dir => {
  // 走る向き（北）から見て右後ろに太陽が来るよう空ごと回す
  const want = Math.atan2(-0.85, -0.5), have = Math.atan2(dir.z, dir.x)
  const rot = have - want
  scene.backgroundRotation.set(0, rot, 0)
  scene.environmentRotation.set(0, rot, 0)
  sun.userData.dir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
  hemi.intensity = 0.35
})
const camera = new THREE.PerspectiveCamera(64, 1, 0.3, 2400)

// ステージ（touge = 峠と峡谷 / city = 湾岸シティ）。選んだものは保存してある
// 警察と犯人は街（湾岸シティ）で遊ぶ
let world = createWorld('city')
let nav = createNav(world)
let built = buildScene(scene, world)
const fx = new FX(scene, world)
const audio = new Audio()
const input = new Input()
const hud = new HUD(world)
hud.onBeep = () => audio.beep(false)

// ステージを切り替える（コースの見た目・壊せる物・案内を作り直す）
function loadStage(id) {
  if (world.stage === id) return
  scene.remove(built.root)
  built.root.traverse(o => { if (o.geometry) o.geometry.dispose() })
  world = createWorld(id)
  nav = createNav(world)
  built = buildScene(scene, world)
  fx.world = world
  hud.world = world
  placePickups()
  if (railIM) { scene.remove(railIM); railIM.dispose(); railIM = null; railIndex.clear() }
  placeProps()
}
const guide = new THREE.Group()
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.92, depthTest: false, fog: false })
  const shape = new THREE.Shape()
  shape.moveTo(0, 1.1); shape.lineTo(0.95, -0.2); shape.lineTo(0.5, -0.2); shape.lineTo(0.5, -1.0); shape.lineTo(-0.5, -1.0); shape.lineTo(-0.5, -0.2); shape.lineTo(-0.95, -0.2); shape.closePath()
  const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false }).rotateX(Math.PI / 2), mat)
  arrow.scale.setScalar(0.34)
  arrow.renderOrder = 10
  const edge = new THREE.Mesh(arrow.geometry, new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false, fog: false }))
  edge.scale.setScalar(0.39); edge.position.y = -0.02; edge.renderOrder = 9
  guide.add(edge, arrow)
}
scene.add(guide)
// ニトロ缶（自分が取ると10秒消える）
let pickupMesh = null
function placePickups() {
  if (pickupMesh) { scene.remove(pickupMesh); pickupMesh.dispose() }
  const list = world.pickups || []
  const g = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14)
  pickupMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x3ab6ff, emissive: 0x2a8cff, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.25 }), Math.max(1, list.length))
  pickupMesh.count = list.length
  pickupMesh.frustumCulled = false
  scene.add(pickupMesh)
}
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3()
function updatePickups(now) {
  if (!pickupMesh) return
  const list = world.pickups || []
  const taken = me && me.taken ? me.taken : {}
  list.forEach((pk, i) => {
    const off = race && taken[i] > race.t
    const y = world.groundAt(pk.x, pk.z, 60).h + 1.2 + Math.sin(now / 300 + i) * 0.15
    _pq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), now / 500 + i)
    pickupMesh.setMatrixAt(i, _pm.compose(_pp.set(pk.x, y, pk.z), _pq, off ? _ps.set(0, 0, 0) : _ps.set(1, 1, 1)))
  })
  pickupMesh.instanceMatrix.needsUpdate = true
}

// 次のゲートの光の柱（霧に消えないので遠くから見える）
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 160, 20, 1, true).translate(0, 80, 0),
  new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }))
scene.add(beacon)

// 目標: 犯人には開いた隠れ家、警察には犯人（見えていれば本当の位置、見失っていれば最後の目撃）
function chaseTarget() {
  if (!me || !race || race.phase === 'done') return null
  const e = race.entry(myId)
  if (!e) return null
  if (e.role === 'robber') return race.hideout.open && !e.escaped && !e.arrested ? { x: race.hideout.x, z: race.hideout.z, color: 0x36e07a, live: false } : null
  const k = hud.known(race, me)
  return k ? { x: k.x, z: k.z, color: k.live ? 0xff3355 : 0xff8a1f, live: k.live } : null
}
let guidePath = null, guidePathAt = 0
function updateGuide(now) {
  const tg = mode === 'race' ? chaseTarget() : null
  guide.visible = !!tg && camMode !== 2
  const d = tg ? Math.hypot(tg.x - me.x, tg.z - me.z) : 0
  beacon.visible = !!tg && !(tg.live && d < 70)
  if (!tg) return
  beacon.position.set(tg.x, world.groundAt(tg.x, tg.z, 60).h, tg.z)
  beacon.material.color.setHex(tg.color)
  beacon.material.opacity = 0.22 + Math.sin(now / 300) * 0.08
  if (!guide.visible) return
  // 遠いときは道なりの次の交差点を指す（ビル越しにまっすぐ指さない）
  let px = tg.x, pz = tg.z
  if (d > 60 && nav) {
    if (!guidePath || now - guidePathAt > 500) { guidePath = nav.path(nav.entry(me.x, me.z, me.yaw), nav.nearest(tg.x, tg.z)); guidePathAt = now }
    const n = guidePath.find(q => Math.hypot(q.x - me.x, q.z - me.z) > 14)
    if (n) { px = n.x; pz = n.z }
  }
  const yaw = Math.atan2(px - me.x, pz - me.z)
  const m = models.get(myId)
  const p = m ? m.group.position : me
  // 車の少し前・上。手前（カメラ側）へ起こして、平たく潰れて見えないようにする
  guide.position.set(p.x + Math.sin(me.yaw) * 1.2, p.y + 1.75 + Math.sin(now / 260) * 0.06, p.z + Math.cos(me.yaw) * 1.2)
  guide.rotation.set(0, yaw, 0, 'YXZ')
  guide.rotateX(-0.55)
  guide.children[1].material.color.setHex(tg.color === 0x36e07a ? 0x36e07a : 0xffc21a)
}

// 壊せる物のメッシュ
const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 })
const geoCache = {}
const props = new Map()
// 道沿いのガードレールは千本以上あるので、まとめて1回で描く（壊れたら、その1本だけ消して実体を飛ばす）
let railIM = null
const railIndex = new Map()
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rs = new THREE.Vector3(1, 1, 1), _rp = new THREE.Vector3()
function railMatrix(o, visible = true) {
  _rq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw)
  return _rm.compose(_rp.set(o.cx, o.y0, o.cz), _rq, visible ? _rs.set(1, 1, 1) : _rs.set(0, 0, 0))
}
function setRail(id, visible) {
  const i = railIndex.get(id)
  if (i == null) return
  railIM.setMatrixAt(i, railMatrix(world.objectById.get(id), visible))
  railIM.instanceMatrix.needsUpdate = true
}
function placeProps() {
  for (const m of props.values()) m.parent && m.parent.remove(m)
  props.clear()
  const rails = world.objects.filter(o => o.type === 'guardrail')
  if (!railIM) {
    railIM = new THREE.InstancedMesh(propGeometry('guardrail'), propMat, rails.length)
    railIM.castShadow = true; railIM.receiveShadow = true; railIM.frustumCulled = false
    scene.add(railIM)
    rails.forEach((o, i) => railIndex.set(o.id, i))
  }
  for (const o of rails) railIM.setMatrixAt(railIndex.get(o.id), railMatrix(o, true))
  railIM.instanceMatrix.needsUpdate = true
  if (built.forest) built.forest.reset()
  for (const o of world.objects) {
    if (o.type === 'guardrail' || o.type === 'tree') continue
    const g = geoCache[o.type] || (geoCache[o.type] = propGeometry(o.type))
    const m = new THREE.Mesh(g, propMat)
    m.position.set(o.cx, o.y0, o.cz)
    m.rotation.y = o.yaw
    m.castShadow = true
    scene.add(m)
    props.set(o.id, m)
  }
}
placeProps()
placePickups()

const post = makeComposer(renderer, scene, camera)
function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  post.composer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  fx.setScale(h)
}
addEventListener('resize', resize)
resize()

// ---------------------------------------------------------------- 状態
const profile = loadProfile()
let mode = 'title'      // title | race | results
let race = null
let me = null           // 自分の車（デモ中は null）
let myId = 'me'         // 自分の車の id（オンラインではサーバーの席 id）
let online = null       // オンライン対戦中なら Online
let onlineRace = false  // 今のレースがオンラインか
let menuOpen = false    // オンライン中のメニュー（止まらない）
let models = new Map()  // id -> CarModel
const trafficModels = new Map() // 種類 -> 使い回す車の見た目の列
// 一般車は百台以上いるので、カメラの近くの車にだけ見た目を割り当てる
function buildTrafficPool() {
  for (const list of trafficModels.values()) for (const m of list) { scene.remove(m.group); m.dispose() }
  trafficModels.clear()
  if (!race || !race.traffic) return
  // 2026-10-26「一般車が重すぎる」: 見た目を割り当てる台数を減らした（スマホ 22→12、PC 44→26）
  const n = LOW ? { sedan: 7, van: 3, taxi: 2 } : { sedan: 14, van: 7, taxi: 5 }
  for (const [kind, k] of Object.entries(n)) {
    const list = []
    for (let i = 0; i < k; i++) { const m = new ProcCar(kind, 0xffffff); m.group.visible = false; scene.add(m.group); list.push(m) }
    trafficModels.set(kind, list)
  }
}
const _tcol = new THREE.Color()
function drawTraffic(dt) {
  const cx = camera.position.x, cz = camera.position.z
  // 描くのはカメラから 220m（スマホ 170m）以内だけ
  const R2 = LOW ? 170 * 170 : 220 * 220
  const near = []
  for (const c of race.traffic.cars) { const d = (c.x - cx) ** 2 + (c.z - cz) ** 2; if (d < R2) near.push([c, d]) }
  near.sort((a, b) => a[1] - b[1])
  const used = {}
  for (const [c] of near) {
    const list = trafficModels.get(c.kind)
    if (!list) continue
    const i = used[c.kind] || 0
    if (i >= list.length) continue
    used[c.kind] = i + 1
    const m = list[i]
    m.group.visible = true
    if (m.paintColor.getHex() !== c.color) { m.paintColor.setHex(c.color); m.paintMat.color.copy(_tcol.setHex(c.color)) }
    m.update(c, dt, {})
  }
  for (const [kind, list] of trafficModels) for (let i = used[kind] || 0; i < list.length; i++) list[i].group.visible = false
}
let paused = false
let seenBroken = new Set()
let camMode = 0
let follow = null       // カメラが追う車
let doneAt = null
let lastFrameInp = null
let msgTimer = 0
let demoSwitch = 0
let copLastRadio = -1

const cam = { pos: new THREE.Vector3(0, 10, -20), look: new THREE.Vector3(), off: new THREE.Vector3(0, 3.5, -9), lookOff: new THREE.Vector3(0, 1, 0), hd: 0, fov: 64 }

function startRace({ demo = false, view = null } = {}) {
  // 前の車を片付ける
  for (const m of models.values()) { scene.remove(m.group); m.dispose() }
  models.clear()
  fx.bodies.forEach(b => b.mesh.parent && b.mesh.parent.remove(b.mesh)); fx.bodies.length = 0
  for (const d of fx.debris) d.life = Math.min(d.life, 0.01)
  seenBroken = new Set()
  placeProps()

  race = new Chase(world, { seed: view && view.seed != null ? view.seed : (Math.random() * 1e9) | 0, ...(view && view.timeLimit ? { timeLimit: view.timeLimit } : {}) })
  for (const g of built.gates) g.grp.visible = false // レースのゲートは使わない
  me = null
  autopilot = null
  onlineRace = !!view
  myId = 'me'
  heli.visible = false
  const pc = profile.cars[profile.car]
  if (view) {
    // オンライン: 役とスタート位置・隠れ家はサーバーと同じ。自分だけここで動かし、他は通信で動かす
    race.remoteJudge = true
    myId = online.you
    if (view.hideout) race.hideout = { ...view.hideout }
    for (const en of view.entries) {
      const isMe = en.id === myId
      const car = race.addHuman({ id: en.id, name: en.name, role: en.role, carId: isMe ? profile.car : en.carId, levels: isMe ? pc.levels : en.levels, paint: isMe ? pc.paint : en.paint, remote: !isMe })
      const e = race.entry(en.id)
      e.bot = en.bot
      if (en.spawn) { Object.assign(car, { x: en.spawn.x, z: en.spawn.z, yaw: en.spawn.yaw }); car.respawnPoint = { ...en.spawn }; e.spawn = en.spawn; e.px = car.x; e.pz = car.z }
      if (isMe) me = car
    }
    for (const [id, at] of view.destroyed) { world.destroyed.add(id); world.destroyedAt.set(id, at) }
    race.t = view.rt
    world.time = view.rt
    if (view.phase !== 'countdown') race.phase = view.phase
    if (view.chase) applyChaseSummary(view.chase)
    // 再接続: サーバーが最後に受け付けた位置から続ける
    if (me && view.you && view.rt > 0) {
      const y = view.you
      Object.assign(me, { x: y.x, y: y.y, z: y.z, yaw: y.yaw })
      const e = race.entry(myId); e.px = y.x; e.pz = y.z
      if (y.respawn) me.respawnPoint = { ...y.respawn }
      if (y.dmg) Object.assign(me.dmg, y.dmg)
    }
  } else if (!demo) {
    // オフライン: 選んだ役で。警察の数は CPU の設定（1〜6）
    const role = profile.role === 'cop' ? 'cop' : 'robber'
    const nCops = Math.max(1, Math.min(6, profile.cpu || 3))
    const mine = { id: 'me', name: profile.name || t('you'), carId: profile.car, levels: pc.levels, paint: role === 'robber' ? pc.paint : null, role }
    if (role === 'robber') { me = race.addHuman(mine); race.addBots(nCops, 'cop') }
    else { race.addBots(1, 'robber'); me = race.addHuman(mine); race.addBots(nCops - 1, 'cop') }
  } else { race.addBots(1, 'robber'); race.addBots(3, 'cop') }
  for (const e of race.entries) {
    const m = makeModel(e, e.car.paint ?? (e.role === 'cop' ? COP_PAINT : ROBBER_PAINT))
    scene.add(m.group)
    models.set(e.id, m)
  }
  // 一般車（街だけ）。軽い手続きの車で描く
  buildTrafficPool()
  follow = me || (race.robbers[0] || race.entries[0]).car
  doneAt = null
  copLastRadio = -1
  paused = false
  hud.setup(race, me)
  // カメラを車の後ろに置き直す
  snapCamera()
}

// 車の見た目。警察は屋根に赤と青の回転灯をのせる
function makeModel(e, paint) {
  const m = new CarModel(e.car.carId, paint)
  if (e.role === 'cop') addPoliceLights(m)
  return m
}
const lightGeo = new THREE.BoxGeometry(0.42, 0.16, 0.26)
const barGeo = new THREE.BoxGeometry(1.1, 0.08, 0.32)
const barMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 })
function addPoliceLights(m) {
  m.group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(m.group)
  const top = box.max.y - m.group.position.y
  const g = new THREE.Group()
  g.position.set(0, top + 0.02, -0.1)
  const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 2.5, roughness: 0.3 })
  const blue = new THREE.MeshStandardMaterial({ color: 0x000a40, emissive: 0x2a6bff, emissiveIntensity: 2.5, roughness: 0.3 })
  const bar = new THREE.Mesh(barGeo, barMat)
  const l = new THREE.Mesh(lightGeo, red); l.position.set(-0.3, 0.1, 0)
  const r = new THREE.Mesh(lightGeo, blue); r.position.set(0.3, 0.1, 0)
  g.add(bar, l, r)
  m.group.add(g)
  m.siren = { red, blue, phase: Math.random() * 6 }
}
// 回転灯の点滅（赤と青が交互に、速く2回ずつ）
function updateSirens(now) {
  for (const [id, m] of models) {
    if (!m.siren) continue
    const k = ((now / 1000 * 2.4 + m.siren.phase) % 1)
    const flash = (a, b) => (k > a && k < a + 0.09) || (k > b && k < b + 0.09)
    m.siren.red.emissiveIntensity = flash(0.0, 0.16) ? 6 : 0.4
    m.siren.blue.emissiveIntensity = flash(0.5, 0.66) ? 6 : 0.4
  }
}

// ヘリ（手配度3から）: 犯人の上を回りながら、白い光の筒で照らす
const heli = new THREE.Group()
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.2, 4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.4, metalness: 0.3 }))
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 4.5), body.material); tail.position.set(0, 0.3, -3.8)
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: 0x111111 })); rotor.position.y = 1.4
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 60, 24, 1, true).translate(0, -30, 0),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }))
  heli.add(body, tail, rotor, beam)
  heli.userData = { rotor, beam }
  heli.visible = false
  scene.add(heli)
}
function updateHeli(dt, now) {
  const H = race && race.heli
  const rob = race && (race.entry(H && H.target) || race.robbers.find(r => !r.left && !r.arrested && !r.escaped) || race.robbers[0])
  heli.visible = !!(H && H.active && rob && race.phase !== 'countdown')
  if (!heli.visible) { heli.position.y = 0; return }
  const c = rob.car
  const gy = world.groundAt(H.x, H.z, 60).h
  _hv.set(H.x, gy + CHASE.heliAlt, H.z)
  if (heli.position.y < 1) heli.position.copy(_hv).y += 30
  heli.position.lerp(_hv, 1 - Math.exp(-dt * 3))
  heli.lookAt(c.x, heli.position.y, c.z)
  heli.userData.rotor.rotation.y += dt * 30
  // 光の筒は犯人へ向ける
  const beam = heli.userData.beam
  beam.lookAt(c.x, c.y, c.z); beam.rotateX(-Math.PI / 2)
  beam.scale.y = Math.max(0.5, heli.position.distanceTo(_v.set(c.x, c.y, c.z)) / 60)
}
// ランチャーの予告（地面の赤い円と照準）とミサイル
const strikeFx = []
{
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false })
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false })
  const missileMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff7a1a, emissiveIntensity: 2 })
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), ringMat)
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), fillMat)
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.08).rotateX(-Math.PI / 2), ringMat)
    const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2
    g.add(ring, fill, cross, cross2)
    g.renderOrder = 5
    const missile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8).rotateX(Math.PI / 2), missileMat)
    g.visible = false; missile.visible = false
    scene.add(g, missile)
    strikeFx.push({ g, fill, missile })
  }
}
function updateStrikes(now) {
  const list = race && race.phase === 'racing' ? (race.strikes || []).filter(s => !s.done) : []
  strikeFx.forEach((f, i) => {
    const s = list[i]
    f.g.visible = !!s; f.missile.visible = false
    if (!s) return
    const left = s.at - race.t
    const gy = world.groundAt(s.x, s.z, 60).h
    f.g.position.set(s.x, gy + 0.25, s.z)
    f.g.scale.setScalar(s.r * (1 + Math.sin(now / 70) * 0.03))
    f.fill.scale.setScalar(Math.max(0.05, 1 - left / CHASE.strikeWarn))
    // 最後の 0.6 秒はミサイルが飛んでくる
    if (left < 0.6 && heli.visible) {
      const k = 1 - left / 0.6
      f.missile.visible = true
      f.missile.position.lerpVectors(heli.position, _v.set(s.x, gy, s.z), k)
      f.missile.lookAt(s.x, gy, s.z)
      if (Math.random() < 0.7) fx.smoke(f.missile.position.x, f.missile.position.y, f.missile.position.z, { dark: 0.7, size: 1.2, life: 0.8, vy: 0.3, a: 0.5 })
    }
  })
}
const _hv = new THREE.Vector3()

// オンライン: サーバーの判定（逮捕ゲージ・手配度・隠れ家・結末）を写す
function applyChaseSummary(ch) {
  if (!race || !ch) return
  if (ch.heat !== race.heat) { race.heat = ch.heat; race.events.push({ t: 'heat', heat: ch.heat }) }
  if (ch.hideout && ch.hideout.open && !race.hideout.open) { race.hideout.open = true; race.events.push({ t: 'hideout', area: ch.hideout.area }) }
  race.pingUntil = ch.pingUntil
  for (const r of ch.robbers || []) {
    const e = race.entry(r.id)
    if (!e) continue
    e.bust = r.bust
    if (r.seen && (!e.lastSeen || r.seen.at !== e.lastSeen.at)) e.lastSeen = r.seen
    if (r.arrested && !e.arrested) { e.arrested = true; race.events.push({ t: 'bust', id: e.id }) }
    if (r.escaped && !e.escaped) { e.escaped = true; race.events.push({ t: 'escape', id: e.id }) }
  }
  // ヘリ・予告・着弾・修理（サーバーが決めたものを写す）
  if (ch.heli) { if (ch.heli.active && !race.heli.active) race.events.push({ t: 'heli' }); Object.assign(race.heli, ch.heli) }
  if (ch.strikes) {
    for (const s of ch.strikes) if (!seenStrikes.has(s.id)) { seenStrikes.add(s.id); race.events.push({ t: 'strikeWarn', ...s }) }
    race.strikes = ch.strikes
  }
  for (const d of ch.downs || []) {
    const k = 'd' + d.id + '@' + d.at
    if (seenStrikes.has(k) || d.id === myId) continue
    seenStrikes.add(k)
    race.events.push({ t: 'copDown', ...d })
  }
  for (const b of ch.blasts || []) {
    if (seenStrikes.has('b' + b.id)) continue
    seenStrikes.add('b' + b.id)
    if (me && b.hit.includes(myId)) blast(me, { x: b.x, z: b.z, r: CHASE.strikeRadius })
    race.events.push({ t: 'blast', ...b })
  }
  if (ch.reps) for (const [id, [rep, cd, n, seen]] of Object.entries(ch.reps)) {
    const e = race.entry(id)
    if (!e) continue
    e.rep = rep; e.repairCd = cd; e.repSeen = !!seen
    if (n > (e.repairs || 0)) {
      e.repairs = n
      if (e.car === me) { for (const k in me.dmg) me.dmg[k] = 1; me.dents.length = 0; me.boost = 1 }
      race.events.push({ t: 'repaired', id, n, lost: e.role === 'robber' })
    }
  }
  if (ch.outcome && !race.outcome) { race.outcome = ch.outcome; race.phase = 'done' }
}
const seenStrikes = new Set()

function snapCamera() {
  const c = follow
  const fx_ = Math.sin(c.yaw), fz = Math.cos(c.yaw)
  cam.off.set(-fx_ * 9, 3.5, -fz * 9); cam.lookOff.set(0, 1, 0); cam.hd = c.yaw
  cam.pos.set(c.x + cam.off.x, c.y + cam.off.y, c.z + cam.off.z)
  cam.look.set(c.x, c.y + 1, c.z)
}

// ---------------------------------------------------------------- 画面遷移
function show(id) {
  for (const s of ['title', 'garage', 'howto', 'pause', 'results', 'lobby']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', !(mode === 'race' && (id === null || id === 'pause')))
  if (typeof syncTouch === 'function') setTimeout(syncTouch, 0)
  if (id === 'garage') renderGarage()
  if (id === 'howto') drawFullMap($('fullMap'), world)
}

function toTitle() {
  mode = 'title'
  startRace({ demo: true })
  show('title')
}

function beginPlayerRace(role = null) {
  audio.start()
  if (role) { profile.role = role; saveProfile(profile) }
  loadStage('city')
  profile.name = ($('nameInput').value || '').trim().slice(0, 12)
  saveProfile(profile)
  mode = 'race'
  startRace()
  show(null)
  hud.hint(touchMode ? t('hintTouch') : t('hintStart'), 6)
  setTimeout(() => { if (mode === 'race' && me) hud.radio(t(me.role === 'cop' ? 'startCop' : 'startRobber'), 4) }, 400)
}

// スマホ: タッチ操作。タッチが主の端末か、画面を指で触ったらタッチ用の表示にする
let touchMode = LOW && matchMedia('(pointer: coarse)').matches
const touch = new Touch($('touch'), {
  onPause: () => setPause(true),
  onCam: () => { camMode = (camMode + 1) % 3 },
  onRespawn: () => { wantRespawn = true }
})
input.touch = touch
function setTouchMode(on) { touchMode = on; document.body.classList.toggle('touch', on); syncTouch() }
function syncTouch() { touch.show(touchMode && mode === 'race' && !paused && !menuOpen && $('pause').classList.contains('hidden') && $('results').classList.contains('hidden')) }
addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !touchMode) setTouchMode(true) }, { capture: true })
setTouchMode(touchMode)
// iPhone の拡大（ピンチ・ダブルタップ）を止める
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault())
document.addEventListener('dblclick', e => e.preventDefault())
document.addEventListener('touchmove', e => { if (!e.target.closest('.panel')) e.preventDefault() }, { passive: false })

// タイトル
$('nameInput').value = profile.name
$('nameInput').addEventListener('change', () => { profile.name = $('nameInput').value.trim().slice(0, 12); saveProfile(profile) })
// 警察の数（1〜6）。自分が警察のときは自分を含む数
for (let i = 1; i <= 6; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; $('cpuSelect').appendChild(o) }
if (!(profile.cpu >= 1 && profile.cpu <= 6)) profile.cpu = 3
$('cpuSelect').value = profile.cpu
$('cpuSelect').addEventListener('change', () => { profile.cpu = Number($('cpuSelect').value); saveProfile(profile) })
function renderCarPick() {
  const box = $('carPickShort'); box.innerHTML = ''
  for (const id of Object.keys(CARS)) {
    const b = document.createElement('button')
    b.textContent = CARS[id].name
    b.className = profile.car === id ? 'on' : ''
    b.onclick = () => { profile.car = id; saveProfile(profile); renderCarPick(); audio.start(); audio.ui() }
    box.appendChild(b)
  }
}
renderCarPick()
function renderStagePick() {
  for (const box of [$('stagePick'), $('stagePickLobby')]) {
    if (!box) continue
    box.innerHTML = ''
    for (const id of ['city', 'touge']) {
      const b = document.createElement('button')
      b.textContent = t(id === 'city' ? 'stageCity' : 'stageTouge')
      b.className = profile.stage === id ? 'on' : ''
      b.onclick = () => { profile.stage = id; saveProfile(profile); renderStagePick(); audio.start(); audio.ui(); if (mode !== 'race') { loadStage(id); startRace({ demo: true }) } }
      box.appendChild(b)
    }
  }
}
renderStagePick()
$('btnOffline').onclick = () => beginPlayerRace('robber')
$('btnOfflineCop').onclick = () => beginPlayerRace('cop')
$('btnGarage').onclick = () => { audio.start(); audio.ui(); returnTo = 'title'; show('garage') }
$('btnHowto').onclick = () => { audio.start(); audio.ui(); returnTo = 'title'; show('howto') }
$('btnLang').onclick = () => { setLang(getLang() === 'ja' ? 'en' : 'ja'); refreshTexts() }
$('btnMute').onclick = () => { audio.start(); audio.setMuted(!audio.muted); refreshTexts() }
let returnTo = 'title'
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { audio.ui(); if (mode === 'race') show('pause'); else show(returnTo); if (returnTo === 'lobby') { renderCarPick(); online && online.setCar(myCar()) } })
function refreshTexts() {
  applyI18n()
  $('btnMute').textContent = audio.muted ? t('unmute') : t('mute')
  if (!$('garage').classList.contains('hidden')) renderGarage()
}
refreshTexts()

// ポーズ
function setPause(p) {
  if (mode !== 'race' || race.phase === 'done') return
  // オンラインは止められない。メニューを出している間は操作を離すだけ
  if (onlineRace) { menuOpen = p; paused = false } else paused = p
  show(p ? 'pause' : null)
}
$('btnResume').onclick = () => setPause(false)
$('btnRespawn').onclick = () => { setPause(false); wantRespawn = true }
$('btnHowto2').onclick = () => show('howto')
$('btnRetire').onclick = () => { paused = false; menuOpen = false; if (onlineRace && online) online.leave(); toTitle() }
let wantRespawn = false
let autopilot = null // 検証用: 自車を CPU に運転させる
input.onKey = code => {
  if (code === 'Escape' || code === 'KeyP') { if (mode === 'race') setPause(!paused); return }
  if (code === 'KeyM') { audio.setMuted(!audio.muted); refreshTexts() }
  if (code === 'KeyC') camMode = (camMode + 1) % 3
}

// 結果
$('btnAgain').onclick = () => {
  audio.ui()
  if (onlineRace && online && online.room) { if (online.room.hostId === online.you) online.rematch(Number($('cpuOnline').value), profile.stage); return }
  beginPlayerRace(profile.role)
}
$('btnRGarage').onclick = () => {
  audio.ui()
  if (onlineRace && online && online.room) { if (online.room.hostId === online.you) online.toLobby(); mode = 'title'; startRace({ demo: true }); onlineRace = false; showLobby(); return }
  mode = 'title'; startRace({ demo: true }); returnTo = 'title'; show('garage')
}
$('btnRTitle').onclick = () => { audio.ui(); if (onlineRace && online) online.leave(); toTitle() }

function showResults(data = null) {
  mode = 'results'
  const res = Array.isArray(data) ? data : data && data.list ? data.list : race.results()
  const outcome = (data && data.outcome) || race.outcome || null
  const mine = res.find(r => r.id === myId)
  if (mine) { profile.credits += mine.credits; profile.races++; if (mine.won) profile.wins = (profile.wins || 0) + 1; saveProfile(profile) }
  const body = $('rBody'); body.innerHTML = ''
  const reasonKey = { bust: 'winByBust', wreck: 'winByWreck', time: 'winByTime', hideout: 'winByHideout', left: 'winByLeft' }
  res.forEach((r, i) => {
    const tr = document.createElement('tr')
    tr.className = (r.id === myId ? 'me ' : '') + (r.won ? 'won' : '')
    const st = r.left ? t('left') : r.role === 'robber' ? (r.arrested ? t('busted') : r.escaped ? t('escaped') : t('onRun')) : (r.arrests ? `${t('arrests')} ${r.arrests}` : '')
    const extra = [r.takedowns ? 'TAKEDOWN ' + r.takedowns : '', `${t('breaks')} ${r.breaks}`, `${t('body')} ${r.body}%`].filter(Boolean).join(' / ')
    tr.innerHTML = `<td class="n role-${r.role}">${r.role === 'cop' ? ICON_COP : ICON_ROBBER}</td><td><b></b> <span class="s">${r.role === 'cop' ? t('roleCop') : t('roleRobber')}</span></td><td class="s">${extra}</td><td class="t">${st}</td>`
    tr.querySelector('b').textContent = r.name
    body.appendChild(tr)
    setTimeout(() => tr.classList.add('in'), 250 + i * 160)
  })
  const stamp = $('rStamp')
  stamp.classList.remove('show')
  const copsWon = outcome ? outcome.winner === 'cop' : false
  $('rTitle').textContent = outcome ? (copsWon ? t('copWin') : t('robberWin')) : t('results')
  $('rReason').textContent = outcome ? `${t(reasonKey[outcome.reason] || 'winByTime')}　${fmtClock(outcome.t)}` : ''
  if (mine) {
    stamp.textContent = mine.role === 'robber' ? (mine.won ? t('msgEscaped') : t('msgCaught')) : (mine.won ? t('msgBusted') : t('msgLost'))
    stamp.style.color = mine.won ? 'var(--yel)' : 'var(--hot)'
    setTimeout(() => { stamp.classList.add('show'); if (mine.won) audio.fanfare(); else audio.beep(true) }, 250 + res.length * 160)
    $('rEarn').textContent = `${t('earned')} +${mine.credits}   ${t('credits')} ${profile.credits}`
  } else $('rEarn').textContent = ''
  // オンラインでは再戦はホストだけが押せる
  const isHost = onlineRace && online && online.room && online.room.hostId === online.you
  $('btnAgain').disabled = onlineRace && !isHost
  $('btnAgain').dataset.t = onlineRace && !isHost ? 'waitRematch' : 'again'
  $('btnRGarage').dataset.t = onlineRace ? 'toLobby' : 'toGarage'
  applyI18n($('results'))
  show('results')
}
function fmtClock(s) { const m = Math.floor(s / 60), r = Math.floor(s - m * 60); return `${m}:${String(r).padStart(2, '0')}` }

function fmtTime(s) {
  if (s == null) return '--:--.--'
  const m = Math.floor(s / 60), r = s - m * 60
  return `${m}:${r.toFixed(2).padStart(5, '0')}`
}

// ---------------------------------------------------------------- ガレージ
let preview = null
function renderGarage() {
  $('gCredits').textContent = profile.credits
  const cc = $('carCards'); cc.innerHTML = ''
  for (const [id, c] of Object.entries(CARS)) {
    const b = document.createElement('button')
    b.className = 'car-card' + (profile.car === id ? ' on' : '')
    b.innerHTML = `<b>${c.name}</b><span>${getLang() === 'ja' ? c.desc : c.descEn}</span>`
    b.onclick = () => { profile.car = id; saveProfile(profile); audio.ui(); renderGarage(); renderCarPick() }
    cc.appendChild(b)
  }
  const pc = profile.cars[profile.car]
  const pp = $('paints'); pp.innerHTML = ''
  for (const col of PAINTS) {
    const b = document.createElement('button')
    b.style.background = '#' + col.toString(16).padStart(6, '0')
    b.className = pc.paint === col ? 'on' : ''
    b.setAttribute('aria-label', 'paint')
    b.onclick = () => { pc.paint = col; saveProfile(profile); audio.ui(); renderGarage() }
    pp.appendChild(b)
  }
  // 性能（基準車との比較）
  const s = buildStats(profile.car, pc.levels), base = buildStats(profile.car, {})
  const rows = [
    ['statTop', s.maxSpeed * 3.6, base.maxSpeed * 3.6, 140, 200, v => Math.round(v)],
    ['statAcc', s.accel, base.accel, 10, 26, v => v.toFixed(1)],
    ['statGrip', s.grip, base.grip, 5, 10, v => v.toFixed(1)],
    ['statDur', s.durability, base.durability, 0.4, 2.6, v => v.toFixed(2)],
    ['statMass', s.mass, base.mass, 0.6, 1.8, v => v.toFixed(2)],
    ['statBoost', s.boostCap, base.boostCap, 2, 6, v => v.toFixed(1) + 's'],
    ['statAir', s.air, base.air, 0.5, 1.8, v => v.toFixed(2)]
  ]
  const st = $('stats'); st.innerHTML = ''
  for (const [k, v, b0, lo, hi, f] of rows) {
    const d = document.createElement('div'); d.className = 'stat'
    const pct = Math.max(2, Math.min(100, (v - lo) / (hi - lo) * 100))
    const cls = Math.abs(v - b0) < 1e-6 ? '' : (k === 'statMass' ? (v > b0 ? 'down' : 'up') : (v > b0 ? 'up' : 'down'))
    d.innerHTML = `<span>${t(k)}</span><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div><b>${f(v)}</b>`
    st.appendChild(d)
  }
  const up = $('upgrades'); up.innerHTML = ''
  for (const [k, u] of Object.entries(UPGRADES)) {
    const lv = pc.levels[k] || 0
    const d = document.createElement('div'); d.className = 'upg'
    const name = getLang() === 'ja' ? u.name : u.nameEn
    d.innerHTML = `<div class="nm">${name} <span class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="tr"><em>+ ${u.up}</em>　<s>- ${u.down}</s></div>
      <div class="act"><span class="cost">${lv < 3 ? u.cost[lv] : t('max')}</span></div>`
    const act = d.querySelector('.act')
    if (lv > 0) { const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = '-'; b.title = '半額で戻す'; b.onclick = () => { sellUpgrade(profile, k); audio.ui(); renderGarage() }; act.prepend(b) }
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = t('buy')
    b.disabled = lv >= 3 || profile.credits < (u.cost[lv] || 0)
    b.onclick = () => { if (buyUpgrade(profile, k)) { audio.ui(); renderGarage() } }
    act.appendChild(b)
    up.appendChild(d)
  }
  renderPreview()
}

function renderPreview() {
  const cv = $('carPreview')
  if (!preview) {
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true })
    r.setPixelRatio(Math.min(devicePixelRatio, 2))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    const s = new THREE.Scene()
    s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2))
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(4, 6, 3); s.add(d)
    const c = new THREE.PerspectiveCamera(32, cv.width / cv.height, 0.1, 100)
    c.position.set(6.2, 3.0, 7.2); c.lookAt(0, 0.2, 0)
    preview = { r, s, c, model: null, key: '' }
  }
  const pc = profile.cars[profile.car]
  const key = profile.car + pc.paint
  if (preview.key !== key) {
    if (preview.model) { preview.s.remove(preview.model.group); preview.model.dispose() }
    preview.model = new CarModel(profile.car, pc.paint)
    preview.s.add(preview.model.group)
    preview.key = key
  }
}

// ---------------------------------------------------------------- 破壊の演出
function breakVisual(id, info) {
  const o = world.objectById.get(id)
  let m = props.get(id)
  if (o && o.type === 'tree') {
    // 木: まとめて描いている中から1本消して、同じ形の木を根元から倒す。葉と枝が散る
    built.forest.hide(o.ti)
    const tm = built.forest.single(o.ti)
    scene.add(tm)
    const dx0 = info ? info.dx || 0 : 0, dz0 = info ? info.dz || 1 : 1, sp0 = Math.hypot(dx0, dz0) || 1
    const ux = dx0 / sp0, uz = dz0 / sp0
    const axis = new THREE.Vector3(uz, 0, -ux).normalize()
    const pivot = tm.position.clone()
    fx.launch(tm, { pivotFall: { axis, pivot, offset: new THREE.Vector3(), base: new THREE.Quaternion(), angle: 0, target: 1.45, dur: 1.1, onDone: () => fx.dust(pivot.x + ux * 9, pivot.y, pivot.z + uz * 9, 6, [0.45, 0.55, 0.3], 1.2) } })
    fx.debrisAt(o.cx, o.y0 + 3, o.cz, 10, 0x4d8c43, { speed: 6, up: 5, size: 0.35, dir: { x: dx0 * 0.4, z: dz0 * 0.4 }, spread: 2 })
    fx.debrisAt(o.cx, o.y0 + 1, o.cz, 4, 0x6b4a2f, { speed: 5, up: 4, size: 0.3, dir: { x: dx0 * 0.4, z: dz0 * 0.4 }, plank: true })
    const near = me ? Math.hypot(me.x - o.cx, me.z - o.cz) : 999
    if (near < 120) { audio.wood(1.2 * (1 - near / 120)); fx.addShake(0.25 * (1 - near / 120)) }
    return
  }
  if (o && o.type === 'guardrail') {
    // 束から1本消して、同じ形の実体を作って飛ばす
    setRail(id, false)
    m = new THREE.Mesh(geoCache.guardrail || (geoCache.guardrail = propGeometry('guardrail')), propMat)
    m.position.set(o.cx, o.y0, o.cz); m.rotation.y = o.yaw; m.castShadow = true
    scene.add(m)
  }
  if (!o || !m) return
  const d = DESTRUCT[o.type]
  const dir = info ? { x: info.dx || 0, z: info.dz || 0 } : { x: 0, z: 8 }
  const sp = Math.hypot(dir.x, dir.z) || 1
  const near = me ? Math.hypot(me.x - o.cx, me.z - o.cz) : 999
  const vol = Math.max(0, 1 - near / 120)
  const mid = o.y0 + d.h / 2
  if (o.type === 'wall') {
    m.visible = false
    fx.debrisAt(o.cx, o.y0 + 2, o.cz, 40, d.color, { speed: 9, up: 7, size: 0.5, dir: { x: dir.x * 0.8, z: dir.z * 0.8 }, spread: 6 })
    fx.dust(o.cx, o.y0, o.cz, 18, [0.62, 0.52, 0.45], 2.2)
    if (vol) { audio.rubble(vol); fx.addShake(1.2 * vol) }
    hud.message(t('msgBreakWall'), '', 1.4, near < 30)
  } else if (o.type === 'lumber') {
    m.visible = false
    fx.debrisAt(o.cx, o.y0 + 0.8, o.cz, 14, d.color, { speed: 7, up: 6, size: 0.45, dir, spread: 2, plank: true })
    fx.dust(o.cx, o.y0, o.cz, 6, [0.7, 0.6, 0.45], 1)
    if (vol) { audio.wood(vol * 1.3); fx.addShake(0.5 * vol) }
  } else if (o.type === 'lamp' || o.type === 'tower') {
    // 根元を軸に、押された向きへ倒れる
    const ux = dir.x / sp, uz = dir.z / sp
    const isTower = o.type === 'tower'
    const fdx = isTower ? 0 : ux, fdz = isTower ? 1 : uz
    const axis = new THREE.Vector3(fdz, 0, -fdx).normalize()
    const pivot = new THREE.Vector3(o.cx + fdx * d.w * 0.4, o.y0, o.cz + fdz * d.w * 0.4)
    const offset = pivot.clone().sub(m.position)
    fx.launch(m, {
      pivotFall: {
        axis, pivot, offset, base: m.quaternion.clone(), angle: 0, target: isTower ? Math.PI / 2 + 0.02 : 1.45, dur: isTower ? FALL_SEC : 0.9,
        onDone: () => {
          const tip = pivot.clone().add(new THREE.Vector3(fdx, 0, fdz).multiplyScalar(d.h * 0.9))
          fx.dust(tip.x, tip.y, tip.z, isTower ? 16 : 4, [0.7, 0.62, 0.5], isTower ? 2 : 0.8)
          const nv = me ? Math.max(0, 1 - Math.hypot(me.x - tip.x, me.z - tip.z) / 150) : 0
          if (nv) { audio.metal(nv * 1.4); if (isTower) { audio.rubble(nv); fx.addShake(nv) } }
        }
      }
    })
    if (isTower) hud.message(t('msgTower'), '', 1.6, true)
    if (vol) audio.metal(vol * 0.8)
  } else {
    // 物体ごと吹き飛ぶ
    const k = o.type === 'cone' ? 0.9 : 0.6
    fx.launch(m, { vx: dir.x * k + (Math.random() - 0.5) * 3, vy: 3 + sp * 0.12, vz: dir.z * k + (Math.random() - 0.5) * 3, spin: 8, life: 25 })
    fx.debrisAt(o.cx, mid, o.cz, Math.min(6, d.debris), d.color, { speed: 5, up: 5, size: 0.25, dir: { x: dir.x * 0.5, z: dir.z * 0.5 } })
    if (vol) {
      if (o.type === 'guardrail' || o.type === 'sign' || o.type === 'tempfence') audio.metal(vol * 0.7)
      else audio.wood(vol * 0.8)
      fx.addShake(0.18 * vol)
    }
  }
}

// ---------------------------------------------------------------- 車ごとの出来事
function handleEvents(e) {
  const c = e.car
  const mine = c === me
  const near = me ? Math.hypot(me.x - c.x, me.z - c.z) : 30
  const vol = mine ? 1 : Math.max(0, 1 - near / 90) * 0.7
  const model = models.get(e.id)
  for (const ev of c.events) {
    switch (ev.t) {
      case 'hit': {
        fx.sparks(ev.x, ev.y, ev.z, Math.min(40, 6 + ev.speed * 1.2))
        if (ev.speed > 14) fx.flash(ev.x, ev.y, ev.z)
        if (vol) audio.crash(Math.min(1.4, ev.speed / 25) * vol)
        if (mine) { fx.addShake(Math.min(1.2, ev.speed / 30)); hud.flashDamage(ev.dmg) }
        break
      }
      case 'scrape': if (mine) { audio.scrape(); fx.sparks(c.x, c.y, c.z, 3) } break
      case 'carhit':
        if (vol) audio.crash(Math.min(1.2, ev.speed / 18) * vol)
        fx.sparks(ev.x ?? c.x, (ev.y ?? c.y) + 0.2, ev.z ?? c.z, Math.min(30, 6 + ev.speed * 1.5))
        if (ev.speed > 10) fx.flash(ev.x ?? c.x, (ev.y ?? c.y) + 0.3, ev.z ?? c.z)
        if (mine || ev.other === myId) {
          fx.addShake(Math.min(0.9, ev.speed / 22))
          juice.hitAt = race.t
          // 手応え: 強く当てた瞬間だけ一瞬止める
          if (ev.speed > 10) hitStop(Math.min(0.09, ev.speed * 0.003))
          if (ev.speed > 14) for (let i = 0; i < 6; i++) fx.emit(ev.x ?? c.x, (ev.y ?? c.y) + 0.5, ev.z ?? c.z, { vx: (Math.random() - 0.5) * 12, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 12, life: 0.6, size: 0.35, grow: 0, r: 0.75, g: 0.85, b: 0.95, a: 0.9 })
        }
        break
      case 'takeoff':
        // 大きく飛んだ瞬間を短くスローで見せる
        if (mine && speedOf(c) > 28 && c.vy > 3) slowMo(0.5, 0.4)
        break
      case 'land':
        if (ev.air > 0.35) {
          const sname = c.surf === 'grass' ? [0.45, 0.55, 0.3] : [0.66, 0.58, 0.46]
          fx.dust(c.x, c.y - 0.5, c.z, Math.min(14, 2 + ev.impact * 0.5), sname, Math.min(2, 0.6 + ev.impact / 20))
          if (vol) audio.land(ev.impact * vol)
          if (mine) {
            fx.addShake(Math.min(1, ev.impact / 30))
            if (ev.crash) hud.message(t('msgCrash'), '', 1.4)
            else if (ev.air > 1.1) reward(t('msgBigAir'), ev.air.toFixed(1) + 's', 0.12)
            if (ev.dmg > 0) hud.flashDamage(ev.dmg)
          }
          if (ev.sev > 0) fx.sparks(c.x, c.y - 0.4, c.z, Math.min(30, ev.sev * 2))
        }
        break
      case 'stunt':
        if (mine) {
          const name = ev.kind === 'roll' ? 'BARREL ROLL' : 'FLAT SPIN'
          hud.feed(name + (ev.n > 1 ? ' x' + ev.n : ''), '+' + Math.round(ev.gain * 100) + '% NITRO')
          audio.cp()
        }
        break
      case 'perfect':
        if (mine) { hud.feed('PERFECT NITRO'); audio.boostStart(); audio.boostStart(); fx.addShake(0.5) }
        for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; fx.emit(c.x, c.y, c.z, { vx: Math.cos(a) * 14, vy: 0.5, vz: Math.sin(a) * 14, life: 0.45, size: 1.4, grow: 2, r: 1, g: 0.85, b: 0.4, a: 0.9, add: true }) }
        break
      case 'wreck':
        if (ev.kind === 'knock' && mine) hud.message('KNOCKED DOWN', '', 1.1)
        fx.flash(c.x, c.y + 0.5, c.z)
        for (let i = 0; i < 10; i++) fx.smoke(c.x, c.y + 0.5, c.z, { dark: 0.12, size: 3, life: 2.4, vy: 3, a: 0.7 })
        fx.sparks(c.x, c.y, c.z, 30, null, 14)
        if (vol) audio.crash(1.5 * vol)
        if (mine && ev.kind !== 'knock') { hud.message(t('msgWreck'), '', 1.4); fx.addShake(1.4) }
        break
      case 'fall': if (mine) hud.message(t('msgFall'), '', 1.6); break
      case 'overheat': if (mine) hud.message(t('msgOverheat'), '', 1.4); break
      case 'boostEmpty': if (mine) hud.toast(t('msgBoostEmpty')); break
      case 'respawn':
        if (model && ev.repair) { model.resetParts(); model.updateParts(c.dmg) }
        if (mine && onlineRace && online) online.send({ t: 'input', data: { k: 'respawn', x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10 } })
        break
      case 'break': {
        // 破壊は世界の destroyed を見て描く（誰が壊しても同じ）。向きの情報だけ取っておく
        breakInfo.set(ev.id, ev)
        if (mine && onlineRace && online) online.send({ t: 'input', data: { k: 'break', id: ev.id, sp: Math.round(ev.speed * 100) / 100, dx: Math.round(ev.dx * 10) / 10, dz: Math.round(ev.dz * 10) / 10 } })
        break
      }
    }
  }
  c.events.length = 0
}
const breakInfo = new Map()

// ---------------------------------------------------------------- 毎フレーム
let last = performance.now()
let acc = 0
const prevState = new Map()

function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.25) dt = 0.25

  if (race && onlineRace) syncOnline()
  if (race && !paused) {
    acc += dt * juiceScale(dt)
    const airborne = me ? !me.grounded : false
    let inp = me ? input.read(airborne) : null
    if (me && autopilot) {
      // 検証用: 自車を CPU と同じ考え方で走らせる（犯人なら逃げる、警察なら追う）
      autopilot.replan -= dt
      if (autopilot.replan <= 0) { autopilot.replan = 0.5; const e = race.entry(myId); if (e.role === 'cop') race.planCop(e); else race.planRobber(e) }
      inp = drive(autopilot, world, race.cars())
    }
    if (inp && menuOpen) inp = { throttle: 0, brake: 0.3, steer: 0 }
    if (inp && wantRespawn) { inp.respawn = true; wantRespawn = false }
    let first = true
    let steps = 0
    while (acc >= STEP && steps < 6) {
      for (const e of race.entries) prevState.set(e.id, { x: e.car.x, y: e.car.y, z: e.car.z, yaw: e.car.yaw })
      const stepInp = inp ? { ...inp, respawn: first && inp.respawn } : null
      race.stepFixed(STEP, me ? { [myId]: stepInp } : {})
      first = false
      acc -= STEP
      steps++
      for (const e of race.entries) handleEvents(e)
      for (const ev of race.events) raceEvent(ev)
      race.events.length = 0
    }
    nearMiss()
    if (steps >= 6) acc = 0
    lastFrameInp = inp
    if (onlineRace && online) online.tick(dt, me, race.t)
  } else acc = 0
  input.endFrame()

  // 新しく壊れた物
  for (const id of world.destroyed) if (!seenBroken.has(id)) { seenBroken.add(id); breakVisual(id, breakInfo.get(id)) }

  // 車の見た目
  const alpha = paused ? 1 : acc / STEP
  if (race) for (const e of race.entries) {
    const c = e.car, m = models.get(e.id)
    if (!m) continue
    const p = prevState.get(e.id)
    const s = p ? { ...c, x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha, z: p.z + (c.z - p.z) * alpha, yaw: lerpAngle(p.yaw, c.yaw, alpha) } : c
    const isMe = c === me
    const inp = isMe ? lastFrameInp : null
    m.update(s, dt, { steer: isMe && inp ? inp.steer : 0, braking: isMe && inp ? inp.brake > 0 : false, boosting: c.boosting })
    m.group.visible = !(c.falling && c.wreck > 0 && c.y < GAME.fallY - 20)
    m.applyDents(c.dents)
    for (const part of m.updateParts(c.dmg)) {
      // 外れた部品を飛ばす
      const clone = part.clone()
      part.updateWorldMatrix(true, false)
      part.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale) // 車から外して世界に置く
      clone.rotation.setFromQuaternion(clone.quaternion)
      clone.visible = true
      fx.launch(clone, { vx: c.vx * 0.6 + (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 3, vz: c.vz * 0.6 + (Math.random() - 0.5) * 6, spin: 10, life: 12 })
      if (isMe) audio.metal(0.8)
    }
    // 煙・ほこり
    if (!paused) {
      const v = speedOf(c)
      const fwx = Math.sin(c.yaw), fwz = Math.cos(c.yaw)
      if (c.dmg.engine < 0.55 && Math.random() < (0.55 - c.dmg.engine) * 1.6) fx.smoke(c.x + fwx * 1.4, c.y + 0.6, c.z + fwz * 1.4, { dark: 0.15 + c.dmg.engine * 0.5, size: 1.4, life: 1.4, vy: 2 })
      // 大破した警察車は復帰までその場で燃える
      if (c.wreck > 0 && c.wreckSec && !c.knock && !c.falling) {
        if (Math.random() < 0.8) fx.emit(c.x + (Math.random() - 0.5) * 2, c.y + 0.6, c.z + (Math.random() - 0.5) * 3, { vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5, life: 0.5 + Math.random() * 0.3, size: 1.3, grow: 1.6, r: 1, g: 0.45 + Math.random() * 0.25, b: 0.1, a: 0.9, add: true })
        if (Math.random() < 0.5) fx.smoke(c.x, c.y + 1.5, c.z, { dark: 0.08, size: 2.4, life: 2.2, vy: 3.5, a: 0.6 })
      }
      if (c.overheat && Math.random() < 0.5) fx.smoke(c.x + fwx * 1.8, c.y + 0.5, c.z + fwz * 1.8, { dark: 0.85, size: 1.2, life: 0.9, vy: 2.5, a: 0.4 })
      if (c.grounded && c.drifting && c.slip > 5 && Math.random() < 0.6) {
        for (const sx of [-0.8, 0.8]) fx.smoke(c.x - fwx * 1.6 + Math.cos(c.yaw) * sx, c.y - 0.45, c.z - fwz * 1.6 - Math.sin(c.yaw) * sx, { dark: 0.8, size: 1.0, life: 0.9, vy: 0.5, a: 0.2 })
      }
      if (c.grounded && v > 18 && (c.surf === 'dirt' || c.surf === 'grass') && Math.random() < 0.5) {
        fx.dust(c.x - fwx * 2, c.y - 0.5, c.z - fwz * 2, 1, c.surf === 'grass' ? [0.5, 0.56, 0.36] : [0.68, 0.58, 0.44], 0.7)
      }
      if (c.boosting && Math.random() < 0.6) fx.emit(c.x - fwx * 2.6, c.y - 0.05, c.z - fwz * 2.6, { vx: -fwx * 10 + c.vx * 0.8, vy: 0.3, vz: -fwz * 10 + c.vz * 0.8, life: 0.18, size: 0.45, grow: 0.5, r: 0.35, g: 0.7, b: 1, a: 0.45, add: true })
      if (c.repairing && Math.random() < 0.3) fx.sparks(c.x, c.y + 1, c.z, 2, null, 4)
    }
  }

  // 一般車
  if (race && race.traffic) {
    drawTraffic(dt)
  }

  // デモ中は数秒ごとに先頭付近の車を追う
  if (mode !== 'race' && race) {
    demoSwitch -= dt
    if (demoSwitch <= 0 || !follow) {
      demoSwitch = 9
      const st = race.standings()
      follow = st[Math.floor(Math.random() * Math.min(3, st.length))].car
    }
    if (race.phase === 'done' && race.t - (race.outcome ? race.outcome.t : race.t) > 4) startRace({ demo: true })
    if (race.t > 150) startRace({ demo: true })
  }

  updateCamera(dt)
  updateGuide(now)
  updatePickups(now)
  updateSirens(now)
  updateHeli(paused ? 0 : dt, now)
  updateStrikes(now)
  fx.update(paused ? 0 : dt)

  // 影は車の周りだけ
  const f = follow || { x: 0, y: 0, z: 0 }
  sun.position.set(f.x, f.y, f.z).addScaledVector(sun.userData.dir, 160)
  sun.target.position.set(f.x, f.y, f.z)

  // 音
  if (me) {
    const st = me.stats
    audio.drive({ speed: speedOf(me), top: st.maxSpeed, throttle: lastFrameInp ? lastFrameInp.throttle : 0, slip: me.slip, boosting: me.boosting, grounded: me.grounded, engineHealth: me.dmg.engine, active: mode === 'race' && !paused && me.wreck <= 0 })
    if (me.boosting && !wasBoosting) audio.boostStart()
    wasBoosting = me.boosting
  } else audio.drive({ active: false })
  // サイレン: 近くの警察ほど大きく（自分が警察なら自分のも少し）
  if (race && (mode === 'race' || mode === 'title') && race.phase !== 'countdown' && !paused) {
    const f = me || follow
    let near = 1e9
    if (f) for (const e of race.cops) if (e.car !== f && !e.left) near = Math.min(near, Math.hypot(e.car.x - f.x, e.car.z - f.z))
    let v = Math.max(0, 1 - near / 240)
    if (me && me.role === 'cop') v = Math.max(v, 0.32)
    if (mode === 'title') v *= 0.35
    if (race.phase === 'done') v *= 0.5
    audio.siren(v)
    // ローター音: ヘリが近いほど大きく
    const f2 = me || follow
    audio.rotor(heli.visible && f2 ? Math.max(0, 1 - heli.position.distanceTo(_v.set(f2.x, f2.y, f2.z)) / 160) * (mode === 'title' ? 0.3 : 1) : 0)
  } else { audio.siren(0); audio.rotor(0) }
  if (mode === 'race' && !paused) audio.tickMusic(dt, race.phase === 'racing' ? 1 : 0.4)

  if (mode === 'race' && race) {
    hud.update(race, me, dt, camera)
    if (race.phase === 'done' && !onlineRace) {
      if (doneAt == null) doneAt = now
      if (now - doneAt > 2600) showResults()
    }
  }

  post.grade.uniforms.speed.value = follow && mode === 'race' ? Math.max(0, Math.min(1, (speedOf(follow) - 30) / 40)) * (follow.boosting ? 1 : 0.55) : 0
  post.composer.render()
  if (preview && preview.model && !$('garage').classList.contains('hidden')) {
    preview.model.group.rotation.y += dt * 0.6
    preview.r.render(preview.s, preview.c)
  }
  window.__btrReady = true
}
let wasBoosting = false

// 無線の文言（英語のときは場所と方角も英語に）
const AREA_EN = { 'ダウンタウン': 'downtown', '運河沿い': 'the canal', '北地区': 'the north', '南地区': 'the south', '北東地区': 'the northeast', '北西地区': 'the northwest', '南東地区': 'the southeast', '南西地区': 'the southwest' }
const DIR_EN = { '北': 'north', '南': 'south', '東': 'east', '西': 'west' }
const trArea = a => getLang() === 'ja' ? a : (AREA_EN[a] || a)
const trDir = d => getLang() === 'ja' ? d : (DIR_EN[d] || d)
function raceEvent(ev) {
  if (ev.t === 'go' && me) audio.beep(true)
  if (!me) return
  const myE = race.entry(myId)
  const cop = myE && myE.role === 'cop'
  if (ev.t === 'takedown') {
    if (ev.id === myId) {
      audio.crash(1.2); audio.glass(1)
      reward(t('takedown'), (race.entry(ev.victim)?.car.name || '') + '  +35% NITRO', 0)
      // パトカーを潰した瞬間はスロー
      if (ev.kind !== 'knock') { hitStop(0.08); slowMo(0.3, 0.9); fx.addShake(1.2) }
    }
    else if (ev.victim === myId && ev.kind !== 'knock') fx.addShake(1)
  }
  if (ev.t === 'copDown') {
    if (cop && ev.id !== myId) { hud.radio(t('radioCopDown'), 2.6); audio.radio() }
    if (ev.id === myId) hud.message(t('msgCopDown'), t('msgCopDownSub').replace('{n}', Math.round(CHASE.copWreckSec)), 2.2)
    const near = Math.hypot(me.x - ev.x, me.z - ev.z)
    if (near < 120) audio.explosion(Math.max(0.2, 1 - near / 120))
  }
  if (ev.t === 'pickup' && ev.id === myId) { hud.feed('NITRO', '+30%'); audio.cp() }
  if (ev.t === 'smash') {
    fx.sparks(ev.x, ev.y, ev.z, 20, null, 10); fx.flash(ev.x, ev.y + 0.3, ev.z)
    const near = Math.hypot(me.x - ev.x, me.z - ev.z)
    if (near < 80) audio.crash(Math.min(1.2, ev.rel / 25 + 0.3) * (1 - near / 80))
    if (ev.id === myId) {
      hud.feed('CRASH', '+4% NITRO'); fx.addShake(0.5); juice.hitAt = race.t
      hitStop(Math.min(0.07, 0.02 + ev.rel * 0.0015)); audio.glass(Math.min(1, ev.rel / 30 + 0.3))
      for (let i = 0; i < 8; i++) fx.emit(ev.x, ev.y + 0.6, ev.z, { vx: (Math.random() - 0.5) * 14, vy: 2 + Math.random() * 6, vz: (Math.random() - 0.5) * 14, life: 0.7, size: 0.3, grow: 0, r: 0.8, g: 0.9, b: 1, a: 0.9 })
    }
  }
  if (ev.t === 'ping' && cop) {
    hud.radio((ev.heading ? t('radioSeen') : t('radioSeenStop')).replace('{area}', trArea(ev.area)).replace('{dir}', trDir(ev.heading)))
    audio.radio()
  }
  if (ev.t === 'heat') {
    hud.radio(ev.heat === CHASE.heli ? t('radioHeli') : t('radioHeat').replace('{n}', ev.heat), 2.6)
    audio.radio()
  }
  if (ev.t === 'hideout' && !cop) { hud.radio(t('radioHideout').replace('{area}', trArea(ev.area)), 4); hud.message(t('toHideout'), trArea(ev.area), 2); audio.cp() }
  if (ev.t === 'bust') {
    const r = race.entry(ev.id)
    if (r) { fx.flash(r.car.x, r.car.y + 1, r.car.z); for (let i = 0; i < 6; i++) fx.smoke(r.car.x, r.car.y + 0.5, r.car.z, { dark: 0.5, size: 2, life: 1.6, vy: 2, a: 0.5 }) }
    if (ev.id === myId) { hud.message(t('msgCaught'), '', 2.6); audio.crash(1) }
    else if (cop) { hud.message(t('msgBusted'), r ? r.car.name : '', 2.6); audio.fanfare() }
    // 逮捕: スローと赤青の光
    slowMo(0.3, 1.5); hud.flashScreen('bust'); fx.addShake(1)
    if (r) for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; fx.emit(r.car.x, r.car.y + 0.8, r.car.z, { vx: Math.cos(a) * 10, vy: 1 + Math.random() * 3, vz: Math.sin(a) * 10, life: 0.8, size: 1.2, grow: 1.5, r: i % 2 ? 1 : 0.2, g: 0.2, b: i % 2 ? 0.25 : 1, a: 0.9, add: true }) }
  }
  if (ev.t === 'heli') { hud.radio(cop ? t('radioHeliCop') : t('radioHeliRobber'), 3.2); audio.radio() }
  if (ev.t === 'strikeWarn') {
    const d = Math.hypot(ev.x - me.x, ev.z - me.z)
    if (!cop && d < 60) { audio.lockon(); if (!race._warnedOnce) { race._warnedOnce = true; hud.message(t('msgMissile'), t('msgMissileSub'), 1.6) } }
  }
  if (ev.t === 'blast') {
    const gy = world.groundAt(ev.x, ev.z, 60).h
    fx.flash(ev.x, gy + 1, ev.z)
    fx.sparks(ev.x, gy + 0.5, ev.z, 50, null, 18)
    for (let i = 0; i < 12; i++) fx.smoke(ev.x + (Math.random() - 0.5) * 6, gy + 1, ev.z + (Math.random() - 0.5) * 6, { dark: 0.15, size: 4, life: 2.2, vy: 4, a: 0.75 })
    const near = Math.hypot(me.x - ev.x, me.z - ev.z)
    audio.explosion(Math.max(0.15, 1 - near / 200))
    if (near < 60) fx.addShake(Math.min(1.6, 1.8 - near / 40))
    if (ev.hit && ev.hit.includes(myId)) { hud.message(t('msgHitMissile'), '', 1.4); hud.flashDamage(0.3) }
  }
  if (ev.t === 'repaired') {
    if (ev.id === myId) {
      hud.message(t('msgRepaired'), ev.lost ? t('msgRepairedLost') : t('msgRepairedSub'), 2)
      audio.cp(); audio.fanfare()
      const m = models.get(myId); if (m) { m.resetParts(); m.updateParts(me.dmg) }
    } else if (cop && ev.lost) { hud.radio(t('radioLost'), 3); audio.radio() }
  }
  if (ev.t === 'escape') {
    if (ev.id === myId) { hud.message(t('msgEscaped'), ev.reason === 'hideout' ? t('winByHideout') : t('winByTime'), 2.6); audio.fanfare() }
    else if (cop) hud.message(t('msgLost'), '', 2.6)
    // 逃げ切り: スローと金色の紙吹雪
    slowMo(0.4, 1.3); hud.flashScreen('escape')
    const r = race.entry(ev.id)
    if (r) for (let i = 0; i < 70; i++) fx.emit(r.car.x + (Math.random() - 0.5) * 4, r.car.y + 2, r.car.z + (Math.random() - 0.5) * 4, { vx: (Math.random() - 0.5) * 16, vy: 6 + Math.random() * 10, vz: (Math.random() - 0.5) * 16, life: 1.6, size: 0.5, grow: 0, r: 1, g: 0.6 + Math.random() * 0.4, b: Math.random() * 0.5, a: 1, add: true })
  }
}

// ---------------------------------------------------------------- 爽快感（ヒットストップ・スロー・ご褒美の文字とコンボ）
// スローとヒットストップはオフラインだけ（オンラインは全員の時計が同じなので見た目だけ）
const juice = { stop: 0, slow: 0, slowK: 1, combo: 0, comboT: 0, hitAt: -9, near: new Map(), cool: new Map() }
function hitStop(sec) { if (!onlineRace) juice.stop = Math.max(juice.stop, sec) }
function slowMo(k, sec) { if (!onlineRace) { juice.slow = Math.max(juice.slow, sec); juice.slowK = k } }
function juiceScale(dt) {
  juice.comboT = Math.max(0, juice.comboT - dt)
  if (juice.stop > 0) { juice.stop -= dt; return 0.03 }
  if (juice.slow > 0) { juice.slow -= dt; return juice.slowK }
  return 1
}
function reward(text, sub = '', nitro = 0) {
  juice.combo = juice.comboT > 0 ? juice.combo + 1 : 1
  juice.comboT = 4
  const mul = 1 + 0.5 * Math.min(3, juice.combo - 1)
  if (nitro && me) { me.boost = Math.min(1, me.boost + nitro * mul); me.boostLock = false }
  hud.reward(text, [sub, nitro ? `+${Math.round(nitro * mul * 100)}% NITRO` : ''].filter(Boolean).join('  '), juice.combo)
  audio.cp()
}
// ニアミス: 速く走っていて、一般車や他の車の真横 2〜3.6m をかすめて当たらなかった
function nearMiss() {
  if (!me || !race || race.phase !== 'racing' || me.wreck > 0) return
  const v = speedOf(me)
  const fx_ = Math.sin(me.yaw), fz = Math.cos(me.yaw)
  // 真横を通り過ぎた瞬間（前後の向きが入れ替わった）で判定する。fps が低くても取りこぼさない
  const prev = juice.along || (juice.along = new Map()), seen = new Set()
  const look = (o, id, ov) => {
    const dx = o.x - me.x, dz = o.z - me.z
    if (dx * dx + dz * dz > 400) return
    seen.add(id)
    const along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_)
    const p0 = prev.get(id); prev.set(id, along)
    const rel = Math.abs(v - ov)
    if (p0 != null && Math.sign(p0) !== Math.sign(along) && Math.abs(p0 - along) < 12 && side > 1.9 && side < 3.6 && rel > 10 && !(juice.cool.get(id) > race.t)) juice.near.set(id, race.t + 0.35)
  }
  if (v > 24) {
    if (race.traffic) for (const o of race.traffic.cars) look(o, o.id, o.speed || 0)
    for (const e of race.entries) if (e.car !== me && !e.car.wreck) look(e.car, e.id, speedOf(e.car))
  }
  for (const id of prev.keys()) if (!seen.has(id)) prev.delete(id)
  for (const [id, at] of juice.near) if (race.t >= at) {
    juice.near.delete(id)
    if (race.t - juice.hitAt > 0.6) { juice.cool.set(id, race.t + 3); reward('NEAR MISS', '', 0.06) }
  }
}

function lerpAngle(a, b, k) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

// ---------------------------------------------------------------- カメラ
const _v = new THREE.Vector3(), _l = new THREE.Vector3()
function updateCamera(dt) {
  if (window.__freeze) return // 検証用: カメラを外から置くとき
  const c = follow
  if (!c) return
  const m = models.get(c.id)
  const pos = m ? m.group.position : _l.set(c.x, c.y, c.z)
  const v = speedOf(c)
  // 進む向き（空中や滑っているときは速度の向きに寄せる）
  let hx = Math.sin(c.yaw), hz = Math.cos(c.yaw)
  if (v > 8) {
    const k = c.grounded ? 0.25 : 0.7
    hx = hx * (1 - k) + (c.vx / v) * k; hz = hz * (1 - k) + (c.vz / v) * k
    const l = Math.hypot(hx, hz); hx /= l; hz /= l
  }
  // 向きはなめらかに追う（位置は車にぴったり付ける。速いほど遠くに置いていかれる遅れを無くした）
  cam.hd = lerpAngle(cam.hd, Math.atan2(hx, hz), 1 - Math.exp(-dt * 7))
  hx = Math.sin(cam.hd); hz = Math.cos(cam.hd)
  // レースゲームの定番: 車のすぐ後ろ・低い位置から前を水平に見る（0）/ 少し引き（1）/ ボンネット（2）
  // 2026-10-26 本人「カメラの距離を近く」: 近い 3.25/1.15→2.85/1.05、引き 6.0/2.0→5.2/1.8（加えて速さによる置いていかれを無くした）
  const presets = [[2.85, 1.05], [5.2, 1.8], [0, 0]]
  let [back0, up0] = presets[camMode]
  // 縦長の画面は上が空ばかりになるので、少し高くから見下ろす
  if (camera.aspect < 1 && camMode !== 2) { back0 += 0.3; up0 += 0.35 }
  // 速いほど少し引く（スピード感）
  let back = back0 + Math.min(1.2, v * 0.026), up = up0
  // カウントダウン中は前から回り込む
  if (race && race.phase === 'countdown' && c === me) {
    const k = Math.max(0, Math.min(1, (-race.t - 0.6) / (GAME.countdownSec - 0.6)))
    const ang = k * Math.PI * 0.9
    const ch = Math.cos(ang), sh = Math.sin(ang)
    const rx = hx * ch - hz * sh, rz = hx * sh + hz * ch
    hx = rx; hz = rz
    back += k * 4; up += k * 1.5
  }
  let tx = pos.x - hx * back, tz = pos.z - hz * back
  let ty = pos.y + up
  // 建物に埋まらないよう手前に寄せる
  if (camMode !== 2) {
    for (let i = 1; i <= 6; i++) {
      const f = i / 6
      const px = pos.x + (tx - pos.x) * f, pz = pos.z + (tz - pos.z) * f, py = pos.y + (ty - pos.y) * f
      let blocked = false
      for (const o of world.nearby(px, pz)) {
        if (o.slab || (o.id && world.destroyed.has(o.id)) || o.kind === 'bound') continue
        if (o.y0 == null || py < o.y0 || py > o.y1) continue
        const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0)
        const dx = px - o.cx, dz = pz - o.cz
        const u = dx * cs - dz * sn, w = dx * sn + dz * cs
        if (Math.abs(u) < o.hw + 0.4 && Math.abs(w) < o.hl + 0.4) { blocked = true; break }
      }
      if (blocked) { const ff = Math.max(0.25, (i - 1) / 6); tx = pos.x + (tx - pos.x) * ff; tz = pos.z + (tz - pos.z) * ff; ty = pos.y + up * 0.8 + (1 - ff) * 2; break }
    }
  }
  const gy = world.groundAt(tx, tz, ty).h + 0.8
  if (ty < gy) ty = gy
  const k = 1 - Math.exp(-dt * 10)
  cam.off.lerp(_v.set(tx - pos.x, ty - pos.y, tz - pos.z), k)
  cam.pos.set(pos.x + cam.off.x, pos.y + cam.off.y, pos.z + cam.off.z)
  cam.lookOff.lerp(_v.set(hx * 10, camera.aspect < 1 ? 0.2 : 1.0, hz * 10), 1 - Math.exp(-dt * 12))
  cam.look.set(pos.x + cam.lookOff.x, pos.y + cam.lookOff.y, pos.z + cam.lookOff.z)
  if (cam.pos.y < gy) cam.pos.y = gy
  if (camMode === 2 && m && !(race && race.phase === 'countdown')) {
    // ボンネットの上（車体の傾きに合わせる）
    m.group.updateMatrixWorld()
    cam.pos.copy(m.group.localToWorld(_v.set(0, 0.78, 0.35)))
    cam.look.copy(m.group.localToWorld(_l.set(0, 0.65, 12)))
  }
  camera.position.copy(cam.pos)
  // ニトロ中は小刻みに揺れ、流れる線を出す
  if (c === me && c.boosting && !paused) fx.shake = Math.max(fx.shake, 0.12)
  hud.speedLines(c === me && camMode !== 2 ? Math.max(0, Math.min(1, (v - 30) / 16)) : 0, c === me && c.boosting)
  // 揺れ
  const sh = fx.shake
  if (sh > 0) camera.position.add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.7, (Math.random() - 0.5) * sh))
  camera.lookAt(cam.look)
  // 縦長の画面では横の見える幅が狭くならないよう縦の画角を広げる
  const asp = camera.aspect
  const base = asp >= 1 ? 58 : Math.min(84, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / asp) * 180 / Math.PI)
  // 速さで視野が広がる（スピード感）。ニトロ中はさらに
  const fov = base + Math.min(14, v * 0.3) + (c.boosting ? (c.perfect ? 12 : 8) : 0)
  cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4))
  camera.fov = cam.fov
  camera.updateProjectionMatrix()
}

// ---------------------------------------------------------------- オンライン
function myCar() { const pc = profile.cars[profile.car]; return { carId: profile.car, levels: pc.levels, paint: pc.paint } }

// 他の車の位置をスナップショットの補間で更新し、時計と進行をサーバーに合わせる
function syncOnline() {
  if (!online || !online.session) return
  const st = online.serverTime()
  if (st != null) {
    const d = st - race.t
    if (Math.abs(d) > 0.5) race.t = st
    else race.t += d * 0.05
  }
  if (online.session.phase === 'racing' && race.phase === 'countdown') { race.phase = 'racing' }
  for (const e of race.entries) {
    if (!e.remote) continue
    const s = online.sample(e.id)
    if (!s) continue
    const c = e.car
    c.x = s.x; c.y = s.y; c.z = s.z; c.vx = s.vx; c.vy = s.vy; c.vz = s.vz
    c.yaw = s.yaw; c.pitch = s.pitch; c.roll = s.roll
    c.boosting = !!s.b; c.grounded = !!s.g; c.wreck = s.w ? 1 : 0
    if (s.d) ['body', 'engine', 'tires', 'susp', 'cool'].forEach((k, i) => { c.dmg[k] = s.d[i] })
  }
}

function serverAvailable() {
  return fetch('healthz', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => !!(j && j.ok)).catch(() => false)
}

function ensureOnline() {
  if (online) { online.open(); return online }
  online = new Online({
    onStatus: s => { const el = $('netStatus'); el.textContent = s === 'online' ? t('netOn') : t('netOff'); el.classList.toggle('on', s === 'online') },
    onRoom: room => { if (!$('lobby').classList.contains('hidden')) renderLobby(room) },
    onError: (code, req) => {
      const map = { not_found: 'errNotFound', started: 'errStarted', full: 'errFull', bad_name: 'errName' }
      if (map[code]) $('lobbyErr').textContent = t(map[code])
    },
    onClosed: () => toTitle(),
    onRaceStart: (view) => {
      audio.start()
      loadStage(view.stage === 'city' ? 'city' : 'touge')
      mode = 'race'
      menuOpen = false
      startRace({ view })
      show(null)
      hud.hint(touchMode ? t('hintTouch') : t('hintStart'), 5)
    },
    onResult: (list) => { if (onlineRace || mode === 'race') showResults(list) },
    onRemoteBreak: br => { if (!world.destroyed.has(br.id)) { world.breakObj(br.id); breakInfo.set(br.id, br) } },
    onUnbreak: id => {
      // サーバーに却下された破壊を元に戻す
      world.destroyed.delete(id); world.destroyedAt.delete(id); seenBroken.delete(id)
      const o = world.objectById.get(id)
      if (o.type === 'guardrail') { setRail(id, true); return }
      if (o.type === 'tree') { built.forest.show(o.ti); return }
      const old = props.get(id); if (old) old.parent && old.parent.remove(old)
      const m = new THREE.Mesh(geoCache[o.type] || (geoCache[o.type] = propGeometry(o.type)), propMat)
      m.position.set(o.cx, o.y0, o.cz); m.rotation.y = o.yaw; m.castShadow = true
      scene.add(m); props.set(id, m)
    },
    onCorrect: s => { if (me) { me.x = s.x; me.y = s.y; me.z = s.z; me.vx = me.vy = me.vz = 0; const e = race.entry(myId); e.px = s.x; e.pz = s.z } },
    onSnapMeta: m => {
      if (!race || !onlineRace) return
      for (const c of m.cars) {
        const e = race.entry(c.id)
        if (!e) continue
        if (e.remote) { e.left = !!c.l; e.connected = !!c.c }
      }
      if (m.ch) applyChaseSummary(m.ch)
      if (m.phase === 'done') race.phase = 'done'
    }
  })
  online.open()
  return online
}

function showLobby() {
  returnTo = 'lobby'
  show('lobby')
  renderLobby(online && online.room)
}

function renderLobby(room) {
  const inRoom = !!(room && room.code)
  $('lobbyEntry').classList.toggle('hidden', inRoom)
  $('lobbyRoom').classList.toggle('hidden', !inRoom)
  if (!inRoom) return
  $('lobbyErr').textContent = ''
  const isHost = room.hostId === online.you
  document.querySelector('.panel.lobby').classList.toggle('guest', !isHost)
  $('roomCode').textContent = room.code
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '?room=' + room.code
  $('inviteLink').value = link
  const ul = $('plist'); ul.innerHTML = ''
  for (const p of room.players) {
    const li = document.createElement('li')
    if (!p.connected) li.className = 'off'
    li.innerHTML = `<span class="nm"></span><span class="car">${p.car ? CARS[p.car.carId].name : '...'}</span><span>${p.id === room.hostId ? `<span class="tag">${t('host')}</span>` : !p.connected ? t('offlineTag') : ''}</span>`
    li.querySelector('.nm').textContent = p.name + (p.id === online.you ? ` (${t('you')})` : '')
    ul.appendChild(li)
  }
  const sel = $('cpuOnline')
  if (!sel.options.length) for (let i = 0; i <= 7; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; sel.appendChild(o) }
  const maxCpu = Math.max(0, 8 - room.players.length)
  for (const o of sel.options) o.disabled = Number(o.value) > maxCpu
  if (Number(sel.value) > maxCpu) sel.value = String(maxCpu)
  $('btnStartOnline').disabled = room.phase === 'playing'
  // 自分の車の選択
  const box = $('carPickLobby'); box.innerHTML = ''
  for (const id of Object.keys(CARS)) {
    const b = document.createElement('button')
    b.textContent = CARS[id].name
    b.className = profile.car === id ? 'on' : ''
    b.onclick = () => { profile.car = id; saveProfile(profile); online.setCar(myCar()); renderLobby(online.room); renderCarPick(); audio.ui() }
    box.appendChild(b)
  }
}

$('btnOnline').onclick = () => { audio.start(); audio.ui(); ensureOnline(); showLobby() }
$('btnLobbyBack').onclick = () => { audio.ui(); if (online && online.room) online.leave(); returnTo = 'title'; show('title') }
$('btnCreate').onclick = () => {
  const name = (($('nameInput').value || '').trim() || t('you')).slice(0, 12)
  profile.name = name; saveProfile(profile)
  ensureOnline().create(name, myCar())
}
$('btnJoin').onclick = () => {
  const code = $('codeInput').value.trim().toUpperCase()
  if (code.length !== 4) { $('lobbyErr').textContent = t('errNotFound'); return }
  const name = (($('nameInput').value || '').trim() || t('you')).slice(0, 12)
  profile.name = name; saveProfile(profile)
  ensureOnline().join(code, name, myCar())
}
$('btnCopy').onclick = () => {
  const v = $('inviteLink').value
  const done = () => { $('btnCopy').textContent = t('copied'); setTimeout(() => { $('btnCopy').textContent = t('copy') }, 1500) }
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, () => { $('inviteLink').select(); document.execCommand('copy'); done() })
  else { $('inviteLink').select(); document.execCommand('copy'); done() }
}
$('btnStartOnline').onclick = () => { audio.start(); online.start(Number($('cpuOnline').value), profile.stage) }
$('btnLeave').onclick = () => { audio.ui(); online.leave(); renderLobby(null) }
$('btnLobbyGarage').onclick = () => { audio.ui(); returnTo = 'lobby'; show('garage') }

// タッチだけの端末には、PC 向けであることを出しておく
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('onlineNote').dataset.t = 'pcOnly'

// サーバーがあるときだけオンラインを使える（GitHub Pages ではオフライン専用）
serverAvailable().then(ok => {
  $('btnOnline').disabled = !ok
  $('btnOnline').dataset.t = ok ? 'online' : 'onlineSoon'
  if ($('onlineNote').dataset.t !== 'pcOnly') $('onlineNote').dataset.t = ok ? '' : 'noServer'
  refreshTexts()
  if (!ok) return
  // 招待リンク（?room=ABCD）で開いたら、その部屋に入る
  const code = new URLSearchParams(location.search).get('room')
  if (code) {
    ensureOnline()
    showLobby()
    $('codeInput').value = code.toUpperCase().slice(0, 4)
    if (profile.name) $('btnJoin').click()
  } else {
    // 同じタブで読み込み直した: 前の席があれば戻る（レース中ならそのまま再開）
    let saved = null
    try { saved = JSON.parse(sessionStorage.getItem('btr-session') || 'null') } catch {}
    if (saved) ensureOnline()
  }
})

// ---------------------------------------------------------------- 起動
toTitle()
requestAnimationFrame(frame)
// 実車モデルは画面が出てから読む（読み終わるまでは手続きの車で走れる）。届いたら今いる車を差し替える
setTimeout(() => loadCarModel(Q.carLite ? 'assets/models/car_lite.glb' : 'assets/models/car.glb').then(() => {
  if (!race) return
  for (const e of race.entries) {
    const old = models.get(e.id)
    const paint = old && old.paintColor ? old.paintColor.getHex() : e.car.paint
    if (old) { scene.remove(old.group); old.dispose() }
    const m = makeModel(e, paint ?? 0xe8432e)
    scene.add(m.group)
    m.updateParts(e.car.dmg)
    models.set(e.id, m)
  }
  if (preview) preview.key = ''
  buildTrafficPool()
}).catch(err => console.warn('car model', err)), 300)
addEventListener('pointerdown', () => audio.start(), { once: true })

// 検証用の窓口（本番の操作には使わない）
window.__btr = {
  get world() { return world }, get race() { return race }, get me() { return me }, get mode() { return mode }, profile, startOffline: beginPlayerRace,
  get online() { return online }, get myId() { return myId }, get camMode() { return camMode }, juice,
  setPaused: p => { paused = p }, fx, camera, renderer,
  autopilot() {
    if (!me) return
    const e = race.entry(myId)
    autopilot = createDriver(world, me, { pts: [{ x: me.x, z: me.z, vmax: 99 }, { x: me.x + 1, z: me.z + 1, vmax: 99 }], picks: [], boostZones: [] })
    autopilot.lead = 0; autopilot.replan = 0
    e.driver = autopilot
  },
  stopAutopilot() { autopilot = null },
  teleport(x, z, yaw = 0, speed = 0) { if (!me) return; me.x = x; me.z = z; me.y = world.groundAt(x, z, 50).h + 0.6; me.yaw = yaw; me.vx = Math.sin(yaw) * speed; me.vz = Math.cos(yaw) * speed; me.vy = 0; snapCamera() }
}
