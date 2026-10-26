// 『犯人は誰だ？』のルールの単体テスト（通信なし）
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, meta, TIMES, SEARCH_SEC, DETECTIVE_SEARCH_SEC, SPEED, FORENSIC_BOARD_USES } from '../lib/game.mjs'
import mansion from '../public/scenarios/mansion.mjs'
import { SCENARIOS, byId } from '../public/scenarios/index.mjs'

const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const mkPlayers = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }))
const mk = (n, seed = 1) => { const ps = mkPlayers(n); const g = createGame(ps, { rng: seeded(seed) }); return { g, ps, d: g._debug } }
const roleHolder = (d, r) => Object.keys(d.roleOf).find(id => d.roleOf[id] === r)
const allReady = (g, ps) => { for (const p of ps) g.input(p.id, { type: 'ready' }) }
const toExplore = (g, ps) => { allReady(g, ps); assert.equal(g.view(ps[0].id).phase, 'explore') }
const spot = id => mansion.spots.find(s => s.id === id)
const placeAt = (d, id, spotId) => { const s = spot(spotId); Object.assign(d.pos[id], { x: s.x + 0.5, y: s.y + 0.5, room: mansion.map[s.y][s.x] }) }
const run = (g, sec, hz = 12) => { for (let i = 0; i < Math.round(sec * hz); i++) g.tick(1 / hz) }
const traceSpots = d => Object.entries(d.content).filter(([, e]) => e).map(([s]) => s)

test('メタ情報: 4〜8人。シナリオはデータファイルから読む', () => {
  assert.equal(meta.minPlayers, 4)
  assert.equal(meta.maxPlayers, 8)
  assert.ok(meta.scenarios.some(s => s.id === 'mansion'))
  assert.equal(byId('nope').id, SCENARIOS[0].id) // 知らないシナリオ名は先頭にする
  for (const row of mansion.map) assert.equal(row.length, mansion.map[0].length)
  for (const s of mansion.spots) assert.notEqual(mansion.map[s.y][s.x], '#', `${s.id} が壁の中`)
})

test('1プレイは最長でも5分に収まる', () => {
  const total = TIMES.intro + TIMES.explore + TIMES.discuss + TIMES.vote
  assert.ok(total <= 300, `合計 ${total}秒`)
})

test('役割: どの人数でも犯人・探偵・鑑識は1人ずつ。目撃者は5人から', () => {
  for (let n = 4; n <= 8; n++) for (let seed = 1; seed <= 30; seed++) {
    const { d } = mk(n, seed)
    const roles = Object.values(d.roleOf)
    assert.equal(roles.filter(r => r === 'culprit').length, 1)
    assert.equal(roles.filter(r => r === 'detective').length, 1)
    assert.equal(roles.filter(r => r === 'forensic').length, 1)
    assert.equal(roles.filter(r => r === 'witness').length, n >= 5 ? 1 : 0)
    assert.equal(roles.length, n)
  }
})

test('手がかり: 本物は3つ、別々の部屋。3つそろえば犯人は1人に絞れる', () => {
  for (let n = 4; n <= 8; n++) for (let seed = 1; seed <= 40; seed++) {
    const { d } = mk(n, seed)
    const spots = traceSpots(d)
    assert.equal(spots.length, 3)
    const rooms = new Set(spots.map(s => mansion.map[spot(s).y][spot(s).x]))
    assert.equal(rooms.size, 3)
    assert.ok(!spots.includes('body'))
    const c = d.traits[d.culpritId]
    const match = Object.keys(d.traits).filter(id => mansion.traits.every(t => d.traits[id][t.key] === c[t.key]))
    assert.deepEqual(match, [d.culpritId])
  }
})

