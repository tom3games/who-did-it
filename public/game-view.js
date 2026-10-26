// ゲーム中の描画と操作。render(state, { send }) は状態が届くたびに呼ばれる。state.game はサーバーの view(自分) の中身。
// 屋敷は 3D（view3d.js）。WebGL が使えない端末は、真上から見た 2D の地図に戻す（?2d を付けると 2D で確かめられる）。
// 手帳・掲示板・人物・投票は DOM。12回/秒の更新で DOM を作り直さないよう、中身が変わった時だけ描き直す。
import { byId } from './scenarios/index.mjs'
import { createView3D } from './view3d.js'
import { COLORS, portrait, icon, floorColor } from './art.js'
import * as sfx from './sound.js'

const $ = s => document.querySelector(s)
export { COLORS }
const REACH = 1.15
const PHASE_TIME = { intro: 15, discuss: 75, vote: 30 }
const PHASE_LABEL = { intro: '役割の確認', explore: '探索', discuss: '推理', vote: '投票' }
const PHASE_ICON = { intro: 'role', explore: 'search', discuss: 'talk', vote: 'vote' }
export const ROLE = {
  culprit: { label: '犯人', desc: '正体を隠して逃げ切る。自分の痕跡を1つ「隠す」、偽の証拠を「偽装」できる（夜が深まるともう1回）。どちらも周りからは調べているようにしか見えない。' },
  detective: { label: '探偵', desc: '検視で分かった手がかりを1つ最初から持っている。調べるのが速い。' },
  forensic: { label: '鑑識', desc: '自分で調べた証拠が本物か偽物か分かる。掲示板の証拠も2回まで鑑定できる。' },
  witness: { label: '目撃者', desc: '事件の時刻に一緒にいた人を知っている。その人は犯人ではない。' },
  resident: { label: '住人', desc: '屋敷を調べて証拠を集め、掲示板で共有して犯人を当てる。' }
}
const STAGE_NAME = ['', '静かな夜', '停電の夜', '嵐の夜']
const NEXT_NAME = { flash: '雷', dark: '停電', night: '夜が深まる', lock: '嵐で扉が閉まる' }
const EVENT_BIG = {
  flash: ['雷が落ちた！', '光った瞬間、全員の居場所が記録に残った'],
  dark: ['停電！', '見えるのは手元だけ。調べるのも遅くなる'],
  light: ['明かりが戻った', ''],
  night: ['夜が深まる…', '犯人はもう一度だけ偽の証拠を置ける'],
  lock: ['嵐で扉が閉まった！', 'しばらく開かない。閉じ込められた人は待つしかない'],
  unlock: ['扉が開いた', '']
}

let S = null, G = null, sc = null, sendFn = null, quitFn = null
let round = -1, charsCache = null
let sheet = null            // 探索中に開いている板: note / board / people / role / fake
let dTab = 'board'          // 推理中のタブ
let marks = {}              // 自分だけのメモ（人物の印）。サーバーには送らない
let lastNotice = 0, lastLog = 0, lastPhase = '', lastStage = 0, wasBusy = false
let panelSig = '', footSig = '', tabsSig = ''
const rp = {}               // 描画用の位置（補間）と向き
let joy = { dx: 0, dy: 0 }, keyVec = { dx: 0, dy: 0 }, sentVec = { dx: 0, dy: 0 }
const keys = new Set()
let v3 = null, ctx2 = null, cv = null, mini = null, miniCtx = null
let ts = 20, ox = 0, oy = 0 // 2D の1マスの大きさと地図の左上
let route = null            // タップで歩く道のり { pts:[[x,y]...], i, spot, best, since }
let myFace = null           // { kind, until }
let shockUntil = 0
let lastFrame = performance.now()

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const trait = dim => sc.traits.find(t => t.key === dim)
const tval = (dim, val) => trait(dim)?.values.find(v => v.v === val)
const spot = id => sc.spots.find(s => s.id === id)
const roomOfSpot = s => sc.rooms[sc.map[s.y][s.x]]
const char = id => G.chars.find(c => c.id === id)
const fmtTime = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
const conclusion = c => `犯人の${trait(c.dim).label}は「${tval(c.dim, c.val).label}」`
const pt = (c, face = 'calm', size = 30) => c ? portrait({ color: c.color, look: c.look, face, size }) : ''

