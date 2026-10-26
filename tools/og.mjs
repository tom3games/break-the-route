// OGP 画像（1200x630）を実際のゲーム画面から作る。node tools/og.mjs
// 警察役で犯人を追い、近づいたところ（ヘリが照らしている）で止めて文字をのせる
import { chromium } from 'playwright'
import { serveStatic } from './static.mjs'
const srv = await serveStatic(5193)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto('http://localhost:5193/')
await p.waitForFunction(() => window.__btrReady)
await p.evaluate(() => { window.__btr.profile.cpu = 4; window.__btr.startOffline('cop') })
await p.waitForTimeout(4800)
await p.evaluate(() => { window.__btr.autopilot(); window.__btr.race.heatBonus = 2 })
// 犯人の 18〜45m 後ろにつくまで走る
const t0 = Date.now()
while (Date.now() - t0 < 90000) {
  await p.waitForTimeout(400)
  const d = await p.evaluate(() => { const r = window.__btr.race.robbers[0].car, m = window.__btr.me; return Math.hypot(r.x - m.x, r.z - m.z) })
  if (d > 14 && d < 30) break
}
await p.evaluate(() => {
  window.__btr.setPaused(true)
  // 警察の斜め後ろ・高めから、前を逃げる犯人を入れて撮る
  const B = window.__btr, r = B.race.robbers[0].car, m = B.me
  const dx = r.x - m.x, dz = r.z - m.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d
  window.__freeze = true
  B.camera.position.set(m.x - ux * 8 - uz * 4.5, m.y + 3.6, m.z - uz * 8 + ux * 4.5)
  B.camera.lookAt((m.x + r.x) / 2, m.y + 1.2, (m.z + r.z) / 2)
  B.camera.fov = 62; B.camera.updateProjectionMatrix()
})
await p.waitForTimeout(600)
await p.addStyleTag({ content: `#hud{display:none!important} .og{position:fixed;left:52px;top:66px;z-index:50;font-family:'Dela Gothic One',sans-serif;color:#fff;line-height:.92;text-shadow:0 6px 0 rgba(0,0,0,.35)} .og b{display:block;font-size:92px;color:#ff5a1f;font-weight:400} .og i{display:block;font-style:normal;font-size:92px} .og s{display:inline-block;text-decoration:none;font-size:30px;margin-top:16px;font-family:'M PLUS 1p',sans-serif;font-weight:800;background:#f2c230;color:#14161a;padding:8px 16px} .og u{display:inline-block;text-decoration:none;font-size:26px;margin:16px 0 0 10px;font-family:'M PLUS 1p',sans-serif;font-weight:800;background:#2f6fe0;color:#fff;padding:9px 14px} .og-h{position:fixed;left:52px;top:38px;width:200px;height:14px;background:repeating-linear-gradient(-45deg,#f2c230 0 12px,#14161a 12px 24px);z-index:50}` })
await p.evaluate(() => { const d = document.createElement('div'); d.className = 'og'; d.innerHTML = '<b>BREAK</b><i>THE ROUTE</i><s>逃げ切るか、捕まえるか。</s><u>警察と犯人</u>'; document.body.appendChild(d); const h = document.createElement('div'); h.className = 'og-h'; document.body.appendChild(h) })
await p.waitForTimeout(500)
await p.screenshot({ path: new URL('../public/og.jpg', import.meta.url).pathname, type: 'jpeg', quality: 86 })
await b.close(); srv.close()
