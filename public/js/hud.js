// レース中の表示（順位・時間・進み具合・損傷・速度・ブースト・小地図）
import { GAME, CARS } from '../shared/config.js'
import { speedOf } from '../shared/physics.js'
import { t, placeText } from './i18n.js'

const $ = id => document.getElementById(id)
const COLORS = ['#ff5a1f', '#3b8cff', '#f2c230', '#36c37a', '#f07acb', '#eeeeee', '#9b6bff', '#ff8a1f']

function hpColor(v) {
  if (v > 0.7) return '#36c37a'
  if (v > 0.4) return '#f2c230'
  if (v > 0.15) return '#ff7a1a'
  return '#ff3b30'
}

export class HUD {
  constructor(world) {
    this.world = world
    this.msgT = 0; this.hintT = 0; this.standT = 0; this.vig = 0; this.lastCount = null
    this.map = $('miniMap').getContext('2d')
    // 小地図の下絵（道と建物）を一度だけ作る
    this.mapScale = 0.9
  }

  setup(race, me) {
    this.race = race; this.me = me
    const tr = $('hTrack'); tr.innerHTML = ''
    const n = this.world.gates.length
    this.world.gates.forEach((g, i) => {
      const d = document.createElement('div'); d.className = 'cp'
      d.style.left = ((i + 1) / n * 100) + '%'
      d.innerHTML = `<span>${g.name}</span>`
      tr.appendChild(d)
    })
    this.dots = new Map()
    race.entries.forEach((e, i) => {
      const d = document.createElement('div'); d.className = 'dot' + (e.car === me ? ' me' : '')
      d.style.background = e.car === me ? '#ff5a1f' : COLORS[(i + 1) % COLORS.length]
      tr.appendChild(d)
      this.dots.set(e.id, d)
      e.color = e.car === me ? '#ff5a1f' : COLORS[(i + 1) % COLORS.length]
    })
    $('hPosOf').textContent = '/' + race.entries.length
    $('hCount').textContent = ''
    this.lastCount = null
    this.message('', '', 0)
    this.dmgEls = null
  }