// ---------- 組み立て（1回だけ）
function build() {
  const root = $('#stage')
  root.innerHTML = `
    <div class="play" id="g-play">
      <div class="g-view" id="g-view">
        <canvas id="g-cv" aria-label="屋敷"></canvas>
        <div class="vignette"></div>
        <div class="labels" id="g-labels"></div>
        <canvas id="g-mini" class="g-mini" aria-label="見取り図（押すと屋敷ぜんぶを見る）"></canvas>
        <div class="g-ticker" id="g-ticker" hidden></div>
        <div class="g-banner" id="g-banner" role="status" hidden></div>
        <div class="g-big" id="g-big" hidden><b></b><small></small></div>
      </div>
      <div class="g-hud" id="g-hud">
        <div class="g-clock" id="g-clock"><span class="g-ph-ic" id="g-ph-ic"></span><b id="g-phase"></b><span class="g-time" id="g-time"></span><i class="g-tbar"><i id="g-tfill"></i></i></div>
        <button class="btn icon g-role" id="g-role" aria-label="自分の役割を見る"></button>
        <button class="btn icon" id="g-zoom" aria-label="屋敷ぜんぶを見る" aria-pressed="false">${icon('zoom')}</button>
        <button class="btn icon" id="g-mute"></button>
      </div>
      <div class="g-panel" id="g-panel" hidden></div>
      <div class="g-ctrl" id="g-ctrl">
        <div class="g-joy" id="g-joy" aria-label="移動スティック"><div class="g-knob" id="g-knob"></div></div>
        <div class="g-right">
          <div class="g-secret" id="g-secret" hidden>
            <button id="g-hide" class="btn sec">${icon('hide')}<span>隠す</span></button>
            <button id="g-plant" class="btn sec">${icon('mask')}<span>偽装</span></button>
          </div>
          <button id="g-search" class="btn primary g-search"></button>
        </div>
      </div>
      <div class="g-tabs" id="g-tabs">
        <button class="btn tab" data-sheet="note" id="t-note">${icon('book')}<span>手帳</span><em></em></button>
        <button class="btn tab" data-sheet="board" id="t-board">${icon('pin')}<span>掲示板</span><em></em></button>
        <button class="btn tab" data-sheet="people" id="t-people">${icon('people')}<span>人物</span></button>
        <button class="btn tab g-done" id="g-done">${icon('check')}<span>終える</span><em></em></button>
      </div>
      <div class="g-foot" id="g-foot" hidden></div>
    </div>`
  const quit = $('#quitBtn'); if (quit) $('#g-hud').prepend(quit)
  cv = $('#g-cv'); mini = $('#g-mini'); miniCtx = mini.getContext('2d')
  if (!new URLSearchParams(location.search).has('2d')) {
    try { v3 = createView3D(cv) } catch (e) { console.warn('3D を使えないので 2D で描く', e); v3 = null }
  }
  if (!v3) ctx2 = cv.getContext('2d')
  $('#g-play').dataset.mode = v3 ? '3d' : '2d'
  $('#g-zoom').hidden = !v3
  const toggleZoom = () => { if (!v3) return; const far = v3.toggleZoom(); $('#g-zoom').setAttribute('aria-pressed', far ? 'true' : 'false'); $('#g-zoom').innerHTML = icon(far ? 'zoomin' : 'zoom') }
  $('#g-zoom').onclick = toggleZoom
  mini.addEventListener('click', toggleZoom)
  sfx.bindMuteButton($('#g-mute'))

  // スティック（押した所が中心。離すと止まる）
  const pad = $('#g-joy'), knob = $('#g-knob')
  let pid = null
  const setJoy = e => {
    const r = pad.getBoundingClientRect()
    const R = r.width / 2
    let dx = (e.clientX - r.left - R) / (R * 0.62), dy = (e.clientY - r.top - R) / (R * 0.62)
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m }
    joy = { dx, dy }
    knob.style.transform = `translate(${dx * R * 0.5}px, ${dy * R * 0.5}px)`
    route = null
    pushMove(false)
  }
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { pad.setPointerCapture(pid) } catch {} pad.classList.add('on'); setJoy(e) })
  pad.addEventListener('pointermove', e => { if (e.pointerId === pid) setJoy(e) })
  const endJoy = e => { if (e.pointerId !== pid) return; pid = null; pad.classList.remove('on'); joy = { dx: 0, dy: 0 }; knob.style.transform = ''; pushMove(true) }
  pad.addEventListener('pointerup', endJoy); pad.addEventListener('pointercancel', endJoy)

  // 床や家具を押すと、そこまで自動で歩く（家具なら着いたら調べる）
  cv.addEventListener('pointerdown', e => {
    if (!G || G.phase !== 'explore' || !G.me || sheet) return
    const r = cv.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    let hit
    if (v3) hit = v3.pick(px, py)
    else { const x = (px - ox) / ts, y = (py - oy) / ts; const s = sc.spots.find(s => Math.floor(x) === s.x && Math.floor(y) === s.y); hit = { x, y, spot: s?.id || null } }
    if (hit) goTo(hit)
  })

  // キーボード（矢印 / WASD で移動、E・スペースで調べる、Z で引きの視点）
  addEventListener('keydown', e => {
    if (!G || e.target.closest?.('input,textarea')) return
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); updKeys(); e.preventDefault() }
    if ((k === 'e' || k === ' ') && G.phase === 'explore' && !sheet) { $('#g-search').click(); e.preventDefault() }
    if (k === 'z' && G.phase === 'explore') toggleZoom()
    if (k === 'escape' && sheet) { sheet = null; draw() }
  })
  addEventListener('keyup', e => { if (keys.delete(e.key.toLowerCase())) updKeys() })
  addEventListener('blur', () => { keys.clear(); updKeys() })

  $('#g-search').onclick = () => { const n = nearest(); if (n && !G.me?.busy) { route = null; sendFn({ type: 'act', kind: 'search', spot: n.id }) } }
  $('#g-hide').onclick = () => { const n = nearest(); if (n) { route = null; sendFn({ type: 'act', kind: 'hide', spot: n.id }) } }
  $('#g-plant').onclick = () => { sheet = 'fake'; draw() }
  $('#g-role').onclick = () => { if (G.phase === 'explore') { sheet = sheet === 'role' ? null : 'role'; draw() } }
  $('#g-done').onclick = () => { sfx.pop(); sendFn({ type: 'ready', on: !G.ready.includes(S.you) }) }
  for (const b of document.querySelectorAll('[data-sheet]')) b.onclick = () => { sheet = sheet === b.dataset.sheet ? null : b.dataset.sheet; sfx.tick(); draw() }
  $('#g-panel').addEventListener('click', onPanelClick)
  $('#g-foot').addEventListener('click', e => { if (e.target.closest('[data-act="ready"]')) { sfx.pop(); sendFn({ type: 'ready', on: !G.ready.includes(S.you) }) } })

  setInterval(() => { steer(); pushMove(true) }, 60)
  addEventListener('resize', () => { if (G) draw() })
  requestAnimationFrame(frame)
}

function updKeys() {
  const h = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'))
  const v = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'))
  const m = Math.hypot(h, v) || 1
  keyVec = { dx: h / m, dy: v / m }
  if (h || v) route = null
  pushMove(true)
}

// 移動の向きを送る。変わった時だけ、細かい揺れは間引く
let autoVec = { dx: 0, dy: 0 }
function pushMove(force) {
  if (!G || G.phase !== 'explore' || !sendFn) return
  const dx = joy.dx || keyVec.dx || autoVec.dx, dy = joy.dy || keyVec.dy || autoVec.dy
  const q = v => Math.round(v * 20) / 20
  const v = { dx: q(dx), dy: q(dy) }
  if (v.dx === sentVec.dx && v.dy === sentVec.dy) return
  if (!force && (v.dx || v.dy) && Math.hypot(v.dx - sentVec.dx, v.dy - sentVec.dy) < 0.25) return
  sentVec = v
  sendFn({ type: 'move', ...v })
}

