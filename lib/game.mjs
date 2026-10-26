// 『犯人は誰だ？』のルール。状態はすべてここ（サーバー）が持ち、view(id) でその人に見せてよい分だけを渡す。
//
// 守る約束（rooms.mjs から呼ばれる）
//   meta / createGame(players, opts) -> { tick, input, view, isOver, result, removePlayer }
//
// 流れ: intro（役割を読む）→ explore（屋敷を歩いて調べる）→ discuss（推理）→ vote（投票）→ 結果
// 役割: 犯人1 / 探偵1 / 鑑識1 / 目撃者1（5人以上）/ 残りは住人
// 秘密: 役割・犯人の痕跡の場所・偽装の中身・鑑定結果・目撃情報は本人の view にだけ入る
// 探索は3幕でだんだん難しくなる（EVENTS）: 雷で全員の居場所が記録される → 停電（見える範囲が狭く、調べるのが遅い）
//   → 夜が深まる（犯人の偽装が1回増える）→ 嵐で扉が1つ閉じる → もう一度雷

import { SCENARIOS, byId } from '../public/scenarios/index.mjs'

export const meta = {
  id: 'who-did-it',
  title: '犯人は誰だ？',
  minPlayers: 4,
  maxPlayers: 8,
  tickHz: 12,
  scenarios: SCENARIOS.map(s => ({ id: s.id, title: s.title, lead: s.lead }))
}

export const TIMES = { intro: 15, explore: 130, discuss: 75, vote: 30 } // explore はシナリオの exploreSec で上書き
export const SEARCH_SEC = 1.5          // 調べる・隠す・偽装はどれも同じ時間（外から見分けられない）
export const DETECTIVE_SEARCH_SEC = 0.9
export const SPEED = 3.2               // マス/秒
export const RADIUS = 0.3
export const REACH = 1.15              // 調べられる距離（マス）
export const FORENSIC_BOARD_USES = 2
export const DARK_VIEW = 2.6           // 停電中に人が見える距離（マス）
export const DARK_SLOW = 1.5           // 停電中は調べる・隠す・偽装が遅くなる（全員同じ倍率）
// 探索のできごと。at は探索の長さに対する割合
export const EVENTS = [
  { at: 0.22, kind: 'flash' },   // 雷: 全員がどの部屋にいたかが記録に残る
  { at: 0.22, kind: 'dark' },    // 停電
  { at: 0.42, kind: 'light' },   // 明かりが戻る
  { at: 0.52, kind: 'night' },   // 夜が深まる: 犯人の偽装 +1
  { at: 0.64, kind: 'lock' },    // 嵐で扉が1つ閉じる
  { at: 0.82, kind: 'flash' },   // 2回目の雷
  { at: 0.86, kind: 'unlock' }   // 扉が開く
]
// 何幕目か（1: 静かな夜 / 2: 停電 / 3: 嵐）
export const stageAt = f => f < 0.22 ? 1 : f < 0.52 ? 2 : 3

const PHASES = ['intro', 'explore', 'discuss', 'vote']

