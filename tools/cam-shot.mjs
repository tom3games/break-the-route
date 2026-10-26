// 追いかけ視点の見え方を縦と横で撮る（前後比較用）。node tools/cam-shot.mjs ラベル  → shots/cam/
import { chromium } from 'playwright'
import { serveStatic } from './static.mjs'
import { mkdir } from 'node:fs/promises'
const OUT = new URL('../shots/cam/', import.meta.url).pathname
await mkdir(OUT, { recursive: true })
const srv = await serveStatic(5193)
const label = process.argv[2] || 'now'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const [w, h] of [[390, 844], [844, 390]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://localhost:5193/?v=' + Date.now())
  await p.waitForFunction(() => window.__btrReady, null, { timeout: 30000 })
  await p.evaluate(() => { window.__btr.profile.cpu = 3; window.__btr.startOffline('robber') })
  await p.waitForTimeout(5200)
  await p.evaluate(() => { window.__btr.teleport(0, 420, 0, 25); window.__btr.autopilot() })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}${label}-${w}x${h}.png` })
  console.log(label, `${w}x${h}`, 'errors', errs.length, errs.slice(0, 2).join(' | '))
  await ctx.close()
}
await b.close(); srv.close()
