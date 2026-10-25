// 車の見た目。車体は細かく割った箱で、ぶつけた場所の頂点を押し込んで凹ませる。
// 損傷が進むとバンパー・ボンネット・ウイングが外れて飛び、エンジンから煙が出る。
import * as THREE from 'three'
import { Builder } from './geo.js'

const SHAPES = {
  runner:  { w: 1.0, len: 2.15, h: 0.62, cab: 0.5, cabLen: 1.0, cabBack: -0.35, wing: true, bar: false },
  bruiser: { w: 1.1, len: 2.3, h: 0.78, cab: 0.58, cabLen: 1.15, cabBack: -0.2, wing: false, bar: true },
  dart:    { w: 0.95, len: 2.05, h: 0.5, cab: 0.42, cabLen: 0.9, cabBack: -0.4, wing: true, bar: false }
}

function bodyGeometry(S, paint) {
  // 下半分（細かく割る）
  const g1 = new THREE.BoxGeometry(S.w * 2, S.h, S.len * 2, 6, 2, 14)
  const p = g1.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    // 先端を丸め、鼻先を低く
    const fz = z / S.len
    if (fz > 0.6 && y > 0) y -= (fz - 0.6) * S.h * 0.9
    if (Math.abs(fz) > 0.85) x *= 0.93
    p.setXYZ(i, x, y - 0.05, z)
  }
  // 上の客室（台形）
  const g2 = new THREE.BoxGeometry(S.w * 1.7, S.cab, S.cabLen * 2, 4, 1, 6)
  const q = g2.attributes.position
  for (let i = 0; i < q.count; i++) {
    let x = q.getX(i), y = q.getY(i), z = q.getZ(i)
    if (y > 0) { x *= 0.82; z *= 0.72 }
    q.setXYZ(i, x, y + S.h / 2 + S.cab / 2 - 0.06, z + S.cabBack)
  }
  const merge = new THREE.BufferGeometry()
  const a = g1.toNonIndexed(), b = g2.toNonIndexed()
  const n = a.attributes.position.count + b.attributes.position.count
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
  pos.set(a.attributes.position.array, 0); pos.set(b.attributes.position.array, a.attributes.position.count * 3)
  const pc = new THREE.Color(paint), glass = new THREE.Color(0x1b2a3a), dark = new THREE.Color(0x202226)
  for (let i = 0; i < n; i++) {
    const isCab = i >= a.attributes.position.count
    const y = pos[i * 3 + 1]
    let c = pc
    if (isCab) {
      // 屋根は車体色、側面と前後はガラス
      const ny = (i - a.attributes.position.count)
      c = y > S.h / 2 + S.cab - 0.08 ? pc : glass
    } else if (y < -S.h / 2 + 0.05) c = dark
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  merge.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merge.setAttribute('color', new THREE.BufferAttribute(col, 3))
  merge.computeVertexNormals()
  return merge
}