test('秘密は本人の view にだけ入る（役割名・犯人の痕跡・鑑定・目撃・検視）', () => {
  for (let n = 4; n <= 8; n++) for (let seed = 1; seed <= 10; seed++) {
    const { g, ps, d } = mk(n, seed)
    toExplore(g, ps)
    // 鑑識が本物を1つ見つけた状態にする
    const f = roleHolder(d, 'forensic')
    placeAt(d, f, traceSpots(d)[0]); g.input(f, { type: 'act', kind: 'search', spot: traceSpots(d)[0] }); run(g, 2)
    for (const p of ps) {
      const v = g.view(p.id)
      const json = JSON.stringify(v)
      const role = d.roleOf[p.id]
      assert.equal(v.role, role)
      for (const r of ['culprit', 'detective', 'forensic', 'witness', 'resident']) {
        if (r !== role) assert.ok(!json.includes(`"${r}"`), `${role} の view に ${r} が入っている`)
      }
      assert.equal('culprit' in v, role === 'culprit')
      assert.equal('analyses' in v, role === 'forensic')
      assert.equal('secret' in v, role === 'detective' || role === 'witness')
      if (role !== 'culprit' && role !== 'forensic') assert.ok(!json.includes('fake'), 'fake の文字が漏れている')
      // 他人の位置は同じ部屋の人だけ
      for (const o of v.others) assert.equal(d.pos[o.id].room, d.pos[p.id].room)
      assert.deepEqual(Object.keys(v.others[0] || { id: 0, x: 0, y: 0, busy: 0 }).sort(), ['busy', 'id', 'x', 'y'])
    }
    // 目撃者が白だと知っている人は犯人ではない
    const w = roleHolder(d, 'witness')
    if (w) { assert.notEqual(g.view(w).secret.clear, d.culpritId); assert.notEqual(g.view(w).secret.clear, w) }
    // 探偵の検視は犯人の特徴と一致する
    const det = roleHolder(d, 'detective')
    const c = g.view(det).secret.clue
    assert.equal(d.traits[d.culpritId][c.dim], c.val)
  }
})

test('違う部屋の人は見えない。同じ部屋なら見える', () => {
  const { g, ps, d } = mk(4)
  toExplore(g, ps)
  placeAt(d, 'p0', 'bed'); placeAt(d, 'p1', 'dresser'); placeAt(d, 'p2', 'stove')
  assert.deepEqual(g.view('p0').others.map(o => o.id), ['p1'])
  assert.deepEqual(g.view('p2').others.map(o => o.id), [])
})

test('犯人の「隠す」は、同じ部屋の人からは「調べる」と全く同じに見える', () => {
  const { g, ps, d } = mk(5, 3)
  toExplore(g, ps)
  const cul = d.culpritId
  const others = ps.map(p => p.id).filter(id => id !== cul)
  const [watcher, searcher] = others
  const ts = traceSpots(d)[0]
  placeAt(d, cul, ts); placeAt(d, watcher, ts); placeAt(d, searcher, ts)
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts }).ok, true)
  assert.equal(g.input(searcher, { type: 'act', kind: 'search', spot: ts }).ok, true)
  run(g, 0.5)
  const seen = g.view(watcher).others
  const a = seen.find(o => o.id === cul), b = seen.find(o => o.id === searcher)
  assert.deepEqual({ ...a, id: 0 }, { ...b, id: 0 })
  assert.equal(a.busy, true)
  run(g, 2)
  // 隠したあとに調べると、ただの家具の説明しか出ない
  assert.equal(d.content[ts], null)
  g.input(watcher, { type: 'act', kind: 'search', spot: ts }); run(g, 2)
  assert.equal(g.view(watcher).notebook.at(-1).eid, null)
  // 犯人の view では隠したことになっている
  const tr = g.view(cul).culprit.traces.find(t => t.spot === ts)
  assert.equal(tr.present, false)
  assert.equal(g.view(cul).culprit.canHide, false)
})

test('偽装: 見つけた人には本物と同じ形で届く。鑑識だけが偽物と分かる', () => {
  const { g, ps, d } = mk(6, 4)
  toExplore(g, ps)
  const cul = d.culpritId, f = roleHolder(d, 'forensic'), res = ps.map(p => p.id).find(id => !['culprit', 'forensic'].includes(d.roleOf[id]))
  const free = mansion.spots.find(s => !s.noClue && d.content[s.id] === null).id
  const opt = g.view(cul).culprit.fakeOptions[0]
  assert.notEqual(d.traits[cul][opt.dim], opt.val) // 犯人自身の特徴は偽装の選択肢に無い
  placeAt(d, cul, free)
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: free, fake: opt }).ok, true)
  run(g, 2)
  assert.ok(d.content[free])
  placeAt(d, res, free); placeAt(d, f, free)
  g.input(res, { type: 'act', kind: 'search', spot: free }); g.input(f, { type: 'act', kind: 'search', spot: free }); run(g, 2)
  const e = g.view(res).notebook.at(-1)
  assert.deepEqual(Object.keys(e).sort(), ['clue', 'eid', 'n', 'spot'])
  assert.deepEqual(e.clue, { dim: opt.dim, val: opt.val })
  assert.equal(g.view(f).analyses[e.eid], 'fake')
  // 掲示板に貼れる。貼られた偽物は住人には本物と区別がつかない
  assert.equal(g.input(res, { type: 'post', eid: e.eid }).ok, true)
  assert.equal(g.input(res, { type: 'post', eid: e.eid }).error, 'already')
  assert.ok(!JSON.stringify(g.view(res).board).includes('fake'))
  // 2回目の偽装はできない
  const free2 = mansion.spots.find(s => !s.noClue && d.content[s.id] === null).id
  placeAt(d, cul, free2)
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: free2, fake: opt }).error, 'used')
})