// ---------- タップで歩く（マスの中心をたどる。壁・家具・閉じた扉はよける）
function blockedTile(x, y) {
  if (x < 0 || y < 0 || y >= sc.map.length || x >= sc.map[0].length) return true
  if (sc.map[y][x] === '#') return true
  if (sc.spots.some(s => s.x === x && s.y === y)) return true
  const L = G.env?.lock
  return !!(L && L[0] === x && L[1] === y)
}
function findPath(from, goals) {
  const W = sc.map[0].length, key = (x, y) => y * W + x
  const goal = new Set(goals.map(([x, y]) => key(x, y)))
  const prev = new Map([[key(...from), null]])
  const q = [from]
  while (q.length) {
    const [x, y] = q.shift()
    if (goal.has(key(x, y))) {
      const out = []; let k = key(x, y)
      while (k != null) { out.unshift([k % W + 0.5, Math.floor(k / W) + 0.5]); k = prev.get(k) }
      return out
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (blockedTile(nx, ny) || prev.has(key(nx, ny))) continue
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny])
    }
  }
  return null
}
function goTo(hit) {
  const me = G.me
  const from = [Math.floor(me.x), Math.floor(me.y)]
  let goals, spotId = null
  const s = hit.spot ? spot(hit.spot) : sc.spots.find(s => s.x === Math.floor(hit.x) && s.y === Math.floor(hit.y))
  if (s) {
    spotId = s.id
    if (Math.hypot(me.x - (s.x + 0.5), me.y - (s.y + 0.5)) <= REACH) { route = null; if (!me.busy) sendFn({ type: 'act', kind: 'search', spot: s.id }); return }
    goals = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [s.x + dx, s.y + dy]).filter(([x, y]) => !blockedTile(x, y))
  } else {
    const tx = Math.floor(hit.x), ty = Math.floor(hit.y)
    if (blockedTile(tx, ty)) return
    goals = [[tx, ty]]
  }
  if (!goals.length) return
  const pts = findPath(from, goals)
  if (!pts) return
  pts.shift() // いまいるマス
  if (!pts.length) { const g = s ? null : [hit.x, hit.y]; if (!g) { if (!me.busy && spotId) sendFn({ type: 'act', kind: 'search', spot: spotId }) } else route = { pts: [g], i: 0, spot: null, best: 99, since: performance.now() }; return }
  route = { pts, i: 0, spot: spotId, best: 99, since: performance.now() }
  sfx.tick()
}
function steer() {
  autoVec = { dx: 0, dy: 0 }
  if (!route || !G?.me || G.phase !== 'explore') { route = null; return }
  if (G.me.busy) return
  const me = G.me
  let p = route.pts[route.i]
  let d = Math.hypot(p[0] - me.x, p[1] - me.y)
  while (d < (route.i === route.pts.length - 1 ? 0.22 : 0.4) && route.i < route.pts.length - 1) { route.i++; route.best = 99; route.since = performance.now(); p = route.pts[route.i]; d = Math.hypot(p[0] - me.x, p[1] - me.y) }
  if (route.i === route.pts.length - 1 && d < 0.22) {
    const sid = route.spot
    route = null
    // 押した家具に手が届けば調べる（同じ距離に別の家具があっても、押した方を調べる）
    const ts = sid && spot(sid)
    if (ts && Math.hypot(G.me.x - (ts.x + 0.5), G.me.y - (ts.y + 0.5)) <= REACH) sendFn({ type: 'act', kind: 'search', spot: sid })
    return
  }
  if (d < route.best - 0.04) { route.best = d; route.since = performance.now() }
  else if (performance.now() - route.since > 1500) { route = null; return } // 進めないときはあきらめる
  autoVec = { dx: (p[0] - me.x) / d, dy: (p[1] - me.y) / d }
}

function onPanelClick(e) {
  const b = e.target.closest('[data-act]')
  if (!b) return
  const a = b.dataset.act
  if (a === 'close') sheet = null
  else if (a === 'post') { sfx.pin(); sendFn({ type: 'post', eid: b.dataset.eid }) }
  else if (a === 'analyze') { sfx.stamp(); sendFn({ type: 'analyze', eid: b.dataset.eid }) }
  else if (a === 'tab') dTab = b.dataset.tab
  else if (a === 'mark') marks[b.dataset.id] = ((marks[b.dataset.id] || 0) + 1) % 3
  else if (a === 'vote') { sfx.stamp(); sendFn({ type: 'vote', target: b.dataset.id }) }
  else if (a === 'fake') { const n = nearest(); if (n) sendFn({ type: 'act', kind: 'plant', spot: n.id, fake: { dim: b.dataset.dim, val: b.dataset.val } }); sheet = null }
  panelSig = ''; draw()
}

// ---------- 状態が届いたとき
export function render(state, { send, quit }) {
  sendFn = send; quitFn = quit
  if (!$('#g-cv')) build()
  S = state; G = state.game
  window.__wdi = G; window.__wdiYou = state.you // 自分の view だけ（検証用）
  if (!G) return
  const nsc = byId(G.scenario)
  if (state.round !== round) {
    if (!G.chars) return // 新しい回の人物一覧が届くまで待つ
    round = state.round; sheet = null; dTab = 'board'; marks = {}; panelSig = ''; footSig = ''; tabsSig = ''
    lastNotice = G.notice?.n || 0; lastLog = G.log?.length ? G.log.at(-1).n : 0; lastPhase = ''; lastStage = 0
    for (const k in rp) delete rp[k]; sentVec = { dx: 0, dy: 0 }; route = null; myFace = null
    sc = nsc
    charsCache = G.chars
    if (v3) { v3.load(sc, G.chars); if (v3.zoomed) { v3.toggleZoom(); $('#g-zoom').setAttribute('aria-pressed', 'false'); $('#g-zoom').innerHTML = icon('zoom') } }
  }
  sc = nsc
  if (G.chars) charsCache = G.chars; else G.chars = charsCache
  if (!G.chars) return
  if (G.notice && G.notice.n > lastNotice) { lastNotice = G.notice.n; onNotice(G.notice.text) }
  for (const e of G.log || []) if (e.n > lastLog) { lastLog = e.n; onEvent(e) }
  if (G.phase !== lastPhase) onPhase(G.phase)
  const st = G.env?.stage || 0
  if (st && st !== lastStage) { lastStage = st; sfx.setStage(st); if (G.phase === 'explore') sfx.restartBgm() }
  const busy = !!G.me?.busy
  if (busy && !wasBusy) sfx.rummage()
  wasBusy = busy
  if (G.phase !== 'explore' && sheet) sheet = null
  draw()
}

function onPhase(ph) {
  lastPhase = ph
  if (ph === 'explore') { sfx.setStage(G.env?.stage || 1); sfx.startBgm(sc.theme) } else if (ph === 'vote') sfx.startBgm('vote'); else sfx.startBgm('talk')
  if (ph !== 'intro') sfx.pop()
  if (ph === 'discuss') dTab = G.log?.some(e => e.kind === 'flash') && !G.board.length ? 'log' : 'board'
}

