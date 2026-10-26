// 効果音と BGM。Web Audio で鳴らすだけ（音声ファイルなし）。最初に画面を触るまで鳴らない（ブラウザの決まり）。
const KEY = 'wdi-mute'
let ctx = null, master = null, muted = false, bgmTimer = 0, bgmWanted = false, beat = 0, song = null, songKey = ''
try { muted = localStorage.getItem(KEY) === '1' } catch {}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  try {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
    if (bgmWanted) startBgm(songKey)
  } catch { ctx = null }
}
addEventListener('pointerdown', unlock, { passive: true })
addEventListener('keydown', unlock)

function tone(freq, dur, { type = 'square', vol = 0.15, at = 0, slide = 0, attack = 0 } = {}) {
  if (!ctx || muted) return
  const t = ctx.currentTime + at
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack) } else g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(master)
  o.start(t); o.stop(t + dur + 0.02)
}

function noise(dur, vol, cutoff, at = 0) {
  if (!ctx || muted) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  const src = ctx.createBufferSource(); src.buffer = buf
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff
  const g = ctx.createGain(); g.gain.value = vol
  src.connect(f); f.connect(g); g.connect(master)
  src.start(ctx.currentTime + at)
}

// 調べはじめ（ごそごそ）
export function rummage() { for (let i = 0; i < 4; i++) noise(0.07, 0.18, 1800, i * 0.12) }
// 証拠を見つけた（きらり）
export function found() { [988, 1319, 1760].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, at: i * 0.07 })) }
// 何もなかった
export function nothing() { tone(330, 0.12, { type: 'triangle', vol: 0.1 }); tone(262, 0.18, { type: 'triangle', vol: 0.1, at: 0.1 }) }
// 犯人の細工（低くこっそり）
export function sneaky() { tone(196, 0.16, { type: 'sine', vol: 0.12 }); tone(185, 0.2, { type: 'sine', vol: 0.1, at: 0.14 }) }
export function pin() { noise(0.05, 0.4, 3500); tone(1400, 0.05, { type: 'square', vol: 0.05 }) }
export function stamp() { noise(0.12, 0.7, 900); tone(110, 0.18, { type: 'sine', vol: 0.3, slide: -50 }) }
export function pop() { tone(660, 0.07, { type: 'triangle', vol: 0.1, slide: 300 }) }
export function tick() { tone(1200, 0.03, { type: 'square', vol: 0.04 }) }
// 雷（ピシャッ → ゴロゴロ）
export function thunder() { noise(0.25, 0.9, 6000); noise(1.6, 0.6, 260, 0.15); tone(55, 1.2, { type: 'sine', vol: 0.25, at: 0.1, slide: -20 }) }
// 停電（ブウン…と落ちる）
export function powerDown() { tone(220, 0.8, { type: 'sawtooth', vol: 0.08, slide: -180 }); noise(0.2, 0.3, 500) }
export function powerUp() { tone(110, 0.5, { type: 'sawtooth', vol: 0.06, slide: 220 }) }
// 夜が深まる（鐘）
export function bell() { [0, 0.9].forEach(at => { tone(392, 1.6, { type: 'sine', vol: 0.16, at }); tone(784, 1.2, { type: 'sine', vol: 0.05, at }) }) }
// 扉が閉まる
export function slam() { noise(0.3, 0.9, 700); tone(80, 0.3, { type: 'sine', vol: 0.35, slide: -30 }) }
// 結果: 当たり（ファンファーレ）
export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { vol: 0.1, at: i * 0.12 }))
  ;[1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.09, at: 0.55 + i * 0.09 }))
}
// 結果: はずれ（しょんぼりトロンボーン）
export function wahwah() { [[392, 0.38], [370, 0.38], [349, 0.38], [330, 1.1]].reduce((at, [f, d]) => { tone(f, d, { type: 'sawtooth', vol: 0.09, at, slide: f === 330 ? -40 : 0, attack: 0.04 }); return at + d * 0.95 }, 0) }
// 発表前のドラムロール
export function drumroll(sec = 1.4) { for (let t = 0; t < sec; t += 0.06) noise(0.05, 0.12 + t * 0.15, 1400, t) }

// BGM: ベースと刻みの短いループ。幕が進むほど速く・音が増える（stage 1〜3）。場面ごとに曲を変える
const SONGS = {
  mansion: { bass: [110, 0, 131, 0, 123, 0, 98, 104], top: [0, 440, 0, 0, 523, 0, 494, 0] },
  ship: { bass: [98, 0, 147, 0, 131, 0, 117, 0], top: [587, 0, 0, 523, 0, 0, 466, 0] },
  lodge: { bass: [117, 0, 0, 139, 0, 0, 104, 0], top: [0, 0, 698, 0, 0, 622, 0, 587] },
  talk: { bass: [131, 0, 0, 0, 117, 0, 0, 0], top: [0, 0, 523, 0, 0, 0, 466, 0] },
  vote: { bass: [98, 98, 98, 104, 98, 98, 98, 92], top: null }
}
let stage = 1
export function setStage(s) { stage = s }
export function startBgm(key) {
  bgmWanted = true
  songKey = key
  song = SONGS[key] || SONGS.mansion
  if (!ctx) return
  clearInterval(bgmTimer)
  const ms = key === 'vote' ? 280 : key === 'talk' ? 420 : [0, 380, 320, 260][stage] || 320
  bgmTimer = setInterval(() => {
    if (muted || document.hidden) return
    const i = beat % 8
    const f = song.bass[i]
    if (f) tone(f, 0.3, { type: 'triangle', vol: 0.11 })
    if (song.top && song.top[i] && (stage >= 2 || i % 4 === 0 || key === 'talk'))tone(song.top[i], 0.2, { type: 'sine', vol: 0.045 })
    if (stage >= 3 && i % 2 === 0) noise(0.03, 0.06, 4000)
    if (key === 'vote' && i % 2 === 1) noise(0.03, 0.05, 2500)
    beat++
  }, ms)
}
export function restartBgm() { if (bgmWanted) startBgm(songKey) }
export function stopBgm() { bgmWanted = false; clearInterval(bgmTimer); bgmTimer = 0 }

const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'
const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
export function bindMuteButton(btn) {
  const paint = () => { btn.innerHTML = muted ? ICON_OFF : ICON_ON; btn.setAttribute('aria-label', muted ? '音を出す' : '音を消す'); btn.dataset.muted = muted ? '1' : '0' }
  paint()
  btn.onclick = () => {
    unlock()
    muted = !muted
    try { localStorage.setItem(KEY, muted ? '1' : '0') } catch {}
    if (master) master.gain.value = muted ? 0 : 0.5
    paint()
  }
}