test('犯人の行動の制限（役割・距離・回数・置ける場所）', () => {
  const { g, ps, d } = mk(4, 5)
  const cul = d.culpritId, res = ps.find(p => p.id !== cul).id
  const ts = traceSpots(d)[0]
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts }).error, 'bad_phase') // 探索前
  toExplore(g, ps)
  placeAt(d, res, ts)
  assert.equal(g.input(res, { type: 'act', kind: 'hide', spot: ts }).error, 'not_allowed')
  assert.equal(g.input(res, { type: 'act', kind: 'plant', spot: ts, fake: { dim: 'hand', val: 'L' } }).error, 'not_allowed')
  placeAt(d, cul, 'body')
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts }).error, 'too_far')
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: 'body' }).error, 'nothing_to_hide')
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: 'body', fake: g.view(cul).culprit.fakeOptions[0] }).error, 'spot_taken')
  placeAt(d, cul, ts)
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: ts, fake: g.view(cul).culprit.fakeOptions[0] }).error, 'spot_taken') // 本物がある所には置けない
  const own = { dim: 'hand', val: d.traits[cul].hand }
  const free = mansion.spots.find(s => !s.noClue && d.content[s.id] === null).id
  placeAt(d, cul, free)
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: free, fake: own }).error, 'bad_fake')
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: free, fake: 'x' }).error, 'bad_fake')
  placeAt(d, cul, ts)
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts }).ok, true)
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts }).error, 'busy')
  run(g, 2)
  const ts2 = traceSpots(d)[0]
  placeAt(d, cul, ts2)
  assert.equal(g.input(cul, { type: 'act', kind: 'hide', spot: ts2 }).error, 'used')
})

test('調べている途中に歩くと中断する。探偵は調べるのが速い', () => {
  const { g, ps, d } = mk(4, 6)
  toExplore(g, ps)
  const det = roleHolder(d, 'detective'), res = ps.map(p => p.id).find(id => d.roleOf[id] !== 'detective')
  placeAt(d, det, 'vase'); placeAt(d, res, 'clock')
  g.input(det, { type: 'act', kind: 'search', spot: 'vase' }); g.input(res, { type: 'act', kind: 'search', spot: 'clock' })
  run(g, (DETECTIVE_SEARCH_SEC + SEARCH_SEC) / 2)
  assert.equal(g.view(det).notebook.length, 1)
  assert.equal(g.view(res).notebook.length, 0)
  g.input(res, { type: 'move', dx: 1, dy: 0 })
  run(g, 2)
  assert.equal(g.view(res).notebook.length, 0)
  assert.equal(g.view(res).me.busy, null)
})

test('移動: 壁は抜けられない。扉は通れる。tick の細かさで速さが変わらない', () => {
  const { g, ps, d } = mk(4)
  toExplore(g, ps)
  // 玄関の上の壁へ向かって歩く
  Object.assign(d.pos.p0, { x: 3.5, y: 12.5, room: 'E' })
  g.input('p0', { type: 'move', dx: 0, dy: -1 }); run(g, 2)
  assert.ok(d.pos.p0.y >= 12.3, '壁を抜けた ' + d.pos.p0.y)
  // 玄関の扉（2,11）の真下から上へ → 食堂に入る
  Object.assign(d.pos.p1, { x: 2.7, y: 12.5, room: 'E' })
  g.input('p1', { type: 'move', dx: 0, dy: -1 }); run(g, 1.5)
  assert.equal(d.pos.p1.room, 'D')
  // 速さ: 12Hz と 60Hz で同じ距離
  const a = mk(4), b = mk(4)
  for (const k of [a, b]) { toExplore(k.g, k.ps); Object.assign(k.d.pos.p0, { x: 1.5, y: 5.5, room: 'H' }); k.g.input('p0', { type: 'move', dx: 1, dy: 0 }) }
  run(a.g, 1, 12); run(b.g, 1, 60)
  assert.ok(Math.abs(a.d.pos.p0.x - b.d.pos.p0.x) < 0.05)
  assert.ok(Math.abs(a.d.pos.p0.x - (1.5 + SPEED)) < 0.1)
})