function onNotice(text) {
  banner(text)
  if (/証拠を見つけた/.test(text)) { sfx.found(); myFace = { kind: 'happy', until: performance.now() + 2200 } }
  else if (/隠した|偽の証拠/.test(text)) { sfx.sneaky(); myFace = { kind: 'smug', until: performance.now() + 2200 } }
  else { sfx.nothing(); myFace = { kind: 'think', until: performance.now() + 1400 } }
}

function onEvent(e) {
  if (G.phase !== 'explore') return
  const [t1, t2] = EVENT_BIG[e.kind] || ['', '']
  if (e.kind === 'flash') { sfx.thunder(); v3?.flash(); shockUntil = performance.now() + 1400; flashDom() }
  else if (e.kind === 'dark') sfx.powerDown()
  else if (e.kind === 'light') sfx.powerUp()
  else if (e.kind === 'night') sfx.bell()
  else if (e.kind === 'lock') { sfx.slam(); shockUntil = performance.now() + 1200 }
  else if (e.kind === 'unlock') sfx.pop()
  if (t1) big(t1, t2)
}
function flashDom() { const v = $('#g-view'); v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash') }

function banner(text) {
  const b = $('#g-banner'); b.textContent = text; b.hidden = false
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop')
  clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), 2200)
}
function big(t1, t2) {
  const b = $('#g-big'); b.querySelector('b').textContent = t1; b.querySelector('small').textContent = t2; b.hidden = false
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop')
  clearTimeout(big.t); big.t = setTimeout(() => (b.hidden = true), 2600)
}

function draw() {
  if (!G) return
  const ph = G.phase
  const n = S.players.length
  document.body.dataset.phase = ph
  const play = $('#g-play')
  play.dataset.dark = G.env?.dark ? '1' : '0'
  $('#g-phase').textContent = PHASE_LABEL[ph] || ''
  $('#g-ph-ic').innerHTML = icon(PHASE_ICON[ph] || 'clock')
  $('#g-time').textContent = fmtTime(G.time)
  $('#g-clock').dataset.low = G.time <= 10 ? '1' : '0'
  const total = ph === 'explore' ? G.explore : PHASE_TIME[ph] || 1
  $('#g-tfill').style.width = Math.max(0, Math.min(100, G.time / total * 100)) + '%'
  // 役割の名前は上に出しっぱなしにしない（横からのぞかれても分からない）。押すと役割の板が開く
  if (!$('#g-role').dataset.set) { $('#g-role').dataset.set = '1'; $('#g-role').innerHTML = icon('role') + '<span>役割</span>' }
  const explore = ph === 'explore' && !!G.me
  $('#g-ctrl').hidden = !explore
  $('#g-tabs').hidden = !explore
  $('#g-role').setAttribute('aria-pressed', sheet === 'role' ? 'true' : 'false')
  $('#g-zoom').hidden = !v3 || !explore
  $('#g-mini').hidden = !v3 || !explore
  $('#g-foot').hidden = !(ph === 'intro' || ph === 'discuss')
  $('#g-ticker').hidden = !explore
  if (explore) { updateControls(n); updateTicker() }
  updatePanel()
  updateFoot(n)
}

function updateTicker() {
  const e = G.env; if (!e) return
  const dots = [1, 2, 3].map(i => `<i class="${i <= e.stage ? 'on' : ''}"></i>`).join('')
  const st = e.dark ? '停電中' : e.lock ? '扉が1つ閉まっている' : STAGE_NAME[e.stage]
  const nx = e.next ? `<span class="nx">${icon(e.next.kind === 'flash' ? 'bolt' : e.next.kind === 'dark' ? 'bulb' : e.next.kind === 'night' ? 'moon' : 'lock')}${NEXT_NAME[e.next.kind]}まで ${e.next.in}秒</span>` : ''
  const html = `<span class="dots">${dots}</span><b>第${e.stage}幕</b><span>${st}</span>${nx}`
  if ($('#g-ticker').dataset.h !== html) { $('#g-ticker').innerHTML = html; $('#g-ticker').dataset.h = html; $('#g-ticker').dataset.stage = e.stage }
}

// ---------- 操作ボタンの状態
function nearest() {
  if (!G?.me) return null
  let best = null, bd = Infinity
  // 同じくらい近いときは、まだ調べていない手がかりの家具を先にする（遺体と家具の間に立ったときなど）
  const checked = new Set(G.checked || [])
  for (const s of sc.spots) {
    const d = Math.hypot(G.me.x - (s.x + 0.5), G.me.y - (s.y + 0.5))
    const score = d + (s.noClue ? 0.12 : 0) + (checked.has(s.id) ? 0.06 : 0)
    if (d <= REACH && score < bd) { bd = score; best = s }
  }
  return best
}

function updateControls(n) {
  const near = nearest()
  const busy = G.me.busy
  const b = $('#g-search')
  const sig = busy ? 'b' + busy.kind + busy.p : near ? 'n' + near.id + (G.checked?.includes(near.id) ? 'c' : '') : '-'
  if (b.dataset.sig !== sig) {
    b.dataset.sig = sig
    b.style.setProperty('--p', busy ? busy.p : 0)
    if (busy) { b.disabled = true; b.innerHTML = `${icon('search')}<span class="s1">${busy.kind === 'search' ? '調べています' : busy.kind === 'hide' ? '隠しています' : '置いています'}</span><i class="bar"></i>` }
    else if (near) { b.disabled = false; b.innerHTML = `${icon('search')}<span class="s1">調べる</span><span class="s2">${esc(near.name)}${G.checked?.includes(near.id) ? '（もう一度）' : ''}</span>` }
    else { b.disabled = true; b.innerHTML = `${icon('search')}<span class="s1">調べる</span><span class="s2">家具に近づく・押す</span>` }
  }
  const c = G.culprit
  $('#g-secret').hidden = !c
  if (c) {
    const tr = near && c.traces.find(t => t.spot === near.id && t.present)
    $('#g-hide').disabled = !!busy || !c.canHide || !tr
    $('#g-hide').querySelector('span').textContent = c.canHide ? '隠す' : '隠した'
    $('#g-plant').disabled = !!busy || !c.canPlant || !near || !c.plantable.includes(near.id)
    $('#g-plant').querySelector('span').textContent = c.canPlant ? `偽装 ${c.plantsLeft}` : '偽装済み'
  }
  const r = G.ready.length, mine = G.ready.includes(S.you)
  const tsig = [G.notebook?.length, G.board.length, sheet, r, mine, n].join()
  if (tsig !== tabsSig) {
    tabsSig = tsig
    $('#t-note em').textContent = G.notebook?.length || 0
    $('#t-board em').textContent = G.board.length
    for (const k of ['note', 'board', 'people']) { $('#t-' + k).classList.toggle('on', sheet === k); $('#t-' + k).setAttribute('aria-pressed', sheet === k ? 'true' : 'false') }
    $('#g-done span').textContent = mine ? '待機中' : '終える'
    $('#g-done em').textContent = `${r}/${n}`
    $('#g-done').classList.toggle('on', mine)
    $('#g-done').setAttribute('aria-pressed', mine ? 'true' : 'false')
  }
}

