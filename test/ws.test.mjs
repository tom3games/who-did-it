// 本物のサーバーを立てて、WebSocket で複数人がつなぐ統合テスト
import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { startServer } from '../server.mjs'
import * as gameDef from '../lib/game.mjs'

function client(port, saved) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  const c = { ws, msgs: [], id: null, token: null, state: null }
  ws.on('message', d => {
    const m = JSON.parse(d)
    c.msgs.push(m)
    if (m.t === 'session') { c.id = m.id; c.token = m.token }
    if (m.t === 'state') c.state = m
  })
  c.ready = new Promise(r => ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', ...(saved || {}) })); r() }))
  c.send = m => ws.send(JSON.stringify(m))
  c.wait = (pred, ms = 3000) => new Promise((res, rej) => {
    const t0 = Date.now()
    const iv = setInterval(() => {
      const hit = c.msgs.find(pred)
      if (hit) { clearInterval(iv); res(hit) } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')) }
    }, 10)
  })
  return c
}

test('4人がつないで、作成・参加・開始・探索・投票・終了・再戦まで通る。秘密は本人にしか届かない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const cs = [0, 1, 2, 3].map(() => client(srv.port))
    for (const c of cs) { await c.ready; await c.wait(m => m.t === 'welcome') }
    const [a, b] = cs
    a.send({ t: 'create', name: 'A' })
    const { code } = await a.wait(m => m.t === 'joined')
    for (const [i, c] of cs.slice(1).entries()) { c.send({ t: 'join', code, name: 'N' + i }); await c.wait(m => m.t === 'joined') }
    await a.wait(m => m.t === 'state' && m.players.length === 4)
    b.send({ t: 'start' })
    await b.wait(m => m.t === 'error' && m.code === 'not_host')
    a.send({ t: 'start', opts: { scenario: 'mansion' } })
    for (const c of cs) await c.wait(m => m.t === 'state' && m.phase === 'playing')
    // 各自に届いた状態に、自分以外の役割が入っていない
    const roles = cs.map(c => c.state.game.role)
    assert.equal(roles.filter(r => r === 'culprit').length, 1)
    for (const c of cs) {
      const json = JSON.stringify(c.msgs.filter(m => m.t === 'state' && m.game))
      for (const r of new Set(roles)) if (r !== c.state.game.role) assert.ok(!json.includes(`"${r}"`), `${c.state.game.role} に ${r} が届いた`)
    }
    const ready = async phase => {
      for (const c of cs) c.send({ t: 'input', data: { type: 'ready' } })
      await a.wait(m => m.t === 'state' && m.game?.phase === phase)
    }
    await ready('explore')
    a.send({ t: 'input', data: { type: 'move', dx: 1, dy: 0 } })
    await new Promise(r => setTimeout(r, 400))
    a.send({ t: 'input', data: { type: 'move', dx: 0, dy: 0 } })
    const moved = await a.wait(m => m.t === 'state' && m.game?.me && m.game.me.x > 1.6)
    assert.ok(moved)
    await ready('discuss')
    await ready('vote')
    const culIdx = roles.indexOf('culprit')
    const culId = cs[culIdx].id
    cs.forEach((c, i) => c.send({ t: 'input', data: { type: 'vote', target: i === culIdx ? cs[(i + 1) % 4].id : culId } }))
    const end = await b.wait(m => m.t === 'state' && m.phase === 'result')
    assert.equal(end.result.win, true)
    assert.equal(end.result.culprit, culId)
    a.send({ t: 'rematch' })
    await b.wait(m => m.t === 'state' && m.phase === 'playing' && m.round === 2)
    for (const c of cs) c.ws.close()
  } finally { await srv.close() }
})

test('切れても id と token で同じ席に戻れる。token が違うと別人になる', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const a = client(srv.port)
    await a.ready; await a.wait(m => m.t === 'session')
    a.send({ t: 'create', name: 'A' })
    const { code } = await a.wait(m => m.t === 'joined')
    const saved = { id: a.id, token: a.token }
    a.ws.close()
    await new Promise(r => setTimeout(r, 100))
    const a2 = client(srv.port, saved)
    const w = await a2.wait(m => m.t === 'welcome')
    assert.equal(w.code, code)
    const st = await a2.wait(m => m.t === 'state')
    assert.equal(st.you, saved.id)
    const evil = client(srv.port, { id: saved.id, token: 'x'.repeat(32) })
    const w2 = await evil.wait(m => m.t === 'welcome')
    assert.notEqual(w2.id, saved.id)
    assert.equal(w2.code, null)
    a2.ws.close(); evil.ws.close()
  } finally { await srv.close() }
})

