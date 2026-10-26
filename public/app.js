// 画面の切り替え（ホーム → ロビー → ゲーム → 結果）。ゲーム中の描画と操作は game-view.js、結果の新聞は result.js に任せる。
import { connect } from './net.js'
import * as view from './game-view.js'
import { renderResult, playResultSound, loadRec, AWARDS } from './result.js'
import { SCENARIOS, byId } from './scenarios/index.mjs'
import { LOGO, icon, mapThumb, portrait } from './art.js'
import * as sfx from './sound.js'

const $ = s => document.querySelector(s)
const screens = ['home', 'lobby', 'game', 'result']
const ERR = {
  not_found: 'その部屋は見つかりません。コードを確かめてください',
  full: 'その部屋は満員です',
  started: 'その部屋はもうゲームを始めています。終わるまで待ってください',
  bad_name: 'ニックネームを入れてください（12文字まで）',
  not_host: 'ゲームを始められるのはホストだけです',
  not_enough: '人数が足りません',
  not_playing: 'いまはゲーム中ではありません',
  no_room: '部屋に入っていません',
  closed: 'しばらく動きがなかったので、部屋を閉じました',
  too_far: 'もう少し近づいてください',
  busy: '調べている途中です',
  used: 'もう使いました',
  nothing_to_hide: 'ここに隠せる痕跡はありません',
  spot_taken: 'ここには置けません',
  bad_fake: 'その偽装はできません',
  already: 'もう済んでいます',
  bad_target: 'その人には投票できません',
  not_allowed: 'あなたの役割ではできません'
}
// 場面が切り替わった直後に届く古い操作の返事は黙って捨てる
const SILENT = new Set(['bad_phase', 'over'])

let state = null, leftCode = null, resultShown = ''
const NAME_KEY = 'pg-name', SC_KEY = 'wdi-scenario'
const SC_IDS = SCENARIOS.map(s => s.id)
let pickId = SC_IDS[0]
try { const k = localStorage.getItem(SC_KEY); if (SC_IDS.includes(k)) pickId = k } catch {}

const net = connect({
  onStatus: s => {
    const el = $('#net')
    el.dataset.s = s
    el.textContent = s === 'online' ? '接続中' : s === 'connecting' ? '接続しています' : '切断。つなぎ直しています'
  },
  onMessage: msg => {
    if (msg.t === 'welcome') {
      // 招待URL（/r/ABCD）で開いたら、コード欄を埋めておく
      const m = location.pathname.match(/^\/r\/([A-Z0-9]{4})/i)
      if (m && !msg.code) { $('#code').value = m[1].toUpperCase(); $('#joinBox').open = true; $('#name').focus() }
      if (!msg.code) show('home')
    } else if (msg.t === 'state') {
      if (leftCode && msg.code === leftCode) return // 抜けた直後に届いた古い部屋の状態で画面を戻さない
      state = msg
      render()
    } else if (msg.t === 'joined') {
      history.replaceState(null, '', '/r/' + msg.code)
    } else if (msg.t === 'error') {
      if (SILENT.has(msg.code)) return
      if (msg.code === 'not_playing' && msg.req === 'input') return
      toast(ERR[msg.code] ? ERR[msg.code] + (msg.need ? `（${msg.need}人から）` : '') : 'エラー: ' + msg.code)
    } else if (msg.t === 'closed') {
      state = null; toast(ERR.closed); history.replaceState(null, '', '/'); show('home')
    } else if (msg.t === 'pong') {
      $('#ping').textContent = Math.round(performance.now() - msg.at) + 'ms'
    }
  }
})

function show(name) {
  for (const s of screens) $('#' + s).hidden = s !== name
  document.body.dataset.screen = name
  if (name !== 'game') delete document.body.dataset.phase
  if (name === 'home') renderHomeRec()
  if (name === 'lobby' || name === 'home') sfx.stopBgm()
}

function toast(text) {
  const t = $('#toast')
  t.textContent = text; t.hidden = false
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500)
}