function updateFoot(n) {
  const ph = G.phase
  if (ph !== 'intro' && ph !== 'discuss') return
  const r = G.ready.length, mine = G.ready.includes(S.you)
  const label = mine ? `待っています ${r}/${n}（取り消す）` : ph === 'intro' ? `読んだ！ ${r}/${n}` : `投票へ進む ${r}/${n}`
  const sig = ph + label
  if (sig === footSig) return
  footSig = sig
  $('#g-foot').innerHTML = `<button class="btn ${mine ? 'ghost on' : 'primary'}" data-act="ready" id="g-ready" aria-pressed="${mine}">${icon(mine ? 'clock' : 'check')}<span>${label}</span></button>`
}

// ---------- 板（役割・手帳・掲示板・人物・投票）
function updatePanel() {
  const ph = G.phase
  let kind = null
  if (ph === 'intro') kind = 'role'
  else if (ph === 'explore') kind = sheet
  else if (ph === 'discuss') kind = 'discuss'
  else if (ph === 'vote') kind = 'vote'
  const p = $('#g-panel')
  p.hidden = !kind
  p.dataset.kind = kind || ''
  if (!kind) { panelSig = ''; return }
  const sig = JSON.stringify([kind, dTab, G.notebook, G.board, G.analyses, G.forensicUses, marks, G.voted, G.myVote, G.culprit, ph, kind === 'fake' ? nearest()?.id : 0, S.players.map(x => x.id), G.log?.length])
  if (sig === panelSig) return
  panelSig = sig
  const sc0 = p.querySelector('.scroll')?.scrollTop || 0
  p.innerHTML = kind === 'role' ? roleHTML(ph === 'intro')
    : kind === 'note' ? sheetWrap('手帳', 'book', noteHTML())
    : kind === 'board' ? sheetWrap('掲示板', 'pin', boardHTML())
    : kind === 'people' ? sheetWrap('人物', 'people', peopleHTML(false))
    : kind === 'fake' ? sheetWrap('偽装する', 'mask', fakeHTML())
    : kind === 'discuss' ? discussHTML()
    : voteHTML()
  const sEl = p.querySelector('.scroll'); if (sEl) sEl.scrollTop = sc0
}

const sheetWrap = (title, ic, body) => `<div class="sheet"><div class="sheet-h"><b>${icon(ic)}${title}</b><button class="btn icon small" data-act="close" aria-label="閉じる">${icon('close')}</button></div><div class="scroll">${body}</div></div>`

function roleHTML(intro) {
  const role = G.role
  if (!role) return '<p class="empty">観戦中</p>'
  const me = char(S.you)
  let secret = ''
  if (G.secret) secret += `<div class="secret"><b>あなただけが知っている</b><p>${esc(G.secret.text)}</p></div>`
  if (G.culprit) {
    secret += `<div class="secret evil"><b>あなたの痕跡（あなたにだけ見えている）</b><ul>${G.culprit.traces.map(t => { const s = spot(t.spot); return `<li>${esc(s.name)}（${esc(roomOfSpot(s))}）に「${esc(tval(t.clue.dim, t.clue.val).label)}」の手がかり${t.present ? '' : ' <span class="tag">隠した</span>'}</li>` }).join('')}</ul><p class="small-note">屋敷では赤い「!」の印。1つだけ隠せる。別の家具に偽物を置ける</p></div>`
  }
  const body = `
    <div class="role-card${intro ? ' flip' : ''}" data-role="${role}">
      <div class="rc-top"><span class="rc-ic">${icon(role)}</span><div><p class="muted">あなたの役割</p><h2>${ROLE[role].label}</h2></div>${me ? `<span class="rc-pt">${pt(me, role === 'culprit' ? 'smug' : 'calm', 54)}</span>` : ''}</div>
      <p class="rc-desc">${ROLE[role].desc}</p>
      ${me ? `<p class="mine">あなたは<b>${esc(me.title)}</b>。特徴 ${traitChips(me.traits, null)}</p>` : ''}
      ${secret}
    </div>
    ${intro ? `<div class="case"><b>${esc(sc.title)}</b><p>${esc(sc.lead)}</p><p class="muted">被害者 ${esc(sc.victim)}　死亡 ${esc(sc.crimeTime)}</p></div>` : ''}`
  return intro ? `<div class="sheet intro"><div class="scroll pad">${body}</div></div>` : sheetWrap('あなたの役割', 'role', body)
}

function traitChips(tr, hit) {
  return sc.traits.map(d => {
    const v = tval(d.key, tr[d.key])
    const h = hit?.[d.key]
    const cls = h === true ? 'chip hit' : h === false ? 'chip miss' : 'chip'
    return `<span class="${cls}">${h === true ? icon('check', 'ck') : ''}${esc(v.label)}</span>`
  }).join('')
}

function stampHTML(eid) {
  const a = G.analyses?.[eid]
  if (!a) return ''
  return a === 'fake' ? '<span class="stamp fake">鑑定 偽物</span>' : '<span class="stamp real">鑑定 本物</span>'
}

function evHTML(spotId, clue, extra) {
  const s = spot(spotId)
  const text = clue ? tval(clue.dim, clue.val).clue : s.text
  return `<div class="ev${clue ? ' clue' : ''}">
    <div class="ev-h"><span class="ev-where">${esc(s.name)}・${esc(roomOfSpot(s))}</span>${extra.stamp || ''}</div>
    <p>${esc(text)}</p>
    ${clue ? `<p class="ev-c">${esc(conclusion(clue))}</p>` : ''}
    ${extra.foot ? `<div class="ev-f">${extra.foot}</div>` : ''}
  </div>`
}

