// ゲーム中の描画と操作。render(state, { send }) は状態が届くたびに呼ばれる。state.game はサーバーの view(自分) の中身。
// 地図は Canvas。手帳・掲示板・人物・投票は DOM。12回/秒の更新で DOM を作り直さないよう、中身が変わった時だけ描き直す。
import { byId } from './scenarios/index.mjs'

const $ = s => document.querySelector(s)
export const COLORS = ['#ff7b72', '#5aa9ff', '#ffd23f', '#5fd39a', '#c38bff', '#ff9f43', '#38d6e0', '#ff86b8']
const REACH = 1.15
const PHASE_LABEL = { intro: '役割の確認', explore: '探索', discuss: '推理', vote: '投票' }
const ROLE = {
  culprit: { label: '犯人', desc: '正体を隠して逃げ切る。自分の痕跡を1つ「隠す」、偽の証拠を1つ「偽装」できる。どちらも周りからは調べているようにしか見えない。' },
  detective: { label: '探偵', desc: '検視で分かった手がかりを1つ最初から持っている。調べるのが速い。' },
  forensic: { label: '鑑識', desc: '自分で調べた証拠が本物か偽物か分かる。掲示板の証拠も2回まで鑑定できる。' },
  witness: { label: '目撃者', desc: '事件の時刻に一緒にいた人を知っている。その人は犯人ではない。' },
  resident: { label: '住人', desc: '屋敷を調べて証拠を集め、掲示板で共有して犯人を当てる。' }
}

let S = null, G = null, sc = null, sendFn = null
let round = -1
let charsCache = null
let sheet = null            // 探索中に開いている板: note / board / people / role / fake
let dTab = 'board'          // 推理中のタブ
let marks = {}              // 自分だけのメモ（人物の印）。サーバーには送らない
let lastNotice = 0
let panelSig = '', footSig = ''
const rp = {}               // 描画用の位置（補間）
let joy = { dx: 0, dy: 0 }, keyVec = { dx: 0, dy: 0 }, sentVec = { dx: 0, dy: 0 }
const keys = new Set()
let canvas, ctx, ts = 20

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const trait = dim => sc.traits.find(t => t.key === dim)
const tval = (dim, val) => trait(dim)?.values.find(v => v.v === val)
const spot = id => sc.spots.find(s => s.id === id)
const roomOfSpot = s => sc.rooms[sc.map[s.y][s.x]]
const char = id => G.chars.find(c => c.id === id)
const initial = name => [...String(name || '?')][0]
const fmtTime = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
const conclusion = c => `犯人の${trait(c.dim).label}は「${tval(c.dim, c.val).label}」`