test('不正な入力は状態を変えずに error を返す', () => {
  const { g, ps, d } = mk(4)
  const before = JSON.stringify(g.view('p0'))
  for (const bad of [null, 1, 'x', {}, { type: 'hack' }, { type: 'move', dx: 'a', dy: 0 }, { type: 'move', dx: NaN, dy: 1 }, { type: 'vote', target: 'p1' }, { type: 'post', eid: 'zzz' }, { type: 'analyze', eid: 'x' }]) {
    assert.ok(g.input('p0', bad).error, JSON.stringify(bad))
  }
  assert.equal(JSON.stringify(g.view('p0')), before)
  assert.equal(g.input('stranger', { type: 'ready' }).error, 'not_player')
  toExplore(g, ps)
  assert.equal(g.input('p0', { type: 'act', kind: 'search', spot: 'nowhere' }).error, 'bad_spot')
  assert.equal(g.input('p0', { type: 'act', kind: 'fly', spot: 'vase' }).error, 'too_far')
  placeAt(d, 'p0', 'vase')
  assert.equal(g.input('p0', { type: 'act', kind: 'fly', spot: 'vase' }).error, 'bad_input')
  // 大きすぎる移動ベクトルは長さ1に丸める
  g.input('p0', { type: 'move', dx: 1000, dy: 0 })
  assert.equal(d.pos.p0.dx, 1)
  const nonF = ps.map(p => p.id).find(id => d.roleOf[id] !== 'forensic')
  assert.equal(g.input(nonF, { type: 'analyze', eid: 'x' }).error, 'not_allowed')
})

test('鑑識は掲示板の証拠を2回まで鑑定できる', () => {
  const { g, ps, d } = mk(4, 8)
  toExplore(g, ps)
  const f = roleHolder(d, 'forensic'), others = ps.map(p => p.id).filter(id => id !== f)
  const spots = traceSpots(d)
  others.forEach((id, i) => { placeAt(d, id, spots[i]); g.input(id, { type: 'act', kind: 'search', spot: spots[i] }) })
  run(g, 2)
  for (const id of others) g.input(id, { type: 'post', eid: g.view(id).notebook[0].eid })
  const board = g.view(f).board
  assert.equal(board.length, 3)
  assert.equal(g.input(f, { type: 'analyze', eid: board[0].eid }).ok, true)
  assert.equal(g.input(f, { type: 'analyze', eid: board[0].eid }).error, 'already')
  assert.equal(g.input(f, { type: 'analyze', eid: board[1].eid }).ok, true)
  assert.equal(g.input(f, { type: 'analyze', eid: board[2].eid }).error, 'used')
  assert.equal(g.view(f).analyses[board[0].eid], 'real')
  assert.equal(g.view(f).forensicUses, 0)
  assert.equal(FORENSIC_BOARD_USES, 2)
})

function playToVote(n, seed) {
  const k = mk(n, seed)
  allReady(k.g, k.ps); allReady(k.g, k.ps); allReady(k.g, k.ps)
  assert.equal(k.g.view('p0').phase, 'vote')
  return k
}

test('勝ち: 犯人に票が集まれば事件解決（最小4人・最大8人）', () => {
  for (const n of [4, 8]) {
    const { g, ps, d } = playToVote(n, 11)
    const cul = d.culpritId
    for (const p of ps) g.input(p.id, { type: 'vote', target: p.id === cul ? ps.find(q => q.id !== cul).id : cul })
    assert.equal(g.isOver(), true)
    const r = g.result()
    assert.equal(r.win, true)
    assert.equal(r.reason, 'caught')
    assert.equal(r.culprit, cul)
    assert.equal(r.roles.find(x => x.id === cul).votes, n - 1)
  }
})