export class CarModel {
  constructor(carId = 'runner', paint = 0xe8432e) {
    this.S = SHAPES[carId] || SHAPES.runner
    const S = this.S
    this.group = new THREE.Group()
    this.group.rotation.order = 'YXZ'
    const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 })
    this.body = new THREE.Mesh(bodyGeometry(S, paint), paintMat)
    this.body.castShadow = true
    this.body.position.y = 0.08
    this.group.add(this.body)
    this.base = Float32Array.from(this.body.geometry.attributes.position.array)

    // 外れる部品
    const mk = (fn, color, mat = null) => { const b = new Builder(); fn(b, color); const m = new THREE.Mesh(b.geometry(), mat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })); m.castShadow = true; this.group.add(m); return m }
    this.parts = {
      bumper: mk(b => b.box(0, -0.12, S.len + 0.08, S.w * 0.98, 0.14, 0.12, 0x2a2c30), 0),
      hood: mk(b => b.box(0, S.h / 2 - 0.02, S.len * 0.62, S.w * 0.86, 0.04, S.len * 0.3, paint), 0),
      wing: S.wing ? mk(b => { b.box(0, S.h / 2 + 0.38, -S.len + 0.2, S.w, 0.04, 0.2, paint); for (const sx of [-0.6, 0.6]) b.box(sx * S.w, S.h / 2 + 0.2, -S.len + 0.22, 0.05, 0.18, 0.06, 0x222222) }, 0) : null,
      bar: S.bar ? mk(b => { b.box(0, 0.05, S.len + 0.25, S.w * 0.85, 0.07, 0.07, 0x9aa0a8); b.box(0, 0.3, S.len + 0.25, S.w * 0.85, 0.07, 0.07, 0x9aa0a8); for (const sx of [-0.7, 0.7]) b.box(sx * S.w, 0.18, S.len + 0.25, 0.06, 0.2, 0.06, 0x9aa0a8) }, 0) : null,
      mirrorL: mk(b => b.box(S.w + 0.1, S.h / 2 + 0.15, S.cabBack + S.cabLen * 0.8, 0.1, 0.07, 0.1, paint), 0),
      mirrorR: mk(b => b.box(-S.w - 0.1, S.h / 2 + 0.15, S.cabBack + S.cabLen * 0.8, 0.1, 0.07, 0.1, paint), 0)
    }
    this.lost = new Set()

    // 灯火
    const lights = new Builder()
    for (const sx of [-0.68, 0.68]) lights.box(sx * S.w, 0.05, S.len + 0.01, 0.2, 0.07, 0.03, 0xfff6d8)
    this.head = new THREE.Mesh(lights.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }))
    this.group.add(this.head)
    const tail = new Builder()
    for (const sx of [-0.7, 0.7]) tail.box(sx * S.w, 0.12, -S.len - 0.01, 0.22, 0.07, 0.03, 0xffffff)
    this.tailMat = new THREE.MeshBasicMaterial({ color: 0x661010 })
    this.group.add(new THREE.Mesh(tail.geometry(), this.tailMat))

    // 車輪
    this.wheels = []
    const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 14).rotateZ(Math.PI / 2)
    const wm = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 })
    const hub = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.7, roughness: 0.3 })
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const pivot = new THREE.Group()
      pivot.position.set(sx * (S.w - 0.05), -0.17, sz * (S.len - 0.62))
      const w = new THREE.Mesh(wg, wm)
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8).rotateZ(Math.PI / 2), hub)
      w.add(h)
      w.castShadow = true
      pivot.add(w)
      this.group.add(pivot)
      this.wheels.push({ pivot, w, front: sz > 0, rest: pivot.position.y, side: sx })
    }

    // ブーストの炎
    this.flames = []
    const fm = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    for (const sx of [-0.4, 0.4]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.7), fm)
      f.position.set(sx * S.w, -0.05, -S.len - 0.05)
      f.visible = false
      this.group.add(f)
      this.flames.push(f)
    }
    this.spin = 0
    this.dentCount = 0
  }

  // 凹みを頂点に反映する（凹みが増えたときだけ）
  applyDents(dents) {
    if (dents.length === this.dentCount) return
    this.dentCount = dents.length
    const S = this.S
    const p = this.body.geometry.attributes.position
    const a = p.array
    a.set(this.base)
    for (const d of dents) {
      const l = Math.hypot(d.x, d.z) || 1
      const dx = d.x / l, dz = d.z / l
      // 当たった点は、車の輪郭（楕円）の上
      const hx = dx * S.w * 1.05, hz = dz * S.len * 1.02
      const r = 1.0 + d.s * 0.6
      const depth = 0.18 + d.s * 0.6
      for (let i = 0; i < p.count; i++) {
        const x = a[i * 3], z = a[i * 3 + 2]
        const dist = Math.hypot(x - hx, z - hz)
        if (dist > r) continue
        const k = (1 - dist / r) ** 2 * depth
        a[i * 3] -= dx * k
        a[i * 3 + 2] -= dz * k
        a[i * 3 + 1] -= k * 0.25
      }
    }
    p.needsUpdate = true
    this.body.geometry.computeVertexNormals()
  }

  // 損傷で外れる部品。外れた部品は fx 側で飛ばすので、外れた瞬間の部品を返す
  updateParts(dmg) {
    // 車体が傷むほど塗装がくすみ、煤ける
    const k = 0.45 + 0.55 * Math.max(0, Math.min(1, dmg.body))
    if (Math.abs(this.body.material.color.r - k) > 0.01) this.body.material.color.setRGB(k, k * 0.97, k * 0.95)
    const out = []
    const rules = [['mirrorL', 0.85], ['bumper', 0.7], ['mirrorR', 0.6], ['bar', 0.55], ['hood', 0.45], ['wing', 0.3]]
    for (const [k, th] of rules) {
      const m = this.parts[k]
      if (!m || this.lost.has(k)) continue
      if (dmg.body < th) { this.lost.add(k); m.visible = false; out.push(m) }
    }
    return out
  }

  resetParts() {
    for (const k of Object.keys(this.parts)) if (this.parts[k]) this.parts[k].visible = true
    this.lost.clear()
  }

  // 毎フレーム: 位置・姿勢・車輪・灯火・炎
  update(state, dt, { steer = 0, braking = false, boosting = false } = {}) {
    const g = this.group
    g.position.set(state.x, state.y, state.z)
    g.rotation.set(-state.pitch, state.yaw, state.roll)
    const v = Math.hypot(state.vx, state.vz)
    const fwd = state.vx * Math.sin(state.yaw) + state.vz * Math.cos(state.yaw)
    this.spin += fwd * dt / 0.38
    for (const w of this.wheels) {
      w.w.rotation.x = this.spin
      if (w.front) w.pivot.rotation.y = -steer * 0.45
      // 空中ではタイヤが垂れる
      const drop = state.grounded ? 0 : 0.12
      w.pivot.position.y += (w.rest - drop - w.pivot.position.y) * Math.min(1, dt * 10)
    }
    this.tailMat.color.setHex(braking ? 0xff2a2a : 0x661010)
    for (const f of this.flames) {
      f.visible = boosting
      if (boosting) { const s = 0.8 + Math.random() * 0.5; f.scale.set(1, 1, s) }
    }
    return v
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose() })
  }
}
