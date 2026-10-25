// レースの進行（カウントダウン・チェックポイント・順位・ゴール・結果）。
// オフラインではブラウザが、オンラインではサーバーがこれを持つ。どちらも同じ判定になる。

import { GAME, REWARD } from './config.js'
import { createCar, step, respawn, speedOf } from './physics.js'
import { crossedGate, progressOf } from './track.js'
import { createDriver, drive, planRoute } from './ai.js'

export const BOT_NAMES = ['ガンテツ', 'ミサキ', 'BOLT', 'タツミ', 'ROOK', 'ヒバナ', 'VEGA']
const BOT_CARS = ['bruiser', 'dart', 'runner', 'bruiser', 'dart', 'runner', 'runner']

export function mulberry(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

export class Race {
  constructor(world, { seed = 1 } = {}) {
    this.world = world
    world.reset()
    this.rng = mulberry(seed)
    this.entries = []
    this.t = -GAME.countdownSec
    this.phase = 'countdown'
    this.firstFinish = null
    this.events = []      // 画面向け: { t:'cp'|'finish'|'break', id, ... }
  }

  // humans: [{ id, name, carId, levels, paint, remote }]。remote=true の車はここで動かさない（通信で位置が来る）
  addHuman(p) {
    const slot = this.world.grid[this.entries.length]
    const car = createCar({ id: p.id, name: p.name, carId: p.carId, levels: p.levels, paint: p.paint, spawn: slot })
    this.entries.push({ id: p.id, car, bot: false, remote: !!p.remote, cp: 0, finished: false, time: null, dnf: false, left: false, px: car.x, pz: car.z })
    return car
  }

  addBots(n, boldness = null) {
    for (let i = 0; i < n && this.entries.length < GAME.maxPlayers; i++) {
      const k = this.entries.length
      const slot = this.world.grid[k]
      const carId = BOT_CARS[i % BOT_CARS.length]
      const levels = { engine: (i % 3), tires: ((i + 1) % 3), armor: (i % 2) }
      const id = 'bot' + i
      const car = createCar({ id, name: BOT_NAMES[i % BOT_NAMES.length], carId, levels, spawn: slot, bot: true })
      const bold = boldness ?? (0.15 + this.rng() * 0.75)
      const plan = planRoute(this.world, this.rng, bold)
      const driver = createDriver(this.world, car, plan, 0.75 + this.rng() * 0.25)
      this.entries.push({ id, car, bot: true, remote: false, driver, cp: 0, finished: false, time: null, dnf: false, left: false, px: car.x, pz: car.z })
    }
  }

  entry(id) { return this.entries.find(e => e.id === id) }
  cars() { return this.entries.map(e => e.car) }

  // 固定ステップ1回。inputs は id -> 入力（ここで動かす人間の車だけ）
  stepFixed(dt, inputs = {}) {
    this.t += dt
    this.world.time = this.t
    if (this.phase === 'countdown') {
      if (this.t >= 0) { this.phase = 'racing'; this.events.push({ t: 'go' }) }
      else return
    }
    if (this.phase === 'done') return
    const cars = this.cars()
    for (const e of this.entries) {
      if (e.remote || e.left) continue
      const c = e.car
      const inp = e.bot ? drive(e.driver, this.world) : (inputs[e.id] || {})
      if (e.finished) { // ゴール後は惰性で止まる
        step(c, { brake: 0.4 }, dt, this.world, null)
      } else step(c, inp, dt, this.world, cars)
      this.observe(e, c.x, c.z)
    }
    this.checkOver()
  }

  // 位置を見てゲート通過を判定する。オンラインのサーバーは、人間の車の位置が届くたびにここを呼ぶ
  observe(e, x, z, clientTime = null) {
    const g = this.world.gates[e.cp]
    if (!e.finished && g && this.phase === 'racing' && crossedGate(g, e.px, e.pz, x, z)) {
      e.cp++
      e.car.respawnPoint = { ...g.respawn }
      if (e.cp >= this.world.gates.length) {
        e.finished = true
        // 時刻は線を横切った瞬間に補間する
        const frac = (g.z - e.pz) / ((z - e.pz) || 1)
        const t = clientTime != null ? Math.min(clientTime, this.t) : this.t - GAME.step * (1 - frac)
        e.time = Math.max(0, t)
        if (this.firstFinish == null) this.firstFinish = this.t
        this.events.push({ t: 'finish', id: e.id, time: e.time })
      } else this.events.push({ t: 'cp', id: e.id, cp: e.cp, name: g.name })
    }
    e.px = x; e.pz = z
  }

  progress(e) { return e.finished ? 100 + (1000 - e.time) / 1000 : progressOf(this.world, e.cp, e.car.z) }

  standings() {
    const list = this.entries.filter(e => !e.left || e.finished)
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time
      if (a.finished !== b.finished) return a.finished ? -1 : 1
      return this.progress(b) - this.progress(a)
    })
    const left = this.entries.filter(e => e.left && !e.finished)
    return [...list, ...left]
  }

  removePlayer(id) {
    const e = this.entry(id)
    if (e) { e.left = true; e.dnf = !e.finished }
  }

  checkOver() {
    if (this.phase !== 'racing' || this.remoteJudge) return // オンラインの画面側では終了はサーバーが決める
    const active = this.entries.filter(e => !e.left)
    const allDone = active.every(e => e.finished)
    const humansDone = active.filter(e => !e.bot).every(e => e.finished)
    const grace = this.firstFinish != null && this.t - this.firstFinish > GAME.finishGraceSec
    // 人間が全員ゴールしたら、CPU を待たずに締める
    if (allDone || grace || (humansDone && active.some(e => !e.bot))) {
      this.phase = 'done'
      for (const e of this.entries) if (!e.finished) e.dnf = true
      this.events.push({ t: 'over' })
    }
  }

  results() {
    return this.standings().map((e, i) => {
      const c = e.car
      let credits = e.finished ? REWARD.place[i] + REWARD.finish : REWARD.dnf
      credits += Math.min(REWARD.breakCap, c.breaks * REWARD.perBreak)
      return {
        id: e.id, name: c.name, bot: e.bot, place: i + 1, time: e.time, finished: e.finished,
        dnf: e.dnf, left: e.left, cp: e.cp, breaks: c.breaks, maxAir: Math.round(c.maxAir * 10) / 10,
        body: Math.round(c.dmg.body * 100), credits, carId: c.carId
      }
    })
  }
}

export { respawn, speedOf }
