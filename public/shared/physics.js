// 車の挙動。アーケード寄りの自前物理（4輪の接地点で姿勢を決め、速度を路面に沿わせる）。
// three.js に依存しないので、ブラウザ（自車）とサーバー/オフライン（CPU車・検証）で同じものが動く。
// 固定ステップ（GAME.step）で呼ぶこと。

import { GAME, PHYS, DAMAGE, buildStats } from './config.js'
import { surfaceDef } from './track.js'

const WX = 0.85, WZ = 1.35       // 車輪の位置（左右・前後の半分）
const WHEELS = [[WX, WZ], [-WX, WZ], [WX, -WZ], [-WX, -WZ]] // 左前 右前 左後 右後（+x が左）
const clamp = (v, a, b) => v < a ? a : v > b ? b : v

export function createCar({ id, name = '', carId = 'runner', levels = {}, paint = null, spawn, bot = false }) {
  const stats = buildStats(carId, levels)
  const c = {
    id, name, bot, carId: stats.car, levels, paint, stats,
    x: spawn.x, y: 0, z: spawn.z, vx: 0, vy: 0, vz: 0,
    yaw: spawn.yaw, pitch: 0, roll: 0, wp: 0, wr: 0,
    grounded: true, airTime: 0, lastAir: 0, surf: 'road',
    boost: 1, boostLock: false, boosting: false, heat: 0, overheat: false,
    dmg: { body: 1, engine: 1, tires: 1, susp: 1, cool: 1 },
    dents: [],
    wreck: 0, freeze: 0, falling: false,
    respawnPoint: { ...spawn },
    drifting: false, slip: 0, repairing: false,
    breaks: 0, maxAir: 0, t: 0,
    events: []
  }
  c.y = PHYS.rideHeight
  return c
}

export function speedOf(c) { return Math.hypot(c.vx, c.vz) }

// 車体の向き（YXZ の順のオイラー角）から前と上のベクトル
export function basis(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const ca = Math.cos(-pitch), sa = Math.sin(-pitch)
  const cr = Math.cos(roll), sr = Math.sin(roll)
  return {
    fx: sy * ca, fy: -sa, fz: cy * ca,
    ux: -cy * sr + sy * sa * cr, uy: ca * cr, uz: sy * sr + cy * sa * cr
  }
}

export function respawn(c, { repair = false } = {}) {
  const p = c.respawnPoint
  c.x = p.x; c.z = p.z; c.y = PHYS.rideHeight + (p.y || 0)
  c.vx = c.vy = c.vz = 0
  c.yaw = p.yaw; c.pitch = 0; c.roll = 0; c.wp = 0; c.wr = 0
  c.grounded = true; c.airTime = 0; c.falling = false
  if (repair) { for (const k in c.dmg) c.dmg[k] = Math.max(c.dmg[k], GAME.wreckRepairTo); c.dents.length = 0 }
  c.wreck = 0
  c.freeze = GAME.respawnFreezeSec
  c.boostLock = false
  c.boost = Math.max(c.boost, 0.4)
  c.events.push({ t: 'respawn', repair })
}

function damage(c, amount, parts, kind) {
  if (amount <= 0) return 0
  const a = amount / c.stats.durability
  for (const [k, w] of Object.entries(parts)) c.dmg[k] = Math.max(0, c.dmg[k] - a * w)
  if (c.dmg.body <= 0 && !c.wreck) {
    c.wreck = GAME.wreckRespawnSec
    c.events.push({ t: 'wreck', kind })
  }
  return a
}

