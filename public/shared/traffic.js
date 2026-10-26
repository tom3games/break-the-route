// 一般車。街の通りを両方向に走る（左側通行。対向車線にも車がいる）。
// 位置はレース時刻だけで決まる（どの画面でも同じ所にいる）。通りの端まで行くと反対の端から出てくる（端は外周のビルの中）。
// レースの車に強く当てられると吹き飛び、数秒後に元の流れへ戻る（吹き飛び方は各画面だけの演出）。
import { PHYS } from './config.js'

export function createTraffic(world) {
  const cars = []
  const lines = []
  // 幅 18m 以上の真っすぐな通り（路地は走らない）
  for (const r of world.roads) {
    if (r.w < 18 || r.pts.length !== 2) continue
    const [[ax, az], [bx, bz]] = r.pts
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 60) continue
    const dx = (bx - ax) / L, dz = (bz - az) / L
    // 片側の車線の中心。大通り（28m）は片側2車線
    const lanes = r.w >= 28 ? [3.6, 10] : [4.4]
    for (const dir of [1, -1]) for (const lane of lanes) lines.push({ ax, az, dx, dz, L, dir, lane })
  }
  lines.forEach((ln, li) => {
    const n = Math.max(1, Math.round(ln.L / 230))
    for (let k = 0; k < n; k++) {
      const kind = ['sedan', 'van', 'taxi', 'sedan', 'sedan', 'van', 'sedan'][(li * 3 + k) % 7]
      cars.push({
        id: `t${li}_${k}`, traffic: true, line: ln, phase: ln.L * (k + (li % 3) * 0.33) / n, speed: 10 + ((li * 7 + k * 3) % 6),
        x: 0, y: PHYS.rideHeight, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, grounded: true, wreck: 0, stats: { mass: 1.3 }, knocked: 0,
        kind, color: kind === 'taxi' ? 0xf2c230 : [0xe9e9e9, 0x2b2e33, 0xb8bcc2, 0x2f5f9a, 0xd8d2c0, 0x8b0f14][(li + k) % 6]
      })
    }
  })

  function place(c, t) {
    const ln = c.line
    let s = (c.phase + t * c.speed) % ln.L
    if (ln.dir < 0) s = ln.L - s
    const fx = ln.dx * ln.dir, fz = ln.dz * ln.dir
    // 左 = 進む向きを左へ 90 度（日本は左側通行）
    const lx = fz, lz = -fx
    c.x = ln.ax + ln.dx * s + lx * ln.lane
    c.z = ln.az + ln.dz * s + lz * ln.lane
    c.y = world.groundAt(c.x, c.z, 5).h + PHYS.rideHeight
    c.vx = fx * c.speed; c.vz = fz * c.speed; c.vy = 0
    c.yaw = Math.atan2(fx, fz)
    c.pitch = 0; c.roll = 0
  }

  return {
    cars,
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
        if (dx * dx + dz * dz > 2.6 * 2.6 || Math.abs(c.y - racer.y) > 2) continue
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
