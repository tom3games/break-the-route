// ゲーム全体の調整値。ブラウザとサーバーの両方が読む（three.js に依存しない）。
// 車の挙動・耐久・ブースト・改造・報酬はここだけ触れば変えられる。

export const GAME = {
  title: 'BREAK THE ROUTE',      // 仮称。表示名はここだけ
  titleJa: 'ブレイク・ザ・ルート',
  maxPlayers: 8,
  minPlayers: 1,
  countdownSec: 4,
  finishGraceSec: 45,            // 1位がゴールしてから締め切るまで
  respawnFreezeSec: 1.2,         // 手動リスポーンの停止時間
  wreckRespawnSec: 2.0,          // 大破してから戻るまで
  wreckRepairTo: 0.55,           // 大破から戻ったときの各部位の下限
  fallY: -32,                    // これより下は落下扱い
  step: 1 / 60,                  // 物理の固定ステップ
  netHz: 30,                     // 自車の状態を送る頻度
  snapHz: 20                     // サーバーが全車を配る頻度
}

export const PHYS = {
  gravity: 22,          // 実際より重め。ジャンプが間延びしない
  rideHeight: 0.55,     // 車体原点から接地面まで
  suspTravel: 0.38,
  stepUp: 1.1,          // これ以下の段差は乗り上げる
  carRadius: 1.15,      // 当たり判定の円（前後2つ）
  carHalfLen: 1.2,
  aeroDrag: 0.00045,
  rolling: 0.9,
  airRate: 2.6,         // 空中の姿勢変化の速さ（rad/s）
  safeLand: 12,         // これより遅い着地は無傷（m/s, 面の法線方向）
  maxPlausibleSpeed: 95 // サーバーの瞬間移動チェック（m/s）
}

// 路面ごとのグリップと抵抗
export const SURFACE = {
  road:  { grip: 1.0,  roll: 1.0, name: 'road' },
  dirt:  { grip: 0.82, roll: 1.6, name: 'dirt' },
  grass: { grip: 0.7,  roll: 2.4, name: 'grass' },
  wood:  { grip: 0.9,  roll: 1.2, name: 'wood' }
}

// 車種。値は係数（1 = 基準車）
export const CARS = {
  runner: {
    name: 'RUNNER', nameJa: 'ランナー', desc: '癖のない基準車', descEn: 'Balanced all-rounder',
    mass: 1.0, maxSpeed: 46, accel: 19, grip: 7.5, steer: 2.3, durability: 1.0, boost: 1.0, air: 1.0, color: 0xe8432e
  },
  bruiser: {
    name: 'BRUISER', nameJa: 'ブルーザー', desc: '重くて硬い。壁を割りやすい', descEn: 'Heavy and tough. Smashes walls',
    mass: 1.35, maxSpeed: 44, accel: 16.5, grip: 7.0, steer: 2.0, durability: 1.55, boost: 1.05, air: 0.8, color: 0x2f7fe0
  },
  dart: {
    name: 'DART', nameJa: 'ダート', desc: '軽くて速い。壊れやすい', descEn: 'Light and quick. Fragile',
    mass: 0.8, maxSpeed: 48, accel: 21, grip: 8.0, steer: 2.5, durability: 0.7, boost: 1.0, air: 1.3, color: 0xf2c230
  }
}

// 改造。レベル0〜3。上げると何かが下がる
export const UPGRADES = {
  engine:     { name: 'エンジン',     nameEn: 'Engine',     cost: [300, 600, 1000], up: '最高速と加速', down: 'グリップと発熱',
                apply: (s, l) => { s.maxSpeed *= 1 + 0.04 * l; s.accel *= 1 + 0.05 * l; s.grip *= 1 - 0.03 * l; s.heat *= 1 + 0.12 * l } },
  turbo:      { name: 'ターボ',       nameEn: 'Turbo',      cost: [250, 500, 900],  up: 'ブースト量と推力', down: '冷却',
                apply: (s, l) => { s.boostCap *= 1 + 0.15 * l; s.boostForce *= 1 + 0.08 * l; s.heat *= 1 + 0.1 * l } },
  tires:      { name: 'タイヤ',       nameEn: 'Tires',      cost: [200, 450, 800],  up: 'グリップ', down: '最高速',
                apply: (s, l) => { s.grip *= 1 + 0.08 * l; s.maxSpeed *= 1 - 0.015 * l } },
  suspension: { name: 'サスペンション', nameEn: 'Suspension', cost: [250, 500, 850],  up: '着地の強さと空中制御', down: '重量',
                apply: (s, l) => { s.landing *= 1 + 0.18 * l; s.air *= 1 + 0.1 * l; s.mass *= 1 + 0.03 * l } },
  armor:      { name: '装甲',         nameEn: 'Armor',      cost: [300, 600, 1000], up: '耐久', down: '重量（加速が落ちる）',
                apply: (s, l) => { s.durability *= 1 + 0.22 * l; s.mass *= 1 + 0.08 * l } },
  weight:     { name: '軽量化',       nameEn: 'Lightweight', cost: [250, 500, 850], up: '加速', down: '耐久',
                apply: (s, l) => { s.mass *= 1 - 0.06 * l; s.durability *= 1 - 0.1 * l } }
}