// 1ステップ進める。world は track.createWorld()、others は他の車（押し合いだけ）
export function step(c, inp, dt, world, others = null) {
  const S = c.stats, d = c.dmg
  c.t += dt
  c.repairing = false

  // 大破・落下中は待つだけ
  if (c.wreck > 0) {
    c.wreck -= dt
    c.vx *= 0.97; c.vz *= 0.97; c.vy -= PHYS.gravity * dt
    c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt
    const g = world.groundAt(c.x, c.z, c.y - PHYS.rideHeight)
    if (c.y < g.h + PHYS.rideHeight && !c.falling) { c.y = g.h + PHYS.rideHeight; c.vy = 0 }
    if (c.wreck <= 0) respawn(c, { repair: true })
    return
  }
  if (c.freeze > 0) { c.freeze -= dt; c.vx = c.vy = c.vz = 0; regen(c, dt, false); return }
  if (inp.respawn) { respawn(c); return }

  // 性能（損傷とオーバーヒートで落ちる）
  const hot = c.overheat
  const maxSpd = S.maxSpeed * (0.6 + 0.4 * d.engine) * (hot ? 0.82 : 1)
  const accel = S.accel * (0.5 + 0.5 * d.engine) * (hot ? 0.75 : 1)
  const grip = S.grip * (0.55 + 0.45 * d.tires)
  const steerK = S.steer * (0.7 + 0.3 * d.tires)
  const boosting = !!inp.boost && c.boost > 0 && !c.boostLock && !hot
  c.boosting = boosting

  // ---- 4輪の接地
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw)
  const base = c.y - PHYS.rideHeight
  const hs = [], surfs = []
  let contacts = 0
  for (const [lx, lz] of WHEELS) {
    const wx = c.x + lx * cy + lz * sy, wz = c.z - lx * sy + lz * cy
    const g = world.groundAt(wx, wz, base)
    // 地面が無い（谷の上など）輪は少し下にあるとみなす。そこへ傾いていく
    hs.push(Math.max(g.h, base - 1.6))
    surfs.push(g.surf)
    if (base - g.h < PHYS.suspTravel) contacts++
  }

  let gripMul = 1, rollMul = 1, surfName = c.surf
  if (contacts >= 2) {
    const hF = (hs[0] + hs[1]) / 2, hR = (hs[2] + hs[3]) / 2
    const hL = (hs[0] + hs[2]) / 2, hRt = (hs[1] + hs[3]) / 2
    const tP = clamp(Math.atan2(hF - hR, 2 * WZ), -0.7, 0.7)
    const tR = clamp(Math.atan2(hL - hRt, 2 * WX), -0.7, 0.7)
    const gY = (hs[0] + hs[1] + hs[2] + hs[3]) / 4
    // 地面の法線
    const tp = Math.tan(tP), tr = Math.tan(tR)
    let gx = sy * tp + cy * tr, gz = cy * tp - sy * tr
    let nx = -gx, ny = 1, nz = -gz
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl

    if (!c.grounded) land(c, nx, ny, nz, tP, tR)
    if (c.wreck) return
    c.grounded = true
    c.lastAir = c.airTime
    c.airTime = 0

    // 路面
    const sname = surfs.find((s, i) => base - hs[i] < PHYS.suspTravel) || 'grass'
    surfName = sname
    const sd = surfaceDef(sname)
    gripMul = sd.grip; rollMul = sd.roll

    // 高さは地面に吸い付ける（サスペンション）。壊れていると揺れる
    const ty = gY + PHYS.rideHeight
    const wob = (1 - d.susp) * Math.sin(c.t * 9) * 0.12 * Math.min(1, speedOf(c) / 30)
    if (c.y < ty) c.y = ty
    else c.y += (ty - c.y) * Math.min(1, dt * 22)
    c.y += wob * dt * 10
    c.pitch += (tP - c.pitch) * Math.min(1, dt * 14)
    c.roll += (tR + wob * 0.6 - c.roll) * Math.min(1, dt * 14)
    c.wp = 0; c.wr = 0

    // 重力を足してから、地面へめり込む向きの速度を消す（坂では下りに加速する）
    c.vy -= PHYS.gravity * dt
    let vn = c.vx * nx + c.vy * ny + c.vz * nz
    if (vn < 0) { c.vx -= nx * vn; c.vy -= ny * vn; c.vz -= nz * vn; vn = 0 }

    // ハンドル。速いほど切れにくい。バック中は逆
    const vf0 = c.vx * sy + c.vz * cy
    const av0 = Math.abs(vf0)
    const sf = clamp(av0 / 5, 0, 1) / (1 + av0 / 28)
    let yawRate = (inp.steer || 0) * steerK * sf * (vf0 < -0.5 ? -1 : 1)
    if (inp.handbrake && av0 > 6) yawRate *= 1.45
    // 壊れたサスペンションは高速でふらつく
    yawRate += (1 - d.susp) * Math.sin(c.t * 5.3) * 0.25 * Math.min(1, av0 / 35)
    c.yaw -= yawRate * dt

    // 新しい向きで、路面に沿った前と横
    const cyn = Math.cos(c.yaw), syn = Math.sin(c.yaw)
    let fx = syn, fy = 0, fz = cyn
    const fd = fx * nx + fz * nz
    fx -= nx * fd; fy -= ny * fd; fz -= nz * fd
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl
    const rx = fy * nz - fz * ny, ry = fz * nx - fx * nz, rz = fx * ny - fy * nx // 右 = 前 x 法線

    let vf = c.vx * fx + c.vy * fy + c.vz * fz
    let vl = c.vx * rx + c.vy * ry + c.vz * rz
    const vnn = c.vx * nx + c.vy * ny + c.vz * nz

    // アクセル・ブレーキ・バック
    const top = maxSpd + (boosting ? S.boostTop * (0.6 + 0.4 * d.engine) : 0)
    const thr = inp.throttle || 0, brk = inp.brake || 0
    if (thr > 0) {
      if (vf < -0.5) vf += 30 * thr * dt
      else vf += (accel * thr * Math.max(0.12, 1 - (vf / top) ** 2) + (boosting && vf < top ? S.boostForce : 0)) * dt
    }
    if (brk > 0) {
      if (vf > 0.8) vf = Math.max(0, vf - 34 * brk * dt)
      else if (thr <= 0) vf = Math.max(-14, vf - 10 * brk * dt)
    }
    if (thr <= 0 && brk <= 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 3 * dt)
    // 転がり抵抗と空気抵抗
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), (PHYS.rolling * rollMul + PHYS.aeroDrag * vf * vf) * dt)
    if (vf > top) vf -= (vf - top) * 1.4 * dt

    // 横滑り。ハンドブレーキと土・草で滑る。消えた横の勢いの大半は前へ回す（曲がっても失速しすぎない）
    const av = Math.abs(vf)
    const latGrip = grip * gripMul * (inp.handbrake ? 0.16 : 1) * (av > 32 && Math.abs(inp.steer || 0) > 0.7 ? 0.8 : 1)
    const keep = Math.exp(-latGrip * dt)
    const lost = Math.abs(vl) * (1 - keep)
    vl *= keep
    if (av > 1) vf += Math.sign(vf) * lost * (inp.handbrake ? 0.55 : 0.8)
    c.slip = Math.abs(vl)
    c.drifting = Math.abs(vl) > 3.5 && av > 10

    c.vx = fx * vf + rx * vl + nx * vnn
    c.vy = fy * vf + ry * vl + ny * vnn
    c.vz = fz * vf + rz * vl + nz * vnn
  } else {
    // ---- 空中
    if (c.grounded) { c.grounded = false; c.airTime = 0; c.events.push({ t: 'takeoff' }) }
    c.airTime += dt
    c.maxAir = Math.max(c.maxAir, c.airTime)
    c.vy -= PHYS.gravity * dt
    const v = Math.hypot(c.vx, c.vy, c.vz)
    const drag = PHYS.aeroDrag * v * dt
    c.vx -= c.vx * drag; c.vz -= c.vz * drag
    if (boosting) {
      const b = basis(c.yaw, c.pitch, c.roll)
      const k = S.boostForce * 0.7 * dt
      c.vx += b.fx * k; c.vy += b.fy * k; c.vz += b.fz * k
    }
    // 姿勢: 入力があればそれに従い、無ければ鼻先がゆっくり軌道を向く
    const airK = PHYS.airRate * S.air * (0.6 + 0.4 * d.susp)
    const hv = Math.hypot(c.vx, c.vz)
    const traj = Math.atan2(c.vy, Math.max(1, hv))
    const pi = inp.pitch || 0, ri = inp.roll || 0
    const wpT = pi ? pi * airK : (traj * 0.75 - c.pitch) * 1.1
    c.wp += (wpT - c.wp) * Math.min(1, dt * (pi ? 5 : 2.5))
    const wrT = ri ? -ri * airK : -c.roll * 1.6
    c.wr += (wrT - c.wr) * Math.min(1, dt * (ri ? 5 : 3))
    c.pitch = clamp(c.pitch + c.wp * dt, -1.45, 1.45)
    c.roll = clamp(c.roll + c.wr * dt, -1.45, 1.45)
    c.yaw -= (inp.steer || 0) * 0.9 * dt
    c.drifting = false
  }
  c.surf = surfName

  // ---- 位置
  c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt

  // ---- 壁・壊せる物・他の車
  collide(c, world, boosting)
  if (others) for (const o of others) if (o !== c && o.id !== c.id && !o.wreck) bump(c, o)

  // ---- 落下
  if (c.y < GAME.fallY && !c.wreck) {
    c.wreck = 1.4; c.falling = true
    c.events.push({ t: 'fall' })
  }

  // ---- 修理ピット
  if (c.grounded && world.inRepair(c.x, c.z) && speedOf(c) < 14) {
    for (const k in d) d[k] = Math.min(1, d[k] + 0.32 * dt)
    c.repairing = true
    if (d.body > 0.97 && c.dents.length) c.dents.length = 0
  }

  // ---- ブーストと熱
  if (boosting) {
    c.boost -= dt / S.boostCap
    c.heat += 0.16 * S.heat * (1 + 2 * (1 - d.cool)) * dt
    if (c.boost <= 0) { c.boost = 0; c.boostLock = true; c.events.push({ t: 'boostEmpty' }) }
  } else {
    c.heat -= 0.11 * (0.3 + 0.7 * d.cool) * dt
    // 冷却が死にかけると全開走行だけで熱がこもる
    if (d.cool < 0.45 && (inp.throttle || 0) > 0.9) c.heat += 0.05 * (0.45 - d.cool) * 4 * dt
  }
  c.heat = clamp(c.heat, 0, 1.05)
  if (!c.overheat && c.heat >= 1) { c.overheat = true; c.events.push({ t: 'overheat' }) }
  if (c.overheat && c.heat < 0.45) c.overheat = false
  regen(c, dt, boosting)
}

