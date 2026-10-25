// オンライン対戦を実ブラウザ2つ（＋任意で webkit）でつないで最後まで通す。
// node tools/e2e-online.mjs   （サーバーは自分で起動する）
import { chromium, webkit } from 'playwright'
import { startServer } from '../server.mjs'
import { mkdir } from 'node:fs/promises'
const OUT = new URL('../shots/', import.meta.url).pathname
await mkdir(OUT, { recursive: true })
const srv = await startServer({ port: 8191, quiet: true })
const URL0 = `http://localhost:${srv.port}/`
const problems = [], notes = []
const ok = (c, label, d = '') => (c ? notes : problems).push(`${c ? 'OK  ' : 'NG  '}${label}${d ? '  ' + d : ''}`)
const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const bA = await chromium.launch({ args }), bB = await (process.argv.includes('--webkit') ? webkit : chromium).launch(process.argv.includes('--webkit') ? {} : { args })
const mk = async (b, name) => {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, locale: 'ja-JP' })
  const p = await ctx.newPage()
  p.errs = []
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_CLOSED')) p.errs.push(m.text()) })
  p.on('pageerror', e => p.errs.push('pageerror: ' + e.message))
  p.on('requestfailed', r => { if (!r.url().includes('fonts.g')) p.errs.push('reqfail: ' + r.url()) })
  p.name = name
  return p
}
const A = await mk(bA, 'A'), B = await mk(bB, 'B')
const ready = p => p.waitForFunction(() => window.__btrReady && !document.getElementById('btnOnline').disabled, null, { timeout: 30000 })
await A.goto(URL0); await ready(A)
await A.fill('#nameInput', 'ホスト')
await A.click('#btnOnline')
await A.click('#btnCreate')
await A.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('roomCode').textContent))
const code = await A.textContent('#roomCode')
const link = await A.inputValue('#inviteLink')
ok(/^[A-Z2-9]{4}$/.test(code), '部屋コードが出る', code)
ok(link.includes('?room=' + code), '招待リンクにコードが入る', link)
// B は招待リンクから入る（名前を先に保存しておくと自動で参加する）
await B.goto(URL0); await ready(B)
await B.fill('#nameInput', 'ゲスト'); await B.dispatchEvent('#nameInput', 'change')
await B.goto(link); await ready(B)
await B.waitForFunction(() => document.querySelectorAll('#plist li').length === 2, null, { timeout: 15000 }).catch(() => {})
const listA = await A.$$eval('#plist li', ls => ls.map(l => l.textContent))
ok(listA.length === 2, 'ホストの一覧に2人', listA.join(' / '))
await B.click('#carPickLobby button:nth-child(2)') // B は BRUISER
await A.waitForTimeout(500)
const carsA = await A.$$eval('#plist li .car', ls => ls.map(l => l.textContent))
ok(carsA.includes('BRUISER'), '相手の車の選択が見える', carsA.join(','))
ok(await B.isVisible('.guest-only') && !(await B.isVisible('#btnStartOnline')), 'ゲストにはスタートボタンが出ない')
await A.selectOption('#cpuOnline', '1')
await A.click('#btnStartOnline')
await Promise.all([A, B].map(p => p.waitForFunction(() => window.__btr.mode === 'race' && window.__btr.race, null, { timeout: 10000 })))
const nA = await A.evaluate(() => window.__btr.race.entries.length), nB = await B.evaluate(() => window.__btr.race.entries.length)
ok(nA === 3 && nB === 3, '両方の画面に3台（人2＋CPU1）', `${nA}/${nB}`)
await A.screenshot({ path: OUT + 'online-A-countdown.png' })
// 両者 CPU 運転。A は破壊ルート、B は安全ルート
await A.evaluate(() => window.__btr.autopilot(['B', 'B', 'E', 'BE']))
await B.evaluate(() => window.__btr.autopilot(['A', 'A', 'A', 'A']))
// 同期の確認: A の車の位置を、B 側で見た A の車の位置と比べる
const samples = []
for (let i = 0; i < 12; i++) {
  await A.waitForTimeout(700)
  const [a, b] = await Promise.all([
    A.evaluate(() => ({ id: window.__btr.myId, x: window.__btr.me.x, z: window.__btr.me.z, t: performance.now() })),
    B.evaluate(() => window.__btr.race && window.__btr.race.entries.map(e => ({ id: e.id, x: e.car.x, z: e.car.z })))
  ])
  const seen = b && b.find(e => e.id === a.id)
  if (seen) samples.push(Math.hypot(seen.x - a.x, seen.z - a.z))
}
const maxGap = Math.max(...samples), avg = samples.reduce((s, v) => s + v, 0) / samples.length
// 100ms 遅らせて補間するので、時速150kmなら 4〜8m 遅れて見えるのが正常
ok(samples.length >= 10 && avg < 14, 'B の画面の A の車が A の実位置についてくる', `平均差 ${avg.toFixed(1)}m 最大 ${maxGap.toFixed(1)}m（${samples.length}回）`)
await B.screenshot({ path: OUT + 'online-B-race.png' })
// 破壊の同期: A が壊した物が B でも壊れている
await A.waitForTimeout(2000)
const [dA, dB] = await Promise.all([A, B].map(p => p.evaluate(() => [...window.__btr.world.destroyed])))
const missing = dA.filter(id => !dB.includes(id))
ok(dA.length > 5 && missing.length <= 2, '壊れた物が両方の画面で一致', `A ${dA.length}個 / B ${dB.length}個 / B に無い ${missing.length}`)
// 最後まで
await Promise.all([A, B].map(p => p.waitForFunction(() => window.__btr.mode === 'results', null, { timeout: 150000 }).catch(() => {})))
await A.waitForTimeout(2500)
await A.screenshot({ path: OUT + 'online-A-results.png' })
await B.screenshot({ path: OUT + 'online-B-results.png' })
const rA = await A.$$eval('#rBody tr', t => t.map(r => r.textContent))
const rB = await B.$$eval('#rBody tr', t => t.map(r => r.textContent))
ok(rA.length === 3 && JSON.stringify(rA) === JSON.stringify(rB), '結果が両方で同じ', rA.map(s => s.slice(0, 30)).join(' | '))
ok(await B.isDisabled('#btnAgain') && !(await A.isDisabled('#btnAgain')), '再戦はホストだけ押せる')
// 再戦
await A.click('#btnAgain')
await Promise.all([A, B].map(p => p.waitForFunction(() => window.__btr.mode === 'race' && window.__btr.race.phase !== 'done', null, { timeout: 10000 }).catch(() => {})))
const again = await Promise.all([A, B].map(p => p.evaluate(() => window.__btr.mode)))
ok(again.every(m => m === 'race'), '再戦で両方がレースに戻る', again.join(','))
const brokenAfter = await B.evaluate(() => window.__btr.world.destroyed.size)
ok(brokenAfter === 0, '再戦で壊れた物が元に戻る', String(brokenAfter))
// 切断と再接続: B を読み込み直すと同じ席でレースに戻る
await B.evaluate(() => window.__btr.autopilot(['A', 'A', 'A', 'A']))
await B.waitForTimeout(9000)
const before = await B.evaluate(() => ({ id: window.__btr.myId, z: window.__btr.me.z }))
await B.reload(); await B.waitForFunction(() => window.__btr && window.__btr.mode === 'race' && window.__btr.me, null, { timeout: 20000 }).catch(() => {})
const after = await B.evaluate(() => window.__btr.me ? ({ id: window.__btr.myId, z: window.__btr.me.z }) : null)
ok(after && after.id === before.id && Math.abs(after.z - before.z) < 80, '読み込み直しても同じ席で続きから走れる', JSON.stringify({ before, after }))
const discA = await A.waitForFunction(id => window.__btr.race.entry(id).connected !== false, before.id, { timeout: 3000 }).then(() => true).catch(() => false)
ok(discA !== false, '戻ったあとホスト側で接続中になる', String(discA))
// 途中退出: B が部屋を出ると A では退出扱い
await B.evaluate(() => window.__btr.online.leave())
await A.waitForTimeout(1500)
const left = await A.evaluate(id => window.__btr.race.entry(id).left, before.id)
ok(left === true, '途中退出した人はホスト側で「途中退出」になる', String(left))
for (const p of [A, B]) ok(p.errs.length === 0, p.name + ' のコンソールエラー 0', p.errs.slice(0, 3).join(' | '))
console.log(notes.join('\n'))
console.log(problems.length ? problems.join('\n') : 'ALL OK')
await bA.close(); await bB.close(); await srv.close()
process.exit(problems.length ? 1 : 0)