  message(text, sub = '', dur = 1.2) {
    const el = $('hMsg')
    el.innerHTML = ''
    if (!text) { el.classList.remove('show'); return }
    el.textContent = text
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s) }
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show')
    this.msgT = dur
  }
  toast(text) { this.hint(text, 1.6) }
  hint(text, dur = 4) { const el = $('hHint'); el.textContent = text; el.classList.add('show'); this.hintT = dur }
  flashDamage(d) { this.vig = Math.min(1, this.vig + d * 4 + 0.15) }

  update(race, me, dt, camera) {
    const W = this.world
    // カウントダウン
    if (race.phase === 'countdown') {
      const n = Math.ceil(-race.t)
      if (n !== this.lastCount && n <= 3) { this.lastCount = n; const el = $('hCount'); el.className = 'count'; el.textContent = n; this.onBeep && this.onBeep(false) }
    } else if (this.lastCount !== 0 && race.t < 1.2) { this.lastCount = 0; const el = $('hCount'); el.className = 'count go'; el.textContent = t('countGo') }
    else if (race.t >= 1.2 && $('hCount').textContent) $('hCount').textContent = ''

    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('hMsg').classList.remove('show') }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('hHint').classList.remove('show') }
    this.vig = Math.max(0, this.vig - dt * 1.5)
    const low = me ? Math.max(0, 0.35 - me.dmg.body) * 1.2 : 0
    $('hVig').style.boxShadow = `inset 0 0 ${120 + this.vig * 80}px rgba(255,30,20,${Math.min(0.75, this.vig * 0.6 + low)})`

    if (!me) return
    const myE = race.entries.find(e => e.car === me)
    const time = myE.finished ? myE.time : Math.max(0, race.t)
    $('hTime').textContent = fmt(time)
    const st = race.standings()
    const myPlace = st.indexOf(myE) + 1
    $('hPos').textContent = placeText(myPlace).replace(/[A-Z]+$/, '')
    $('hPosOf').textContent = placeText(myPlace).replace(/^\d+/, '') + ' /' + st.length

    // 次のゲート
    const g = W.gates[Math.min(myE.cp, W.gates.length - 1)]
    $('hNext').textContent = myE.finished ? t('goal') : `${t('nextCp')} ${g.name}  ${Math.max(0, Math.round(g.z - me.z))}m`

    // 進み具合（全員）
    for (const e of race.entries) {
      const d = this.dots.get(e.id)
      if (!d) continue
      const p = Math.min(W.gates.length, race.progress(e))
      d.style.left = (Math.min(1, p / W.gates.length) * 100) + '%'
      d.style.opacity = e.left ? 0.25 : 1
    }

    // 順位表（5回/秒）
    this.standT -= dt
    if (this.standT <= 0) {
      this.standT = 0.2
      const ol = $('hStand'); ol.innerHTML = ''
      st.forEach((e, i) => {
        const li = document.createElement('li')
        if (e.car === me) li.className = 'me'
        const status = e.finished ? fmt(e.time) : e.left ? t('left') : e.car.wreck > 0 ? t('msgWreck') : (W.gates[e.cp] ? W.gates[e.cp].name : '')
        li.innerHTML = `<span>${i + 1}</span><span class="sw" style="background:${e.color}"></span><span class="nm"></span><span class="st">${status}</span>`
        li.querySelector('.nm').textContent = e.car.name
        ol.appendChild(li)
      })
    }

    // 速度とブースト
    $('hSpeed').textContent = Math.round(speedOf(me) * 3.6)
    const bEl = $('hBoost')
    bEl.style.width = (me.boost * 100) + '%'
    const box = bEl.parentElement
    box.classList.toggle('lock', me.boostLock || me.overheat)
    box.classList.toggle('on', me.boosting)
    $('hBoostLbl').textContent = me.overheat ? t('msgOverheat') : me.boostLock ? t('recharge') : 'NITRO'

    // 損傷
    const d = me.dmg
    $('dBody').style.fill = hpColor(d.body)
    $('dEngine').style.fill = hpColor(d.engine)
    $('dCool').style.fill = hpColor(d.cool)
    $('dSusp').style.fill = hpColor(d.susp)
    document.querySelectorAll('.dTire').forEach(el => el.style.fill = hpColor(d.tires))
    if (!this.dmgEls) {
      const list = $('dmgList'); list.innerHTML = ''
      this.dmgEls = {}
      for (const [k, key] of [['body', 'partBody'], ['engine', 'partEngine'], ['tires', 'partTires'], ['susp', 'partSusp'], ['cool', 'partCool']]) {
        const row = document.createElement('div')
        row.innerHTML = `<span>${t(key)}</span><b></b>`
        list.appendChild(row)
        this.dmgEls[k] = row.querySelector('b')
      }
      const heat = document.createElement('span'); heat.className = 'heat'; heat.innerHTML = '<i></i>'
      heat.title = t('heat')
      list.appendChild(heat)
      this.heatEl = heat.querySelector('i')
    }
    for (const k of Object.keys(this.dmgEls)) { this.dmgEls[k].textContent = Math.round(d[k] * 100) + '%'; this.dmgEls[k].style.color = hpColor(d[k]) }
    this.heatEl.style.width = Math.min(100, me.heat * 100) + '%'
    const bb = $('hBodyBar'); bb.style.width = Math.round(d.body * 100) + '%'; bb.style.background = hpColor(d.body)
    if (me.repairing) { if (this.hintT <= 0.2) this.hint(t('msgRepair'), 0.4) }

    this.drawMini(race, me)
  }

  drawMini(race, me) {
    const g = this.map, W = this.world
    const S = g.canvas.width, R = S / 2, sc = this.mapScale
    g.clearRect(0, 0, S, S)
    g.save()
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip()
    g.translate(R, R)
    // 地図座標は (-x, -z)。これで進行方向が上、車の右が右になる
    g.rotate(me.yaw)
    g.scale(sc, sc)
    g.translate(me.x, me.z)
    g.save()
    // 道
    g.lineCap = 'round'; g.lineJoin = 'round'
    for (const r of W.roads) {
      g.strokeStyle = r.surf === 'dirt' ? 'rgba(170,130,80,0.85)' : 'rgba(210,214,222,0.85)'
      g.lineWidth = r.w
      g.beginPath()
      r.pts.forEach(([x, z], i) => i ? g.lineTo(-x, -z) : g.moveTo(-x, -z))
      g.stroke()
    }
    // 板（橋・高架）
    g.fillStyle = 'rgba(210,214,222,0.85)'
    for (const sl of W.slabs) if (W.slabActive(sl) && sl.kind !== 'mound') rectRot(g, sl)
    // 建物
    g.fillStyle = 'rgba(0,0,0,0.45)'
    for (const o of W.colliders) if (!o.slab && o.kind !== 'bound' && o.kind !== 'rail') rectRot(g, o)
    // 壊せる物（残っているもの）
    g.fillStyle = '#ff9a3c'
    for (const o of W.objects) if (!W.destroyed.has(o.id) && o.def.breakAt >= 14) rectRot(g, o, 1.5)
    // 修理ピット
    g.fillStyle = 'rgba(59,140,255,0.8)'
    for (const r of W.repair) g.fillRect(-r.x1, -r.z1, r.x1 - r.x0, r.z1 - r.z0)
    // 次のゲート
    const e = race.entries.find(en => en.car === me)
    const gt = W.gates[Math.min(e.cp, W.gates.length - 1)]
    g.strokeStyle = '#ffb020'; g.lineWidth = 4 / sc
    g.beginPath(); g.moveTo(-gt.x0, -gt.z); g.lineTo(-gt.x1, -gt.z); g.stroke()
    // 車
    for (const en of race.entries) {
      const c = en.car
      if (c === me) continue
      g.fillStyle = en.color || '#fff'
      g.beginPath(); g.arc(-c.x, -c.z, 4 / sc, 0, Math.PI * 2); g.fill()
    }
    g.restore()
    g.restore()
    // 自分（中央の三角）
    g.fillStyle = '#ff5a1f'; g.strokeStyle = '#fff'; g.lineWidth = 2
    g.beginPath(); g.moveTo(R, R - 9); g.lineTo(R + 6, R + 7); g.lineTo(R - 6, R + 7); g.closePath(); g.fill(); g.stroke()
  }
}

