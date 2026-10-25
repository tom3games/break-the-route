// 表示の文言（日本語・英語）。data-t="key" の要素はここから埋める
const D = {
  ja: {
    tagline: '道は、壊して作る。',
    story: '取り壊しが決まった旧市街から峡谷を越えて山の町まで。ルールはひとつ、4つのゲートを順に抜けて先にゴールした者が勝つ。道を選ぶのも、作るのも自由。',
    name: 'ドライバー名', offline: 'オフラインで走る', online: 'オンライン対戦', onlineSoon: 'オンライン対戦（準備中）', garage: 'ガレージ', howto: '遊び方',
    cpu: 'CPUの数', start: 'スタート', back: '戻る', credits: '所持金', buy: '購入', max: '最大', equip: '使う',
    paint: '塗装', upgrades: '改造', cars: '車種',
    statTop: '最高速', statAcc: '加速', statGrip: 'グリップ', statDur: '耐久', statMass: '重さ', statBoost: 'ブースト', statAir: '空中制御',
    pos: '位', time: 'タイム', resume: '再開', respawn: 'リスポーン (R)', retire: 'リタイアしてタイトルへ', paused: 'ポーズ',
    results: 'リザルト', again: 'もう一度', toGarage: 'ガレージへ', toTitle: 'タイトル', earned: '獲得', breaks: '破壊', air: '最長滞空', body: '車体',
    dnf: 'リタイア', left: '途中退出', goal: 'GOAL', you: 'あなた',
    msgWreck: '大破', msgFall: '落下', msgOverheat: 'オーバーヒート', msgRepair: '修理中', msgBoostEmpty: 'ブースト切れ', msgCrash: 'クラッシュ着地',
    msgBreakWall: '壁を突破', msgTower: '鉄塔が倒れる', msgBigAir: 'ビッグエア', wrongWay: '逆走', recharge: '充電中',
    partBody: '車体', partEngine: 'エンジン', partTires: 'タイヤ', partSusp: 'サスペンション', partCool: '冷却', heat: '熱',
    nextCp: '次', lang: 'English', mute: '音を消す', unmute: '音を出す',
    hintStart: 'W アクセル / S ブレーキ・バック / A D ハンドル / Space ドリフト / Shift ブースト',
    tipBridge: '崩れた橋はブーストなしでは届かない', tipWall: '倉庫の壁はかなりの速さでないと割れない',
    howtoTitle: '遊び方',
    howto1: '4つのゲート（CP1・CP2・CP3・GOAL）を順番に通ってゴールを目指す。ゲートの間はどこを走ってもいい。',
    howto2: '各区間に複数の道がある。A は安全で長い。B は壊して進む。C と E は飛ぶ。D は細くて曲がりくねっている。',
    howto3: 'ぶつけると車体・エンジン・タイヤ・サスペンション・冷却が傷み、速さや曲がりやすさが落ちる。青い PIT にゆっくり入ると直る。',
    howto4: 'ブーストは有限。直線で使うか、崩れた橋のジャンプに取っておくか。ドリフトと空中で少しずつ溜まる。使い切ると30%まで溜まるまで使えない。',
    howto5: '大破や谷への落下は、直前のゲートから戻される。R で自分から戻ることもできる。',
    howto6: '賞金で車を改造できる。上げれば何かが下がる。耐久を上げれば無茶なルートに挑みやすくなる。',
    keys: '操作', kAccel: 'アクセル', kBrake: 'ブレーキ / バック', kSteer: 'ハンドル', kDrift: 'ドリフト（サイドブレーキ）', kBoost: 'ニトロブースト', kAir: '空中で W/S 前後の傾き、A/D 左右の傾き', kRespawn: 'リスポーン', kPause: 'ポーズ', kCam: 'カメラ切替', kMute: '音のオンオフ',
    pad: 'ゲームパッド: RT アクセル / LT ブレーキ / A ブースト / X ドリフト / Y リスポーン',
    countGo: 'GO', placeSuffix: ['ST', 'ND', 'RD', 'TH'],
    onlineLead: '部屋を作って招待リンクを送るか、友達の部屋のコードを入れる。2〜8人。空いた枠はCPUで埋められる。',
    createRoom: '部屋を作る', joinRoom: '参加', roomCode: '部屋コード', copy: 'コピー', copied: 'コピーした',
    waitHost: 'ホストがスタートするのを待っています', leaveRoom: '部屋を出る', host: 'ホスト', offlineTag: '切断中',
    errNotFound: 'その部屋は見つからない', errStarted: 'レース中の部屋には入れない。終わるまで待って', errFull: '満員', errName: '名前を入れて', errConn: 'サーバーにつながらない',
    noServer: 'オンライン対戦はサーバー版で遊べる（README 参照）。このページはオフライン専用。',
    toLobby: 'ロビーへ', waitRematch: 'ホストの再戦を待っています', netOn: 'ONLINE', netOff: 'OFFLINE',
    pcOnly: '',
    tSteer: 'ここをなぞってハンドル', tGas: 'アクセル', tBrake: 'ブレーキ',
    hintTouch: '左手: なぞってハンドル　右手: アクセル・ブレーキ・NITRO・DRIFT'
  },
  en: {
    tagline: 'Break it. Make your own route.',
    story: 'From a condemned old town, across the canyon, to the mountain village. One rule: pass the four gates in order and finish first. Choose your road, or make one.',
    name: 'Driver name', offline: 'Race offline', online: 'Online race', onlineSoon: 'Online race (coming soon)', garage: 'Garage', howto: 'How to play',
    cpu: 'CPU racers', start: 'Start', back: 'Back', credits: 'Credits', buy: 'Buy', max: 'MAX', equip: 'Select',
    paint: 'Paint', upgrades: 'Upgrades', cars: 'Cars',
    statTop: 'Top speed', statAcc: 'Accel', statGrip: 'Grip', statDur: 'Durability', statMass: 'Weight', statBoost: 'Boost', statAir: 'Air control',
    pos: '', time: 'Time', resume: 'Resume', respawn: 'Respawn (R)', retire: 'Retire to title', paused: 'Paused',
    results: 'Results', again: 'Race again', toGarage: 'Garage', toTitle: 'Title', earned: 'Earned', breaks: 'Smashed', air: 'Best air', body: 'Body',
    dnf: 'DNF', left: 'Left', goal: 'GOAL', you: 'YOU',
    msgWreck: 'WRECKED', msgFall: 'FELL', msgOverheat: 'OVERHEAT', msgRepair: 'REPAIRING', msgBoostEmpty: 'BOOST EMPTY', msgCrash: 'CRASH LANDING',
    msgBreakWall: 'WALL BREACHED', msgTower: 'TOWER DOWN', msgBigAir: 'BIG AIR', wrongWay: 'WRONG WAY', recharge: 'RECHARGING',
    partBody: 'Body', partEngine: 'Engine', partTires: 'Tires', partSusp: 'Suspension', partCool: 'Cooling', heat: 'Heat',
    nextCp: 'Next', lang: '日本語', mute: 'Mute', unmute: 'Unmute',
    hintStart: 'W throttle / S brake-reverse / A D steer / Space drift / Shift boost',
    tipBridge: 'The broken bridge needs boost', tipWall: 'The warehouse wall only breaks at high speed',
    howtoTitle: 'How to play',
    howto1: 'Pass the four gates (CP1, CP2, CP3, GOAL) in order. Between gates you may drive anywhere.',
    howto2: 'Every section has several roads. A is safe and long. B is smash-through. C and E are jumps. D is narrow and twisty.',
    howto3: 'Crashes damage body, engine, tires, suspension and cooling, which costs speed and handling. Roll slowly into a blue PIT to repair.',
    howto4: 'Boost is limited. Spend it on a straight or save it for the broken bridge. It refills a little from drifting and air time. Once empty it locks until 30%.',
    howto5: 'Wrecks and falls send you back to the last gate. Press R to respawn yourself.',
    howto6: 'Spend prize money on upgrades. Every gain has a cost. More durability makes risky routes survivable.',
    keys: 'Controls', kAccel: 'Throttle', kBrake: 'Brake / reverse', kSteer: 'Steer', kDrift: 'Drift (handbrake)', kBoost: 'Nitro boost', kAir: 'In the air: W/S pitch, A/D roll', kRespawn: 'Respawn', kPause: 'Pause', kCam: 'Camera', kMute: 'Sound on/off',
    pad: 'Gamepad: RT throttle / LT brake / A boost / X drift / Y respawn',
    countGo: 'GO', placeSuffix: ['ST', 'ND', 'RD', 'TH'],
    onlineLead: 'Create a room and send the invite link, or enter a friend\'s room code. 2-8 players. Empty slots can be filled with CPUs.',
    createRoom: 'Create room', joinRoom: 'Join', roomCode: 'Room code', copy: 'Copy', copied: 'Copied',
    waitHost: 'Waiting for the host to start', leaveRoom: 'Leave room', host: 'HOST', offlineTag: 'Offline',
    errNotFound: 'Room not found', errStarted: 'Race in progress. Wait for it to finish', errFull: 'Room is full', errName: 'Enter a name', errConn: 'Cannot reach the server',
    noServer: 'Online races need the server build (see README). This page is offline only.',
    toLobby: 'Lobby', waitRematch: 'Waiting for the host', netOn: 'ONLINE', netOff: 'OFFLINE',
    pcOnly: '',
    tSteer: 'Slide here to steer', tGas: 'GAS', tBrake: 'BRAKE',
    hintTouch: 'Left: slide to steer   Right: gas, brake, NITRO, DRIFT'
  }
}

let lang = 'ja'
try { lang = localStorage.getItem('btr-lang') || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en') } catch {}

export const t = k => (D[lang] && D[lang][k] != null ? D[lang][k] : D.ja[k] ?? k)
export const getLang = () => lang
export function setLang(l) { lang = l; try { localStorage.setItem('btr-lang', l) } catch {} ; applyI18n() }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t) })
  document.documentElement.lang = lang
}
export function placeText(n) {
  const s = t('placeSuffix')
  return n + (n <= 3 ? s[n - 1] : s[3])
}