const LOOKS = ['tophat', 'chef', 'straw', 'glasses', 'cap', 'mirror', 'beret', 'maid']
function render() {
  if (!state) return show('home')
  const isHost = state.hostId === state.you
  if (state.phase === 'lobby') {
    show('lobby')
    $('#roomCode').textContent = state.code
    $('#invite').value = `${location.origin}/r/${state.code}`
    $('#count').textContent = `${state.players.length} / ${state.max}人`
    $('#players').replaceChildren(...state.players.map((p, i) => {
      const li = document.createElement('li')
      li.innerHTML = portrait({ color: i, look: LOOKS[i % LOOKS.length], size: 26 })
      const box = document.createElement('span'); box.className = 'pbox'
      const nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = p.name; box.append(nm)
      const bs = document.createElement('span'); bs.className = 'pbs'
      if (p.id === state.hostId) bs.append(badge('ホスト'))
      if (p.id === state.you) bs.append(badge('あなた'))
      if (!p.connected) { bs.append(badge('切断中')); li.classList.add('off') }
      if (bs.childNodes.length) box.append(bs)
      li.append(box)
      return li
    }))
    const short = state.min - state.players.filter(p => p.connected).length
    $('#startBtn').hidden = !isHost
    $('#startBtn').disabled = short > 0
    renderScenario(isHost)
    $('#lobbyHint').textContent = short > 0 ? `あと${short}人でスタートできます。招待URLを送ってください` : isHost ? 'そろったらスタート' : 'ホストがスタートするのを待っています'
  } else if (state.phase === 'playing') {
    show('game')
    view.render(state, { send: data => net.send({ t: 'input', data }) })
  } else if (state.phase === 'result') {
    show('result')
    const r = state.result || {}
    const key = `${state.code}:${state.round}`
    $('#resultTitle').textContent = r.title || '結果'
    if (resultShown !== key) {
      resultShown = key
      $('#resultBody').replaceChildren(renderResult(state))
      playResultSound(state)
    }
    $('#rematchBtn').hidden = !isHost
    $('#lobbyBtn').hidden = !isHost
    $('#resultHint').textContent = isHost ? '' : 'ホストが次を選ぶのを待っています'
  }
}