function noteHTML() {
  const posted = new Set(G.board.map(x => x.eid))
  let h = ''
  if (G.secret?.clue) h += `<div class="ev clue own"><div class="ev-h"><span class="ev-where">検視（探偵だけ）</span></div><p class="ev-c">${esc(conclusion(G.secret.clue))}</p></div>`
  if (G.secret?.clear) h += `<div class="ev own"><div class="ev-h"><span class="ev-where">目撃（あなただけ）</span></div><p>${esc(G.secret.text)}</p></div>`
  const list = [...(G.notebook || [])].reverse()
  if (!list.length) h += '<p class="empty">まだ何も調べていない。家具に近づくか、家具を押すと調べに行く</p>'
  h += list.map(e => evHTML(e.spot, e.clue, {
    stamp: e.eid ? stampHTML(e.eid) : '',
    foot: e.eid ? (posted.has(e.eid) ? '<span class="tag">掲示板に貼った</span>' : `<button class="btn small" data-act="post" data-eid="${esc(e.eid)}">${icon('pin')}掲示板に貼る</button>`) : ''
  })).join('')
  return h
}

function conflicts() {
  const by = {}
  for (const b of G.board) if (b.clue) (by[b.clue.dim] ||= new Set()).add(b.clue.val)
  return Object.entries(by).filter(([, s]) => s.size > 1).map(([d]) => d)
}

function boardHTML() {
  if (!G.board.length) return '<p class="empty">まだ誰も貼っていない。見つけた証拠は手帳から貼れる</p>'
  const cf = conflicts()
  let h = cf.length ? `<div class="warn"><b>食い違い</b> ${cf.map(d => esc(trait(d).label)).join('・')}の証拠が2種類ある。どれかが偽物だ</div>` : ''
  h += [...G.board].reverse().map(b => {
    const who = char(b.by)
    let foot = `<span class="by">${pt(who, 'calm', 22)}${esc(who?.name || '退出した人')}が貼った</span>`
    if (G.role === 'forensic' && !G.analyses?.[b.eid] && G.forensicUses > 0) foot += `<button class="btn small" data-act="analyze" data-eid="${esc(b.eid)}">鑑定（残り${G.forensicUses}）</button>`
    return evHTML(b.spot, b.clue, { stamp: stampHTML(b.eid), foot })
  }).join('')
  return h
}

// 雷の記録など（全員に同じ）
function logHTML() {
  const L = (G.log || []).filter(e => e.kind === 'flash' || e.kind === 'lock')
  if (!L.length) return '<p class="empty">まだ何も起きていない</p>'
  return L.map(e => {
    if (e.kind === 'lock') { const d = e.door; const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => sc.rooms[sc.map[d[1] + dy]?.[d[0] + dx]]).filter(Boolean); return `<div class="logrow">${icon('lock')}<p><b>探索 ${e.at}秒</b> 嵐で${esc([...new Set(nb)].join('と'))}の間の扉が閉まった</p></div>` }
    const rows = Object.entries(e.rooms).map(([id, r]) => { const c = char(id); return c ? `<span class="who">${pt(c, 'shock', 22)}<b>${esc(c.name)}</b>${esc(sc.rooms[r] || '')}</span>` : '' }).join('')
    return `<div class="logrow flash">${icon('bolt')}<div><p><b>探索 ${e.at}秒の雷</b> 光った瞬間の居場所</p><div class="whos">${rows}</div></div></div>`
  }).join('')
}

// 掲示板（と探偵の検視）の手がかりを人物の特徴に照らす。食い違っている特徴は判定しない
function hits(c) {
  const cf = new Set(conflicts())
  const known = {}
  for (const b of G.board) if (b.clue && !cf.has(b.clue.dim)) known[b.clue.dim] = b.clue.val
  if (G.secret?.clue) known[G.secret.clue.dim] = G.secret.clue.val
  const out = {}
  for (const [d, v] of Object.entries(known)) out[d] = c.traits[d] === v
  return out
}

function peopleHTML(vote) {
  const present = new Set(S.players.map(p => p.id))
  return '<p class="muted legend">証拠と合う特徴に印が付く。全部合う人が怪しい</p>' + G.chars.filter(c => present.has(c.id)).map(c => {
    const h = hits(c)
    const keys = Object.keys(h)
    const ok = keys.filter(k => h[k]).length
    const self = c.id === S.you
    const cleared = G.secret?.clear === c.id
    const m = marks[c.id] || 0
    const mine = G.myVote === c.id
    let right
    if (self) right = '<span class="tag">あなた</span>'
    else if (vote) right = `<button class="btn ${mine ? 'danger' : ''} vbtn" data-act="vote" data-id="${esc(c.id)}" aria-pressed="${mine}">${icon('vote')}${mine ? '投票中' : '投票'}</button>`
    else right = `<button class="btn small mark m${m}" data-act="mark" data-id="${esc(c.id)}" aria-label="自分用の印">${['印なし', '白', '怪しい'][m]}</button>`
    const sus = keys.length && ok === keys.length
    return `<div class="person${mine ? ' voted' : ''}${sus ? ' sus' : ''}">
      ${pt(c, mine ? 'shock' : sus ? 'think' : 'calm', 40)}
      <div class="pinfo"><div class="pname"><b>${esc(c.name)}</b><small>${esc(c.title)}</small>${cleared ? '<span class="tag ok">目撃で白</span>' : ''}${keys.length ? `<small class="fit">一致 ${ok}/${keys.length}</small>` : ''}</div><div class="chips">${traitChips(c.traits, h)}</div></div>
      ${right}
    </div>`
  }).join('')
}

function fakeHTML() {
  const c = G.culprit
  const n = nearest()
  if (!c || !n || !c.canPlant || !c.plantable.includes(n.id)) return '<p class="empty">ここには置けない</p>'
  return `<p class="muted">${esc(n.name)}に偽の証拠を置く。見つけた人には本物と同じに見える。鑑識には見破られる。</p>` +
    c.fakeOptions.map(o => `<button class="btn fake-opt" data-act="fake" data-dim="${esc(o.dim)}" data-val="${esc(o.val)}"><b>${esc(tval(o.dim, o.val).label)}に見せかける</b><small>${esc(tval(o.dim, o.val).clue)}</small></button>`).join('')
}