test('負け: 別の人が最多票、または同票なら犯人の逃げ切り', () => {
  {
    const { g, ps, d } = playToVote(4, 12)
    const cul = d.culpritId, inno = ps.map(p => p.id).filter(id => id !== cul)
    for (const p of ps) g.input(p.id, { type: 'vote', target: p.id === inno[0] ? inno[1] : inno[0] })
    const r = g.result()
    assert.equal(r.win, false); assert.equal(r.reason, 'wrong'); assert.equal(r.accused, inno[0])
  }
  {
    const { g, ps, d } = playToVote(4, 13)
    const cul = d.culpritId, inno = ps.map(p => p.id).filter(id => id !== cul)
    // 2票ずつに割る: inno0,inno1 → 犯人、犯人,inno2 → inno0
    g.input(inno[0], { type: 'vote', target: cul }); g.input(inno[1], { type: 'vote', target: cul })
    g.input(cul, { type: 'vote', target: inno[0] }); g.input(inno[2], { type: 'vote', target: inno[0] })
    const r = g.result()
    assert.equal(r.win, false); assert.equal(r.reason, 'tie')
  }
})

test('投票: 自分には入れられない。入れ直せる。投票前は誰が誰に入れたか見えない', () => {
  const { g, ps } = playToVote(4, 14)
  assert.equal(g.input('p0', { type: 'vote', target: 'p0' }).error, 'bad_target')
  assert.equal(g.input('p0', { type: 'vote', target: 'ghost' }).error, 'bad_target')
  g.input('p0', { type: 'vote', target: 'p1' }); g.input('p0', { type: 'vote', target: 'p2' })
  assert.equal(g.view('p0').myVote, 'p2')
  assert.deepEqual(g.view('p1').voted, ['p0'])
  assert.equal(g.view('p1').myVote, null)
  assert.ok(!('votes' in g.view('p1')))
  assert.equal(g.isOver(), false)
  void ps
})

test('時間切れ: 誰も何もしなければ順に進み、誰も投票しないと犯人の勝ち', () => {
  const { g } = mk(4)
  const phases = []
  for (let i = 0; i < 12 * 320 && !g.isOver(); i++) { g.tick(1 / 12); const p = g.view('p0').phase; if (phases.at(-1) !== p) phases.push(p) }
  assert.deepEqual(phases, ['intro', 'explore', 'discuss', 'vote'])
  assert.equal(g.isOver(), true)
  assert.equal(g.result().win, false)
  assert.equal(g.result().reason, 'novote')
})

test('全員が「終える」を押すと次へ進む。取り消せる', () => {
  const { g, ps } = mk(4)
  for (const p of ps.slice(0, 3)) g.input(p.id, { type: 'ready' })
  g.input('p0', { type: 'ready', on: false })
  g.input('p3', { type: 'ready' })
  assert.equal(g.view('p0').phase, 'intro')
  g.input('p0', { type: 'ready' })
  assert.equal(g.view('p0').phase, 'explore')
  assert.deepEqual(g.view('p0').ready, [])
})

test('途中退出: 犯人が抜けたら事件解決で終わる。他の人が抜けても続き、残りがそろえば進む', () => {
  {
    const { g, d } = mk(4)
    g.removePlayer(d.culpritId)
    assert.equal(g.isOver(), true)
    assert.equal(g.result().reason, 'culprit_left')
    assert.equal(g.result().win, true)
  }
  {
    const { g, ps, d } = playToVote(5, 21)
    const cul = d.culpritId, inno = ps.map(p => p.id).filter(id => id !== cul)
    for (const id of [cul, ...inno.slice(0, 3)]) g.input(id, { type: 'vote', target: id === cul ? inno[0] : cul })
    assert.equal(g.isOver(), false)
    g.removePlayer(inno[3]) // 最後の1人が抜ける → 全員投票済みになる
    assert.equal(g.isOver(), true)
    assert.equal(g.result().win, true)
  }
  {
    const { g, ps, d } = mk(4, 22)
    const inno = ps.map(p => p.id).filter(id => id !== d.culpritId)
    for (const id of ps.map(p => p.id).filter(id => id !== inno[0])) g.input(id, { type: 'ready' })
    g.removePlayer(inno[0])
    assert.equal(g.view(inno[1]).phase, 'explore')
    assert.equal(g.view(inno[0]).role, null) // 抜けた人の view に秘密は入らない
  }
})