// ---- シナリオ選び（左右の矢印で切り替える絵入りのカード。ホストの選択は参加者にも見える）
const CHEV = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const stars = n => `<span class="stars" aria-label="難しさ${n}">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">${icon('star')}</i>`).join('')}</span>`
function renderScenario(isHost) {
  const sh = state.setup || {}
  const cur = isHost ? pickId : (SC_IDS.includes(sh.scenario) ? sh.scenario : SC_IDS[0])
  if (isHost && sh.scenario !== pickId) net.send({ t: 'setup', opts: { scenario: pickId } })
  const s = byId(cur), i = SC_IDS.indexOf(cur)
  const el = $('#scenarioPick')
  const sig = cur + (isHost ? 'h' : 'g')
  if (el.dataset.sig === sig) return
  el.dataset.sig = sig
  el.dataset.host = isHost ? '1' : '0'
  el.innerHTML = `
    <button type="button" class="pk-btn" data-d="-1" aria-label="前の事件">${CHEV(-1)}</button>
    <div class="pk-body" data-id="${cur}" data-theme="${s.theme}">
      <div class="pk-thumb">${mapThumb(s, { w: 64 })}</div>
      <div class="pk-text"><small>事件 ${i + 1}/${SC_IDS.length}${stars(s.level || 1)}</small><b></b><span class="pk-lead"></span><span class="pk-note">部屋${Object.keys(s.rooms).length}・手がかり${s.traits.length}・探索${s.exploreSec}秒</span></div>
    </div>
    <button type="button" class="pk-btn" data-d="1" aria-label="次の事件">${CHEV(1)}</button>`
  el.querySelector('b').textContent = s.title
  el.querySelector('.pk-lead').textContent = s.lead
  for (const b of el.querySelectorAll('.pk-btn')) {
    b.hidden = !isHost
    b.onclick = () => {
      pickId = SC_IDS[(i + Number(b.dataset.d) + SC_IDS.length) % SC_IDS.length]
      try { localStorage.setItem(SC_KEY, pickId) } catch {}
      sfx.tick(); render()
    }
  }
}

function badge(text) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = text; return b }

// ---- 背景の屋敷（影絵。窓だけ灯る）
{
  const win = (x, y, on) => `<rect x="${x}" y="${y}" width="14" height="20" rx="2" fill="${on ? '#ffd27a' : '#2a2147'}"/>`
  let w = ''
  for (const [x, y, on] of [[118, 120, 1], [148, 120, 0], [252, 120, 0], [282, 120, 1], [118, 168, 0], [148, 168, 1], [252, 168, 1], [282, 168, 0], [196, 92, 1]]) w += win(x, y, on)
  const H = document.querySelector('.bg-house')
  if (H) H.innerHTML = `<svg viewBox="0 0 400 230" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <path d="M0 230V196q40-20 70-12t60-6V230z" fill="#120d22"/><path d="M400 230V190q-30-14-60-6t-50 4V230z" fill="#120d22"/>
    <path d="M96 230V110l40-34 24 20V60l40-36 40 36v36l24-20 40 34v120z" fill="#0c0918"/>
    <rect x="232" y="40" width="12" height="34" fill="#0c0918"/>
    <path d="M190 230v-28q10-10 20 0v28z" fill="#ffd27a" opacity=".55"/>${w}
    <g fill="#0c0918"><circle cx="40" cy="186" r="22"/><circle cx="62" cy="176" r="18"/><circle cx="352" cy="180" r="24"/><circle cx="376" cy="190" r="18"/></g>
  </svg>`
}

// ---- ホーム
$('#hero').innerHTML = LOGO + '<p class="hand hand-1">仲間の中に<br>犯人がいる！</p><p class="hand hand-2">証拠は隠され、<br>偽物もまざる。</p>'
function renderHomeRec() {
  const r = loadRec()
  $('#homeRec').innerHTML = r.plays
    ? `${icon('trophy')}<span><b>${r.plays}</b>回<b>${r.wins}</b>勝・称号<b>${Object.keys(r.awards).length}</b>/${Object.keys(AWARDS).length}</span>`
    : `${icon('people')}<span>4〜8人・1回5分</span>`
}

// 遊び方（絵で4つ）
const FIG = {
  role: `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="12" y="8" width="32" height="46" rx="5" fill="#fff8ea" stroke="#1d1530" stroke-width="3" transform="rotate(-9 28 31)"/><text x="20" y="41" font-family="Dela Gothic One,sans-serif" font-size="20" fill="#1d1530" transform="rotate(-9 28 31)">?</text><rect x="34" y="8" width="32" height="46" rx="5" fill="#ff3b4a" stroke="#1d1530" stroke-width="3" transform="rotate(8 50 31)"/><g transform="translate(50 33) rotate(8)" fill="#fff"><path d="M-11 6c3-2 19-2 22 0l-1 3h-20z"/><path d="M-7 6l1.2-11h11.6l1.2 11"/><rect x="-9" y="-1" width="18" height="2" fill="#ff3b4a"/></g></svg>`,
  search: `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="6" y="32" width="36" height="26" rx="3" fill="#8a5a33" stroke="#1d1530" stroke-width="3"/><rect x="10" y="37" width="28" height="7" fill="#b5874e"/><circle cx="24" cy="20" r="10" fill="#ffc94a" stroke="#1d1530" stroke-width="3"/><text x="24" y="26" text-anchor="middle" font-family="Dela Gothic One,sans-serif" font-size="14" fill="#1d1530">?</text><circle cx="55" cy="30" r="13" fill="rgba(170,220,255,.5)" stroke="#1d1530" stroke-width="4"/><path d="M64 39l10 10" stroke="#1d1530" stroke-width="6" stroke-linecap="round"/></svg>`,
  board: `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="5" y="7" width="70" height="50" rx="4" fill="#c69256" stroke="#1d1530" stroke-width="3"/><rect x="11" y="13" width="22" height="18" fill="#fff8ea" stroke="#1d1530" stroke-width="2" transform="rotate(-4 22 22)"/><rect x="43" y="13" width="24" height="18" fill="#fff8ea" stroke="#1d1530" stroke-width="2" transform="rotate(5 55 22)"/><rect x="23" y="34" width="26" height="17" fill="#fff8ea" stroke="#1d1530" stroke-width="2"/><circle cx="22" cy="14" r="3" fill="#ff3b4a"/><circle cx="55" cy="14" r="3" fill="#ff3b4a"/><circle cx="36" cy="35" r="3" fill="#ff3b4a"/><path d="M25 22l27 2M36 40l16-14" stroke="#ff3b4a" stroke-width="2" stroke-dasharray="3 2"/><text x="52" y="55" font-family="Dela Gothic One,sans-serif" font-size="11" fill="#ff3b4a">偽?</text></svg>`,
  vote: `<svg viewBox="0 0 80 64" aria-hidden="true"><rect x="12" y="30" width="50" height="28" rx="3" fill="#fff8ea" stroke="#1d1530" stroke-width="3"/><rect x="26" y="28" width="22" height="4" fill="#1d1530"/><g transform="rotate(8 37 18)"><rect x="28" y="5" width="18" height="26" fill="#fff" stroke="#1d1530" stroke-width="3"/><path d="M32 17l4 4 7-8" fill="none" stroke="#ff3b4a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g><circle cx="66" cy="16" r="11" fill="#fff8ea" stroke="#ff3b4a" stroke-width="3"/><text x="66" y="21" text-anchor="middle" font-family="Dela Gothic One,sans-serif" font-size="12" fill="#ff3b4a">捕</text></svg>`
}
$('#steps').innerHTML = [
  ['role', '役割を引く', '1人だけ犯人。探偵・鑑識・目撃者は自分だけの情報を持つ'],
  ['search', '屋敷を調べる', 'スティックで歩き、家具の「?」に近づいて調べる。床や家具を押してもそこへ歩く'],
  ['board', '証拠を貼って話す', '犯人は証拠を隠し、偽物も置ける。食い違いを見つけて絞る'],
  ['vote', '犯人に投票', '犯人が単独で最多票なら事件解決。外れたら犯人の逃げ切り']
].map(([k, t, d], i) => `<li>${FIG[k]}<p><b><i>${i + 1}</i>${t}</b>${d}</p></li>`).join('')

