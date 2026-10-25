// スマホのタッチ操作。左手: ハンドル（押した所から左右に指をずらす。空中では上下で前後の傾き）
// 右手: アクセル（大）・ブレーキ/バック・ブースト・ドリフト。上: ポーズ・カメラ・リスポーン
// 複数の指を同時に使えるよう、ボタンごとに pointerId を覚えておく。
export class Touch {
  constructor(root, { onPause, onCam, onRespawn }) {
    this.root = root
    this.state = { steer: 0, pitch: 0, throttle: 0, brake: 0, boost: false, drift: false }
    this.active = false
    const hold = (el, key, on = 1) => {
      const ids = new Set()
      const down = e => { e.preventDefault(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId) } catch {}; this.state[key] = on; el.classList.add('on') }
      const up = e => { ids.delete(e.pointerId); if (!ids.size) { this.state[key] = typeof on === 'boolean' ? false : 0; el.classList.remove('on') } }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up)
    }
    const q = s => root.querySelector(s)
    hold(q('[data-k=gas]'), 'throttle')
    hold(q('[data-k=brake]'), 'brake')
    hold(q('[data-k=boost]'), 'boost', true)
    hold(q('[data-k=drift]'), 'drift', true)
    const tap = (sel, fn) => q(sel).addEventListener('pointerdown', e => { e.preventDefault(); fn() })
    tap('[data-k=pause]', onPause); tap('[data-k=cam]', onCam); tap('[data-k=respawn]', onRespawn)

    // ハンドル: 触れた点を中心に、横へのずれで切る
    const pad = q('.t-steer'), knob = q('.t-knob')
    let sid = null, sx = 0, sy = 0
    const R = () => Math.max(46, Math.min(90, innerWidth * 0.08))
    pad.addEventListener('pointerdown', e => {
      e.preventDefault()
      if (sid != null) return
      sid = e.pointerId; sx = e.clientX; sy = e.clientY
      try { pad.setPointerCapture(e.pointerId) } catch {}
      const r = pad.getBoundingClientRect()
      knob.style.left = (sx - r.left) + 'px'; knob.style.top = (sy - r.top) + 'px'
      knob.classList.add('on')
    })
    pad.addEventListener('pointermove', e => {
      if (e.pointerId !== sid) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      this.state.steer = Math.max(-1, Math.min(1, dx / R()))
      this.state.pitch = Math.max(-1, Math.min(1, dy / R()))
      knob.style.transform = `translate(calc(-50% + ${this.state.steer * R() * 0.6}px), calc(-50% + ${this.state.pitch * R() * 0.4}px))`
    })
    const end = e => {
      if (e.pointerId !== sid) return
      sid = null; this.state.steer = 0; this.state.pitch = 0
      knob.style.transform = 'translate(-50%, -50%)'
      knob.classList.remove('on')
    }
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end)
    // 長押しメニュー・選択・拡大を出さない
    root.addEventListener('contextmenu', e => e.preventDefault())
  }

  show(on) {
    this.active = on
    this.root.classList.toggle('hidden', !on)
    if (!on) for (const k of Object.keys(this.state)) this.state[k] = typeof this.state[k] === 'boolean' ? false : 0
  }
}