test('操作を送りすぎても、部屋の操作（再戦など）は捨てられない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const cs = [0, 1, 2, 3].map(() => client(srv.port))
    for (const c of cs) { await c.ready; await c.wait(m => m.t === 'welcome') }
    const a = cs[0]
    a.send({ t: 'create', name: 'A' }); const { code } = await a.wait(m => m.t === 'joined')
    for (const c of cs.slice(1)) { c.send({ t: 'join', code, name: 'X' }); await c.wait(m => m.t === 'joined') }
    a.send({ t: 'start' }); await a.wait(m => m.t === 'state' && m.phase === 'playing')
    for (let i = 0; i < 300; i++) a.send({ t: 'input', data: { type: 'move', dx: 1, dy: 0 } }) // 一気に送る
    a.send({ t: 'leave' })
    await new Promise(r => setTimeout(r, 200))
    assert.equal(srv.rooms.rooms.get(code).players.length, 3)
    for (const c of cs) c.ws.close()
  } finally { await srv.close() }
})

test('壊れたメッセージを送ってもサーバーは落ちない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const a = client(srv.port)
    await a.ready
    a.ws.send('not json')
    a.send({ nope: 1 })
    a.send({ t: 'input', data: { type: 'tap' } })
    await a.wait(m => m.t === 'error' && m.code === 'bad_json')
    const res = await fetch(`http://localhost:${srv.port}/healthz`)
    assert.equal((await res.json()).ok, true)
    a.ws.close()
  } finally { await srv.close() }
})

test('画面と招待URL（/r/コード）が返る。フォルダの外は読めない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const base = `http://localhost:${srv.port}`
    assert.equal((await fetch(base + '/')).status, 200)
    assert.match(await (await fetch(base + '/r/ABCD')).text(), /<html/)
    assert.equal((await fetch(base + '/app.js')).status, 200)
    const r = await fetch(base + '/..%2fpackage.json')
    assert.notEqual(r.status, 200)
  } finally { await srv.close() }
})

test('og:image は来たホスト名の絶対URLになる。変なホスト名は使わない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const base = `http://localhost:${srv.port}`
    const html = await (await fetch(base + '/r/ABCD', { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'who-did-it.example.com' } })).text()
    assert.match(html, /content="https:\/\/who-did-it\.example\.com\/og\.png"/)
    const bad = await (await fetch(base + '/', { headers: { 'x-forwarded-host': 'evil.com"><script>' } })).text()
    assert.match(bad, /content="\/og\.png"/)
    assert.equal((await fetch(base + '/og.png')).status, 200)
  } finally { await srv.close() }
})

test('画面から rng などの変な opts を送ってもサーバーは落ちない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const cs = [0, 1, 2, 3].map(() => client(srv.port))
    for (const c of cs) { await c.ready; await c.wait(m => m.t === 'welcome') }
    const a = cs[0]
    a.send({ t: 'create', name: 'A' }); const { code } = await a.wait(m => m.t === 'joined')
    for (const c of cs.slice(1)) { c.send({ t: 'join', code, name: 'X' }); await c.wait(m => m.t === 'joined') }
    a.send({ t: 'start', opts: { rng: 'x', scenario: { evil: 1 } } })
    const st = await a.wait(m => m.t === 'state' && m.phase === 'playing')
    assert.equal(st.game.scenario, 'mansion')
    assert.equal((await (await fetch(`http://localhost:${srv.port}/healthz`)).json()).ok, true)
    for (const c of cs) c.ws.close()
  } finally { await srv.close() }
})

test('ホストが選んだシナリオがロビーの全員に届く。ホスト以外は選べない', async () => {
  const srv = await startServer({ port: 0, quiet: true })
  try {
    const a = client(srv.port), b = client(srv.port)
    for (const c of [a, b]) { await c.ready; await c.wait(m => m.t === 'welcome') }
    a.send({ t: 'create', name: 'A' })
    const { code } = await a.wait(m => m.t === 'joined')
    b.send({ t: 'join', code, name: 'B' }); await b.wait(m => m.t === 'joined')
    a.send({ t: 'setup', opts: { scenario: 'lodge' } })
    await b.wait(m => m.t === 'state' && m.setup?.scenario === 'lodge')
    b.send({ t: 'setup', opts: { scenario: 'ship' } })
    await b.wait(m => m.t === 'error' && m.code === 'not_host')
    a.send({ t: 'setup', opts: { scenario: '<script>' } })
    await b.wait(m => m.t === 'state' && m.setup && !('scenario' in m.setup))
    for (const c of [a, b]) c.ws.close()
  } finally { await srv.close() }
})