// ---------- シナリオ3本・家具の当たり・探索のできごと（3幕）・称号
import { EVENTS, DARK_VIEW, DARK_SLOW, stageAt } from '../lib/game.mjs'
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

test('シナリオ3本: 形が正しく、家具をよけても全部の部屋と家具に届く。扉の前後に家具が無い', () => {
  assert.deepEqual(SCENARIOS.map(s => s.id), ['mansion', 'ship', 'lodge'])
  for (const s of SCENARIOS) {
    const H = s.map.length, W = s.map[0].length
    for (const row of s.map) assert.equal(row.length, W, s.id)
    const fur = new Set(s.spots.map(p => p.x + ',' + p.y))
    assert.equal(fur.size, s.spots.length, `${s.id} 家具が重なっている`)
    for (const p of s.spots) assert.ok(s.rooms[s.map[p.y][p.x]], `${s.id} ${p.id} が部屋の外`)
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && s.map[y][x] !== '#' && !fur.has(x + ',' + y)
    let st = null
    for (let y = 0; y < H && !st; y++) for (let x = 0; x < W; x++) if (s.map[y][x] === s.spawnRoom && ok(x, y)) { st = [x, y]; break }
    const seen = new Set([st.join()]), q = [st]
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of D4) { const k = [x + dx, y + dy]; if (ok(...k) && !seen.has(k.join())) { seen.add(k.join()); q.push(k) } } }
    const rooms = new Set([...seen].map(k => { const [x, y] = k.split(',').map(Number); return s.map[y][x] }))
    for (const r of Object.keys(s.rooms)) assert.ok(rooms.has(r), `${s.id} ${r} に入れない`)
    for (const p of s.spots) assert.ok(D4.some(([dx, dy]) => seen.has(`${p.x + dx},${p.y + dy}`)), `${s.id} ${p.id} に近づけない`)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (s.map[y][x] === '+') for (const [dx, dy] of D4) assert.ok(!fur.has(`${x + dx},${y + dy}`), `${s.id} 扉(${x},${y})の前に家具`)
    assert.ok(s.spots.filter(p => p.noClue).length === 1, `${s.id} 遺体は1つ`)
    assert.ok(s.cast.length >= 8 && s.cast.every(t => s.looks[t]), `${s.id} 肩書きと見た目`)
    assert.ok(TIMES.intro + s.exploreSec + TIMES.discuss + TIMES.vote <= 300, `${s.id} 5分を超える`)
    for (const t of s.traits) for (const v of t.values) assert.ok(v.label && v.clue, `${s.id} ${t.key}`)
  }
})

test('シナリオ3本とも: 本物の手がかりは特徴の数だけ別々の部屋にあり、全部そろえば犯人は1人に絞れる', () => {
  for (const s of SCENARIOS) for (const n of [4, 6, 8]) for (let seed = 1; seed <= 25; seed++) {
    const g = createGame(mkPlayers(n), { rng: seeded(seed), scenario: s.id }), d = g._debug
    const spots = Object.entries(d.content).filter(([, e]) => e).map(([k]) => s.spots.find(p => p.id === k))
    assert.equal(spots.length, s.traits.length, s.id)
    assert.equal(new Set(spots.map(p => s.map[p.y][p.x])).size, s.traits.length, `${s.id} 同じ部屋に2つ`)
    const c = d.traits[d.culpritId]
    assert.deepEqual(Object.keys(d.traits).filter(id => s.traits.every(t => d.traits[id][t.key] === c[t.key])), [d.culpritId])
    assert.equal(g.view('p0').chars.every(ch => typeof ch.look === 'string'), true)
  }
})

