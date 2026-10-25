// コースの見た目を作る。形はすべてコードで組む（外部モデルなし）。
import * as THREE from 'three'
import { Builder, windowTexture, textTexture } from './geo.js'
import { terrain, toWorld, slabTop, BOUNDS, CANYON } from '../shared/track.js'
import { DESTRUCT } from '../shared/config.js'

const PAL = {
  grass: 0x6f9a4a, grass2: 0x86ab55, dirt: 0x9a7a52, rock: 0x8a6a55, rockDark: 0x5e4a3f, city: 0x8a8e94,
  asphalt: 0x3b3f46, dirtRoad: 0x8c6c45, line: 0xf4f1e6, concrete: 0xb8b4ab, metal: 0xc9ced6
}
const BUILD_COLORS = [0xd9c7a8, 0xc7d0d9, 0xe0b49a, 0xa8b8c4, 0xd8d2c0, 0xb7a99a, 0x9fb3a1, 0xe3d9c6]

export function buildScene(scene, world) {
  const root = new THREE.Group()
  scene.add(root)
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 })
  const winTex = windowTexture()
  const buildingMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: winTex, roughness: 0.85 })

  // ---------------------------------------- 地形
  {
    const X0 = BOUNDS.x0 - 90, X1 = BOUNDS.x1 + 90, Z0 = BOUNDS.z0 - 90, Z1 = BOUNDS.z1 + 90
    const S = 4
    const nx = Math.ceil((X1 - X0) / S), nz = Math.ceil((Z1 - Z0) / S)
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz)
    g.rotateX(-Math.PI / 2)
    g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2)
    const p = g.attributes.position
    const cols = new Float32Array(p.count * 3)
    const c = new THREE.Color(), c2 = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      const h = terrain(x, z)
      p.setY(i, h)
      const hx = terrain(x + 2, z) - terrain(x - 2, z), hz = terrain(x, z + 2) - terrain(x, z - 2)
      const slope = Math.hypot(hx, hz) / 4
      const inCanyon = x > CANYON.x0 - 8 && x < CANYON.x1 + 8 && z > CANYON.z0 - 8 && z < CANYON.z1 + 8 && h < -3
      if (z < 626 && x > BOUNDS.x0 && x < BOUNDS.x1 && h < 2) c.set(z < 346 ? PAL.city : 0x9b9585)
      else if (inCanyon) c.set(PAL.rock).lerp(c2.set(PAL.rockDark), Math.min(1, -h / 70))
      else if (slope > 0.9) c.set(PAL.rock)
      else {
        c.set(PAL.grass).lerp(c2.set(PAL.grass2), (Math.sin(x * 0.05) * Math.cos(z * 0.04) + 1) / 2)
        if (h > 30) c.lerp(c2.set(0x9aa29a), Math.min(1, (h - 30) / 40))
      }
      // 地面の小さな揺らぎ
      const n = (Math.sin(x * 1.7 + z * 0.3) * Math.sin(z * 1.3 - x * 0.2)) * 0.04
      cols[i * 3] = c.r + n; cols[i * 3 + 1] = c.g + n; cols[i * 3 + 2] = c.b + n
    }
    for (const d of world.dirt) for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) { c.set(PAL.dirt); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b }
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
    m.receiveShadow = true
    root.add(m)
  }

  // ---------------------------------------- 道路（地形に沿う帯）
  {
    const b = new Builder()
    const lines = new Builder()
    const hAt = (x, z) => terrain(x, z)
    let lift = 0.06
    for (const r of world.roads) {
      lift += 0.004
      const col = r.surf === 'dirt' ? PAL.dirtRoad : PAL.asphalt
      const pts = r.pts
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
        const L = Math.hypot(bx - ax, bz - az)
        const n = Math.max(1, Math.ceil(L / 4))
        const dx = (bx - ax) / L, dz = (bz - az) / L
        const px = -dz * r.w / 2, pz = dx * r.w / 2
        // 角は少しはみ出させて継ぎ目を隠す
        const ext = r.w / 2
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n
          const x0 = ax + (bx - ax) * t0 - (k === 0 ? dx * ext : 0), z0 = az + (bz - az) * t0 - (k === 0 ? dz * ext : 0)
          const x1 = ax + (bx - ax) * t1 + (k === n - 1 ? dx * ext : 0), z1 = az + (bz - az) * t1 + (k === n - 1 ? dz * ext : 0)
          const q = (x, z) => [x, hAt(x, z) + lift, z]
          const A = q(x0 + px, z0 + pz), B = q(x0 - px, z0 - pz), C = q(x1 - px, z1 - pz), D = q(x1 + px, z1 + pz)
          // 谷の上（地形がずっと下）には帯を描かない
          if (A[1] < -3 || B[1] < -3 || C[1] < -3 || D[1] < -3) continue
          b.tri(A, B, C, col); b.tri(A, C, D, col)
          // 中央の破線（舗装路だけ）
          if (r.surf === 'road' && r.w >= 12 && k % 2 === 0) {
            const lw = 0.18
            const lx = -dz * lw, lz = dx * lw
            const mx0 = (x0 + x1) / 2 - dx * 1.2, mz0 = (z0 + z1) / 2 - dz * 1.2
            const mx1 = (x0 + x1) / 2 + dx * 1.2, mz1 = (z0 + z1) / 2 + dz * 1.2
            const e = 0.02
            const a2 = [mx0 + lx, hAt(mx0, mz0) + lift + e, mz0 + lz], b2 = [mx0 - lx, hAt(mx0, mz0) + lift + e, mz0 - lz]
            const c2 = [mx1 - lx, hAt(mx1, mz1) + lift + e, mz1 - lz], d2 = [mx1 + lx, hAt(mx1, mz1) + lift + e, mz1 + lz]
            lines.tri(a2, b2, c2, PAL.line); lines.tri(a2, c2, d2, PAL.line)
          }
        }
      }
    }
    const rm = new THREE.Mesh(b.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    rm.receiveShadow = true
    root.add(rm)
    root.add(new THREE.Mesh(lines.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })))
  }

  // ---------------------------------------- 板（橋・高架・ジャンプ台）
  const plankMeshes = []
  {
    const b = new Builder()
    for (const sl of world.slabs) {
      if (sl.needs) continue // 倒れた鉄塔そのものが板になる
      const top = sl.surf === 'wood' ? 0xc49a5c : sl.surf === 'dirt' ? PAL.dirt : PAL.asphalt
      const side = sl.surf === 'wood' ? 0x9c7342 : sl.surf === 'dirt' ? 0x7d6143 : PAL.concrete
      const P = (u, v, y) => { const w = toWorld(sl, u, v); return [w.x, y, w.z] }
      const t0 = sl.y0, t1 = sl.y1, th = sl.thick
      b.hexa([
        P(-sl.hw, -sl.hl, t0 - th), P(sl.hw, -sl.hl, t0 - th), P(sl.hw, sl.hl, t1 - th), P(-sl.hw, sl.hl, t1 - th),
        P(-sl.hw, -sl.hl, t0), P(sl.hw, -sl.hl, t0), P(sl.hw, sl.hl, t1), P(-sl.hw, sl.hl, t1)
      ], side, { top })
      // 舗装の板には白線
      if (sl.surf === 'road' && sl.hw >= 5) for (const su of [-sl.hw + 0.5, sl.hw - 0.5]) {
        const a = toWorld(sl, su, -sl.hl), c = toWorld(sl, su, sl.hl)
        b.box((a.x + c.x) / 2, (t0 + t1) / 2 + 0.02, (a.z + c.z) / 2, 0.12, 0.02, sl.hl, PAL.line, sl.yaw)
      }
      if (sl.kind === 'kicker') { // 黄黒の縁
        const e = toWorld(sl, 0, sl.hl - 0.3)
        b.box(e.x, t1 - 0.05, e.z, sl.hw, 0.1, 0.3, 0xf2c230, sl.yaw)
      }
      if (sl.kind === 'mound') for (let i = 0; i < 18; i++) {
        const u = (Math.sin(i * 7.1) * 0.9) * sl.hw, v = (Math.cos(i * 3.3) * 0.9) * sl.hl
        const w = toWorld(sl, u, v)
        b.box(w.x, slabTop(sl, v) + 0.2, w.z, 0.6 + (i % 3) * 0.3, 0.35, 0.5, 0x8a6a48, i)
      }
    }
    const m = new THREE.Mesh(b.geometry(), vc)
    m.castShadow = true; m.receiveShadow = true
    root.add(m)
  }

  // ---------------------------------------- 壊れない箱（建物・壁・柵）
  {
    const bld = new Builder(), other = new Builder()
    let k = 0
    for (const o of world.colliders) {
      if (o.slab || o.kind === 'bound' || o.kind === 'pylon') continue
      const cy = o.y0 + o.h / 2
      if (o.kind === 'building') {
        const color = BUILD_COLORS[(k++ * 5) % BUILD_COLORS.length]
        bld.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, color, o.yaw, { top: 0x7c7f86, uvScale: 4.5 })
        // 屋上の箱
        other.box(o.cx + o.hw * 0.3, o.y0 + o.h + 0.8, o.cz - o.hl * 0.2, Math.min(3, o.hw * 0.3), 0.8, Math.min(2.5, o.hl * 0.25), 0x9a9da3, 0)
      } else if (o.kind === 'whouse') other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, 0x7d8b99, o.yaw, { top: 0x5d6873 })
      else if (o.kind === 'rail') {
        // ガードレール: 支柱と横板
        const len = Math.max(o.hw, o.hl)
        const along = o.hl > o.hw
        other.box(o.cx, o.y0 + o.h * 0.75, o.cz, o.hw, 0.18, o.hl, PAL.metal, o.yaw)
        for (let t = -len; t <= len; t += 4) {
          other.box(o.cx + (along ? 0 : t), o.y0 + o.h * 0.4, o.cz + (along ? t : 0), 0.08, o.h * 0.4, 0.08, 0x8b9099, 0)
        }
      } else if (o.kind === 'pillar') other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, PAL.concrete, o.yaw)
      else if (o.kind === 'container') {
        const cc = [0xc0392b, 0x2a6fb0, 0x2e8b57, 0xd4882b][k++ % 4]
        other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, cc, o.yaw)
        for (let t = -o.hl + 0.5; t < o.hl; t += 1) other.box(o.cx + o.hw + 0.02, cy, o.cz + t, 0.03, o.h / 2 - 0.1, 0.12, cc, 0, { shade: false })
      } else if (o.kind === 'rock') {
        other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, 0x7f746a, o.yaw)
        other.box(o.cx + 0.4, o.y0 + o.h * 0.9, o.cz - 0.3, o.hw * 0.6, o.h * 0.25, o.hl * 0.6, 0x8d8378, o.yaw + 0.5)
      } else if (o.kind === 'sidewall') other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, 0xa9a59c, o.yaw)
      else other.box(o.cx, cy, o.cz, o.hw, o.h / 2, o.hl, 0xa3a09a, o.yaw)
    }
    const bm = new THREE.Mesh(bld.geometry(), buildingMat)
    bm.castShadow = true; bm.receiveShadow = true
    root.add(bm)
    const om = new THREE.Mesh(other.geometry(), vc)
    om.castShadow = true; om.receiveShadow = true
    root.add(om)
  }

  // ---------------------------------------- 崩れた橋の主塔・ケーブル・垂れ下がった残骸（見た目だけ）
  {
    const b = new Builder()
    const steel = 0xb5442e, conc = 0xaaa59b
    for (const z of [650, 776]) {
      const base = z === 650 ? 0 : -4
      for (const sx of [-9.2, 9.2]) {
        b.box(sx, base - 20, z, 1.2, 50, 1.2, conc)       // 谷底からの柱
        b.box(sx, base + 34, z, 0.9, 4, 0.9, steel)
      }
      b.box(0, base + 37, z, 10.1, 0.8, 0.8, steel)      // 門
      b.box(0, base + 26, z, 10.1, 0.5, 0.5, steel)
    }
    // ケーブル（主塔から板へ）。切れた側は垂れ下がる
    const cable = (x, y0, z0, y1, z1) => {
      const n = 10
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n
        const ya = y0 + (y1 - y0) * t0 - Math.sin(t0 * Math.PI) * 4, yb = y0 + (y1 - y0) * t1 - Math.sin(t1 * Math.PI) * 4
        const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1
        const len = Math.hypot(yb - ya, zb - za) / 2
        const ang = Math.atan2(yb - ya, zb - za)
        const g = new Builder(); g.box(0, 0, 0, 0.12, 0.12, len, 0x2b2e33)
        const geo = g.geometry()
        geo.rotateX(-ang); geo.translate(x, (ya + yb) / 2, (za + zb) / 2)
        const p = geo.attributes.position.array, nn = geo.attributes.normal.array, cc = geo.attributes.color.array
        for (let k = 0; k < p.length; k += 3) { b.pos.push(p[k], p[k + 1], p[k + 2]); b.nor.push(nn[k], nn[k + 1], nn[k + 2]); b.col.push(cc[k], cc[k + 1], cc[k + 2]); b.uv.push(0.01, 0.01) }
      }
    }
    for (const sx of [-8.6, 8.6]) {
      cable(sx, 37, 650, 1, 686)          // 手前の塔から跳ね上がった端へ
      cable(sx, 37, 650, -60, 704)        // 切れて谷へ垂れたケーブル
      cable(sx, 33, 776, 0, 752)          // 奥の塔から着地側へ
      cable(sx, 33, 776, -55, 735)
    }
    // 垂れ下がった板の残骸（谷側へ傾いた板）
    const hang = (z, y, tilt, len, dir) => {
      const g = new Builder(); g.box(0, 0, 0, 6.5, 0.9, len, 0x6f6a62, 0, { top: 0x3b3f46 })
      const geo = g.geometry(); geo.translate(0, 0, dir * len); geo.rotateX(tilt * dir); geo.translate(0, y, z)
      const p = geo.attributes.position.array, nn = geo.attributes.normal.array, cc = geo.attributes.color.array
      for (let k = 0; k < p.length; k += 3) { b.pos.push(p[k], p[k + 1], p[k + 2]); b.nor.push(nn[k], nn[k + 1], nn[k + 2]); b.col.push(cc[k], cc[k + 1], cc[k + 2]); b.uv.push(0.01, 0.01) }
    }
    hang(691, -2.4, 1.15, 7, 1)
    hang(749, -2.6, 1.2, 8, -1)
    // 鉄筋の飛び出し
    for (let i = -6; i <= 6; i += 1.5) { b.box(i, 1.2, 691, 0.06, 0.06, 1.6, 0x5a3a2a, 0); b.box(i, -0.6, 749.2, 0.06, 0.06, 1.4, 0x5a3a2a, 0) }
    const m = new THREE.Mesh(b.geometry(), vc)
    m.castShadow = true
    root.add(m)
  }

  // ---------------------------------------- 木・残骸
  {
    const trunk = new Builder(), leaf = new Builder()
    const isClear = (x, z) => {
      if (world.surfaceAt(x, z) !== 'grass') return false
      for (const o of world.nearby(x, z)) if (Math.abs(x - o.cx) < o.hw + 3 && Math.abs(z - o.cz) < o.hl + 3) return false
      const h = terrain(x, z)
      return h > -2
    }
    for (const d of world.decor) {
      if (d.kind === 'tree') {
        if (!isClear(d.x, d.z)) continue
        // 道から少し離す
        let near = false
        for (const s of world.segs) { const dd = Math.hypot(d.x - (s.ax + s.bx) / 2, d.z - (s.az + s.bz) / 2); if (dd < 2) { near = true; break } }
        if (near) continue
        const h = terrain(d.x, d.z), s = d.s
        trunk.box(d.x, h + 1.2 * s, d.z, 0.25 * s, 1.2 * s, 0.25 * s, 0x6b4a2f)
        leaf.box(d.x, h + 3.4 * s, d.z, 1.6 * s, 1.3 * s, 1.6 * s, 0x3f7a3a, d.x)
        leaf.box(d.x, h + 4.9 * s, d.z, 1.05 * s, 0.9 * s, 1.05 * s, 0x4d8c43, d.x + 1)
      } else if (d.kind === 'debris') {
        for (let i = 0; i < 6; i++) trunk.box(d.x + Math.sin(i * 2) * d.s, d.y + (i % 3), d.z + Math.cos(i * 3) * d.s, 2 + i % 2, 0.8, 3, PAL.concrete, i)
      }
    }
    for (const [m] of [[new THREE.Mesh(trunk.geometry(), vc)], [new THREE.Mesh(leaf.geometry(), vc)]]) { m.castShadow = true; m.receiveShadow = true; root.add(m) }
  }

  // ---------------------------------------- 遠景の山（外周より外）
  {
    const b = new Builder()
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2
      const r = 1100 + (i % 5) * 60
      const cx = -35 + Math.cos(a) * r * 0.55, cz = 580 + Math.sin(a) * r
      const h = 110 + (i * 37 % 7) * 25
      const w = 140 + (i % 3) * 40
      b.tri([cx - w, -5, cz], [cx + w, -5, cz], [cx, h, cz + 10], 0x6a7d8c)
      b.tri([cx + w, -5, cz], [cx - w, -5, cz], [cx, h, cz + 10], 0x5b6d7b)
    }
    root.add(new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })))
  }

  // ---------------------------------------- チェックポイントの門
  const gates = []
  world.gates.forEach((g, i) => {
    const grp = new THREE.Group()
    const isGoal = i === world.gates.length - 1
    const w = 16
    const x = g.respawn.x
    const h0 = world.groundAt(x, g.z, 50).h
    const postM = new THREE.MeshStandardMaterial({ color: isGoal ? 0xffffff : 0x1f2633, roughness: 0.6 })
    for (const sx of [-w / 2, w / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), postM)
      p.position.set(x + sx, h0 + 3.5, g.z)
      p.castShadow = true
      grp.add(p)
    }
    const tex = isGoal ? checkerTexture() : textTexture(g.name, { bg: '#ff5a1f', fg: '#fff', font: 'bold 56px sans-serif' })
    const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.6, 0.3), [postM, postM, postM, postM, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })])
    banner.position.set(x, h0 + 7, g.z)
    grp.add(banner)
    // 光る帯（次に通る門だけ光らせる）
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(g.x1 - g.x0, 1.2), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }))
    beam.position.set((g.x0 + g.x1) / 2, h0 + 0.7, g.z)
    grp.add(beam)
    root.add(grp)
    gates.push({ grp, beam })
  })

  // ---------------------------------------- 看板（ルートの案内）
  const signs = [
    { x: 0, z: 116, t: 'ROAD CLOSED', yaw: Math.PI, y: 0, stripes: true },
    { x: 0, z: 405, t: 'NO ENTRY', yaw: Math.PI, y: 0, stripes: true },
    { x: 0, z: 626, t: 'BRIDGE OUT', yaw: Math.PI, y: 0, stripes: true },
    { x: -14, z: 632, t: '< DETOUR', yaw: Math.PI, y: 0 },
    { x: 0, z: 872, t: 'MINE ROAD', yaw: Math.PI, y: 0, stripes: true },
    { x: 56, z: 358, t: 'UNDER CONSTRUCTION', yaw: Math.PI, y: 4 }
  ]
  for (const s of signs) {
    const tex = textTexture(s.t, { stripes: s.stripes, w: 512, h: 128, font: 'bold 54px sans-serif' })
    const h0 = terrain(s.x, s.z) + s.y
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }))
    m.position.set(s.x, h0 + 5.5, s.z); m.rotation.y = s.yaw
    root.add(m)
    for (const sx of [-3.6, 3.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x555b63 }))
      p.position.set(s.x + sx * Math.cos(s.yaw), h0 + 2.75, s.z)
      root.add(p)
    }
  }

  // ---------------------------------------- 修理ピット
  for (const r of world.repair) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2
    const h0 = terrain(cx, cz)
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: textTexture('PIT', { bg: '#1d6fd1', fg: '#fff', w: 256, h: 256, font: 'bold 96px sans-serif' }), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -6 }))
    pad.position.set(cx, h0 + 0.12, cz)
    root.add(pad)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.4, r.z1 - r.z0), new THREE.MeshStandardMaterial({ color: 0x2b78d6, roughness: 0.6 }))
    roof.position.set(cx, h0 + 6, cz); roof.castShadow = true
    root.add(roof)
    for (const [sx, sz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), new THREE.MeshStandardMaterial({ color: 0xdddddd }))
      p.position.set(sx, h0 + 3, sz); root.add(p)
    }
  }

  return { root, gates, plankMeshes }
}