export const PAINTS = [0xe8432e, 0x2f7fe0, 0xf2c230, 0x2fbf71, 0xf07acb, 0xeeeeee, 0x2b2b30, 0xff8a1f]

// 壊せる物の種類。breakAt は「衝突の法線速度 × 車の重さ係数」の閾値（m/s）
// absorb は壊したときに失う速度の割合、hard は壊せなかったときの硬さ（ダメージ倍率）
export const DESTRUCT = {
  cone:      { breakAt: 1,  absorb: 0.01, hard: 0.1, debris: 3,  color: 0xff7a1a, w: 0.6, l: 0.6, h: 0.8 },
  barricade: { breakAt: 3,  absorb: 0.04, hard: 0.3, debris: 6,  color: 0xf4f4f4, w: 3.0, l: 0.5, h: 1.1 },
  fence:     { breakAt: 5,  absorb: 0.06, hard: 0.4, debris: 8,  color: 0x9b6a3c, w: 4.0, l: 0.3, h: 1.4 },
  tempfence: { breakAt: 6,  absorb: 0.07, hard: 0.4, debris: 6,  color: 0x8aa0b0, w: 4.0, l: 0.3, h: 2.0 },
  sign:      { breakAt: 5,  absorb: 0.05, hard: 0.4, debris: 5,  color: 0x2e8bd8, w: 2.4, l: 0.4, h: 2.6 },
  lamp:      { breakAt: 9,  absorb: 0.08, hard: 0.7, debris: 4,  color: 0x6d7480, w: 0.5, l: 0.5, h: 6.5 },
  lumber:    { breakAt: 19, absorb: 0.25, hard: 1.1, debris: 12, color: 0xc4904f, w: 3.2, l: 2.2, h: 1.6 },
  guardrail: { breakAt: 17, absorb: 0.15, hard: 1.0, debris: 4,  color: 0xc9ced6, w: 4.0, l: 0.4, h: 0.9 },
  wall:      { breakAt: 31, absorb: 0.42, hard: 1.6, debris: 22, color: 0xa65a3f, w: 16,  l: 1.2, h: 6.0 },
  tower:     { breakAt: 14, absorb: 0.18, hard: 0.9, debris: 8,  color: 0xe0a020, w: 1.6, l: 1.6, h: 48 }
}

// ダメージの係数
export const DAMAGE = {
  wallBase: 0.0065,     // 壁衝突: (法線速度-4)^1.3 * これ * 硬さ
  wallFree: 4,
  landBase: 0.0075,
  boostMul: 1.35,       // ブースト中の衝突は重い
  carHit: 0.25          // 車同士は軽め
}

// 報酬（ゲーム内通貨）。保存は各プレイヤーのブラウザ
export const REWARD = {
  place: [700, 520, 420, 340, 280, 240, 210, 190],
  finish: 100,
  perBreak: 8,
  breakCap: 240,
  dnf: 80
}

// 車種と改造レベルから実際の性能値を作る。サーバーでも同じ関数で作るので画面からの値は信じない
export function buildStats(carId, levels = {}) {
  const c = CARS[carId] || CARS.runner
  const s = {
    car: CARS[carId] ? carId : 'runner',
    mass: c.mass, maxSpeed: c.maxSpeed, accel: c.accel, grip: c.grip, steer: c.steer,
    durability: c.durability, air: c.air, landing: 1,
    boostCap: 3.2 * c.boost, boostForce: 15 * c.boost, boostTop: 16, heat: 1
  }
  for (const [k, u] of Object.entries(UPGRADES)) {
    const l = clampLevel(levels[k])
    if (l) u.apply(s, l)
  }
  // 重いほど加速が鈍る
  s.accel /= Math.sqrt(s.mass)
  return s
}

export function clampLevel(v) {
  const n = Math.round(Number(v) || 0)
  return Math.max(0, Math.min(3, n))
}
