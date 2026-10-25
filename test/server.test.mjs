// 本物のサーバーに WebSocket でつなぎ、部屋・同期・不正対策を確かめる
import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { startServer } from '../server.mjs'
import { createWorld } from '../public/shared/track.js'

const W = createWorld()

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  const c = { ws, msgs: [], id: null, state: null, snaps: [] }
  ws.on('message', d => {
    const m = JSON.parse(d)
    c.msgs.push(m)
    if (m.t === 'welcome') c.id = m.id
    if (m.t === 'state') c.state = m
    if (m.t === 'snap') c.snaps.push(m)
  })
  c.send = m => ws.send(JSON.stringify(m))
  c.ready = new Promise(r => ws.on('open', () => { c.send({ t: 'hello' }); r() }))
  c.wait = async (fn, ms = 4000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { const v = fn(c); if (v) return v; await new Promise(r => setTimeout(r, 20)) }
    throw new Error('timeout')
  }
  return c
}

async function room(srv, n = 2, cpu = 0) {
  const cs = []
  for (let i = 0; i < n; i++) { const c = client(srv.port); await c.ready; await c.wait(c => c.id); cs.push(c) }
  cs[0].send({ t: 'create', name: 'host' })
  const code = (await cs[0].wait(c => c.state && c.state.code && c.state)).code
  for (let i = 1; i < n; i++) { cs[i].send({ t: 'join', code, name: 'p' + i }); await cs[i].wait(c => c.state && c.state.code === code) }
  cs[0].send({ t: 'start', opts: { cpu } })
  for (const c of cs) await c.wait(c => c.state && c.state.phase === 'playing')
  return { cs, code }
}

const stateMsg = (x, z, extra = {}) => ({ t: 'input', data: { k: 'state', s: { x, y: 0.55, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, ...extra }, rt: 0 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

// レースが始まるまで待つ（カウントダウン 4 秒）
async function untilRacing(c) { await c.wait(c => c.snaps.length && c.snaps[c.snaps.length - 1].phase === 'racing', 7000) }
const myCar = c => c.snaps[c.snaps.length - 1].cars.find(k => k.id === c.id)

test('部屋を作って入り、スタートで全員の画面にスナップショットが届く', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 2, 2)
    await cs[1].wait(c => c.snaps.length > 3)
    const s = cs[1].snaps.at(-1)
    assert.equal(s.cars.length, 4, '人2 + CPU2')
    assert.ok(cs[0].state.game.entries.filter(e => e.bot).length === 2)
  } finally { await srv.close() }
})

test('瞬間移動は受け付けず、元の位置に戻させる', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 1, 0)
    const [a] = cs
    await untilRacing(a)
    const g = W.grid[0]
    a.send(stateMsg(g.x, g.z + 2))
    await sleep(100)
    a.send(stateMsg(0, 1180)) // ゴールの先へ飛ぶ
    await a.wait(c => c.msgs.some(m => m.t === 'correct'))
    await sleep(150)
    const car = myCar(a)
    assert.ok(car.z < 20, `位置は戻されている z=${car.z}`)
    assert.equal(car.cp, 0)
    assert.equal(car.f, 0, 'ゴール扱いにならない')
  } finally { await srv.close() }
})

test('建物の中を通り抜ける移動は受け付けない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 1, 0)
    const [a] = cs
    await untilRacing(a)
    const g = W.grid[0]
    a.send(stateMsg(g.x, g.z + 6)); await sleep(150)
    a.send(stateMsg(g.x, 40)); await sleep(700)
    // 東の街区（x 12..110）を突き抜けて裏へ
    a.send(stateMsg(40, 50, { vx: 40 }))
    await a.wait(c => c.msgs.some(m => m.t === 'correct'))
    await sleep(120)
    assert.ok(myCar(a).x < 10, `壁の手前に戻されている x=${myCar(a).x}`)
  } finally { await srv.close() }
})

test('カウントダウン中に動くと戻される', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 1, 0)
    const [a] = cs
    await a.wait(c => c.snaps.length && c.snaps.at(-1).phase === 'countdown')
    a.send(stateMsg(0, 40))
    await a.wait(c => c.msgs.some(m => m.t === 'correct'))
  } finally { await srv.close() }
})