function rectRot(g, o, pad = 0) {
  g.save()
  g.translate(-o.cx, -o.cz)
  g.rotate(Math.PI - (o.yaw || 0))
  g.fillRect(-o.hw - pad, -o.hl - pad, (o.hw + pad) * 2, (o.hl + pad) * 2)
  g.restore()
}

export function fmt(s) {
  if (s == null) return '--:--.--'
  const m = Math.floor(s / 60), r = s - m * 60
  return `${m}:${r.toFixed(2).padStart(5, '0')}`
}

// コース全体図（遊び方の画面）
export function drawFullMap(cv, W) {
  const g = cv.getContext('2d')
  const { x0, x1, z0, z1 } = { x0: -310, x1: 240, z0: -60, z1: 1215 }
  const sc = Math.min(cv.width / (x1 - x0), cv.height / (z1 - z0))
  g.clearRect(0, 0, cv.width, cv.height)
  g.save()
  // 北が上、東が右
  g.translate(cv.width / 2 - ((x0 + x1) / 2) * sc, cv.height - 6)
  g.scale(sc, -sc)
  g.fillStyle = 'rgba(120,80,60,0.55)'
  g.fillRect(-230, 660, 380, 100) // 峡谷
  g.lineCap = 'round'; g.lineJoin = 'round'
  for (const r of W.roads) {
    g.strokeStyle = r.surf === 'dirt' ? '#a8814f' : '#cfd3da'
    g.lineWidth = Math.max(3 / sc, r.w)
    g.beginPath(); r.pts.forEach(([x, z], i) => i ? g.lineTo(x, z - z0) : g.moveTo(x, z - z0)); g.stroke()
  }
  g.fillStyle = '#cfd3da'
  for (const sl of W.slabs) if (!sl.needs && sl.kind !== 'mound') { g.save(); g.translate(sl.cx, sl.cz - z0); g.fillRect(-sl.hw, -sl.hl, sl.hw * 2, sl.hl * 2); g.restore() }
  g.fillStyle = 'rgba(0,0,0,0.5)'
  for (const o of W.colliders) if (o.kind === 'building' || o.kind === 'whouse') g.fillRect(o.cx - o.hw, o.cz - o.hl - z0, o.hw * 2, o.hl * 2)
  g.strokeStyle = '#ffb020'; g.lineWidth = 3 / sc
  for (const gt of W.gates) { g.beginPath(); g.moveTo(gt.x0, gt.z - z0); g.lineTo(gt.x1, gt.z - z0); g.stroke() }
  g.restore()
  // ルート名
  g.font = 'bold 12px "Chakra Petch", sans-serif'
  g.textAlign = 'center'
  const P = (x, z) => [cv.width / 2 + (x - (x0 + x1) / 2) * sc, cv.height - 6 - (z - z0) * sc]
  for (const l of W.labels) {
    const [px, py] = P(l.x, l.z)
    g.fillStyle = '#14161a'; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#f2c230'; g.fillText(l.t, px, py + 4)
  }
  for (const gt of W.gates) { const [px, py] = P(gt.x1 - 20, gt.z); g.fillStyle = '#ffb020'; g.textAlign = 'right'; g.fillText(gt.name, px, py - 4) }
  const [sx, sy] = P(0, 0); g.fillStyle = '#36c37a'; g.textAlign = 'center'; g.fillText('START', sx, sy + 2)
}