// ---------- 組み立て（1回だけ）
function build() {
  const root = $('#stage')
  root.innerHTML = `
    <div class="g-hud">
      <span class="g-phase" id="g-phase"></span>
      <span class="g-time" id="g-time"></span>
      <button class="g-role" id="g-role" aria-label="自分の役割を見る"></button>
    </div>
    <div class="g-main" id="g-main">
      <canvas id="g-map" aria-label="屋敷の地図"></canvas>
      <div class="g-room" id="g-room"></div>
      <div class="g-banner" id="g-banner" role="status" hidden></div>
      <div class="g-panel" id="g-panel" hidden></div>
    </div>
    <div class="g-ctrl" id="g-ctrl">
      <div class="g-joy" id="g-joy" aria-label="移動パッド"><div class="g-knob" id="g-knob"></div></div>
      <div class="g-acts">
        <button id="g-search" class="primary g-search"></button>
        <div class="g-secret" id="g-secret" hidden>
          <button id="g-hide" class="sec">隠す</button>
          <button id="g-plant" class="sec">偽装</button>
        </div>
      </div>
      <div class="g-tabs">
        <button data-sheet="note" id="t-note">手帳</button>
        <button data-sheet="board" id="t-board">掲示板</button>
        <button data-sheet="people" id="t-people">人物</button>
        <button id="g-done" class="g-done">終える</button>
      </div>
    </div>
    <div class="g-foot" id="g-foot" hidden></div>`
  canvas = $('#g-map'); ctx = canvas.getContext('2d')

  // 移動パッド
  const pad = $('#g-joy'), knob = $('#g-knob')
  let pid = null
  const setJoy = e => {
    const r = pad.getBoundingClientRect()
    const R = r.width / 2
    let dx = (e.clientX - r.left - R) / (R * 0.7), dy = (e.clientY - r.top - R) / (R * 0.7)
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m }
    joy = { dx, dy }
    knob.style.transform = `translate(${dx * R * 0.5}px, ${dy * R * 0.5}px)`
    pushMove(false)
  }
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { pad.setPointerCapture(pid) } catch {} setJoy(e) })
  pad.addEventListener('pointermove', e => { if (e.pointerId === pid) setJoy(e) })
  const endJoy = e => { if (e.pointerId !== pid) return; pid = null; joy = { dx: 0, dy: 0 }; knob.style.transform = ''; pushMove(true) }
  pad.addEventListener('pointerup', endJoy); pad.addEventListener('pointercancel', endJoy)

  // キーボード（矢印 / WASD で移動、E・スペースで調べる）
  addEventListener('keydown', e => {
    if (!G || e.target.closest?.('input,textarea')) return
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); updKeys(); e.preventDefault() }
    if ((k === 'e' || k === ' ') && G.phase === 'explore' && !sheet) { $('#g-search').click(); e.preventDefault() }
    if (k === 'escape' && sheet) { sheet = null; draw() }
  })
  addEventListener('keyup', e => { if (keys.delete(e.key.toLowerCase())) updKeys() })
  addEventListener('blur', () => { keys.clear(); updKeys() })

  $('#g-search').onclick = () => { const n = nearest(); if (n && !G.me?.busy) sendFn({ type: 'act', kind: 'search', spot: n.id }) }
  $('#g-hide').onclick = () => { const n = nearest(); if (n) sendFn({ type: 'act', kind: 'hide', spot: n.id }) }
  $('#g-plant').onclick = () => { sheet = 'fake'; draw() }
  $('#g-role').onclick = () => { if (G.phase === 'explore') { sheet = sheet === 'role' ? null : 'role'; draw() } }
  $('#g-done').onclick = () => sendFn({ type: 'ready', on: !G.ready.includes(S.you) })
  for (const b of document.querySelectorAll('[data-sheet]')) b.onclick = () => { sheet = sheet === b.dataset.sheet ? null : b.dataset.sheet; draw() }
  $('#g-panel').addEventListener('click', onPanelClick)
  $('#g-foot').addEventListener('click', e => { if (e.target.closest('[data-act="ready"]')) sendFn({ type: 'ready', on: !G.ready.includes(S.you) }) })

  setInterval(() => pushMove(true), 120)
  addEventListener('resize', () => { if (G) draw() })
  requestAnimationFrame(frame)
}

function updKeys() {
  const h = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'))
  const v = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'))
  const m = Math.hypot(h, v) || 1
  keyVec = { dx: h / m, dy: v / m }
  pushMove(true)
}

// 移動の向きを送る。変わった時だけ、細かい揺れは間引く
function pushMove(force) {
  if (!G || G.phase !== 'explore' || !sendFn) return
  const dx = joy.dx || keyVec.dx, dy = joy.dy || keyVec.dy
  const q = v => Math.round(v * 20) / 20
  const v = { dx: q(dx), dy: q(dy) }
  if (v.dx === sentVec.dx && v.dy === sentVec.dy) return
  if (!force && (v.dx || v.dy) && Math.hypot(v.dx - sentVec.dx, v.dy - sentVec.dy) < 0.25) return
  sentVec = v
  sendFn({ type: 'move', ...v })
}

function onPanelClick(e) {
  const b = e.target.closest('[data-act]')
  if (!b) return
  const a = b.dataset.act
  if (a === 'close') sheet = null
  else if (a === 'post') sendFn({ type: 'post', eid: b.dataset.eid })
  else if (a === 'analyze') sendFn({ type: 'analyze', eid: b.dataset.eid })
  else if (a === 'tab') dTab = b.dataset.tab
  else if (a === 'mark') marks[b.dataset.id] = ((marks[b.dataset.id] || 0) + 1) % 3
  else if (a === 'vote') sendFn({ type: 'vote', target: b.dataset.id })
  else if (a === 'fake') { const n = nearest(); if (n) sendFn({ type: 'act', kind: 'plant', spot: n.id, fake: { dim: b.dataset.dim, val: b.dataset.val } }); sheet = null }
  panelSig = ''; draw()
}

