// iPhone 相当（webkit・タッチ）で、横持ちと縦持ちを実際に操作する。
// 読み込みの量、タイトル→レース、アクセルを押して進むか、ハンドルで曲がるか、はみ出し、エラーを見る。
import { webkit, chromium } from 'playwright'
import { serveStatic } from './static.mjs'
import { mkdir } from 'node:fs/promises'
const OUT = new URL('../shots/mobile/', import.meta.url).pathname
await mkdir(OUT, { recursive: true })
const srv = await serveStatic(5195)
const URL0 = process.argv[2] || 'http://localhost:5195/'
const bad = [], good = []
const ok = (c, l, d = '') => (c ? good : bad).push(`${c ? 'OK' : 'NG'}  ${l}  ${d}`)
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
for (const engine of [webkit, chromium]) for (const [w, h] of [[844, 390], [390, 844], [667, 375]]) {
  const b = await engine.launch(engine === chromium ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {})
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: engine === chromium ? true : undefined, hasTouch: true, userAgent: UA, locale: 'ja-JP' })
  const p = await ctx.newPage()
  const errs = []; let bytes = 0
  p.on('pageerror', e => errs.push(e.message))
  p.on('console', m => { if (m.type() === 'error' && !/404|healthz|fonts|ERR_CONNECTION/.test(m.text())) errs.push(m.text()) })
  p.on('response', async r => { try { const l = Number(r.headers()['content-length'] || 0) || (await r.body()).length; bytes += l } catch {} })
  const tag = `${engine.name()}-${w}x${h}`
  const t0 = Date.now()
  await p.goto(URL0)
  await p.waitForFunction(() => window.__btrReady, null, { timeout: 60000 }).catch(() => errs.push('not ready'))
  const readyMs = Date.now() - t0
  await p.waitForTimeout(1500)
  const fit = await p.evaluate(() => { const c = document.querySelector('.title-card'); const r = c.getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight, scroll: document.documentElement.scrollHeight > innerHeight + 1 } })
  ok(fit.bottom <= fit.h + 1 && !fit.scroll, tag + ' タイトルが一画面に収まる', JSON.stringify(fit))
  await p.screenshot({ path: OUT + tag + '-title.png' })
  await p.tap('#btnOffline')
  await p.waitForTimeout(5200)
  const vis = await p.evaluate(() => !document.getElementById('touch').classList.contains('hidden'))
  ok(vis, tag + ' タッチ操作が出る')
  // アクセルを押し続け、2秒後にハンドルを右へ
  const press = (sel, type, x, y) => p.evaluate(([sel, type, x, y]) => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent(type, { pointerId: sel.length + (type === 'pointermove' ? 0 : 0), pointerType: 'touch', bubbles: true, clientX: x ?? r.left + r.width / 2, clientY: y ?? r.top + r.height / 2 }))
  }, [sel, type, x, y])
  await press('[data-k=gas]', 'pointerdown')
  await p.waitForTimeout(2500)
  const z1 = await p.evaluate(() => window.__btr.me.z)
  ok(z1 > 30, tag + ' アクセルで進む', 'z=' + z1.toFixed(1))
  const yaw0 = await p.evaluate(() => window.__btr.me.yaw)
  const pad = await p.evaluate(() => { const r = document.querySelector('.t-steer').getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.7 } })
  await press('.t-steer', 'pointerdown', pad.x, pad.y)
  await press('.t-steer', 'pointermove', pad.x + 80, pad.y)
  await p.waitForTimeout(600)
  const yaw1 = await p.evaluate(() => window.__btr.me.yaw)
  ok(yaw1 < yaw0 - 0.2, tag + ' ハンドル右で右へ曲がる', `${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`)
  await p.screenshot({ path: OUT + tag + '-race.png' })
  await press('.t-steer', 'pointerup', pad.x + 80, pad.y)
  await press('[data-k=gas]', 'pointerup')
  // 操作部品が画面からはみ出していないか・重なっていないか
  const lay = await p.evaluate(() => {
    const rs = ['[data-k=gas]', '[data-k=brake]', '[data-k=boost]', '[data-k=drift]', '[data-k=pause]', '#miniMap', '.hud-br', '.hud-tl'].map(s => [s, document.querySelector(s).getBoundingClientRect()])
    const out = rs.filter(([, r]) => r.width && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)).map(([s]) => s)
    const ov = []
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i][1], c = rs[j][1]; if (a.width && c.width && a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) ov.push(rs[i][0] + '/' + rs[j][0]) }
    return { out, ov }
  })
  ok(!lay.out.length && !lay.ov.length, tag + ' 操作と表示がはみ出さず重ならない', JSON.stringify(lay))
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2) }; requestAnimationFrame(f) }))
  good.push(`    ${tag} 読み込み ${(bytes / 1e6).toFixed(1)}MB / 起動 ${readyMs}ms / fps ${fps}（この Mac のエミュレーション）`)
  ok(!errs.length, tag + ' エラー 0', errs.slice(0, 3).join(' | '))
  await b.close()
}
console.log(good.join('\n')); console.log(bad.length ? bad.join('\n') : 'ALL OK')
srv.close()