function discussHTML() {
  const tabs = [['board', 'pin', `掲示板 ${G.board.length}`], ['note', 'book', `手帳 ${G.notebook?.length || 0}`], ['people', 'people', '人物'], ['log', 'bolt', '記録']]
  const body = dTab === 'board' ? boardHTML() : dTab === 'note' ? noteHTML() : dTab === 'log' ? logHTML() : peopleHTML(false)
  return `<div class="sheet"><div class="dtabs">${tabs.map(([k, ic, l]) => `<button class="btn small${dTab === k ? ' on' : ''}" data-act="tab" data-tab="${k}" aria-pressed="${dTab === k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div><p class="muted dhint">話し合って犯人を絞る。手帳の証拠はまだ貼れる</p><div class="scroll">${body}</div></div>`
}

function voteHTML() {
  return `<div class="sheet"><div class="sheet-h"><b>${icon('vote')}犯人だと思う人に投票</b><span class="muted">投票済み ${G.voted?.length || 0}/${S.players.length}</span></div><div class="scroll">${peopleHTML(true)}</div></div>`
}

// ---------- 毎フレーム（3D か 2D）
function interp(list, dt) {
  const live = new Set(list.map(o => o.id))
  for (const k in rp) if (!live.has(k)) delete rp[k]
  const now = performance.now()
  return list.map(o => {
    const r = rp[o.id] || (rp[o.id] = { x: o.x, y: o.y, tx: o.x, ty: o.y, yaw: 0, movedAt: 0 })
    if (o.x !== r.tx || o.y !== r.ty) {
      const dx = o.x - r.tx, dy = o.y - r.ty
      if (Math.hypot(dx, dy) > 0.01) { r.yaw = Math.atan2(dx, dy); r.movedAt = now }
      r.tx = o.x; r.ty = o.y
    }
    const k = 1 - Math.pow(0.0005, dt)
    r.x += (o.x - r.x) * k; r.y += (o.y - r.y) * k
    if (Math.hypot(o.x - r.x, o.y - r.y) > 2) { r.x = o.x; r.y = o.y }
    // 立ち止まって少したったら、こちら（カメラ）を向く。調べている間は家具の方を向いたまま
    if (now - r.movedAt > 900 && !o.busy) r.yaw = 0
    return { ...o, x: r.x, y: r.y, yaw: r.yaw, moving: now - r.movedAt < 180 }
  })
}

function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now
  if (!G || !sc || !G.chars || $('#game').hidden) return
  const view = $('#g-view'), r = view.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return
  const explore = G.phase === 'explore' && G.me
  const dark = !!G.env?.dark
  const shock = now < shockUntil
  if (v3) {
    v3.setSize(r.width, r.height)
    let out = {}
    if (explore) {
      const near = nearest()
      const list = interp([...(G.others || []).map(o => ({ ...o, self: false })), { id: S.you, x: G.me.x, y: G.me.y, busy: !!G.me.busy, self: true }], dt)
      const meF = myFace && now < myFace.until ? myFace.kind : null
      for (const o of list) o.face = o.busy ? 'search' : shock ? 'shock' : o.self && meF ? meF : dark ? 'worry' : 'calm'
      const me = list.pop()
      out = v3.frame({ mode: 'explore', dt, me: { ...me, room: G.me.room }, others: list, near, checked: new Set(G.checked || []), traces: new Set((G.culprit?.traces || []).filter(x => x.present).map(x => x.spot)), env: G.env, dest: route ? route.pts.at(-1) : null })
      drawMini()
    } else if (G.phase === 'intro') {
      out = v3.frame({ mode: 'scene', dt })
    } else {
      const present = new Set(S.players.map(p => p.id))
      const voted = new Set(G.voted || [])
      const t = now / 1000
      const lineup = G.chars.filter(c => present.has(c.id)).map((c, i) => ({
        id: c.id, self: c.id === S.you,
        face: G.phase === 'vote' ? (c.id === G.myVote ? 'shock' : voted.has(c.id) ? 'smug' : 'think') : ((Math.floor(t / 2.5) + i) % 3 === 0 ? 'think' : 'calm'),
        hop: G.phase === 'vote' && voted.has(c.id)
      }))
      out = v3.frame({ mode: 'lineup', dt, lineup, myVote: G.phase === 'vote' ? G.myVote : null })
    }
    placeLabels(out.labels || [], G.me?.busy?.p)
  } else {
    if (explore) draw2d(dt); else { if (ctx2) ctx2.clearRect(0, 0, cv.width, cv.height); placeLabels([]) }
  }
}