// ---------- 状態が届いたとき
export function render(state, { send }) {
  sendFn = send
  if (!$('#g-map')) build()
  S = state; G = state.game
  window.__wdi = G; window.__wdiYou = state.you // 自分の view だけ（検証用）
  if (!G) return
  sc = byId(G.scenario)
  if (state.round !== round) {
    if (!G.chars) return // 新しい回の人物一覧が届くまで待つ
    round = state.round; sheet = null; dTab = 'board'; marks = {}; panelSig = ''; footSig = ''
    lastNotice = G.notice?.n || 0; for (const k in rp) delete rp[k]; sentVec = { dx: 0, dy: 0 }
  }
  if (G.chars) charsCache = G.chars; else G.chars = charsCache
  if (!G.chars) return
  if (G.notice && G.notice.n > lastNotice) { lastNotice = G.notice.n; banner(G.notice.text) }
  if (G.phase !== 'explore' && sheet) sheet = null
  draw()
}

function banner(text) {
  const b = $('#g-banner'); b.textContent = text; b.hidden = false
  clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), 2200)
}

function draw() {
  if (!G) return
  const ph = G.phase
  const n = S.players.length
  document.body.dataset.phase = ph
  $('#g-phase').textContent = PHASE_LABEL[ph] || ''
  $('#g-time').textContent = '残り ' + fmtTime(G.time)
  $('#g-time').dataset.low = G.time <= 10 ? '1' : '0'
  $('#g-role').textContent = G.role ? ROLE[G.role].label : '観戦'
  $('#g-role').dataset.role = G.role || ''
  const explore = ph === 'explore' && !!G.me
  $('#g-map').hidden = !explore
  $('#g-room').hidden = !explore
  $('#g-ctrl').hidden = !explore
  $('#g-foot').hidden = !(ph === 'intro' || ph === 'discuss')
  if (explore) { fit(); updateControls(n) }
  updatePanel()
  updateFoot(n)
}

// ---------- 操作ボタンの状態
function nearest() {
  if (!G?.me) return null
  let best = null, bd = Infinity
  for (const s of sc.spots) {
    const d = Math.hypot(G.me.x - (s.x + 0.5), G.me.y - (s.y + 0.5))
    if (d <= REACH && d < bd) { bd = d; best = s }
  }
  return best
}

function updateControls(n) {
  const near = nearest()
  const busy = G.me.busy
  const b = $('#g-search')
  const sig = busy ? 'b' + busy.kind + busy.p : near ? 'n' + near.id : '-'
  if (b.dataset.sig !== sig) {
    b.dataset.sig = sig
    if (busy) { b.disabled = true; b.innerHTML = `<span class="s1">${busy.kind === 'search' ? '調べています' : busy.kind === 'hide' ? '隠しています' : '置いています'}</span><i class="bar" style="width:${Math.round(busy.p * 100)}%"></i>` }
    else if (near) { b.disabled = false; b.innerHTML = `<span class="s1">調べる</span><span class="s2">${esc(near.name)}</span>` }
    else { b.disabled = true; b.innerHTML = '<span class="s1">調べる</span><span class="s2">家具に近づく</span>' }
  }
  const c = G.culprit
  $('#g-secret').hidden = !c
  if (c) {
    const tr = near && c.traces.find(t => t.spot === near.id && t.present)
    $('#g-hide').disabled = !!busy || !c.canHide || !tr
    $('#g-hide').textContent = c.canHide ? '隠す' : '隠した'
    $('#g-plant').disabled = !!busy || !c.canPlant || !near || !c.plantable.includes(near.id)
    $('#g-plant').textContent = c.canPlant ? '偽装' : '偽装済み'
  }
  $('#t-note').textContent = `手帳 ${G.notebook?.length || 0}`
  $('#t-board').textContent = `掲示板 ${G.board.length}`
  for (const k of ['note', 'board', 'people']) { $('#t-' + k).classList.toggle('on', sheet === k); $('#t-' + k).setAttribute('aria-pressed', sheet === k ? 'true' : 'false') }
  const r = G.ready.length, mine = G.ready.includes(S.you)
  $('#g-done').textContent = mine ? `待機 ${r}/${n}` : `終える ${r}/${n}`
  $('#g-done').classList.toggle('on', mine)
  $('#g-done').setAttribute('aria-pressed', mine ? 'true' : 'false')
  const names = (G.others || []).map(o => char(o.id)?.name).filter(Boolean)
  $('#g-room').textContent = `${sc.rooms[G.me.room] || ''}　${names.length ? '同じ部屋: ' + names.join('・') : 'ほかに誰もいない'}`
}