// ---- ボタン
const nameInput = $('#name')
try { nameInput.value = localStorage.getItem(NAME_KEY) || '' } catch {}
const name = () => { const n = nameInput.value.trim(); try { localStorage.setItem(NAME_KEY, n) } catch {}; return n }

$('#createBtn').onclick = () => { leftCode = null; if (!name()) return toast(ERR.bad_name); net.send({ t: 'create', name: name() }) }
$('#joinBtn').onclick = () => {
  leftCode = null
  const code = $('#code').value.trim().toUpperCase()
  if (!name()) return toast(ERR.bad_name)
  if (!/^[A-Z0-9]{4}$/.test(code)) return toast('参加コードは4文字です')
  net.send({ t: 'join', code, name: name() })
}
$('#copyBtn').onclick = async () => {
  const url = $('#invite').value
  try {
    if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ title: document.title, url })
    else { await navigator.clipboard.writeText(url); toast('招待URLをコピーしました') }
  } catch { $('#invite').select(); toast('URLを長押ししてコピーしてください') }
}
$('#startBtn').onclick = () => { sfx.unlock(); net.send({ t: 'start', opts: { scenario: pickId } }) }
function leaveRoom() { leftCode = state && state.code; net.send({ t: 'leave' }); state = null; history.replaceState(null, '', '/'); show('home') }
$('#leaveBtn').onclick = leaveRoom
$('#rematchBtn').onclick = () => net.send({ t: 'rematch', opts: { scenario: pickId } })
$('#lobbyBtn').onclick = () => net.send({ t: 'lobby' })
// 抜けるボタンは2回押しで確定（ブラウザの確認ダイアログは使わない）
const QUIT_IC = $('#quitBtn').innerHTML
$('#quitBtn').onclick = () => {
  const b = $('#quitBtn')
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'もう一度で退出'; setTimeout(() => { b.dataset.armed = ''; b.innerHTML = QUIT_IC }, 2500); return }
  b.dataset.armed = ''; b.innerHTML = QUIT_IC
  leaveRoom()
}

// 遊び方
$('#howBtn').onclick = () => { $('#howto').hidden = false; $('#howClose').focus() }
$('#howClose').onclick = () => { $('#howto').hidden = true }
$('#howto').onclick = e => { if (e.target.id === 'howto') $('#howto').hidden = true }
addEventListener('keydown', e => { if (e.key === 'Escape') $('#howto').hidden = true })

window.__boot = true
{ const d = document.getElementById('bootErr'); if (d) d.hidden = true } // 遅れて起動できたときは誤報を消す
show('home')
