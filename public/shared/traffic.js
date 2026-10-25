// 一般車。通りの長方形を左側通行で回る。位置はレース時刻だけで決まる（どの画面でも同じ所にいる）。
// レースの車に強く当てられると吹き飛び、数秒後に元の周回に戻る（吹き飛び方は各画面だけの演出）。
import { PHYS } from './config.js'

const LANE = 4.4 // 道の中心から左へ（18m の通りの片側車線の真ん中）

export function createTraffic(world) {
  const loops = world.trafficLoops || []
  const cars = []
  loops.forEach(([x0, z0, x1, z1], li) => {
    // 交互に回る向きを変える
    const cw = li % 2 === 0
    const pts = cw ? [[x0, z0], [x0, z1], [x1, z1], [x1, z0]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
    const segs = []
    let len = 0
    for (let i = 0; i < 4; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4]
      const L = Math.hypot(bx - ax, bz - az)
      segs.push({ ax, az, dx: (bx - ax) / L, dz: (bz - az) / L, L, s0: len })
      len += L
    }
    const n = Math.max(2, Math.round(len / 110))
    for (let k = 0; k < n; k++) {
      const id = `t${li}_${k}`
      cars.push({ id, traffic: true, loop: { segs, len }, phase: len * k / n, speed: 9 + ((li * 7 + k * 3) % 5), x: 0, y: PHYS.rideHeight, z: 0, vx: 0, vy: 0, vz: 0,
        yaw: 0, pitch: 0, roll: 0, grounded: true, wreck: 0, stats: { mass: 1.3 }, knocked: 0,
        kind: ['sedan', 'van', 'taxi', 'sedan', 'sedan', 'van'][(li * 3 + k) % 6],
        color: [0xe9e9e9, 0x2b2e33, 0xb8bcc2, 0x2f5f9a, 0xd8d2c0, 0x8b0f14][(li + k) % 6] })
      if (cars[cars.length - 1].kind === 'taxi') cars[cars.length - 1].color = 0xf2c230
    }
  })

  function place(c, t) {
    const { segs, len } = c.loop
    let s = (c.phase + t * c.speed) % len
    let sg = segs[0]
    for (const g of segs) if (s >= g.s0 && s < g.s0 + g.L) { sg = g; break }
    s -= sg.s0
    // 左 = 進む向きを左へ 90 度
    const lx = sg.dz, lz = -sg.dx
    c.x = sg.ax + sg.dx * s + lx * LANE
    c.z = sg.az + sg.dz * s + lz * LANE
    c.y = world.groundAt(c.x, c.z, 5).h + PHYS.rideHeight
    c.vx = sg.dx * c.speed; c.vz = sg.dz * c.speed; c.vy = 0
    c.yaw = Math.atan2(sg.dx, sg.dz)
    c.pitch = 0; c.roll = 0
  }

  return {
    cars,
    // t はレース時刻。dt は吹き飛んでいる車を動かす刻み
    update(t, dt) {
      for (const c of cars) {
        if (c.knocked > 0) {
          c.knocked -= dt
          c.vy -= 22 * dt
          c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt
          c.yaw += c.spin * dt; c.roll += c.spin * 0.6 * dt
          const g = world.groundAt(c.x, c.z, c.y).h + PHYS.rideHeight
          if (c.y < g) { c.y = g; c.vy = Math.abs(c.vy) * 0.3; c.vx *= 0.7; c.vz *= 0.7; c.spin *= 0.6 }
          if (c.knocked <= 0) { c.roll = 0; place(c, t) }
          continue
        }
        place(c, Math.max(0, t))
      }
    },
    // レースの車が当たったら吹き飛ばす。当てた車に返す（演出・ニトロ用）
    hitBy(racer) {
      for (const c of cars) {
        if (c.knocked > 0) continue
        const dx = c.x - racer.x, dz = c.z - racer.z
        if (Math.abs(c.y - racer.y) > 2 || dx * dx + dz * dz > 2.6 * 2.6) continue
        const rel = Math.hypot(racer.vx - c.vx, racer.vz - c.vz)
        if (rel < 7) continue
        c.knocked = 4
        c.vx = racer.vx * 0.9 + dx * 2; c.vz = racer.vz * 0.9 + dz * 2; c.vy = 5 + rel * 0.15
        c.spin = (Math.random() - 0.5) * 8
        return { car: c, rel }
      }
      return null
    }
  }
}