function updateFoot(n) {
  const ph = G.phase
  if (ph !== 'intro' && ph !== 'discuss') return
  const r = G.ready.length, mine = G.ready.includes(S.you)
  const label = mine ? `待っています ${r}/${n}（取り消す）` : ph === 'intro' ? `読んだ ${r}/${n}` : `投票へ進む ${r}/${n}`
  const sig = ph + label
  if (sig === footSig) return
  footSig = sig
  $('#g-foot').innerHTML = `<button class="${mine ? 'ghost on' : 'primary'}" data-act="ready" id="g-ready" aria-pressed="${mine}">${label}</button>`
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
  const sig = JSON.stringify([kind, dTab, G.notebook, G.board, G.analyses, G.forensicUses, marks, G.voted, G.myVote, G.culprit, ph, kind === 'fake' ? nearest()?.id : 0, S.players.map(x => x.id)])
  if (sig === panelSig) return
  panelSig = sig
  const sc0 = p.querySelector('.scroll')?.scrollTop || 0
  p.innerHTML = kind === 'role' ? roleHTML(ph === 'intro')
    : kind === 'note' ? sheetWrap('手帳', noteHTML())
    : kind === 'board' ? sheetWrap('掲示板', boardHTML())
    : kind === 'people' ? sheetWrap('人物', peopleHTML(false))
    : kind === 'fake' ? sheetWrap('偽装する', fakeHTML())
    : kind === 'discuss' ? discussHTML()
    : voteHTML()
  const sEl = p.querySelector('.scroll'); if (sEl) sEl.scrollTop = sc0
}

const sheetWrap = (title, body) => `<div class="sheet"><div class="sheet-h"><b>${title}</b><button class="ghost small" data-act="close">閉じる</button></div><div class="scroll">${body}</div></div>`

function roleIcon(role) {
  const paths = {
    culprit: '<path d="M3 16c3-2 15-2 18 0l-1 3H4z" fill="currentColor"/><path d="M7 16l1.2-9h7.6L17 16" fill="currentColor"/><rect x="5" y="10" width="14" height="2" fill="#1b1410"/>',
    detective: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.5 14.5l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    forensic: '<path d="M9 3h6M10 3v6l-5 10h14l-5-10V3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 15h10" stroke="currentColor" stroke-width="2"/>',
    witness: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
    resident: '<path d="M4 11l8-7 8 7v9H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" fill="currentColor"/>'
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[role] || ''}</svg>`
}

function roleHTML(intro) {
  const role = G.role
  if (!role) return '<p class="empty">観戦中</p>'
  const me = char(S.you)
  let secret = ''
  if (G.secret) secret += `<div class="secret"><b>あなただけが知っている</b><p>${esc(G.secret.text)}</p></div>`
  if (G.culprit) {
    secret += `<div class="secret evil"><b>あなたの痕跡（あなたにだけ見えている）</b><ul>${G.culprit.traces.map(t => { const s = spot(t.spot); return `<li>${esc(s.name)}（${esc(roomOfSpot(s))}）に「${esc(tval(t.clue.dim, t.clue.val).label)}」の手がかり${t.present ? '' : ' <span class="tag">隠した</span>'}</li>` }).join('')}</ul><p class="small-note">地図の赤い菱形。1つだけ隠せる。別の家具に偽物を1つ置ける</p></div>`
  }
  const body = `
    <div class="role-card" data-role="${role}">
      <div class="rc-top">${roleIcon(role)}<div><p class="muted">あなたの役割</p><h2>${ROLE[role].label}</h2></div></div>
      <p class="rc-desc">${ROLE[role].desc}</p>
      ${me ? `<p class="mine">あなたは${esc(me.title)}。特徴 ${traitChips(me.traits, null)}</p>` : ''}
      ${secret}
    </div>
    ${intro ? `<div class="case"><b>${esc(sc.title)}</b><p>${esc(sc.lead)}</p><p class="muted">被害者 ${esc(sc.victim)}　死亡 ${esc(sc.crimeTime)}</p></div>` : ''}`
  return intro ? `<div class="sheet"><div class="scroll pad">${body}</div></div>` : sheetWrap('あなたの役割', body)
}

function traitChips(tr, hit) {
  return sc.traits.map(d => {
    const v = tval(d.key, tr[d.key])
    const h = hit?.[d.key]
    const cls = h === true ? 'chip hit' : h === false ? 'chip miss' : 'chip'
    return `<span class="${cls}">${h === true ? '<i class="ck" aria-label="一致"></i>' : ''}${esc(v.label)}</span>`
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
  if (!list.length) h += '<p class="empty">まだ何も調べていない。家具に近づいて「調べる」</p>'
  h += list.map(e => evHTML(e.spot, e.clue, {
    stamp: e.eid ? stampHTML(e.eid) : '',
    foot: e.eid ? (posted.has(e.eid) ? '<span class="tag">掲示板に貼った</span>' : `<button class="small" data-act="post" data-eid="${esc(e.eid)}">掲示板に貼る</button>`) : ''
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
    let foot = `<span class="by"><i class="dot" style="background:${COLORS[who?.color ?? 0]}">${esc(initial(who?.name))}</i>${esc(who?.name || '退出した人')}が貼った</span>`
    if (G.role === 'forensic' && !G.analyses?.[b.eid] && G.forensicUses > 0) foot += `<button class="small" data-act="analyze" data-eid="${esc(b.eid)}">鑑定（残り${G.forensicUses}）</button>`
    return evHTML(b.spot, b.clue, { stamp: stampHTML(b.eid), foot })
  }).join('')
  return h
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
    let right
    if (self) right = '<span class="tag">あなた</span>'
    else if (vote) right = `<button class="${G.myVote === c.id ? 'primary' : ''} vbtn" data-act="vote" data-id="${esc(c.id)}" aria-pressed="${G.myVote === c.id}">${G.myVote === c.id ? '投票中' : '投票'}</button>`
    else right = `<button class="small mark m${m}" data-act="mark" data-id="${esc(c.id)}" aria-label="自分用の印">${['印なし', '白', '怪しい'][m]}</button>`
    return `<div class="person${G.myVote === c.id ? ' voted' : ''}">
      <i class="dot" style="background:${COLORS[c.color]}">${esc(initial(c.name))}</i>
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
    c.fakeOptions.map(o => `<button class="fake-opt" data-act="fake" data-dim="${esc(o.dim)}" data-val="${esc(o.val)}"><b>${esc(tval(o.dim, o.val).label)}に見せかける</b><small>${esc(tval(o.dim, o.val).clue)}</small></button>`).join('')
}

