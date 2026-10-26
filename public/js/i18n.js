// 表示の文言（日本語・英語）。data-t="key" の要素はここから埋める
const D = {
  ja: {
    tagline: '道は、壊して作る。',
    story: '大通りと運河の街、峠と峡谷。ゲートを順に抜けて、誰より先にゴールへ。道は選んでも、壊して作ってもいい。',
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
    hintStart: 'W アクセル / S ブレーキ（曲がりながらでドリフト）/ A D ハンドル / Shift ニトロ（2回目でパーフェクト）',
    tipBridge: '崩れた橋はブーストなしでは届かない', tipWall: '倉庫の壁はかなりの速さでないと割れない',
    howtoTitle: '遊び方',
    howto1: 'ゲート（CP）を順番に通ってゴールへ。街は2周。ゲートの間はどこを走ってもいい。車の上の矢印と光の柱が次のゲート。',
    howto2: '湾岸シティ: 大通り・路地・公園・広場・駐車場を突っ切れて、一般車が走る。運河の跳ね橋は飛び越えられる。峠と峡谷: 九十九折りの峠道と崩れた橋。',
    howto3: 'ジャンプ台から飛ぶと技。黄黒の斜め線の台はバレルロール、ドリフトしながら飛ぶとフラットスピン。決まるとニトロが溜まる。着地では壊れない。',
    howto4: 'ニトロは技・ドリフト・空中・体当たり・すれすれ追い越しで溜まる。ニトロを入れた直後、ゲージの赤い区間が光ったらもう一度押すとパーフェクトニトロ。',
    howto5: '横や後ろから勢いよく当てると相手はスピンして脱落（TAKEDOWN）。壁に強くぶつけると傷むが、壊れてもすぐ近くの道に戻れる。',
    howto6: '賞金で車を改造できる。上げれば何かが下がる。',
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
    stageCity: '湾岸シティ（街・2周）', stageTouge: '峠と峡谷',
    shortcutHint: '近道！ バリケードを壊して突っ込め',
    tSteer: '', tGas: 'アクセル', tBrake: 'ブレーキ',
    hintTouch: '左手: 左右でハンドル　右手: アクセル（押すと入りっぱなし）・ブレーキ（曲がりながらでドリフト）・ニトロ'
  },
  en: {
    tagline: 'Break it. Make your own route.',
    story: 'A canal city of boulevards, and a mountain pass over a canyon. Pass the gates in order and finish first. Pick a road, or smash a new one.',
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
    hintStart: 'W gas / S brake (drift while turning) / A D steer / Shift nitro (tap again for Perfect)',
    tipBridge: 'The broken bridge needs boost', tipWall: 'The warehouse wall only breaks at high speed',
    howtoTitle: 'How to play',
    howto1: 'Pass the gates (CP) in order. The city is 2 laps. Between gates, drive anywhere. The arrow above your car and the light pillar show the next gate.',
    howto2: 'Bay City: boulevards, alleys, parks, plazas and parking lots to cut through, with traffic. Jump the broken drawbridge over the canal. Pass & Canyon: hairpins and a broken bridge.',
    howto3: 'Ramps give stunts. Striped ramps barrel roll; drift off a ramp to flat spin. Stunts refill nitro. Landings never damage the car.',
    howto4: 'Nitro refills from stunts, drifts, air time, takedowns and near misses. Right after you fire nitro, tap again while the red zone glows for Perfect Nitro.',
    howto5: 'Ram rivals from the side or rear to spin them out (TAKEDOWN). Hard wall hits damage the car, but you respawn right on the road.',
    howto6: 'Spend prize money on upgrades. Every gain has a cost.',
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
    stageCity: 'Bay City (2 laps)', stageTouge: 'Pass & Canyon',
    shortcutHint: 'SHORTCUT! Smash through the barricade',
    tSteer: '', tGas: 'GAS', tBrake: 'BRAKE',
    hintTouch: 'Left: steer   Right: gas (tap to toggle), brake (drift while turning), nitro'
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