test('家具は通り抜けられない。玄関の家具の上には誰も置かれない', () => {
  for (const s of SCENARIOS) {
    const g = createGame(mkPlayers(8), { rng: seeded(3), scenario: s.id }), d = g._debug
    for (const id in d.pos) assert.ok(!d.solidTile(Math.floor(d.pos[id].x), Math.floor(d.pos[id].y)), `${s.id} 家具の上に出た`)
  }
  const { g, ps, d } = mk(4)
  toExplore(g, ps)
  // 食堂の食卓（3,9）の右から左へ歩いても食卓を抜けない
  Object.assign(d.pos.p0, { x: 4.5, y: 9.5, room: 'D' })
  g.input('p0', { type: 'move', dx: -1, dy: 0 }); run(g, 1.5)
  assert.ok(d.pos.p0.x >= 4.29, '食卓を抜けた ' + d.pos.p0.x)
  // 家具の中に置かれても歩いて出られる
  placeAt(d, 'p1', 'table')
  g.input('p1', { type: 'move', dx: 0, dy: 1 }); run(g, 1)
  assert.ok(!d.solidTile(Math.floor(d.pos.p1.x), Math.floor(d.pos.p1.y)), '家具から出られない')
})

test('探索は3幕でだんだん難しくなる: 雷の記録 → 停電 → 夜が深まる → 扉が閉じる → 雷', () => {
  const { g, ps, d } = mk(6, 7)
  toExplore(g, ps)
  const E = mansion.exploreSec
  const v0 = g.view('p0')
  assert.equal(v0.env.stage, 1); assert.equal(v0.env.dark, false); assert.equal(v0.env.next.kind, 'flash')
  assert.equal(v0.log.length, 0)
  run(g, E * 0.22 + 0.2)
  const v1 = g.view('p0')
  assert.equal(v1.env.stage, 2); assert.equal(v1.env.dark, true)
  const flash = v1.log.find(e => e.kind === 'flash')
  assert.ok(flash, '雷の記録が無い')
  assert.deepEqual(Object.keys(flash.rooms).sort(), ps.map(p => p.id).sort()) // 全員の居場所
  for (const p of ps) assert.deepEqual(g.view(p.id).log, v1.log) // 全員に同じ記録
  assert.ok(v1.log.some(e => e.kind === 'dark'))
  run(g, E * 0.21)
  assert.equal(g.view('p0').env.dark, false)
  run(g, E * 0.10)
  const v3 = g.view('p0')
  assert.equal(v3.env.stage, 3); assert.ok(v3.log.some(e => e.kind === 'night'))
  run(g, E * 0.13)
  const lock = g.view('p0').log.find(e => e.kind === 'lock')
  assert.ok(lock, '扉が閉じない')
  assert.deepEqual(g.view('p0').env.lock, lock.door)
  assert.equal(mansion.map[lock.door[1]][lock.door[0]], '+')
  assert.ok(d.solidTile(lock.door[0], lock.door[1]))
  run(g, E * 0.24)
  const v5 = g.view('p0')
  assert.equal(v5.log.filter(e => e.kind === 'flash').length, 2)
  assert.equal(v5.env.lock, null)
  assert.ok(!d.solidTile(lock.door[0], lock.door[1]))
  assert.deepEqual(v5.log.map(e => e.kind), ['flash', 'dark', 'light', 'night', 'lock', 'flash', 'unlock'])
  assert.equal(stageAt(0.1), 1); assert.equal(stageAt(0.3), 2); assert.equal(stageAt(0.9), 3)
  assert.equal(EVENTS.length, 7)
})

test('閉じた扉は通れない（閉じ込められる）', () => {
  const { g, ps, d } = mk(4, 9)
  toExplore(g, ps)
  const E = mansion.exploreSec
  for (const id in d.pos) Object.assign(d.pos[id], { x: 2.5, y: 13.5, room: 'E' }) // 全員玄関の奥
  run(g, E * 0.65)
  const door = g.view('p0').env.lock
  assert.ok(door)
  // 閉じた扉の手前から扉へ向かって歩いても、扉のマスに入れない
  const [x, y] = door
  const from = mansion.map[y + 1]?.[x] && mansion.map[y + 1][x] !== '#' ? [x + 0.5, y + 1.5, 0, -1] : [x + 0.5, y - 0.5, 0, 1]
  Object.assign(d.pos.p1, { x: from[0], y: from[1], room: mansion.map[Math.floor(from[1])][x] })
  g.input('p1', { type: 'move', dx: from[2], dy: from[3] }); run(g, 1)
  assert.notEqual(`${Math.floor(d.pos.p1.x)},${Math.floor(d.pos.p1.y)}`, `${x},${y}`)
})