function discussHTML() {
  const tabs = [['board', `掲示板 ${G.board.length}`], ['note', `手帳 ${G.notebook?.length || 0}`], ['people', '人物']]
  const body = dTab === 'board' ? boardHTML() : dTab === 'note' ? noteHTML() : peopleHTML(false)
  return `<div class="sheet"><div class="dtabs">${tabs.map(([k, l]) => `<button class="small${dTab === k ? ' on' : ''}" data-act="tab" data-tab="${k}" aria-pressed="${dTab === k}">${l}</button>`).join('')}</div><p class="muted dhint">話し合って犯人を絞る。手帳の証拠はまだ貼れる</p><div class="scroll">${body}</div></div>`
}

function voteHTML() {
  return `<div class="sheet"><div class="sheet-h"><b>犯人だと思う人に投票</b><span class="muted">投票済み ${G.voted?.length || 0}/${S.players.length}</span></div><div class="scroll">${peopleHTML(true)}</div></div>`
}

// ---------- 地図
function fit() {
  const main = $('#g-main')
  const W = sc.map[0].length, H = sc.map.length
  const r = main.getBoundingClientRect()
  const nts = Math.max(8, Math.floor(Math.min(r.width / W, (r.height - 26) / H)))
  const dpr = Math.min(3, devicePixelRatio || 1)
  const cw = nts * W, ch = nts * H
  if (nts !== ts || canvas.width !== Math.round(cw * dpr)) {
    ts = nts
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr)
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}

const FLOOR = { S: '#5a4330', B: '#46374f', H: '#4a3530', D: '#54402c', K: '#3f4544', E: '#4a443c', G: '#324a37' }
const FLOOR2 = { S: '#634a35', B: '#4e3d58', H: '#6e3b33', D: '#5d4731', K: '#4a504f', E: '#524b42', G: '#3a5640' }

