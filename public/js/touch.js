// スマホのタッチ操作。左手: 左右のボタンでハンドル（空中では車体を傾ける）
// 右手: アクセル（大）・ブレーキ/バック・ブースト・ドリフト。上: ポーズ・カメラ・リスポーン
// 複数の指を同時に使えるよう、ボタンごとに pointerId を覚えておく。
export class Touch {
  constructor(root, { onPause, onCam, onRespawn }) {
    this.root = root
    this.state = { left: false, right: false, throttle: 0, brake: 0, boost: false, drift: false }
    this.active = false
    const hold = (el, key, on = 1) => {
      const ids = new Set()
      const down = e => { e.preventDefault(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId) } catch {}; this.state[key] = on; el.classList.add('on') }
      const up = e => { ids.delete(e.pointerId); if (!ids.size) { this.state[key] = typeof on === 'boolean' ? false : 0; el.classList.remove('on') } }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up)
    }
    const q = s => root.querySelector(s)
    // アクセルはスイッチ式: 1回押すと入りっぱなし、もう1回で切れる
    const gas = q('[data-k=gas]')
    gas.addEventListener('pointerdown', e => { e.preventDefault(); this.setGas(!this.gasOn) })
    hold(q('[data-k=brake]'), 'brake')
    hold(q('[data-k=boost]'), 'boost', true)
    hold(q('[data-k=drift]'), 'drift', true)
    const tap = (sel, fn) => q(sel).addEventListener('pointerdown', e => { e.preventDefault(); fn() })
    tap('[data-k=pause]', onPause); tap('[data-k=cam]', onCam); tap('[data-k=respawn]', onRespawn)

    // 左右のボタン（押している間だけ切る。切れ方は input.js でなめらかにする）
    hold(q('[data-k=left]'), 'left', true)
    hold(q('[data-k=right]'), 'right', true)
    // 長押しメニュー・選択・拡大を出さない
    root.addEventListener('contextmenu', e => e.preventDefault())
  }

  setGas(on) {
    this.gasOn = on
    this.state.throttle = on ? 1 : 0
    this.root.querySelector('[data-k=gas]').classList.toggle('on', on)
  }

  show(on) {
    const was = this.active
    this.active = on
    this.root.classList.toggle('hidden', !on)
    if (!on) for (const k of Object.keys(this.state)) if (k !== 'throttle') this.state[k] = typeof this.state[k] === 'boolean' ? false : 0
    if (on && !was) this.setGas(this.gasOn ?? true) // レースに出たらアクセルは入った状態から
  }
}