function regen(c, dt, boosting) {
  if (boosting) return
  const r = 0.035 + (c.drifting ? 0.22 : 0) + (!c.grounded ? 0.2 : 0)
  c.boost = Math.min(1, c.boost + r * dt)
  if (c.boostLock && c.boost >= 0.3) c.boostLock = false
}

// 着地。法線方向の速さと、車体と地面のずれで損傷が決まる
function land(c, nx, ny, nz, tP, tR) {
  const S = c.stats, d = c.dmg
  const vn = c.vx * nx + c.vy * ny + c.vz * nz
  const b = basis(c.yaw, c.pitch, c.roll)
  const align = clamp(b.ux * nx + b.uy * ny + b.uz * nz, -1, 1)
  const mis = Math.acos(align)
  const impact = Math.max(0, -vn)
  const safe = PHYS.safeLand * S.landing * (0.4 + 0.6 * d.susp)
  const sev = Math.max(0, impact - safe) * (1 + 2.5 * Math.max(0, mis - 0.3))
  const crash = mis > 1.1 && impact > 3
  let amount = sev > 0 ? Math.pow(sev, 1.3) * DAMAGE.landBase : 0
  if (crash) amount += 0.12 + impact * 0.006
  const dealt = damage(c, amount, { susp: 1.2, tires: 0.6, body: 0.75, engine: 0.2, cool: 0.1 }, 'land')
  if (sev > 0 || crash) {
    const keep = crash ? 0.45 : 1 - Math.min(0.45, sev * 0.02)
    c.vx *= keep; c.vz *= keep
  }
  c.events.push({ t: 'land', impact, mis, sev, crash, air: c.airTime, dmg: dealt })
  if (crash) { c.pitch = tP; c.roll = tR; c.yaw += (c.roll > 0 ? 1 : -1) * 0.6 }
}