function frame() {
  requestAnimationFrame(frame)
  if (!G || G.phase !== 'explore' || !ctx || !G.me) return
  const t = performance.now() / 1000
  const W = sc.map[0].length, H = sc.map.length
  ctx.clearRect(0, 0, W * ts, H * ts)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = sc.map[y][x]
    if (c === '#') {
      ctx.fillStyle = '#141015'; ctx.fillRect(x * ts, y * ts, ts, ts)
      if (y + 1 < H && sc.map[y + 1][x] !== '#') { ctx.fillStyle = '#33252c'; ctx.fillRect(x * ts, y * ts + ts * 0.6, ts, ts * 0.4) }
      continue
    }
    const room = c === '+' ? null : c
    ctx.fillStyle = room ? ((x + y) % 2 ? FLOOR[room] : FLOOR2[room]) : '#6b5434'
    ctx.fillRect(x * ts, y * ts, ts, ts)
    if (c === '+') { ctx.strokeStyle = '#a07c45'; ctx.lineWidth = 2; ctx.strokeRect(x * ts + ts * 0.18, y * ts + ts * 0.18, ts * 0.64, ts * 0.64) }
  }
  const near = nearest()
  const checked = new Set(G.checked || [])
  const traces = new Set((G.culprit?.traces || []).filter(x => x.present).map(x => x.spot))
  for (const s of sc.spots) drawSpot(s, s === near, checked.has(s.id), traces.has(s.id), t)
  // 自分の部屋以外は暗い（そこにいる人は見えない）
  ctx.fillStyle = 'rgba(8,5,10,.55)'
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = sc.map[y][x]
    if (c !== '#' && c !== '+' && c !== G.me.room) ctx.fillRect(x * ts, y * ts, ts, ts)
  }
  drawRoomLabels()
  const list = [...(G.others || []).map(o => ({ ...o, self: false })), { id: S.you, x: G.me.x, y: G.me.y, busy: !!G.me.busy, self: true }]
  const live = new Set(list.map(o => o.id))
  for (const k in rp) if (!live.has(k)) delete rp[k]
  for (const o of list) {
    const r = rp[o.id] || (rp[o.id] = { x: o.x, y: o.y })
    r.x += (o.x - r.x) * 0.3; r.y += (o.y - r.y) * 0.3
    if (Math.hypot(o.x - r.x, o.y - r.y) > 2) { r.x = o.x; r.y = o.y }
    drawPerson(char(o.id), r.x, r.y, o.self, o.busy, o.self ? G.me.busy?.p : null, t)
  }
}