test('遠くの物を壊したという申告は却下され、他の人には配られない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 2, 0)
    const [a, b] = cs
    await untilRacing(a)
    const wall = W.objects.find(o => o.type === 'wall')
    a.send({ t: 'input', data: { k: 'break', id: wall.id, sp: 60, dx: 0, dz: 60 } })
    await a.wait(c => c.msgs.some(m => m.t === 'unbreak' && m.id === wall.id))
    await sleep(200)
    assert.ok(!b.snaps.some(s => s.br.some(x => x.id === wall.id)))
  } finally { await srv.close() }
})

test('近くで十分な速さの破壊は全員に配られ、部屋の状態にも残る', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 2, 0)
    const [a, b] = cs
    await untilRacing(a)
    // 封鎖道路の仮設フェンスまで、許される速さで少しずつ近づく
    const fence = W.objects.find(o => o.type === 'tempfence')
    const g = W.grid[0]
    let z = g.z
    while (z < fence.cz - 3) {
      z = Math.min(fence.cz - 3, z + 12)
      a.send(stateMsg(fence.cx, z, { vz: 30 }))
      await sleep(250)
    }
    a.send({ t: 'input', data: { k: 'break', id: fence.id, sp: 25, dx: 0, dz: 25 } })
    await b.wait(c => c.snaps.some(s => s.br.some(x => x.id === fence.id)))
    await b.wait(c => c.state.game.destroyed.some(([id]) => id === fence.id), 3000)
    // 速さが足りない申告は却下
    const cone = W.objects.find(o => o.type === 'lumber')
    a.send({ t: 'input', data: { k: 'break', id: cone.id, sp: 3, dx: 0, dz: 3 } })
    await a.wait(c => c.msgs.some(m => m.t === 'unbreak' && m.id === cone.id))
  } finally { await srv.close() }
})

test('ゲートを順に通るとサーバーが順位とゴールを決める', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 1, 0)
    const [a] = cs
    await untilRacing(a)
    // 正面の大通りを北へ。ゲート直前と直後の位置を送る（間は許容速度内で刻む）
    let z = W.grid[0].z, x = 0
    const path = []
    for (const gt of W.gates) { path.push([gt.respawn.x, gt.z - 1]); path.push([gt.respawn.x, gt.z + 1]) }
    for (const [tx, tz] of path) {
      while (Math.abs(tz - z) > 0.01) {
        z = tz > z ? Math.min(tz, z + 20) : Math.max(tz, z - 20)
        a.send(stateMsg(tx, z, { vz: 40 }))
        await sleep(240)
      }
    }
    await a.wait(c => c.msgs.some(m => m.t === 'state' && m.phase === 'result'), 6000)
    const res = a.msgs.filter(m => m.t === 'state' && m.phase === 'result').at(-1).result
    assert.equal(res[0].finished, true)
    assert.ok(res[0].time > 0)
  } finally { await srv.close() }
})

test('不正な形のメッセージでサーバーが落ちない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 1, 0)
    const [a] = cs
    for (const bad of ['{', '{"t":1}', JSON.stringify({ t: 'input', data: null }), JSON.stringify({ t: 'input', data: { k: 'state', s: { x: 'a' } } }),
      JSON.stringify({ t: 'input', data: { k: 'break', id: '__proto__' } }), JSON.stringify({ t: 'car', car: { carId: 'tank', levels: { engine: 99 } } }), JSON.stringify({ t: 'start', opts: { cpu: 1e9, rng: 'x' } })]) a.ws.send(bad)
    await sleep(300)
    a.send({ t: 'ping', at: 1 })
    await a.wait(c => c.msgs.some(m => m.t === 'pong'))
  } finally { await srv.close() }
})

test('途中退出した人は DNF（途中退出）として結果に残る', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const { cs } = await room(srv, 2, 0)
    const [a, b] = cs
    await untilRacing(a)
    b.send({ t: 'leave' })
    await a.wait(c => c.snaps.at(-1).cars.find(k => k.id === b.id)?.l === 1)
  } finally { await srv.close() }
})