export function createGame(players, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random
  const sc = byId(typeof opts.scenario === 'string' ? opts.scenario : '')
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
  const pick = a => a[Math.floor(rng() * a.length)]
  const H = sc.map.length, W = sc.map[0].length
  const exploreSec = Number(sc.exploreSec) > 0 ? Number(sc.exploreSec) : TIMES.explore
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : sc.map[y][x]
  const furniture = new Set(sc.spots.map(s => s.x + ',' + s.y)) // 家具のマスは通れない
  let locked = null // 嵐で閉じた扉 { x, y }
  const solidTile = (tx, ty) => tileAt(tx, ty) === '#' || furniture.has(tx + ',' + ty) || (locked && locked.x === tx && locked.y === ty)
  const solid = (x, y) => solidTile(Math.floor(x), Math.floor(y))
  const blocked = (x, y) => solid(x - RADIUS, y - RADIUS) || solid(x + RADIUS, y - RADIUS) || solid(x - RADIUS, y + RADIUS) || solid(x + RADIUS, y + RADIUS)
  const roomCodeAt = (x, y) => { const c = tileAt(Math.floor(x), Math.floor(y)); return sc.rooms[c] ? c : null }
  const spotById = Object.fromEntries(sc.spots.map(s => [s.id, s]))
  const spotRoom = s => roomCodeAt(s.x + 0.5, s.y + 0.5)

  // ---- 役割
  const order = shuffle(players.map(p => p.id))
  const looks = sc.looks || {}
  const roleOf = {}
  order.forEach((id, i) => {
    roleOf[id] = i === 0 ? 'culprit' : i === 1 ? 'detective' : i === 2 ? 'forensic' : (i === 3 && players.length >= 5) ? 'witness' : 'resident'
  })
  const culpritId = order[0]

  // ---- 人物（肩書き・特徴は公開）。犯人の特徴の組は全員の中で1つだけ。できれば1つの特徴だけでは絞れないようにする
  const titles = shuffle(sc.cast)
  const comboKey = (t, id) => sc.traits.map(d => t[id][d.key]).join('|')
  let traits = null, fallback = null
  for (let tries = 0; tries < 500 && !traits; tries++) {
    const t = {}
    for (const p of players) t[p.id] = Object.fromEntries(sc.traits.map(d => [d.key, pick(d.values).v]))
    const unique = players.every(p => p.id === culpritId || comboKey(t, p.id) !== comboKey(t, culpritId))
    if (!unique) continue
    const shared = sc.traits.every(d => players.some(p => p.id !== culpritId && t[p.id][d.key] === t[culpritId][d.key]))
    if (shared) traits = t
    else fallback ||= t
  }
  traits ||= fallback
  const chars = players.map((p, i) => { const title = titles[i % titles.length]; return { id: p.id, name: p.name, title, look: looks[title] || 'cap', color: i, traits: traits[p.id] } })
  const charOf = id => chars.find(c => c.id === id)

  // ---- 証拠を置く。本物は特徴ごとに1つ、別々の部屋に
  const ev = {}           // eid -> { eid, dim, val, fake }
  const content = {}      // spotId -> eid | null（null ならシナリオの text がそのまま見える）
  for (const s of sc.spots) content[s.id] = null
  const newEid = () => { let e; do { e = 'e' + Math.floor(rng() * 1e9).toString(36) } while (ev[e]); return e }
  const usedRooms = new Set()
  const traces = []       // 犯人にだけ見せる「自分が残した痕跡」
  for (const d of shuffle(sc.traits)) {
    const free = sc.spots.filter(s => !s.noClue && content[s.id] === null)
    const spot = shuffle(free.filter(s => !usedRooms.has(spotRoom(s))))[0] || free[0]
    const eid = newEid()
    ev[eid] = { eid, dim: d.key, val: traits[culpritId][d.key], fake: false }
    content[spot.id] = eid
    usedRooms.add(spotRoom(spot))
    traces.push({ eid, spot: spot.id })
  }

  // ---- 役割ごとの秘密の情報
  const secret = {}
  const detDim = pick(sc.traits)
  const detVal = detDim.values.find(v => v.v === traits[culpritId][detDim.key])
  for (const p of players) {
    const r = roleOf[p.id]
    if (r === 'detective') secret[p.id] = { text: `検視の結果、犯人は「${detVal.label}」と分かった。この手がかりは犯人にも消せない`, clue: { dim: detDim.key, val: detVal.v } }
    if (r === 'witness') {
      const friend = pick(players.filter(q => q.id !== culpritId && q.id !== p.id))
      secret[p.id] = { text: `事件の時刻、${friend.name}（${charOf(friend.id).title}）と${sc.alibiRoom}にいた。${friend.name}は犯人ではない`, clear: friend.id }
    }
  }

  // ---- 進行
  let phase = 'intro'
  let time = TIMES.intro
  let over = false
  let endReason = null
  const ready = new Set()
  const votes = {}
  const board = []        // { eid, by, spot }
  const analyses = {}     // 鑑識だけが見る: eid -> 'real' | 'fake'
  let forensicUses = FORENSIC_BOARD_USES
  const used = { hide: false, plant: false }
  let plantsLeft = 1      // 夜が深まると +1
  let dark = false
  let evIdx = 0           // EVENTS のどこまで進んだか
  const log = []          // 全員に見せるできごとの記録 { n, kind, at, rooms?, door? }
  let logN = 0
  const stats = {}        // id -> { searched, found, fakes, posted } 結果の称号に使う
  const actions = []      // 犯人がやったこと（結果画面で公開）
  const notebooks = {}    // id -> [{ n, spot, eid }]
  const checked = {}      // id -> Set(spotId)
  const notice = {}       // id -> { n, text }
  let noticeN = 0
  let tickN = 0
  const say = (id, text) => { notice[id] = { n: ++noticeN, text } }
  const elapsed = () => exploreSec - time

  // 玄関に並べて置く（家具のマスは避ける）
  const spawnTiles = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sc.map[y][x] === sc.spawnRoom && !furniture.has(x + ',' + y)) spawnTiles.push([x + 0.5, y + 0.5])
  const pos = {}
  players.forEach((p, i) => {
    const [x, y] = spawnTiles[i % spawnTiles.length]
    pos[p.id] = { x, y, dx: 0, dy: 0, room: sc.spawnRoom, busy: null }
    notebooks[p.id] = []
    checked[p.id] = new Set()
    stats[p.id] = { searched: 0, found: 0, fakes: 0, posted: 0 }
  })

  const alive = () => players.filter(p => pos[p.id])
  const inGame = id => !!pos[id]

  function setPhase(p) {
    phase = p; time = p === 'explore' ? exploreSec : TIMES[p]; ready.clear()
    if (p !== 'explore') { dark = false; locked = null }
    for (const id in pos) { pos[id].dx = 0; pos[id].dy = 0; pos[id].busy = null }
  }
  function nextPhase() {
    const i = PHASES.indexOf(phase)
    if (i < PHASES.length - 1) setPhase(PHASES[i + 1])
    else finish('vote')
  }
  function finish(reason) { over = true; endReason = reason }

  function tally() {
    const count = {}
    for (const p of players) count[p.id] = 0
    for (const [voter, target] of Object.entries(votes)) if (count[target] != null && inGame(voter)) count[target]++
    const max = Math.max(0, ...Object.values(count))
    const top = max > 0 ? Object.keys(count).filter(id => count[id] === max) : []
    return { count, top }
  }

  function move(p, dt) {
    const { dx, dy } = p
    if (!dx && !dy) return
    const step = SPEED * dt
    if (blocked(p.x, p.y)) { // 閉じた扉や家具の中にいるときは、抜け出せるように当たりを見ない
      const nx = p.x + dx * step, ny = p.y + dy * step
      const wall = (x, y) => tileAt(Math.floor(x), Math.floor(y)) === '#'
      if (![[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([sx, sy]) => wall(nx + sx * RADIUS, ny + sy * RADIUS))) { p.x = nx; p.y = ny }
      const rc = roomCodeAt(p.x, p.y); if (rc) p.room = rc
      return
    }
    const nx = p.x + dx * step
    if (!blocked(nx, p.y)) p.x = nx
    else if (Math.abs(dx) > 0.3) { // 扉に入りやすいよう、マスの中心へ寄せる
      const cy = Math.floor(p.y) + 0.5
      if (!blocked(nx, cy)) p.y += Math.sign(cy - p.y) * Math.min(Math.abs(cy - p.y), step)
    }
    const ny = p.y + dy * step
    if (!blocked(p.x, ny)) p.y = ny
    else if (Math.abs(dy) > 0.3) {
      const cx = Math.floor(p.x) + 0.5
      if (!blocked(cx, ny)) p.x += Math.sign(cx - p.x) * Math.min(Math.abs(cx - p.x), step)
    }
    const rc = roomCodeAt(p.x, p.y)
    if (rc) p.room = rc // 扉の上では前にいた部屋のまま
  }

  const near = (p, s) => Math.hypot(p.x - (s.x + 0.5), p.y - (s.y + 0.5)) <= REACH

  function complete(id, b) {
    const s = spotById[b.spot]
    if (b.kind === 'search') {
      const eid = content[s.id]
      notebooks[id].push({ n: notebooks[id].length + 1, spot: s.id, eid })
      checked[id].add(s.id)
      stats[id].searched++
      if (eid && !ev[eid].fake && id !== culpritId) stats[id].found++
      if (eid && ev[eid].fake && id !== culpritId) stats[id].fakes++
      if (eid && roleOf[id] === 'forensic') analyses[eid] = ev[eid].fake ? 'fake' : 'real'
      say(id, eid ? `${s.name}で証拠を見つけた` : `${s.name}を調べた`)
    } else if (b.kind === 'hide') {
      const eid = content[s.id]
      if (!eid || ev[eid].fake || used.hide) return
      content[s.id] = null; used.hide = true
      actions.push({ kind: 'hide', spot: s.id, eid })
      say(id, `${s.name}の痕跡を隠した`)
    } else if (b.kind === 'plant') {
      if (content[s.id] !== null || plantsLeft <= 0) return
      const eid = newEid()
      ev[eid] = { eid, dim: b.fake.dim, val: b.fake.val, fake: true }
      content[s.id] = eid; plantsLeft--; used.plant = plantsLeft <= 0
      actions.push({ kind: 'plant', spot: s.id, eid })
      say(id, `${s.name}に偽の証拠を置いた`)
    }
  }

  function addLog(e) { log.push({ n: ++logN, at: Math.round(elapsed()), ...e }) }
  function runEvent(e) {
    if (e.kind === 'flash') {
      const rooms = {}
      for (const q of alive()) rooms[q.id] = pos[q.id].room
      addLog({ kind: 'flash', rooms })
    } else if (e.kind === 'dark') { dark = true; addLog({ kind: 'dark' }) }
    else if (e.kind === 'light') { dark = false; addLog({ kind: 'light' }) }
    else if (e.kind === 'night') { plantsLeft++; used.plant = false; addLog({ kind: 'night' }) }
    else if (e.kind === 'lock') {
      // 誰も近くにいない扉を1つ閉じる（閉じ込められて笑えるのは良いが、扉の中に挟まないように）
      const doors = []
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sc.map[y][x] === '+') doors.push({ x, y })
      const free = doors.filter(d => alive().every(q => Math.hypot(pos[q.id].x - (d.x + 0.5), pos[q.id].y - (d.y + 0.5)) > 1.3))
      if (!free.length) return
      locked = pick(free)
      addLog({ kind: 'lock', door: [locked.x, locked.y] })
    } else if (e.kind === 'unlock') { if (locked) addLog({ kind: 'unlock', door: [locked.x, locked.y] }); locked = null }
  }
  function busyDur(role) { return (role === 'detective' ? DETECTIVE_SEARCH_SEC : SEARCH_SEC) * (dark ? DARK_SLOW : 1) }

  function envView() {
    const f = elapsed() / exploreSec
    const nx = EVENTS.slice(evIdx).find(e => e.kind !== 'unlock' && e.kind !== 'light')
    return { stage: stageAt(f), dark, lock: locked ? [locked.x, locked.y] : null, next: nx ? { kind: nx.kind, in: Math.max(0, Math.ceil(nx.at * exploreSec - elapsed())) } : null }
  }

  // 称号（結果画面で1人1つ）。笑える負け方にも名前を付ける
  function award(id, win, top, count) {
    const acc = top.length === 1 ? top[0] : null
    const st = stats[id], myVote = votes[id]
    const n = alive().length
    if (id === culpritId) {
      if (endReason === 'culprit_left') return 'nigeashi'
      if (win) return count[id] >= Math.max(2, n - 1) ? 'unanimous' : 'caught'
      return (count[id] || 0) === 0 ? 'perfect' : 'escape'
    }
    if (acc === id) return 'framed'
    if (myVote === culpritId && st.found > 0) return 'detective'
    if (myVote === culpritId) return 'hunch'
    if (acc && myVote === acc) return 'accomplice'
    const most = Math.max(...Object.values(stats).map(x => x.searched))
    if (st.searched >= 3 && st.searched === most) return 'searcher'
    if (st.posted >= 2) return 'informer'
    if (st.fakes > 0) return 'fooled'
    if (st.searched === 0) return 'statue'
    return 'guest'
  }

  const clueOf = eid => eid ? { dim: ev[eid].dim, val: ev[eid].val } : null
  const fakeOptions = () => sc.traits.flatMap(d => d.values.filter(v => v.v !== traits[culpritId][d.key]).map(v => ({ dim: d.key, val: v.v })))

  return {
    tick(dt) {
      if (over) return
      tickN++
      time = Math.max(0, time - dt)
      if (phase === 'explore') {
        while (evIdx < EVENTS.length && elapsed() >= EVENTS[evIdx].at * exploreSec) runEvent(EVENTS[evIdx++])
        for (const id in pos) {
          const p = pos[id]
          if (p.busy) {
            p.busy.t += dt
            if (p.busy.t >= p.busy.dur) { const b = p.busy; p.busy = null; complete(id, b) }
          } else move(p, dt)
        }
      }
      if (time === 0) nextPhase()
    },

    input(id, data) {
      if (over) return { error: 'over' }
      if (!inGame(id)) return { error: 'not_player' }
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return { error: 'bad_input' }
      const p = pos[id]
      const role = roleOf[id]
      switch (data.type) {
        case 'move': {
          if (phase !== 'explore') return { error: 'bad_phase' }
          let dx = Number(data.dx), dy = Number(data.dy)
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { error: 'bad_input' }
          const m = Math.hypot(dx, dy)
          if (m > 1) { dx /= m; dy /= m }
          if (m < 0.15) { dx = 0; dy = 0 }
          if (p.busy && (dx || dy)) p.busy = null // 歩くと調べるのをやめる
          p.dx = dx; p.dy = dy
          return { ok: true }
        }
        case 'act': {
          if (phase !== 'explore') return { error: 'bad_phase' }
          if (p.busy) return { error: 'busy' }
          const s = spotById[data.spot]
          if (!s) return { error: 'bad_spot' }
          if (!near(p, s)) return { error: 'too_far' }
          const kind = data.kind
          if (kind === 'search') {
            p.busy = { kind, spot: s.id, t: 0, dur: busyDur(role) }
          } else if (kind === 'hide') {
            if (role !== 'culprit') return { error: 'not_allowed' }
            if (used.hide) return { error: 'used' }
            const eid = content[s.id]
            if (!eid || ev[eid].fake) return { error: 'nothing_to_hide' }
            p.busy = { kind, spot: s.id, t: 0, dur: busyDur('culprit') }
          } else if (kind === 'plant') {
            if (role !== 'culprit') return { error: 'not_allowed' }
            if (plantsLeft <= 0) return { error: 'used' }
            if (s.noClue || content[s.id] !== null) return { error: 'spot_taken' }
            const f = data.fake
            if (!f || typeof f !== 'object' || !fakeOptions().some(o => o.dim === f.dim && o.val === f.val)) return { error: 'bad_fake' }
            p.busy = { kind, spot: s.id, t: 0, dur: busyDur('culprit'), fake: { dim: f.dim, val: f.val } }
          } else return { error: 'bad_input' }
          p.dx = 0; p.dy = 0
          return { ok: true }
        }
        case 'post': {
          if (phase !== 'explore' && phase !== 'discuss') return { error: 'bad_phase' }
          const e = notebooks[id].find(x => x.eid && x.eid === data.eid)
          if (!e) return { error: 'not_found' }
          if (board.some(b => b.eid === e.eid)) return { error: 'already' }
          board.push({ eid: e.eid, by: id, spot: e.spot })
          stats[id].posted++
          return { ok: true }
        }
        case 'analyze': {
          if (role !== 'forensic') return { error: 'not_allowed' }
          if (phase !== 'explore' && phase !== 'discuss') return { error: 'bad_phase' }
          if (!board.some(b => b.eid === data.eid)) return { error: 'not_found' }
          if (analyses[data.eid]) return { error: 'already' }
          if (forensicUses <= 0) return { error: 'used' }
          forensicUses--
          analyses[data.eid] = ev[data.eid].fake ? 'fake' : 'real'
          return { ok: true }
        }
        case 'ready': {
          if (phase === 'vote') return { error: 'bad_phase' }
          if (data.on === false) ready.delete(id); else ready.add(id)
          if (alive().every(q => ready.has(q.id))) nextPhase()
          return { ok: true }
        }
        case 'vote': {
          if (phase !== 'vote') return { error: 'bad_phase' }
          if (typeof data.target !== 'string' || data.target === id || !inGame(data.target)) return { error: 'bad_target' }
          votes[id] = data.target
          if (alive().every(q => votes[q.id])) finish('vote')
          return { ok: true }
        }
        default: return { error: 'bad_input' }
      }
    },

    view(id) {
      const me = pos[id]
      const role = roleOf[id]
      const v = {
        scenario: sc.id,
        phase, time: Math.ceil(time),
        role: me ? role : null,
        // 人物の一覧は変わらないので、役割確認中と2秒に1回だけ送る（画面側で覚えておく）
        chars: phase === 'intro' || tickN % 24 === 0 ? chars : undefined,
        ready: [...ready].filter(inGame),
        explore: exploreSec,
        // できごと（全員に同じ）。stage は何幕目か、next は次のできごとまでの秒数
        env: phase === 'explore' ? envView() : null,
        log,
        board: board.map(b => ({ eid: b.eid, by: b.by, spot: b.spot, clue: clueOf(b.eid) }))
      }
      if (!me) return v
      v.notice = notice[id] || null
      v.me = { x: +me.x.toFixed(2), y: +me.y.toFixed(2), room: me.room, busy: me.busy ? { kind: me.busy.kind, spot: me.busy.spot, p: +(me.busy.t / me.busy.dur).toFixed(2) } : null }
      // 同じ部屋にいる人だけ見える。調べている・隠している・偽装しているは、どれも同じ busy にしか見えない
      v.others = phase === 'explore'
        ? Object.entries(pos).filter(([oid, o]) => oid !== id && o.room === me.room && (!dark || Math.hypot(o.x - me.x, o.y - me.y) <= DARK_VIEW)).map(([oid, o]) => ({ id: oid, x: +o.x.toFixed(2), y: +o.y.toFixed(2), busy: !!o.busy }))
        : []
      v.notebook = notebooks[id].map(e => ({ n: e.n, spot: e.spot, eid: e.eid, clue: clueOf(e.eid) }))
      v.checked = [...checked[id]]
      if (secret[id]) v.secret = secret[id]
      if (role === 'forensic') { v.analyses = { ...analyses }; v.forensicUses = forensicUses }
      if (role === 'culprit') {
        v.culprit = {
          traces: traces.map(t => ({ spot: t.spot, clue: clueOf(t.eid), present: content[t.spot] === t.eid })),
          canHide: !used.hide, canPlant: plantsLeft > 0, plantsLeft,
          fakeOptions: fakeOptions(),
          plantable: sc.spots.filter(s => !s.noClue && content[s.id] === null).map(s => s.id)
        }
      }
      if (phase === 'vote') { v.voted = Object.keys(votes).filter(inGame); v.myVote = votes[id] || null }
      return v
    },

    isOver: () => over,

    result() {
      const { count, top } = tally()
      const win = endReason === 'culprit_left' || (top.length === 1 && top[0] === culpritId)
      return {
        win,
        title: win ? '事件解決' : '犯人の逃げ切り',
        reason: endReason === 'culprit_left' ? 'culprit_left' : top.length > 1 ? 'tie' : top.length === 0 ? 'novote' : top[0] === culpritId ? 'caught' : 'wrong',
        scenario: sc.id,
        culprit: culpritId,
        culpritName: charOf(culpritId).name,
        accused: top.length === 1 ? top[0] : null,
        roles: chars.map(ch => ({ id: ch.id, name: ch.name, title: ch.title, look: ch.look, color: ch.color, role: roleOf[ch.id], traits: ch.traits, votes: count[ch.id] || 0, award: award(ch.id, win, top, count), stats: { ...stats[ch.id] } })),
        log,
        votes: Object.fromEntries(Object.entries(votes).filter(([v]) => inGame(v))),
        actions: actions.map(a => ({ kind: a.kind, spot: a.spot, clue: clueOf(a.eid) })),
        traces: traces.map(t => ({ spot: t.spot, clue: clueOf(t.eid) }))
      }
    },

    _plantsLeft: () => plantsLeft,

    removePlayer(id) {
      if (!pos[id]) return
      delete pos[id]
      delete votes[id]
      ready.delete(id)
      if (over) return
      if (id === culpritId) return finish('culprit_left')
      if (!alive().length) return
      if (phase === 'vote' && alive().every(q => votes[q.id])) return finish('vote')
      if (phase !== 'vote' && alive().every(q => ready.has(q.id))) nextPhase()
    },

    // テスト用。view には入らないので画面には届かない
    _debug: { culpritId, roleOf, traits, content, ev, pos, secret, stats, get locked() { return locked }, get dark() { return dark }, solidTile }
  }
}