// 部屋の名前は家具と重ならない所（下の辺の中央か上の辺の中央）に置く
const labelCache = new Map()
function roomLabels() {
  if (labelCache.has(sc.id)) return labelCache.get(sc.id)
  const box = {}
  sc.map.forEach((row, y) => [...row].forEach((c, x) => {
    if (!sc.rooms[c]) return
    const b = box[c] ||= { x0: x, x1: x, y0: y, y1: y }
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y)
  }))
  const out = Object.entries(box).map(([c, b]) => {
    const cx = (b.x0 + b.x1 + 1) / 2
    const cands = [[cx, b.y1 + 0.5], [cx, b.y0 + 0.5], [b.x0 + 1, b.y1 + 0.5], [b.x1, b.y1 + 0.5]]
    const free = cands.find(([x, y]) => sc.spots.every(s => Math.abs(s.x + 0.5 - x) > 1.6 || Math.abs(s.y + 0.5 - y) > 0.9)) || cands[0]
    return { c, x: free[0], y: free[1] }
  })
  labelCache.set(sc.id, out)
  return out
}
function drawRoomLabels() {
  ctx.font = `700 ${Math.max(10, Math.round(ts * 0.4))}px "Hiragino Sans", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const l of roomLabels()) {
    const text = sc.rooms[l.c], w = ctx.measureText(text).width + 10, h = Math.max(14, ts * 0.56)
    const mine = l.c === G.me.room
    ctx.fillStyle = mine ? 'rgba(232,176,74,.9)' : 'rgba(12,8,12,.7)'
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(l.x * ts - w / 2, l.y * ts - h / 2, w, h, h / 2) : ctx.rect(l.x * ts - w / 2, l.y * ts - h / 2, w, h); ctx.fill()
    ctx.fillStyle = mine ? '#231703' : 'rgba(255,240,220,.8)'
    ctx.fillText(text, l.x * ts, l.y * ts + 1)
  }
  ctx.textAlign = 'left'
}

function drawSpot(s, isNear, isChecked, isTrace, t) {
  const cx = (s.x + 0.5) * ts, cy = (s.y + 0.5) * ts, u = ts / 24
  if (isNear) {
    ctx.strokeStyle = `rgba(255,214,120,${0.6 + 0.35 * Math.sin(t * 5)})`; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(cx, cy, ts * 0.62, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.save(); ctx.translate(cx, cy)
  ctx.strokeStyle = '#f0d7a8'; ctx.fillStyle = '#7a5733'; ctx.lineWidth = Math.max(1.2, u * 1.6); ctx.lineJoin = 'round'
  const R = (x, y, w, h) => { ctx.beginPath(); ctx.rect(x * u, y * u, w * u, h * u); ctx.fill(); ctx.stroke() }
  const L = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)); ctx.stroke() }
  const C = (x, y, r) => { ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  switch (s.icon) {
    case 'body':
      ctx.fillStyle = 'rgba(150,25,25,.65)'; ctx.beginPath(); ctx.ellipse(2 * u, 5 * u, 9 * u, 3.5 * u, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#d9d2c5'; C(-7, -1, 3.5); R(-3, -4, 12, 6); break
    case 'desk': R(-9, -5, 18, 7); L([[-8, 2], [-8, 8]]); L([[8, 2], [8, 8]]); break
    case 'shelf': R(-8, -9, 16, 18); L([[-8, -3], [8, -3]]); L([[-8, 3], [8, 3]]); break
    case 'bed': R(-8, -9, 16, 18); ctx.fillStyle = '#e8e0d0'; R(-6, -7, 12, 4); break
    case 'dresser': R(-8, -1, 16, 8); ctx.fillStyle = '#9fb4c4'; C(0, -5, 4); break
    case 'vase': ctx.beginPath(); ctx.moveTo(-3 * u, -8 * u); ctx.lineTo(3 * u, -8 * u); ctx.quadraticCurveTo(9 * u, 2 * u, 3 * u, 8 * u); ctx.lineTo(-3 * u, 8 * u); ctx.quadraticCurveTo(-9 * u, 2 * u, -3 * u, -8 * u); ctx.fill(); ctx.stroke(); break
    case 'clock': R(-5, -10, 10, 20); ctx.fillStyle = '#f0e6d0'; C(0, -4, 3.5); L([[0, -4], [0, -6.5]]); break
    case 'table': ctx.beginPath(); ctx.ellipse(0, 0, 10 * u, 6 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break
    case 'cupboard': R(-8, -9, 16, 18); L([[0, -9], [0, 9]]); break
    case 'stove': R(-8, -6, 16, 13); ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(-3 * u, 4 * u); ctx.lineTo(0, -3 * u); ctx.lineTo(3 * u, 4 * u); ctx.closePath(); ctx.fill(); break
    case 'sink': R(-8, -6, 16, 12); ctx.fillStyle = '#6f8a96'; R(-5, -3, 10, 6); break
    case 'umbrella': ctx.beginPath(); ctx.arc(0, -1 * u, 8 * u, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); L([[0, -1], [0, 8], [-2, 9]]); break
    case 'shoebox': R(-8, -6, 16, 12); L([[-8, 0], [8, 0]]); break
    case 'pot': ctx.fillStyle = '#5fb36a'; C(-3, -5, 3.5); C(3, -6, 3.5); ctx.fillStyle = '#a0603a'; ctx.beginPath(); ctx.moveTo(-7 * u, -1 * u); ctx.lineTo(7 * u, -1 * u); ctx.lineTo(5 * u, 8 * u); ctx.lineTo(-5 * u, 8 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); break
    case 'can': R(-6, -4, 10, 10); L([[4, -2], [9, -7]]); break
    default: R(-7, -7, 14, 14)
  }
  ctx.restore()
  // 印: 調べた = チェック / まだ = ？ / 犯人だけ: 自分の痕跡 = 赤い菱形
  const bx = cx + ts * 0.38, by = cy - ts * 0.38, br = Math.max(5, ts * 0.2)
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fillStyle = isChecked ? '#2f8f62' : '#2a2128'; ctx.fill()
  ctx.strokeStyle = '#f3ece4'; ctx.lineWidth = 1.4; ctx.stroke()
  if (isChecked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.4, br * 0.3); ctx.beginPath(); ctx.moveTo(bx - br * 0.5, by); ctx.lineTo(bx - br * 0.1, by + br * 0.45); ctx.lineTo(bx + br * 0.55, by - br * 0.4); ctx.stroke() }
  else { ctx.fillStyle = '#f3ece4'; ctx.font = `800 ${Math.round(br * 1.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', bx, by + 0.5); ctx.textAlign = 'left' }
  if (isTrace) {
    const tx = cx - ts * 0.38, ty = cy - ts * 0.38, tr = br
    ctx.fillStyle = '#e03b3b'; ctx.beginPath(); ctx.moveTo(tx, ty - tr); ctx.lineTo(tx + tr, ty); ctx.lineTo(tx, ty + tr); ctx.lineTo(tx - tr, ty); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
  }
}

function drawPerson(c, x, y, self, busy, prog, t) {
  if (!c) return
  const cx = x * ts, cy = y * ts, r = ts * 0.34
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = COLORS[c.color]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = self ? 3 : 1.5; ctx.strokeStyle = self ? '#fff' : 'rgba(0,0,0,.6)'; ctx.stroke()
  ctx.fillStyle = '#1b1410'; ctx.font = `800 ${Math.round(r * 1.15)}px "Hiragino Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(initial(c.name), cx, cy + 1)
  ctx.font = `700 ${Math.max(10, Math.round(ts * 0.32))}px "Hiragino Sans", sans-serif`
  const label = self ? 'あなた' : [...c.name].slice(0, 4).join('')
  const w = ctx.measureText(label).width + 8
  ctx.fillStyle = 'rgba(10,6,10,.75)'; ctx.fillRect(cx - w / 2, cy + r + 3, w, Math.max(12, ts * 0.42))
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.fillText(label, cx, cy + r + 4)
  // 調べている印（犯人の「隠す」「偽装」も、外からはこれと同じに見える）
  if (busy) {
    const mx = cx + r * 0.9, my = cy - r * 1.3 + Math.sin(t * 8) * 1.5, mr = ts * 0.2
    ctx.fillStyle = 'rgba(20,12,16,.85)'; ctx.beginPath(); ctx.arc(mx, my, mr * 1.6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx - mr * 0.2, my - mr * 0.2, mr * 0.7, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mx + mr * 0.3, my + mr * 0.3); ctx.lineTo(mx + mr, my + mr); ctx.stroke()
    if (prog != null) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke() }
  }
  ctx.textAlign = 'left'
}

// ---------- 結果
export function renderResult(state) {
  const r = state.result
  const s = byId(r.scenario)
  const tv = (d, v) => s.traits.find(t => t.key === d).values.find(x => x.v === v)
  const sp = id => s.spots.find(x => x.id === id)
  const meRole = r.roles.find(x => x.id === state.you)?.role
  const youWin = meRole ? (meRole === 'culprit' ? !r.win : r.win) : null
  const cul = r.roles.find(x => x.id === r.culprit)
  const accused = r.roles.find(x => x.id === r.accused)
  const reason = { caught: '投票で犯人を言い当てた', wrong: `最多票の${accused?.name ?? ''}は犯人ではなかった`, tie: '票が割れて、犯人を決めきれなかった', novote: '誰も投票しなかった', culprit_left: '犯人が屋敷から逃げ出した（退出）' }[r.reason] || ''
  const maxV = Math.max(1, ...r.roles.map(x => x.votes))
  const el = document.createElement('div')
  el.className = 'res'
  el.innerHTML = `
    ${youWin == null ? '' : `<p class="res-you" data-win="${youWin ? 1 : 0}"><span class="seal">${youWin ? '勝' : '負'}</span>${youWin ? 'あなたの勝ち' : 'あなたの負け'}<small>（${ROLE[meRole].label}）</small></p>`}
    <div class="res-culprit"><i class="dot big" style="background:${COLORS[cul.color]}">${esc(initial(cul.name))}</i><div><small>犯人は</small><b>${esc(cul.name)}</b><small>${esc(cul.title)}・${s.traits.map(d => esc(tv(d.key, cul.traits[d.key]).label)).join('・')}</small></div></div>
    <p class="res-reason">${esc(reason)}</p>
    <div class="res-scroll">
      <h4>投票</h4>
      ${r.roles.slice().sort((a, b) => b.votes - a.votes).map(x => `<div class="vrow"><i class="dot" style="background:${COLORS[x.color]}">${esc(initial(x.name))}</i><span class="vname">${esc(x.name)}<small>${ROLE[x.role].label}</small></span><span class="vbar"><i style="width:${x.votes / maxV * 100}%"></i></span><b>${x.votes}票</b></div>`).join('')}
      <h4>犯人がしたこと</h4>
      ${r.actions.length ? r.actions.map(a => `<p class="act">${a.kind === 'hide' ? `${esc(sp(a.spot).name)}の痕跡（${esc(tv(a.clue.dim, a.clue.val).label)}）を隠した` : `${esc(sp(a.spot).name)}に偽の証拠（${esc(tv(a.clue.dim, a.clue.val).label)}）を置いた`}</p>`).join('') : '<p class="act">何も細工しなかった</p>'}
      <h4>本物の手がかり</h4>
      ${r.traces.map(t => `<p class="act">${esc(sp(t.spot).name)}　${esc(tv(t.clue.dim, t.clue.val).label)}</p>`).join('')}
    </div>`
  return el
}
