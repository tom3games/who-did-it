// 『犯人は誰だ？』を実ブラウザで最後まで遊ぶ手順。pages[0] がホスト。shot(name, page) で各サイズのスクショと見切れ検査をする。
export async function playToEnd(pages, { shot, check, srv }) {
  const [host] = pages
  // 役割の確認
  await host.waitForSelector('#g-ready')
  await shot('intro', host)
  // 犯人の画面も撮る
  const roles = await Promise.all(pages.map(p => p.evaluate(() => window.__wdi.role)))
  check(roles.filter(r => r === 'culprit').length === 1, `犯人はちょうど1人（${roles.join(',')}）`)
  check((await Promise.all(pages.map(p => p.textContent('#g-role')))).every(t => t === '役割'), '上の役割ボタンに役割の名前は出ない（のぞかれても分からない）')
  const culprit = pages[roles.indexOf('culprit')]
  await shot('intro-culprit', culprit)
  for (const p of pages) await p.click('#g-ready')
  await host.waitForSelector('#g-ctrl:not([hidden])')
  check(true, '探索が始まる')

  // ---- 位置はテスト用にサーバー側で動かす（家具の前へ）
  const idOf = async p => p.evaluate(() => window.__wdiYou)
  const ids = await Promise.all(pages.map(idOf))
  const room = [...srv.rooms.rooms.values()].find(r => r.phase === 'playing' && r.players.some(p => p.id === ids[0]))
  const d = room.game._debug

  // ---- 3幕のできごと（サーバーの時計を進める）: まず雷と停電（探索の 22%）。時計は戻せないので、探索の始めに見る
  const E = room.game.view(ids[0]).explore
  const elapsed = () => E - room.game.view(ids[0]).time
  const adv = sec => { for (let t = 0; t < sec; t += 0.1) room.game.tick(0.1) }
  adv(E * 0.23 - elapsed())
  await host.waitForFunction(() => document.querySelector('#g-play').dataset.dark === '1', null, { timeout: 3000 }).then(() => check(true, '停電になると画面が暗くなる'), () => check(false, '停電が画面に出ない'))
  check(/停電/.test(await host.textContent('#g-big')), `停電の大きな知らせが出る（${await host.textContent('#g-big')}）`)
  await shot('explore-dark', host)
  const { byId } = await import('../public/scenarios/index.mjs')
  const mansion = byId(await host.evaluate(() => window.__wdi.scenario))
  const W = mansion.map[0].length
  // 家具の隣の、歩ける床のマスへ
  const tp = (id, spotId) => {
    const s = mansion.spots.find(x => x.id === spotId)
    const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= mansion.map.length || mansion.map[y][x] === '#' || mansion.map[y][x] === '+' || mansion.spots.some(q => q.x === x && q.y === y)
    // 隣のマスのうち、そこから一番近い家具がこの家具だけになる所。無ければ家具の上（サーバーは家具の中から歩いて出られる）
    const uniq = ([x, y]) => mansion.spots.every(q => q === s || Math.hypot(q.x - x, q.y - y) > 1.2)
    const [x, y] = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [s.x + dx, s.y + dy]).find(c => !blocked(...c) && uniq(c)) || [s.x, s.y]
    Object.assign(d.pos[id], { x: x + 0.5, y: y + 0.5, room: mansion.map[y][x], dx: 0, dy: 0, busy: null })
  }
  // ホストを家具の前へ → 調べるボタン
  const first = mansion.spots.find(s => !s.noClue)
  tp(ids[0], first.id)
  await host.waitForFunction(() => !document.querySelector('#g-search').disabled)
  await host.click('#g-search')
  await host.waitForFunction(() => document.querySelector('#t-note em').textContent === '1', null, { timeout: 5000 })
  check(true, '家具を調べると手帳に1件入る')
  // 床の家具を押すと、そこまで歩いて調べる（タップで移動）
  const target = mansion.spots.filter(s => !s.noClue && s.id !== first.id).sort((a, b) => Math.hypot(a.x - first.x, a.y - first.y) - Math.hypot(b.x - first.x, b.y - first.y))[0]
  await host.evaluate(id => window.__wdiv.goSpot(id), target.id)
  await host.waitForFunction(() => document.querySelector('#t-note em').textContent === '2', null, { timeout: 12000 }).then(() => check(true, `家具を押すと歩いて行って調べる（${target.name}）`), () => check(false, `家具を押しても調べに行かない（${target.name}）`))

  // キーボードで右へ歩く → 位置が変わる
  // キーボード（矢印キー）で歩ける。壁に当たる向きもあるので、4方向のどれかで0.5マス以上動けばよい
  let moved = 0
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
    const a0 = await host.evaluate(() => [window.__wdi.me.x, window.__wdi.me.y])
    await host.keyboard.down(k); await host.waitForTimeout(500); await host.keyboard.up(k)
    await host.waitForTimeout(300)
    const a1 = await host.evaluate(() => [window.__wdi.me.x, window.__wdi.me.y])
    moved = Math.hypot(a1[0] - a0[0], a1[1] - a0[1])
    if (moved > 0.5) { check(true, `キーボード（${k}）で歩ける ${a0} → ${a1}`); break }
  }
  if (moved <= 0.5) check(false, 'キーボードで歩けない')

  // 2人目は移動スティックで上へ（スティックの上 = 画面の奥 = 地図の上）
  const g = pages[1]
  { // 上が同じ部屋の床になっている所に立たせる
    const free = (x, y) => mansion.map[y]?.[x] && mansion.map[y][x] !== '#' && mansion.map[y][x] !== '+' && !mansion.spots.some(q => q.x === x && q.y === y)
    let at = null
    for (let y = 2; y < mansion.map.length && !at; y++) for (let x = 1; x < W && !at; x++) if (free(x, y) && free(x, y - 1) && free(x, y - 2) && mansion.map[y][x] === mansion.map[y - 2][x] && mansion.map[y][x] === mansion.spawnRoom) at = [x, y]
    Object.assign(d.pos[ids[1]], { x: at[0] + 0.5, y: at[1] + 0.5, room: mansion.map[at[1]][at[0]], dx: 0, dy: 0, busy: null })
    await g.waitForTimeout(300)
  }
  const y0 = await g.evaluate(() => window.__wdi?.me?.y)
  const pad = await g.$('#g-joy'); const box = await pad.boundingBox()
  await g.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await g.mouse.down(); await g.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 3 })
  await g.waitForTimeout(700); await g.mouse.up()
  await g.waitForTimeout(300)
  const y1 = await g.evaluate(() => window.__wdi?.me?.y)
  check(y1 < y0 - 0.5, `移動スティックの上で画面の奥（地図の上）へ歩ける y ${y0} → ${y1}`)

  // ---- 犯人の秘密行動・掲示板・鑑定を画面から操作する
  const pageOf = role => pages[ids.findIndex(id => d.roleOf[id] === role)]
  const cid = d.culpritId
  const trace = Object.keys(d.content).find(k => d.content[k] && !d.ev[d.content[k]].fake)
  tp(cid, trace)
  try { await culprit.waitForFunction(() => !document.querySelector('#g-hide').disabled, null, { timeout: 3000 }) }
  catch (e) { console.log('DEBUG', trace, JSON.stringify(d.pos[cid]), await culprit.evaluate(() => JSON.stringify({ me: window.__wdi.me, c: window.__wdi.culprit, ph: window.__wdi.phase }))); throw e }
  await culprit.click('#g-hide')
  try { await culprit.waitForFunction(() => /隠した/.test(document.querySelector('#g-banner').textContent), null, { timeout: 4000 }) }
  catch (e) { console.log('DEBUG2', trace, d.content[trace], JSON.stringify(d.pos[cid]), await culprit.evaluate(() => JSON.stringify({ n: window.__wdi.notice, b: document.querySelector('#g-banner').textContent, me: window.__wdi.me }))); throw e }
  check(d.content[trace] === null, `犯人が画面から痕跡を隠せる（${trace}）`)
  const free = mansion.spots.find(s => !s.noClue && d.content[s.id] === null && s.id !== trace).id
  tp(cid, free)
  await culprit.waitForFunction(() => !document.querySelector('#g-plant').disabled, null, { timeout: 3000 })
  await culprit.click('#g-plant')
  await culprit.waitForSelector('.fake-opt')
  await shot('explore-fake', culprit)
  await culprit.click('.fake-opt')
  await culprit.waitForFunction(() => /偽の証拠/.test(document.querySelector('#g-banner').textContent), null, { timeout: 4000 })
  const fakeEid = d.content[free]
  check(!!fakeEid && d.ev[fakeEid].fake, `犯人が画面から偽の証拠を置ける（${free}）`)
  // 住人（か探偵）が偽物を見つけて貼る
  const finder = pageOf('resident') || pageOf('detective')
  const fid = await idOf(finder)
  tp(fid, free)
  const freeName = mansion.spots.find(s => s.id === free).name
  try { await finder.waitForFunction(n => !document.querySelector('#g-search').disabled && (document.querySelector('#g-search .s2')?.textContent || '').startsWith(n), freeName, { timeout: 6000 }) }
  catch (e) { console.log('DEBUG finder', free, JSON.stringify(d.pos[fid]), await finder.evaluate(() => JSON.stringify({ me: window.__wdi.me, s2: document.querySelector('#g-search').textContent }))); throw e }
  await finder.click('#g-search')
  await finder.waitForFunction(f => window.__wdi.notebook.some(e => e.eid && e.spot === f), free, { timeout: 4000 })
  await finder.click('#t-note')
  await finder.click(`[data-act="post"][data-eid="${fakeEid}"]`)
  await finder.waitForFunction(() => window.__wdi.board.length === 1)
  check(true, '手帳の証拠を掲示板に貼れる')
  check(!(await finder.evaluate(() => JSON.stringify(window.__wdi))).includes('fake'), '見つけた人の画面には偽物だという情報が届かない')
  await finder.click('[data-act="close"]')
  // 鑑識が掲示板の証拠を鑑定 → 偽物の判子
  const fp = pageOf('forensic')
  await fp.waitForFunction(() => window.__wdi.board.length === 1)
  await fp.click('#t-board')
  await fp.click('[data-act="analyze"]')
  try { await fp.waitForSelector('.stamp.fake', { timeout: 5000 }) }
  catch (e) { console.log('DEBUG3', await fp.evaluate(() => JSON.stringify({ a: window.__wdi.analyses, u: window.__wdi.forensicUses, b: window.__wdi.board, role: window.__wdi.role, kind: document.querySelector('#g-panel').dataset.kind, html: document.querySelector('#g-panel').innerHTML.slice(0, 600) }))); throw e }
  check(true, '鑑識が掲示板の証拠を鑑定すると「偽物」と出る')
  await shot('explore-board-forensic', fp)
  await fp.click('[data-act="close"]')
  const others = await host.evaluate(() => window.__wdi.others.map(o => Object.keys(o).sort().join()))
  check(others.every(k => k === 'busy,id,x,y'), `他人の情報は位置と busy だけ（${others.join(' | ')}）`)

  // 嵐で扉が閉まる（探索の 64%）まで時計を進める
  adv(E * 0.66 - elapsed())
  await host.waitForFunction(() => /扉/.test(document.querySelector('#g-ticker').textContent), null, { timeout: 3000 }).then(() => check(true, '嵐で扉が閉まると上の帯に出る'), () => check(false, '扉が閉まったことが出ない'))
  await shot('explore', host)
  await shot('explore-culprit', culprit)
  await host.click('#t-note')
  await host.waitForSelector('#g-panel:not([hidden]) .ev')
  await shot('explore-note', host)
  await host.click('[data-act="close"]')
  await host.click('#t-people')
  await shot('explore-people', host)
  await host.click('[data-act="close"]')

  // 全員「終える」→ 推理
  for (const p of pages) await p.click('#g-done')
  await host.waitForSelector('#g-ready')
  await host.waitForFunction(() => document.body.dataset.phase === 'discuss')
  check(true, '推理タイムに進む')
  await shot('discuss', host)
  await host.click('[data-act="tab"][data-tab="note"]')
  await host.click('[data-act="tab"][data-tab="people"]')
  for (const p of pages) await p.click('#g-ready')
  await host.waitForFunction(() => document.body.dataset.phase === 'vote')
  check(true, '投票に進む')
  await shot('vote', host)
  // 犯人以外は犯人に、犯人は先頭の人に投票
  for (const [i, p] of pages.entries()) {
    if (ids[i] === cid) await p.click('.vbtn')
    else await p.click(`.vbtn[data-id="${cid}"]`)
  }
  return { culpritId: cid, ids }
}
