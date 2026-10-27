// 表示の文言（日本語・英語）。data-t="key" の要素はここから埋める
const D = {
  ja: {
    tagline: '逃げ切るか、捕まえるか。',
    story: '運河の街で、警察と犯人のカーチェイス。犯人は3分逃げ切るか、隠れ家へ。警察はぶつけて止めて逮捕する。柵も一般車も吹き飛ばせる。',
    name: 'ドライバー名', offline: '犯人で逃げる', offlineCop: '警察で捕まえる', online: 'オンライン対戦', onlineSoon: 'オンライン対戦（準備中）', garage: 'ガレージ', howto: '遊び方',
    cpu: '警察の数', start: 'スタート', back: '戻る', credits: '所持金', buy: '購入', max: '最大', equip: '使う',
    paint: '塗装', upgrades: '改造', cars: '車種',
    statTop: '最高速', statAcc: '加速', statGrip: 'グリップ', statDur: '耐久', statMass: '重さ', statBoost: 'ブースト', statAir: '空中制御',
    pos: '位', time: 'タイム', resume: '再開', respawn: 'リスポーン (R)', retire: 'リタイアしてタイトルへ', paused: 'ポーズ',
    results: 'リザルト', again: 'もう一度', toGarage: 'ガレージへ', toTitle: 'タイトル', earned: '獲得', breaks: '破壊', air: '最長滞空', body: '車体',
    dnf: 'リタイア', left: '途中退出', goal: 'GOAL', you: 'あなた',
    msgWreck: '大破', msgFall: '落下', msgOverheat: 'オーバーヒート', msgRepair: '修理中', msgBoostEmpty: 'ブースト切れ', msgCrash: 'クラッシュ着地',
    msgBreakWall: '壁を突破', msgTower: '鉄塔が倒れる', msgBigAir: 'ビッグエア', wrongWay: '逆走', recharge: '充電中',
    partBody: '車体', partEngine: 'エンジン', partTires: 'タイヤ', partSusp: 'サスペンション', partCool: '冷却', heat: '熱',
    nextCp: '次', lang: 'English', mute: '音を消す', unmute: '音を出す',
    hintStart: 'W アクセル / S ブレーキ（曲がりながらでドリフト）/ A D ハンドル / Shift ニトロ',
    roleCop: '警察', roleRobber: '犯人', busted: '逮捕', escaped: '逃走成功', onRun: '逃走中',
    bustYou: '逮捕されそう', bustCop: '逮捕ゲージ', escapeGoal: '逃げ切れ', hideoutIn: '隠れ家まであと', toHideout: '隠れ家へ',
    robberDist: '犯人まで', lastSeen: '最後の目撃まで', findRobber: '無線を待て',
    msgBusted: '逮捕！', msgEscaped: '逃げ切った！', msgCaught: '捕まった…', msgLost: '逃げられた…',
    radioSeen: '犯人は{area}を{dir}へ逃走中', radioSeenStop: '犯人は{area}にいる', radioHideout: '隠れ家が開いた（{area}）', radioHeat: '手配度 {n}', radioHeli: 'ヘリが出動した', radioCopDown: '1台やられた。応援を回す', msgCopDown: 'パトカー撃破', msgCopDownSub: '{n}秒で離れた場所から復帰',
    radioCopHideout: '警察は隠れ家を知らない。見られずに入れ', startRobber: '逃げろ！ 警察は3秒後に動き出す', startCop: '犯人を追え！ 地図の赤い点と無線が手がかり',
    winByBust: '逮捕', winByWreck: '大破させて逮捕', winByTime: '時間いっぱい逃げ切り', winByHideout: '隠れ家に到着', winByLeft: '犯人が退出',
    radioHeliRobber: '警察ヘリが来た！ 赤い円はランチャーの着弾地点。曲がって避けろ', radioHeliCop: '警察ヘリが援護に来た。ランチャーで犯人を止める',
    msgMissile: 'ミサイル！', msgMissileSub: '赤い円から逃げろ', msgHitMissile: '被弾！', radioBackupCop: '応援が到着（パトカー {n} 台）', radioBackupRobber: '警察の応援が来た（パトカー {n} 台）', msgSpike: 'スパイクベルト！', msgSpikeSub: '黄色く光る帯の空いた側を抜けろ', msgFlat: 'パンク！', msgFlatSub: '修理工場で直せる', radioSpikeRobber: '前方にスパイクベルト。空いた側を抜けろ', radioSpikeCop: 'スパイクベルトを設置した', radioFlat: '犯人の車がパンクした', msgShot: '撃ってきた！', msgShotSub: '建物の陰に入れば当たらない', radioGunRobber: '手配度 2。パトカーが拳銃を撃ってくる。建物の陰を走れ', radioGunCop: '手配度 2。発砲許可が出た（CPU のパトカーが撃つ）',
    msgRepaired: '修理完了', msgRepairedSub: '耐久が全回復', msgRepairedLost: '全回復。手配度が下がり、警察は見失った', radioLost: '犯人を見失った。修理工場に入ったらしい',
    repairing: '修理中', repairSeen: '警察に見られている。ここでは直せない', repairWait: '修理工場はあと{n}秒で使える', repairHint: '修理工場: 止まって3秒で全回復',
    copWin: '警察の勝ち', robberWin: '犯人の勝ち', arrests: '逮捕', takedown: 'TAKEDOWN', roleLobby: '犯人はランダムで1人（6人以上なら2人）。残りは警察',
    tipBridge: '崩れた橋はブーストなしでは届かない', tipWall: '倉庫の壁はかなりの速さでないと割れない',
    howtoTitle: '遊び方',
    howto1: '犯人: 3分逃げ切れば勝ち。90秒たつと隠れ家が開く（緑の光の柱）。警察に見られずに（40m以内に警察がいない）入れば、その場で勝ち。',
    howto2: '警察: 犯人を逮捕すれば勝ち。犯人のすぐそばで犯人が遅くなる（時速40km未満。2台で囲めば72km、ぴったり付けば90km未満）と逮捕ゲージがたまる。体当たりで止めろ。犯人の車が大破したときに近くにいても逮捕。',
    howto3: '警察の地図には、犯人が近いときと無線（目撃情報）の直後だけ赤い点が出る。見失ったら、輪の印が最後の目撃。車の上の矢印が犯人（最後の目撃）を指す。',
    howto4: '手配度（星）は時間と、犯人が警察の車を大破させるたびに上がる。上がるほど警察が速くしつこくなり、応援のパトカーが増え（星5で最初より6台多い）、星2つからはパトカーが拳銃を撃ってくる（建物の陰なら当たらない）。星3つからはヘリが犯人を照らし、星4つからは行く手にスパイクベルト（踏むとパンク。修理工場で直る）を敷いてくる。',
    howto5: '柵・街灯・バリケード・一般車は吹き飛ばせる。犯人の車は丈夫で、壊れてもすぐ近くの道に戻れる（警察の近くで大破すると逮捕）。パトカーは体当たり2〜3回で大破し、燃えて約6秒後に遠くから戻る。',
    howto6: '修理工場（地図の青い四角・REPAIR の屋根）で3秒止まると全回復。犯人は警察に見られていると直せず、直すと手配度が下がる。手配度3からは警察ヘリが赤い円で予告してランチャーを撃つ。曲がって避けろ。',
    keys: '操作', kAccel: 'アクセル', kBrake: 'ブレーキ / バック', kSteer: 'ハンドル', kDrift: 'ドリフト（サイドブレーキ）', kBoost: 'ニトロブースト', kAir: '空中で W/S 前後の傾き、A/D 左右の傾き', kRespawn: 'リスポーン', kPause: 'ポーズ', kCam: 'カメラ切替', kMute: '音のオンオフ',
    pad: 'ゲームパッド: RT アクセル / LT ブレーキ / A ブースト / X ドリフト / Y リスポーン',
    countGo: 'GO', placeSuffix: ['ST', 'ND', 'RD', 'TH'],
    onlineLead: '部屋を作って招待リンクを送るか、友達の部屋のコードを入れる。1〜8人。犯人はランダムで1人（6人以上なら2人）、残りは警察。空いた枠はCPUの警察で埋められる。',
    createRoom: '部屋を作る', joinRoom: '参加', roomCode: '部屋コード', copy: 'コピー', copied: 'コピーした',
    waitHost: 'ホストがスタートするのを待っています', leaveRoom: '部屋を出る', host: 'ホスト', offlineTag: '切断中',
    errNotFound: 'その部屋は見つからない', errStarted: '追跡中の部屋には入れない。終わるまで待って', errFull: '満員', errName: '名前を入れて', errConn: 'サーバーにつながらない',
    noServer: 'オンライン対戦はサーバー版で遊べる（README 参照）。このページはオフライン専用。',
    toLobby: 'ロビーへ', waitRematch: 'ホストの再戦を待っています', netOn: 'ONLINE', netOff: 'OFFLINE',
    pcOnly: '',
    stageCity: '湾岸シティ（街・2周）', stageTouge: '峠と峡谷',
    shortcutHint: '近道！ バリケードを壊して突っ込め',
    tSteer: '', tGas: 'アクセル', tBrake: 'ブレーキ',
    hintTouch: '左手: 左右でハンドル　右手: アクセル（押すと入りっぱなし）・ブレーキ（曲がりながらでドリフト）・ニトロ'
  },
  en: {
    tagline: 'Run for it, or run them down.',
    story: 'Cops and robbers in a canal city. Robbers survive 3 minutes or reach the hideout. Cops ram, box in and arrest. Smash fences and traffic out of the way.',
    name: 'Driver name', offline: 'Play as robber', offlineCop: 'Play as cop', online: 'Online race', onlineSoon: 'Online race (coming soon)', garage: 'Garage', howto: 'How to play',
    cpu: 'Cops', start: 'Start', back: 'Back', credits: 'Credits', buy: 'Buy', max: 'MAX', equip: 'Select',
    paint: 'Paint', upgrades: 'Upgrades', cars: 'Cars',
    statTop: 'Top speed', statAcc: 'Accel', statGrip: 'Grip', statDur: 'Durability', statMass: 'Weight', statBoost: 'Boost', statAir: 'Air control',
    pos: '', time: 'Time', resume: 'Resume', respawn: 'Respawn (R)', retire: 'Retire to title', paused: 'Paused',
    results: 'Results', again: 'Race again', toGarage: 'Garage', toTitle: 'Title', earned: 'Earned', breaks: 'Smashed', air: 'Best air', body: 'Body',
    dnf: 'DNF', left: 'Left', goal: 'GOAL', you: 'YOU',
    msgWreck: 'WRECKED', msgFall: 'FELL', msgOverheat: 'OVERHEAT', msgRepair: 'REPAIRING', msgBoostEmpty: 'BOOST EMPTY', msgCrash: 'CRASH LANDING',
    msgBreakWall: 'WALL BREACHED', msgTower: 'TOWER DOWN', msgBigAir: 'BIG AIR', wrongWay: 'WRONG WAY', recharge: 'RECHARGING',
    partBody: 'Body', partEngine: 'Engine', partTires: 'Tires', partSusp: 'Suspension', partCool: 'Cooling', heat: 'Heat',
    nextCp: 'Next', lang: '日本語', mute: 'Mute', unmute: 'Unmute',
    hintStart: 'W gas / S brake (drift while turning) / A D steer / Shift nitro',
    roleCop: 'COP', roleRobber: 'ROBBER', busted: 'BUSTED', escaped: 'ESCAPED', onRun: 'On the run',
    bustYou: 'Getting busted', bustCop: 'Bust meter', escapeGoal: 'Escape', hideoutIn: 'Hideout opens in', toHideout: 'Hideout',
    robberDist: 'Robber', lastSeen: 'Last seen', findRobber: 'Wait for the radio',
    msgBusted: 'BUSTED!', msgEscaped: 'ESCAPED!', msgCaught: 'Caught...', msgLost: 'They got away...',
    radioSeen: 'Suspect heading {dir} in {area}', radioSeenStop: 'Suspect spotted in {area}', radioHideout: 'Hideout open ({area})', radioHeat: 'Wanted level {n}', radioHeli: 'Helicopter dispatched', radioCopDown: 'Unit down. Sending backup', msgCopDown: 'COP WRECKED', msgCopDownSub: 'Back in {n}s somewhere else',
    radioCopHideout: 'The cops do not know the hideout. Get in unseen', startRobber: 'Run! The cops move in 3 seconds', startCop: 'Chase the robber! Red dots and radio reports are your leads',
    winByBust: 'Busted', winByWreck: 'Wrecked and busted', winByTime: 'Survived the clock', winByHideout: 'Reached the hideout', winByLeft: 'Robber left',
    radioHeliRobber: 'Police chopper inbound! Red circles mark missile strikes. Turn to dodge', radioHeliCop: 'Air support inbound. The chopper will fire on the suspect',
    msgMissile: 'MISSILE!', msgMissileSub: 'Get out of the red circle', msgHitMissile: 'HIT!', radioBackupCop: 'Backup arrived ({n} units)', radioBackupRobber: 'Police backup inbound ({n} units)', msgSpike: 'SPIKE STRIP!', msgSpikeSub: 'Take the open side of the glowing strip', msgFlat: 'FLAT TIRE!', msgFlatSub: 'Fix it at a repair shop', radioSpikeRobber: 'Spike strip ahead. Take the open side', radioSpikeCop: 'Spike strip deployed', radioFlat: 'Suspect has a flat', msgShot: 'SHOTS FIRED!', msgShotSub: 'Break line of sight behind buildings', radioGunRobber: 'Wanted level 2. Cops are shooting. Stay behind buildings', radioGunCop: 'Wanted level 2. Weapons free (CPU units will fire)',
    msgRepaired: 'REPAIRED', msgRepairedSub: 'Fully repaired', msgRepairedLost: 'Fully repaired. Wanted level down, cops lost you', radioLost: 'Lost the suspect. They ducked into a repair shop',
    repairing: 'Repairing', repairSeen: 'The cops can see you. No repairs here', repairWait: 'Repair shop ready in {n}s', repairHint: 'Repair shop: stop for 3 s to fully repair',
    copWin: 'COPS WIN', robberWin: 'ROBBER WINS', arrests: 'Arrests', takedown: 'TAKEDOWN', roleLobby: 'One random robber (two with 6+ players). Everyone else is a cop.',
    tipBridge: 'The broken bridge needs boost', tipWall: 'The warehouse wall only breaks at high speed',
    howtoTitle: 'How to play',
    howto1: 'Robber: survive 3 minutes to win. After 90 s the hideout opens (green light pillar). Enter it unseen (no cop within 40 m) to win on the spot.',
    howto2: 'Cop: arrest the robber to win. The bust meter fills while you are right next to a slow robber (under 40 km/h; 72 km/h when boxed in by two cops; 90 km/h when you stick to their bumper). Ram them to a stop. Wrecking the robber near a cop is also an arrest.',
    howto3: 'The cop map shows the robber only when close or right after a radio report. Lost them? The ring marks the last sighting. The arrow above your car points there.',
    howto4: 'The wanted level (stars) rises over time and whenever the robber wrecks a cop. Higher means faster, more persistent cops and more backup units (up to 6 extra at 5 stars); from 2 stars police cars open fire (buildings block bullets); from 3 stars a helicopter lights up the robber; from 4 stars spike strips appear ahead (flat tires until repaired).',
    howto5: 'Fences, lamps, barricades and traffic all go flying. The robber car is tough and respawns right on the road (wrecked near a cop = arrested). Cop cars wreck after 2-3 hard rams, burn, and return far away about 6s later.',
    howto6: 'Stop in a repair shop (blue squares on the map) for 3 s to fully repair. Robbers cannot repair while a cop can see them; repairing lowers the wanted level. From 3 stars a police chopper marks red circles and fires missiles. Turn to dodge.',
    keys: 'Controls', kAccel: 'Throttle', kBrake: 'Brake / reverse', kSteer: 'Steer', kDrift: 'Drift (handbrake)', kBoost: 'Nitro boost', kAir: 'In the air: W/S pitch, A/D roll', kRespawn: 'Respawn', kPause: 'Pause', kCam: 'Camera', kMute: 'Sound on/off',
    pad: 'Gamepad: RT throttle / LT brake / A boost / X drift / Y respawn',
    countGo: 'GO', placeSuffix: ['ST', 'ND', 'RD', 'TH'],
    onlineLead: 'Create a room and send the invite link, or enter a friend\'s room code. 1-8 players. One random robber (two with 6+), the rest are cops. Empty slots can be filled with CPU cops.',
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
