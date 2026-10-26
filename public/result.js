// 結果の画面（号外の新聞）。称号と、この端末の通算記録もここで扱う。
import { byId } from './scenarios/index.mjs'
import { portrait, icon } from './art.js'
import { ROLE } from './game-view.js'
import * as sfx from './sound.js'

export const AWARDS = {
  detective: ['名探偵', '証拠を見つけて、犯人に投票した'],
  hunch: ['鋭い勘', '証拠は無くても犯人を当てた'],
  framed: ['濡れ衣', '無実なのに一番疑われた'],
  accomplice: ['冤罪づくり', '無実の人を犯人にした一票'],
  searcher: ['調べ魔', '屋敷で一番たくさん調べた'],
  informer: ['情報屋', '証拠を2つ以上貼った'],
  fooled: ['まんまと偽物', '偽の証拠をつかまされた'],
  statue: ['置物', '一度も何も調べなかった'],
  guest: ['ただの客', '特に何もしなかった'],
  unanimous: ['満場一致でお縄', '全員に見抜かれた犯人'],
  caught: ['お縄', '投票で捕まった犯人'],
  perfect: ['完全犯罪', '1票も入らずに逃げ切った'],
  escape: ['逃げ切り', '疑われつつも逃げ切った'],
  nigeashi: ['夜逃げ', '屋敷から逃げ出した犯人']
}
const REC_KEY = 'wdi-rec'
export function loadRec() {
  try { return { plays: 0, wins: 0, culpritPlays: 0, culpritWins: 0, streak: 0, best: 0, awards: {}, seen: '', ...JSON.parse(localStorage.getItem(REC_KEY) || '{}') } }
  catch { return { plays: 0, wins: 0, culpritPlays: 0, culpritWins: 0, streak: 0, best: 0, awards: {}, seen: '' } }
}
// 1回の結果を記録に足す（同じ回を2回数えない）。初めての称号なら true を返す
function addRec(key, role, win, award) {
  const r = loadRec()
  if (r.seen === key) return { rec: r, firstAward: false, counted: false }
  r.seen = key
  r.plays++
  if (role === 'culprit') r.culpritPlays++
  if (win) { r.wins++; r.streak++; r.best = Math.max(r.best, r.streak); if (role === 'culprit') r.culpritWins++ } else r.streak = 0
  const firstAward = !!award && !r.awards[award]
  if (award) r.awards[award] = (r.awards[award] || 0) + 1
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)) } catch {}
  return { rec: r, firstAward, counted: true }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const PAPER = { mansion: '霧ヶ丘新聞', ship: 'オーロラ船内新聞', lodge: '雪山タイムズ' }

