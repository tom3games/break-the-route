// 画面の入口。タイトル（裏でCPUのデモ走行）→ ガレージ → レース → 結果。
// 物理とレース判定は shared/ のものをそのまま使い、ここは描画・入力・音・画面遷移だけを持つ。
import * as THREE from 'three'
import { GAME, CARS, UPGRADES, PAINTS, DESTRUCT, buildStats } from '../shared/config.js'
import { createWorld, FALL_SEC, terrain, gateAt, totalGates } from '../shared/track.js'
import { Race, mulberry } from '../shared/race.js'
import { speedOf } from '../shared/physics.js'
import { createDriver, drive, planRoute } from '../shared/ai.js'
import { buildScene, propGeometry } from './scene.js'
import { CarModel, ProcCar, loadCarModel } from './carmodel.js'
import { FX } from './fx.js'
import { Audio } from './audio.js'
import { Input } from './input.js'
import { t, applyI18n, setLang, getLang, placeText } from './i18n.js'
import { loadProfile, saveProfile, buyUpgrade, sellUpgrade } from './save.js'
import { HUD, drawFullMap } from './hud.js'
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
let world = createWorld(loadProfile().stage === 'city' ? 'city' : 'touge')
let built = buildScene(scene, world)
const fx = new FX(scene, world)
const audio = new Audio()
const input = new Input()
const hud = new HUD(world)
hud.onBeep = () => audio.beep(false)

// ---------------------------------------------------------------- 道案内
// 車の上の矢印: 今いる区間のルート（A〜E のうち一番近い道）を 30m 先まで辿った点を指す。
// 近道を選んでも、その道に沿って次のゲートへ案内する
const makeGuidePaths = () => world.routes.map((opts, si) => opts.map(o => {
  const out = []
  for (let i = 0; i < o.pts.length - 1; i++) {
    const [ax, az] = o.pts[i], [bx, bz] = o.pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4))
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n])
  }
  const g = world.gates[si].respawn
  out.push([g.x, g.z])
  return out
}))
let guidePaths = makeGuidePaths()

// ステージを切り替える（コースの見た目・壊せる物・案内を作り直す）
function loadStage(id) {
  if (world.stage === id) return
  scene.remove(built.root)
  built.root.traverse(o => { if (o.geometry) o.geometry.dispose() })
  world = createWorld(id)
  built = buildScene(scene, world)
  fx.world = world
  hud.world = world
  guidePaths = makeGuidePaths()
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
// 次のゲートの光の柱（霧に消えないので遠くから見える）
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 160, 20, 1, true).translate(0, 80, 0),
  new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }))
scene.add(beacon)