// 名前の札（3D の頭の上に HTML を重ねる）
const tagEls = new Map()
function placeLabels(labels, prog) {
  const box = $('#g-labels')
  const seen = new Set()
  for (const l of labels) {
    const c = char(l.id); if (!c) continue
    let el = tagEls.get(l.id)
    if (!el) { el = document.createElement('div'); el.className = 'tag3'; box.append(el); tagEls.set(l.id, el) }
    const label = l.self ? 'あなた' : [...c.name].slice(0, labels.length >= 6 ? 4 : 6).join('')
    const key = label + c.color + (l.self ? 's' : '')
    if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = `<span>${esc(label)}</span><i class="prog"></i>`; el.style.setProperty('--c', COLORS[c.color % COLORS.length]); el.classList.toggle('self', !!l.self) }
    el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, ${l.below ? '0%' : '-100%'})`
    el.hidden = false
    el.querySelector('.prog').style.setProperty('--p', l.self && prog != null ? prog : 0)
    el.classList.toggle('busy', !!(l.self && prog != null))
    seen.add(l.id)
  }
  for (const [id, el] of tagEls) if (!seen.has(id)) el.hidden = true
}

// 見取り図（右上。自分の部屋・調べた家具・閉じた扉）
let miniAt = 0
function drawMini() {
  const now = performance.now(); if (now - miniAt < 150) return; miniAt = now
  const W = sc.map[0].length, H = sc.map.length
  const T = Math.max(4, Math.floor(Math.min(110 / W, 110 / H)))
  const dpr = Math.min(2, devicePixelRatio || 1)
  if (mini.width !== W * T * dpr) { mini.width = W * T * dpr; mini.height = H * T * dpr; mini.style.width = W * T + 'px'; mini.style.height = H * T + 'px' }
  const g = miniCtx; g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const checked = new Set(G.checked || []), traces = new Set((G.culprit?.traces || []).filter(x => x.present).map(x => x.spot))
  const L = G.env?.lock
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = sc.map[y][x]
    g.fillStyle = c === '#' ? '#120c1c' : c === '+' ? (L && L[0] === x && L[1] === y ? '#ff3b4a' : '#c9925a') : floorColor(sc.floors?.[c])
    g.globalAlpha = c !== '#' && c !== '+' && c !== G.me.room ? 0.45 : 1
    g.fillRect(x * T, y * T, T, T)
  }
  g.globalAlpha = 1
  for (const s of sc.spots) {
    if (s.noClue) continue
    g.fillStyle = traces.has(s.id) ? '#ff3b4a' : checked.has(s.id) ? '#3fcf8e' : '#ffc94a'
    g.fillRect(s.x * T + T * 0.2, s.y * T + T * 0.2, T * 0.6, T * 0.6)
  }
  g.fillStyle = '#fff'; g.strokeStyle = '#1d1530'; g.lineWidth = 2
  g.beginPath(); g.arc(G.me.x * T, G.me.y * T, Math.max(3, T * 0.55), 0, Math.PI * 2); g.fill(); g.stroke()
}

// ---------- 2D（WebGL が使えない端末）。真上から見た地図
const FLOOR2 = k => floorColor(k)
function draw2d(dt) {
  const view = $('#g-view'), r = view.getBoundingClientRect()
  const W = sc.map[0].length, H = sc.map.length
  const dpr = Math.min(2, devicePixelRatio || 1)
  const cw = Math.round(r.width), ch = Math.round(r.height)
  if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr }
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0)
  // 上の HUD と下の操作の分をよけて地図を置く
  const top = 64, bottom = matchMedia('(orientation: landscape) and (max-height: 560px)').matches ? 8 : 190
  ts = Math.max(8, Math.floor(Math.min((cw - 16) / W, (ch - top - bottom) / H)))
  ox = Math.round((cw - ts * W) / 2); oy = Math.round(top + (ch - top - bottom - ts * H) / 2)
  const g = ctx2
  g.clearRect(0, 0, cw, ch)
  g.save(); g.translate(ox, oy)
  const L = G.env?.lock
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = sc.map[y][x]
    if (c === '#') { g.fillStyle = '#141015'; g.fillRect(x * ts, y * ts, ts, ts); continue }
    g.fillStyle = c === '+' ? '#6b5434' : FLOOR2(sc.floors?.[c]); g.fillRect(x * ts, y * ts, ts, ts)
    if (c === '+') { g.strokeStyle = L && L[0] === x && L[1] === y ? '#ff3b4a' : '#a07c45'; g.lineWidth = L && L[0] === x && L[1] === y ? 4 : 2; g.strokeRect(x * ts + ts * 0.18, y * ts + ts * 0.18, ts * 0.64, ts * 0.64) }
  }
  const near = nearest(), checked = new Set(G.checked || []), traces = new Set((G.culprit?.traces || []).filter(x => x.present).map(x => x.spot))
  const t = performance.now() / 1000
  for (const s of sc.spots) {
    const cx = (s.x + 0.5) * ts, cy = (s.y + 0.5) * ts
    g.fillStyle = s.noClue ? '#b02a2a' : '#7a5733'; g.strokeStyle = '#f0d7a8'; g.lineWidth = 1.5
    g.beginPath(); g.roundRect ? g.roundRect(cx - ts * 0.38, cy - ts * 0.38, ts * 0.76, ts * 0.76, 4) : g.rect(cx - ts * 0.38, cy - ts * 0.38, ts * 0.76, ts * 0.76); g.fill(); g.stroke()
    if (s === near) { g.strokeStyle = `rgba(255,214,120,${0.6 + 0.35 * Math.sin(t * 5)})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, ts * 0.62, 0, Math.PI * 2); g.stroke() }
    if (!s.noClue) { g.fillStyle = traces.has(s.id) ? '#ff3b4a' : checked.has(s.id) ? '#3fcf8e' : '#ffc94a'; g.beginPath(); g.arc(cx + ts * 0.32, cy - ts * 0.32, Math.max(4, ts * 0.16), 0, Math.PI * 2); g.fill() }
  }
  g.fillStyle = G.env?.dark ? 'rgba(4,2,8,.8)' : 'rgba(8,5,10,.55)'
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = sc.map[y][x]; if (c !== '#' && c !== '+' && (c !== G.me.room || G.env?.dark)) g.fillRect(x * ts, y * ts, ts, ts) }
  if (G.env?.dark) { const gr = g.createRadialGradient(G.me.x * ts, G.me.y * ts, ts * 0.5, G.me.x * ts, G.me.y * ts, ts * 2.6); gr.addColorStop(0, 'rgba(255,220,150,.35)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, W * ts, H * ts) }
  if (route) { const d = route.pts.at(-1); g.strokeStyle = '#6fe3ff'; g.lineWidth = 3; g.beginPath(); g.arc(d[0] * ts, d[1] * ts, ts * 0.25, 0, Math.PI * 2); g.stroke() }
  const list = interp([...(G.others || []).map(o => ({ ...o, self: false })), { id: S.you, x: G.me.x, y: G.me.y, busy: !!G.me.busy, self: true }], dt)
  const labels = []
  for (const o of list) {
    const c = char(o.id); if (!c) continue
    const cx = o.x * ts, cy = o.y * ts, rr = ts * 0.36
    g.fillStyle = COLORS[c.color % COLORS.length]; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill()
    g.lineWidth = o.self ? 3 : 1.5; g.strokeStyle = o.self ? '#fff' : 'rgba(0,0,0,.6)'; g.stroke()
    if (o.busy) { g.strokeStyle = '#ffd76a'; g.lineWidth = 2; g.beginPath(); g.arc(cx + rr, cy - rr, rr * 0.5, 0, Math.PI * 2); g.stroke() }
    labels.push({ id: o.id, x: ox + cx, y: oy + cy - rr - 2, self: o.self })
  }
  g.restore()
  placeLabels(labels, G.me?.busy?.p)
}

// 検証用（e2e）: 描画の方式と、3D が描けているか（輝度の分散）、fps
window.__wdiv = {
  mode: () => v3 ? '3d' : '2d',
  variance: () => v3 ? v3.variance() : null,
  fps: () => v3 ? v3.fps() : null,
  tier: () => v3 ? v3.tier : null,
  route: () => route && { n: route.pts.length, i: route.i, spot: route.spot },
  goSpot: id => { const s = spot(id); if (s) goTo({ x: s.x + 0.5, y: s.y + 0.5, spot: id }) }
}