function collide(c, world, boosting) {
  const S = c.stats
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw)
  const r = PHYS.carRadius
  const bottom = c.y - 0.45, topY = c.y + 0.95
  const base = c.y - PHYS.rideHeight
  for (const off of [PHYS.carHalfLen, -PHYS.carHalfLen]) {
    for (let pass = 0; pass < 2; pass++) {
      const px = c.x + sy * off, pz = c.z + cy * off
      let hitAny = false
      for (const o of world.nearby(px, pz)) {
        if (o.id && world.destroyed.has(o.id)) continue
        // 縦の重なり
        const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0)
        const dx = px - o.cx, dz = pz - o.cz
        const u = dx * cs - dz * sn, v = dx * sn + dz * cs
        let yb, yt
        if (o.slab) {
          if (!world.slabActive(o.slab)) continue
          const vv = clamp(v, -o.hl, o.hl)
          yt = o.slab.y0 + (o.slab.y1 - o.slab.y0) * (vv + o.hl) / (2 * o.hl)
          yb = yt - o.slab.thick
          if (yt <= base + PHYS.stepUp) continue // 乗り上げられる
        } else { yb = o.y0; yt = o.y1 }
        if (topY <= yb || bottom >= yt - 0.25) continue
        const lu = clamp(u, -o.hw, o.hw), lv = clamp(v, -o.hl, o.hl)
        let nu, nv, pen
        if (lu === u && lv === v) {
          // 中心が箱の中。いちばん浅い面から出す
          const pu = o.hw - Math.abs(u), pv = o.hl - Math.abs(v)
          if (pu < pv) { nu = Math.sign(u) || 1; nv = 0; pen = pu + r } else { nu = 0; nv = Math.sign(v) || 1; pen = pv + r }
        } else {
          const du = u - lu, dv = v - lv
          const dist = Math.hypot(du, dv)
          if (dist >= r) continue
          nu = du / dist; nv = dv / dist; pen = r - dist
        }
        const nx = nu * cs + nv * sn, nz = -nu * sn + nv * cs
        const vn = c.vx * nx + c.vz * nz
        if (o.def && vn < -0.2) {
          // 壊せる物。勢いが足りれば突き抜ける
          const power = -vn * S.mass * (boosting ? 1.15 : 1)
          if (power >= o.def.breakAt) {
            world.breakObj(o.id)
            c.breaks++
            const keep = 1 - o.def.absorb
            c.vx *= keep; c.vz *= keep
            damage(c, o.def.hard * 0.012 * Math.max(0, -vn - 8) * 0.2, { body: 1, engine: 0.3 }, 'break')
            c.events.push({ t: 'break', id: o.id, speed: -vn, x: o.cx, z: o.cz, dx: c.vx, dz: c.vz })
            continue
          }
        }
        hitAny = true
        if (vn < 0) {
          const hard = o.def ? o.def.hard : (o.kind === 'rail' ? 0.8 : o.kind === 'rock' ? 1.2 : 1.0)
          const imp = -vn
          c.vx -= nx * vn * 1.25; c.vz -= nz * vn * 1.25
          // 擦った分の摩擦
          const tx = -nz, tz = nx
          const vt = c.vx * tx + c.vz * tz
          c.vx -= tx * vt * 0.08 * Math.min(1, imp / 5); c.vz -= tz * vt * 0.08 * Math.min(1, imp / 5)
          const sev = Math.max(0, imp - DAMAGE.wallFree)
          if (sev > 0) {
            const front = -(nx * sy + nz * cy) // 1 = 正面衝突
            const amount = Math.pow(sev, 1.3) * DAMAGE.wallBase * hard * (boosting ? DAMAGE.boostMul : 1)
            const parts = front > 0.5
              ? { body: 1, engine: 0.75, cool: 0.8, tires: 0.2 }
              : { body: 1, tires: 0.6, susp: 0.45, engine: 0.15 }
            const dealt = damage(c, amount, parts, 'wall')
            // へこみの位置（車の局所座標）
            const lx = (nx * cy - nz * sy) * -1, lz = -(nx * sy + nz * cy)
            c.dents.push({ x: lx, z: lz, s: Math.min(1, sev / 25) })
            if (c.dents.length > 14) c.dents.shift()
            c.events.push({ t: 'hit', speed: imp, dmg: dealt, x: px - nx * r, y: c.y, z: pz - nz * r, front })
          } else if (imp > 1.5) c.events.push({ t: 'scrape', speed: imp })
          // かすめた角度で少し回る
          c.yaw += (nx * cy - nz * sy) * Math.min(0.4, imp * 0.012) * Math.sign(off)
        }
        c.x += nx * pen; c.z += nz * pen
      }
      if (!hitAny) break
    }
  }
}