function checkerTexture() {
  const cv = document.createElement('canvas')
  cv.width = 256; cv.height = 32
  const g = cv.getContext('2d')
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16) }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  return t
}

// ======================================== 壊せる物
// 1物体 = 1メッシュ（色を頂点に焼く）。壊れたら非表示にして、破片か倒れる動きに置き換える
export function propGeometry(type) {
  const d = DESTRUCT[type]
  const b = new Builder()
  const W = d.w / 2, L = d.l / 2, H = d.h
  switch (type) {
    case 'cone':
      b.box(0, 0.03, 0, 0.32, 0.03, 0.32, 0x222222)
      b.box(0, 0.35, 0, 0.18, 0.3, 0.18, 0xff7a1a)
      b.box(0, 0.45, 0, 0.19, 0.06, 0.19, 0xffffff)
      break
    case 'barricade':
      for (const sx of [-W + 0.2, W - 0.2]) b.box(sx, 0.5, 0, 0.08, 0.5, 0.25, 0x666666)
      for (let i = 0; i < 6; i++) b.box(-W + 0.25 + i * (2 * W - 0.5) / 6 + (2 * W - 0.5) / 12, 0.85, 0, (2 * W - 0.5) / 12, 0.18, 0.06, i % 2 ? 0xffffff : 0xe8432e)
      b.box(0, 0.45, 0, W, 0.06, 0.05, 0xffffff)
      break
    case 'fence':
      b.box(0, 0.5, 0, W, 0.07, 0.06, 0x8a5c33); b.box(0, 1.05, 0, W, 0.07, 0.06, 0x8a5c33)
      for (let x = -W + 0.2; x <= W; x += 0.5) b.box(x, 0.7, 0, 0.09, 0.7, 0.04, 0xa8784a)
      break
    case 'tempfence':
      b.box(0, 0.1, 0, W, 0.1, 0.25, 0x555555)
      b.box(0, H / 2, 0, W - 0.1, H / 2 - 0.05, 0.03, 0x8aa0b0)
      for (const sx of [-W, 0, W]) b.box(sx * 0.98, H / 2, 0, 0.05, H / 2, 0.05, 0xbfc6cc)
      b.box(0, 1.0, 0.04, W * 0.6, 0.35, 0.01, 0xf2c230)
      break
    case 'sign':
      b.box(0, 1.0, 0, 0.06, 1.0, 0.06, 0x666b72)
      b.box(0, 2.0, 0, W, 0.55, 0.05, 0x2e8bd8, 0, { top: 0xffffff })
      b.box(0, 2.0, 0.06, W * 0.8, 0.12, 0.01, 0xffffff)
      break
    case 'lamp':
      b.box(0, 0.15, 0, 0.25, 0.15, 0.25, 0x555b63)
      b.box(0, H / 2, 0, 0.1, H / 2, 0.1, 0x6d7480)
      b.box(0, H - 0.1, 0.6, 0.08, 0.06, 0.6, 0x6d7480)
      b.box(0, H - 0.22, 1.1, 0.22, 0.08, 0.3, 0xfff3c4)
      break
    case 'lumber':
      for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - (row % 2); i++)
        b.box(-W + 0.45 + i * 0.8 + (row % 2) * 0.4, 0.2 + row * 0.38, 0, 0.36, 0.18, L, row % 2 ? 0xc4904f : 0xb47f42)
      break
    case 'guardrail':
      b.box(0, 0.65, 0, W, 0.17, 0.05, 0xc9ced6)
      for (const sx of [-W + 0.2, 0, W - 0.2]) b.box(sx, 0.4, -0.08, 0.07, 0.4, 0.07, 0x8b9099)
      break
    case 'wall':
      for (let row = 0; row < 10; row++) for (let i = 0; i < 8; i++)
        b.box(-W + 1 + i * 2 + (row % 2 ? 0.5 : -0.5), 0.3 + row * 0.6, 0, 0.97, 0.28, L, (row * 3 + i) % 4 ? 0xa65a3f : 0x8f4b35)
      b.box(0, H + 0.2, 0, W, 0.2, L + 0.1, 0x6b5a4c)
      break
    case 'tower': {
      // 工事用の鉄塔（格子）
      const s = W
      for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) b.box(x * 0.9, H / 2, z * 0.9, 0.15, H / 2, 0.15, 0xe0a020)
      for (let y = 2; y < H; y += 3) {
        b.box(0, y, -s * 0.9, s, 0.08, 0.08, 0xd09018); b.box(0, y, s * 0.9, s, 0.08, 0.08, 0xd09018)
        b.box(-s * 0.9, y, 0, 0.08, 0.08, s, 0xd09018); b.box(s * 0.9, y, 0, 0.08, 0.08, s, 0xd09018)
      }
      b.box(0, H, 0, s + 0.3, 0.3, s + 0.3, 0xe8432e)
      // 南面の足場板。倒れるとこの面が上になり、細い橋の路面になる
      for (let y = 1; y < H; y += 1.2) b.box(0, y, -s - 0.08, 1.6, 0.55, 0.06, y % 2.4 < 1.2 ? 0xc49a5c : 0xb08850)
      break
    }
  }
  return b.geometry()
}