function updateGuide(now) {
  const e = me && race ? race.entry(myId) : null
  const on = !!(e && mode === 'race' && !e.finished && camMode !== 2)
  guide.visible = on
  beacon.visible = !!(e && mode === 'race' && !e.finished)
  if (!e || e.finished) return
  const cpi = Math.min(e.cp, totalGates(world) - 1)
  const si = cpi % world.gates.length
  const g = gateAt(world, cpi)
  beacon.position.set(g.cx, world.groundAt(g.cx, g.cz, 60).h, g.cz)
  beacon.material.color.setHex(cpi === totalGates(world) - 1 ? 0x7dffb0 : 0xff8a1f)
  beacon.material.opacity = 0.22 + Math.sin(now / 300) * 0.08
  if (!on) return
  // 一番近い道の点から 30m 先
  let best = null, bd = 1e9
  for (const path of guidePaths[si]) for (let i = 0; i < path.length; i++) {
    const d = (path[i][0] - me.x) ** 2 + (path[i][1] - me.z) ** 2
    if (d < bd) { bd = d; best = { path, i } }
  }
  const tgt = best.path[Math.min(best.path.length - 1, best.i + 8)]
  const yaw = Math.atan2(tgt[0] - me.x, tgt[1] - me.z)
  const m = models.get(myId)
  const p = m ? m.group.position : me
  // 車の少し前・上。手前（カメラ側）へ起こして、平たく潰れて見えないようにする
  guide.position.set(p.x + Math.sin(me.yaw) * 1.2, p.y + 1.75 + Math.sin(now / 260) * 0.06, p.z + Math.cos(me.yaw) * 1.2)
  guide.rotation.set(0, yaw, 0, 'YXZ')
  guide.rotateX(-0.55)
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
  for (const o of world.objects) {
    if (o.type === 'guardrail') continue
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
const trafficModels = new Map()
let paused = false
let seenBroken = new Set()
let camMode = 0
let follow = null       // カメラが追う車
let doneAt = null
let lastFrameInp = null
let msgTimer = 0
let demoSwitch = 0

const cam = { pos: new THREE.Vector3(0, 10, -20), look: new THREE.Vector3(), fov: 64 }

function startRace({ demo = false, view = null } = {}) {
  // 前の車を片付ける
  for (const m of models.values()) { scene.remove(m.group); m.dispose() }
  models.clear()
  fx.bodies.forEach(b => b.mesh.parent && b.mesh.parent.remove(b.mesh)); fx.bodies.length = 0
  for (const d of fx.debris) d.life = Math.min(d.life, 0.01)
  seenBroken = new Set()
  placeProps()

  race = new Race(world, { seed: (Math.random() * 1e9) | 0 })
  me = null
  autopilot = null
  onlineRace = !!view
  myId = 'me'
  if (view) {
    // オンライン: 並び順（スタート位置）はサーバーと同じ。自分だけここで動かし、他は通信で動かす
    race.remoteJudge = true
    myId = online.you
    const pc = profile.cars[profile.car]
    for (const en of view.entries) {
      const isMe = en.id === myId
      const car = race.addHuman({ id: en.id, name: en.name, carId: isMe ? profile.car : en.carId, levels: isMe ? pc.levels : en.levels, paint: isMe ? pc.paint : en.paint, remote: !isMe })
      const e = race.entry(en.id)
      e.bot = en.bot
      if (isMe) me = car
    }
    for (const [id, at] of view.destroyed) { world.destroyed.add(id); world.destroyedAt.set(id, at) }
    race.t = view.rt
    world.time = view.rt
    if (view.phase !== 'countdown') race.phase = view.phase
    // 再接続: サーバーが最後に受け付けた位置から続ける
    if (me && view.you && view.rt > 0) {
      const y = view.you, e = race.entry(myId)
      Object.assign(me, { x: y.x, y: y.y, z: y.z, yaw: y.yaw })
      e.cp = y.cp; e.px = y.x; e.pz = y.z
      if (y.respawn) me.respawnPoint = { ...y.respawn }
      if (y.dmg) Object.assign(me.dmg, y.dmg)
    }
  } else if (!demo) {
    const pc = profile.cars[profile.car]
    me = race.addHuman({ id: 'me', name: profile.name || t('you'), carId: profile.car, levels: pc.levels, paint: pc.paint })
    race.addBots(profile.cpu)
  } else race.addBots(7)
  // CPU の塗装はばらす
  const rng = mulberry(7)
  for (const e of race.entries) {
    const paint = e.car.paint ?? PAINTS[(Math.floor(rng() * PAINTS.length) + race.entries.indexOf(e)) % PAINTS.length]
    const m = new CarModel(e.car.carId, paint)
    scene.add(m.group)
    models.set(e.id, m)
  }
  // 一般車（街だけ）。軽い手続きの車で描く
  for (const m of trafficModels.values()) { scene.remove(m.group); m.dispose() }
  trafficModels.clear()
  if (race.traffic) for (const c of race.traffic.cars) {
    const m = new ProcCar(c.kind, c.color)
    scene.add(m.group); trafficModels.set(c.id, m)
  }
  follow = me || race.entries[0].car
  doneAt = null
  paused = false
  hud.setup(race, me)
  // カメラを車の後ろに置き直す
  snapCamera()
}

function snapCamera() {
  const c = follow
  const fx_ = Math.sin(c.yaw), fz = Math.cos(c.yaw)
  cam.pos.set(c.x - fx_ * 9, c.y + 3.5, c.z - fz * 9)
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

function beginPlayerRace() {
  audio.start()
  loadStage(profile.stage)
  profile.name = ($('nameInput').value || '').trim().slice(0, 12)
  saveProfile(profile)
  mode = 'race'
  startRace()
  show(null)
  hud.hint(touchMode ? t('hintTouch') : t('hintStart'), 6)
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
for (let i = 0; i <= 7; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; $('cpuSelect').appendChild(o) }
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
$('btnOffline').onclick = beginPlayerRace
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
  beginPlayerRace()
}
$('btnRGarage').onclick = () => {
  audio.ui()
  if (onlineRace && online && online.room) { if (online.room.hostId === online.you) online.toLobby(); mode = 'title'; startRace({ demo: true }); onlineRace = false; showLobby(); return }
  mode = 'title'; startRace({ demo: true }); returnTo = 'title'; show('garage')
}
$('btnRTitle').onclick = () => { audio.ui(); if (onlineRace && online) online.leave(); toTitle() }

function showResults(list = null) {
  mode = 'results'
  const res = list || race.results()
  const mine = res.find(r => r.id === myId)
  if (mine) { profile.credits += mine.credits; profile.races++; if (mine.finished && (!profile.best || mine.time < profile.best)) profile.best = mine.time; saveProfile(profile) }
  const body = $('rBody'); body.innerHTML = ''
  res.forEach((r, i) => {
    const tr = document.createElement('tr')
    if (r.id === myId) tr.className = 'me'
    const st = r.finished ? fmtTime(r.time) : r.left ? t('left') : t('dnf')
    tr.innerHTML = `<td class="n">${r.place}</td><td><b></b> <span class="s">${CARS[r.carId].name}</span></td><td class="s">${t('breaks')} ${r.breaks} / ${t('air')} ${r.maxAir}s${r.takedowns ? ' / TAKEDOWN ' + r.takedowns : ''} / ${t('body')} ${r.body}%</td><td class="t">${st}</td>`
    tr.querySelector('b').textContent = r.name
    body.appendChild(tr)
    setTimeout(() => tr.classList.add('in'), 250 + i * 160)
  })
  const stamp = $('rStamp')
  stamp.classList.remove('show')
  if (mine) {
    stamp.textContent = mine.finished ? placeText(mine.place) : t('dnf')
    stamp.style.color = mine.place === 1 && mine.finished ? 'var(--yel)' : mine.finished && mine.place <= 3 ? 'var(--fg)' : 'var(--hot)'
    setTimeout(() => { stamp.classList.add('show'); if (mine.place === 1 && mine.finished) audio.fanfare(); else audio.beep(true) }, 250 + res.length * 160)
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
        if (mine || ev.other === myId) fx.addShake(Math.min(0.9, ev.speed / 22))
        break
      case 'land':
        if (ev.air > 0.35) {
          const sname = c.surf === 'grass' ? [0.45, 0.55, 0.3] : [0.66, 0.58, 0.46]
          fx.dust(c.x, c.y - 0.5, c.z, Math.min(14, 2 + ev.impact * 0.5), sname, Math.min(2, 0.6 + ev.impact / 20))
          if (vol) audio.land(ev.impact * vol)
          if (mine) {
            fx.addShake(Math.min(1, ev.impact / 30))
            if (ev.crash) hud.message(t('msgCrash'), '', 1.4)
            else if (ev.air > 1.1) hud.message(t('msgBigAir'), ev.air.toFixed(1) + 's', 1.2)
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
    acc += dt
    const airborne = me ? !me.grounded : false
    let inp = me ? input.read(airborne) : null
    if (me && autopilot) inp = drive(autopilot, world)
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
    for (const c of race.traffic.cars) { const m = trafficModels.get(c.id); if (m) m.update(c, dt, {}) }
  }

  // デモ中は数秒ごとに先頭付近の車を追う
  if (mode !== 'race' && race) {
    demoSwitch -= dt
    if (demoSwitch <= 0 || !follow) {
      demoSwitch = 9
      const st = race.standings()
      follow = st[Math.floor(Math.random() * Math.min(3, st.length))].car
    }
    if (race.phase === 'done' && race.t - (race.firstFinish ?? race.t) > 4) startRace({ demo: true })
  }

  updateCamera(dt)
  updateGuide(now)
  fx.update(paused ? 0 : dt)

  // 次のゲートを光らせる
  const myEntry = me ? race.entry(myId) : null
  built.gates.forEach((g, i) => { g.beam.material.opacity = myEntry && !myEntry.finished && i === myEntry.cp % world.gates.length ? 0.35 + Math.sin(now / 200) * 0.15 : 0 })

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

function raceEvent(ev) {
  if (!me) return
  if (ev.t === 'go') audio.beep(true)
  if (ev.t === 'takedown' && ev.id === myId) { audio.crash(1.2); hud.message('TAKEDOWN', race.entry(ev.victim)?.car.name || '', 1.3); hud.feed('TAKEDOWN', '+35% NITRO') }
  if (ev.t === 'nearmiss' && ev.id === myId) { hud.feed('NEAR MISS', '+8% NITRO'); if (ev.traffic) audio.horn() }
  if (ev.t === 'smash') {
    fx.sparks(ev.x, ev.y, ev.z, 20, null, 10); fx.flash(ev.x, ev.y + 0.3, ev.z)
    const near = me ? Math.hypot(me.x - ev.x, me.z - ev.z) : 99
    if (near < 80) audio.crash(Math.min(1.2, ev.rel / 25) * (1 - near / 80))
    if (ev.id === myId) { hud.feed('CRASH', '+5% NITRO'); fx.addShake(0.4) }
  }
  if (ev.id === myId && ev.t === 'cp') { audio.cp(); hud.message(ev.name, fmtTime(race.t), 1.1) }
  if (ev.id === myId && ev.t === 'finish') { audio.fanfare(); hud.message(t('goal'), fmtTime(ev.time), 2.4) }
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
  // レースゲームの定番: 車のすぐ後ろ・低い位置から前を水平に見る（0）/ 少し引き（1）/ ボンネット（2）
  const presets = [[3.25, 1.15], [6.0, 2.0], [0, 0]]
  let [back0, up0] = presets[camMode]
  // 縦長の画面は上が空ばかりになるので、少し高くから見下ろす
  if (camera.aspect < 1 && camMode !== 2) { back0 += 0.4; up0 += 0.45 }
  let back = back0 + Math.min(0.7, v * 0.01), up = up0
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
  _v.set(tx, ty, tz)
  cam.pos.lerp(_v, k)
  _l.set(pos.x + hx * 10, pos.y + (camera.aspect < 1 ? 0.2 : 1.0), pos.z + hz * 10)
  cam.look.lerp(_l, 1 - Math.exp(-dt * 12))
  if (camMode === 2 && m && !(race && race.phase === 'countdown')) {
    // ボンネットの上（車体の傾きに合わせる）
    m.group.updateMatrixWorld()
    cam.pos.copy(m.group.localToWorld(_v.set(0, 0.78, 0.35)))
    cam.look.copy(m.group.localToWorld(_l.set(0, 0.65, 12)))
  }
  camera.position.copy(cam.pos)
  // 揺れ
  const sh = fx.shake
  if (sh > 0) camera.position.add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.7, (Math.random() - 0.5) * sh))
  camera.lookAt(cam.look)
  // 縦長の画面では横の見える幅が狭くならないよう縦の画角を広げる
  const asp = camera.aspect
  const base = asp >= 1 ? 58 : Math.min(90, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / asp) * 180 / Math.PI)
  const fov = base + Math.min(10, v * 0.12) + (c.boosting ? (c.perfect ? 10 : 6) : 0)
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
        if (e.remote) { e.cp = c.cp; e.finished = !!c.f; e.time = c.ft; e.left = !!c.l; e.connected = !!c.c }
        else {
          if (c.cp > e.cp) e.cp = c.cp
          if (c.f && !e.finished) { e.finished = true; race.events.push({ t: 'finish', id: e.id, time: c.ft }) }
          if (c.f) e.time = c.ft
        }
      }
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
    const m = new CarModel(e.car.carId, paint ?? 0xe8432e)
    scene.add(m.group)
    m.updateParts(e.car.dmg)
    models.set(e.id, m)
  }
  if (preview) preview.key = ''
  for (const [id, m] of trafficModels) { scene.remove(m.group); m.dispose(); trafficModels.delete(id) }
  if (race && race.traffic) for (const c of race.traffic.cars) { const m = new ProcCar(c.kind, c.color); scene.add(m.group); trafficModels.set(c.id, m) }
}).catch(err => console.warn('car model', err)), 300)
addEventListener('pointerdown', () => audio.start(), { once: true })

// 検証用の窓口（本番の操作には使わない）
window.__btr = {
  get world() { return world }, get race() { return race }, get me() { return me }, get mode() { return mode }, profile, startOffline: beginPlayerRace,
  get online() { return online }, get myId() { return myId },
  setPaused: p => { paused = p }, fx, camera, renderer,
  autopilot(force) { autopilot = me ? createDriver(world, me, planRoute(world, Math.random, 0.5, force)) : null },
  teleport(x, z, yaw = 0, speed = 0) { if (!me) return; me.x = x; me.z = z; me.y = world.groundAt(x, z, 50).h + 0.6; me.yaw = yaw; me.vx = Math.sin(yaw) * speed; me.vz = Math.cos(yaw) * speed; me.vy = 0; snapCamera() }
}