// 車同士。自分だけを押し返す（相手は相手の側で同じ計算をする）
function bump(c, o) {
  const dx = c.x - o.x, dz = c.z - o.z
  if (Math.abs(c.y - o.y) > 2) return
  const dist = Math.hypot(dx, dz)
  const min = 2.4
  if (dist >= min || dist < 1e-4) return
  const nx = dx / dist, nz = dz / dist
  const rv = (c.vx - (o.vx || 0)) * nx + (c.vz - (o.vz || 0)) * nz
  if (rv < 0) {
    const share = (o.stats ? o.stats.mass : 1) / ((c.stats.mass) + (o.stats ? o.stats.mass : 1))
    c.vx -= nx * rv * 1.3 * share; c.vz -= nz * rv * 1.3 * share
    const sev = Math.max(0, -rv - 5)
    if (sev > 0) damage(c, Math.pow(sev, 1.3) * DAMAGE.wallBase * DAMAGE.carHit, { body: 1, tires: 0.3 }, 'car')
    if (-rv > 3) c.events.push({ t: 'carhit', speed: -rv, other: o.id })
  }
  c.x += nx * (min - dist) * 0.5; c.z += nz * (min - dist) * 0.5
}

// ネット送信・保存用（数値を丸める）
export function packCar(c) {
  const r = (v, k = 100) => Math.round(v * k) / k
  return {
    id: c.id, x: r(c.x), y: r(c.y), z: r(c.z), vx: r(c.vx), vy: r(c.vy), vz: r(c.vz),
    yaw: r(c.yaw, 1000), pitch: r(c.pitch, 1000), roll: r(c.roll, 1000),
    b: c.boosting ? 1 : 0, g: c.grounded ? 1 : 0, w: c.wreck > 0 ? 1 : 0,
    d: [c.dmg.body, c.dmg.engine, c.dmg.tires, c.dmg.susp, c.dmg.cool].map(v => r(v)),
    boost: r(c.boost), heat: r(c.heat)
  }
}