test('停電中: 同じ部屋でも離れた人は見えない。調べる・隠すはどちらも同じだけ遅くなる', () => {
  const { g, ps, d } = mk(5, 3)
  toExplore(g, ps)
  run(g, mansion.exploreSec * 0.22 + 0.2)
  assert.equal(g.view('p0').env.dark, true)
  // 廊下の両端に立つ（同じ部屋）
  Object.assign(d.pos.p0, { x: 1.5, y: 5.5, room: 'H' }); Object.assign(d.pos.p1, { x: 9.5, y: 5.5, room: 'H' })
  assert.deepEqual(g.view('p0').others.map(o => o.id), [])
  Object.assign(d.pos.p1, { x: 1.5 + DARK_VIEW - 0.2, y: 5.5, room: 'H' })
  assert.deepEqual(g.view('p0').others.map(o => o.id), ['p1'])
  // 犯人の「隠す」と住人の「調べる」は同じ時間（停電の倍率も同じ）
  const cul = d.culpritId, res = ps.map(p => p.id).find(id => d.roleOf[id] === 'resident' || d.roleOf[id] === 'witness')
  const ts = traceSpots(d)[0]
  placeAt(d, cul, ts); placeAt(d, res, ts)
  g.input(cul, { type: 'act', kind: 'hide', spot: ts }); g.input(res, { type: 'act', kind: 'search', spot: ts })
  run(g, SEARCH_SEC * 1.1)
  assert.ok(d.pos[res].busy && d.pos[cul].busy, '停電中なのに遅くならない')
  run(g, SEARCH_SEC * (DARK_SLOW - 1))
  assert.equal(d.pos[res].busy, null); assert.equal(d.pos[cul].busy, null)
})

test('夜が深まると犯人はもう1回偽装できる（それまでは1回）', () => {
  const { g, ps, d } = mk(4, 5)
  toExplore(g, ps)
  const cul = d.culpritId
  const freeSpots = () => mansion.spots.filter(s => !s.noClue && d.content[s.id] === null).map(s => s.id)
  const opt = g.view(cul).culprit.fakeOptions[0]
  placeAt(d, cul, freeSpots()[0])
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: freeSpots()[0], fake: opt }).ok, true); run(g, 2)
  placeAt(d, cul, freeSpots()[0])
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: freeSpots()[0], fake: opt }).error, 'used')
  assert.equal(g.view(cul).culprit.canPlant, false)
  run(g, mansion.exploreSec * 0.53)
  assert.equal(g.view(cul).culprit.canPlant, true)
  assert.equal(g.view(cul).culprit.plantsLeft, 1)
  const sp = freeSpots()[0]; placeAt(d, cul, sp)
  assert.equal(g.input(cul, { type: 'act', kind: 'plant', spot: sp, fake: opt }).ok, true); run(g, 3)
  assert.equal(g.view(cul).culprit.canPlant, false)
})

test('称号: 当てた人・濡れ衣・犯人の負け方に名前が付く。称号は結果にだけ入る', () => {
  {
    const k = mk(4, 31)
    const { g, ps, d } = k
    toExplore(g, ps)
    const cul = d.culpritId, inno = ps.map(p => p.id).filter(id => id !== cul)
    const ts = traceSpots(d)[0]
    placeAt(d, inno[0], ts); g.input(inno[0], { type: 'act', kind: 'search', spot: ts }); run(g, 2)
    assert.ok(!('award' in g.view(inno[0])) && !JSON.stringify(g.view(inno[0])).includes('stats'))
    allReady(g, ps); allReady(g, ps)
    for (const p of ps) g.input(p.id, { type: 'vote', target: p.id === cul ? inno[0] : cul })
    const r = g.result()
    const aw = id => r.roles.find(x => x.id === id).award
    assert.equal(aw(cul), 'unanimous')
    assert.equal(aw(inno[0]), 'detective')
    assert.equal(aw(inno[1]), 'hunch')
    assert.equal(r.roles.find(x => x.id === inno[0]).stats.found, 1)
  }
  {
    const { g, ps, d } = playToVote(4, 32)
    const cul = d.culpritId, inno = ps.map(p => p.id).filter(id => id !== cul)
    for (const p of ps) g.input(p.id, { type: 'vote', target: p.id === inno[0] ? inno[1] : inno[0] })
    const r = g.result()
    const aw = id => r.roles.find(x => x.id === id).award
    assert.equal(aw(inno[0]), 'framed')
    assert.equal(aw(inno[1]), 'accomplice')
    assert.equal(aw(cul), 'perfect')
  }
})