export function renderResult(state) {
  const r = state.result
  const s = byId(r.scenario)
  const tv = (d, v) => s.traits.find(t => t.key === d).values.find(x => x.v === v)
  const sp = id => s.spots.find(x => x.id === id)
  const meRow = r.roles.find(x => x.id === state.you)
  const meRole = meRow?.role
  const youWin = meRole ? (meRole === 'culprit' ? !r.win : r.win) : null
  const cul = r.roles.find(x => x.id === r.culprit)
  const accused = r.roles.find(x => x.id === r.accused)
  const framed = accused && accused.id !== r.culprit ? accused : null
  const pt = (x, face, size) => portrait({ color: x.color, look: x.look, face, size })
  const head = r.win
    ? (r.reason === 'culprit_left' ? `犯人${cul.name}、夜逃げ` : `犯人は${cul.title}の${cul.name}！`)
    : (r.reason === 'tie' ? '票が割れて犯人は闇の中' : r.reason === 'novote' ? '誰も投票せず犯人は逃走' : `${framed?.name ?? ''}を誤認逮捕！`)
  const sub = { caught: '投票で犯人を言い当てた', wrong: `本当の犯人は${cul.name}。まんまと逃げ切った`, tie: `本当の犯人は${cul.name}だった`, novote: `本当の犯人は${cul.name}だった`, culprit_left: '屋敷から逃げ出したので事件解決' }[r.reason] || ''
  const maxV = Math.max(1, ...r.roles.map(x => x.votes))
  const { rec, firstAward } = meRow ? addRec(`${state.code}:${state.round}`, meRole, youWin, meRow.award) : { rec: loadRec(), firstAward: false }
  const today = new Date()
  const el = document.createElement('div')
  el.className = 'res'
  el.dataset.win = r.win ? '1' : '0'
  el.innerHTML = `
    <div class="paper-top"><b>${esc(PAPER[s.theme] || '屋敷新聞')}</b><span>号外</span><small>${today.getMonth() + 1}月${today.getDate()}日 ${esc(s.title)}</small></div>
    <h2 class="headline" id="resultHead">${esc(head)}</h2>
    <div class="res-culprit">
      <div class="mug">${pt(cul, r.win ? 'cry' : 'smug', 92)}${r.win ? '<i class="cuffs"></i>' : '<i class="dash"></i>'}</div>
      <div class="mug-txt"><small>犯人は</small><b>${esc(cul.name)}</b><small>${esc(cul.title)}・${s.traits.map(d => esc(tv(d.key, cul.traits[d.key]).label)).join('・')}</small></div>
      <span class="big-stamp" data-win="${r.win ? 1 : 0}">${r.win ? '逮捕' : '迷宮入り'}</span>
    </div>
    <p class="res-reason">${esc(sub)}</p>
    ${youWin == null ? '' : `<p class="res-you" data-win="${youWin ? 1 : 0}"><span class="seal">${youWin ? '勝' : '負'}</span>${youWin ? 'あなたの勝ち' : 'あなたの負け'}<small>${ROLE[meRole].label}</small></p>`}
    ${framed ? `<div class="framed">${pt(framed, 'cry', 44)}<p><b>${esc(framed.name)}</b>は無実だった…<small>${framed.votes}票で連れていかれた</small></p><span class="mini-stamp">冤罪</span></div>` : ''}
    <div class="res-scroll">
      <h4>${icon('star')}称号</h4>
      <div class="awards">${r.roles.map(x => { const a = AWARDS[x.award] || ['', '']; return `<div class="aw${x.id === state.you ? ' me' : ''}">${pt(x, x.role === 'culprit' ? (r.win ? 'cry' : 'smug') : x.award === 'framed' ? 'cry' : x.award === 'detective' || x.award === 'hunch' ? 'happy' : x.award === 'accomplice' || x.award === 'fooled' ? 'shock' : 'calm', 36)}<div><b>${esc(a[0])}</b><small>${esc(x.name)}（${ROLE[x.role].label}）${esc(a[1])}</small></div>${x.id === state.you && firstAward ? '<span class="new">初</span>' : ''}</div>` }).join('')}</div>
      <h4>${icon('vote')}投票</h4>
      ${r.roles.slice().sort((a, b) => b.votes - a.votes).map(x => `<div class="vrow">${pt(x, 'calm', 26)}<span class="vname">${esc(x.name)}<small>${ROLE[x.role].label}</small></span><span class="vbar"><i style="--w:${x.votes / maxV * 100}%"></i></span><b>${x.votes}票</b></div>`).join('')}
      <h4>${icon('mask')}犯人がしたこと</h4>
      ${r.actions.length ? r.actions.map(a => `<p class="act">${a.kind === 'hide' ? `${esc(sp(a.spot).name)}の痕跡（${esc(tv(a.clue.dim, a.clue.val).label)}）を隠した` : `${esc(sp(a.spot).name)}に偽の証拠（${esc(tv(a.clue.dim, a.clue.val).label)}）を置いた`}</p>`).join('') : '<p class="act">何も細工しなかった</p>'}
      <h4>${icon('search')}本物の手がかり</h4>
      ${r.traces.map(t => `<p class="act">${esc(sp(t.spot).name)}（${esc(s.rooms[s.map[sp(t.spot).y][sp(t.spot).x]])}）　${esc(tv(t.clue.dim, t.clue.val).label)}</p>`).join('')}
      <h4>${icon('trophy')}この端末の記録</h4>
      <div class="recs"><span><b>${rec.plays}</b>回</span><span><b>${rec.wins}</b>勝</span><span><b>${rec.best}</b>連勝が最高</span><span>犯人で<b>${rec.culpritWins}</b>/${rec.culpritPlays}勝</span><span>称号<b>${Object.keys(rec.awards).length}</b>/${Object.keys(AWARDS).length}</span></div>
    </div>`
  // 紙吹雪（勝ち）か雨（負け）
  const fx = document.createElement('div'); fx.className = 'res-fx' + (youWin === false ? ' rain' : '')
  for (let i = 0; i < (youWin === false ? 26 : 36); i++) { const p = document.createElement('i'); p.style.setProperty('--x', Math.random() * 100 + '%'); p.style.setProperty('--d', (Math.random() * 1.8).toFixed(2) + 's'); p.style.setProperty('--h', Math.floor(Math.random() * 360)); fx.append(p) }
  el.append(fx)
  return el
}

// 結果が出た瞬間の音（ドラムロール → 当たりのファンファーレか、しょんぼり）
export function playResultSound(state) {
  sfx.stopBgm()
  sfx.drumroll(1.2)
  const r = state.result, me = r.roles.find(x => x.id === state.you)
  const youWin = me ? (me.role === 'culprit' ? !r.win : r.win) : r.win
  setTimeout(() => { sfx.stamp(); setTimeout(() => (youWin ? sfx.fanfare() : sfx.wahwah()), 250) }, 1300)
}
