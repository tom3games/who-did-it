// 『犯人は誰だ？』を実ブラウザで最後まで遊ぶ手順。pages[0] がホスト。shot(name, page) で各サイズのスクショと見切れ検査をする。
export async function playToEnd(pages, { shot, check, srv }) {
  const [host] = pages
  // 役割の確認
  await host.waitForSelector('#g-ready')
  await shot('intro', host)
  // 犯人の画面も撮る
  const roles = await Promise.all(pages.map(p => p.textContent('#g-role')))
  check(roles.filter(r => r === '犯人').length === 1, `犯人はちょうど1人（${roles.join(',')}）`)
  const culprit = pages[roles.indexOf('犯人')]
  await shot('intro-culprit', culprit)
  for (const p of pages) await p.click('#g-ready')
  await host.waitForSelector('#g-ctrl:not([hidden])')
  check(true, '探索が始まる')

  // ホストは玄関の傘立ての上から始まる → 調べる
  await host.waitForFunction(() => !document.querySelector('#g-search').disabled)
  await host.click('#g-search')
  await host.waitForFunction(() => /手帳 1/.test(document.querySelector('#t-note').textContent), null, { timeout: 5000 })
  check(true, '家具を調べると手帳に1件入る')

  // キーボードで右へ歩く → 位置が変わる
  const x0 = await host.evaluate(() => window.__wdi?.me?.x)
  await host.keyboard.down('ArrowRight'); await host.waitForTimeout(500); await host.keyboard.up('ArrowRight')
  await host.waitForTimeout(300)
  const x1 = await host.evaluate(() => window.__wdi?.me?.x)
  check(x1 > x0 + 0.5, `キーボードで歩ける ${x0} → ${x1}`)

  // 2人目は移動パッドで上へ（食堂へ）
  const g = pages[1]
  const pad = await g.$('#g-joy'); const box = await pad.boundingBox()
  await g.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await g.mouse.down(); await g.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 3 })
  await g.waitForTimeout(700); await g.mouse.up()
  await g.waitForTimeout(300)
  const y1 = await g.evaluate(() => window.__wdi?.me?.y)
  check(y1 < 12.2, `移動パッドで歩ける y=${y1}`)

  // ---- 犯人の秘密行動・掲示板・鑑定を画面から操作する（位置だけはテスト用にサーバー側で動かす）
  const idOf = async p => p.evaluate(() => window.__wdiYou)
  const ids = await Promise.all(pages.map(idOf))
  const room = [...srv.rooms.rooms.values()].find(r => r.phase === 'playing' && r.players.some(p => p.id === ids[0]))
  const d = room.game._debug
  const mansion = (await import('../public/scenarios/mansion.mjs')).default
  const pageOf = role => pages[ids.findIndex(id => d.roleOf[id] === role)]
  const tp = (id, spotId) => { const s = mansion.spots.find(x => x.id === spotId); Object.assign(d.pos[id], { x: s.x + 0.5, y: s.y + 0.5, room: mansion.map[s.y][s.x], dx: 0, dy: 0 }) }
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
  await finder.waitForFunction(n => !document.querySelector('#g-search').disabled && document.querySelector('#g-search .s2')?.textContent === n, freeName)
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
  // 全員、自分以外の先頭の人に投票
  for (const p of pages) await p.click('.vbtn')
}
