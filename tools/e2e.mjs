// 実ブラウザ（chromium と webkit）で4人つないで、作成→招待URLで参加→シナリオ選択（参加者にも見える）→開始→役割→探索（調べる・歩く・
// 犯人の隠す/偽装・掲示板・鑑定・停電・嵐）→推理→投票→結果→再戦 を通す。最後に8人でも最後まで遊ぶ。
// 各画面を 390x844 / 360x640 / 844x390 / 568x320 で撮り、はみ出し・ページの縦スクロール・44px 未満のボタンを数値で確かめる。
// 3D が描けているか（画素の分散）、WebGL が無いときの 2D（?2d）、起動エラーの誤表示が出ないことも見る。スクショは tools/shots/
// 使い方: node tools/e2e.mjs   （サーバーは自前で立てる）
import { chromium, webkit } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { startServer } from '../server.mjs'
import * as play from './e2e-play.mjs'

const SHOTS = new URL('./shots/', import.meta.url).pathname
await mkdir(SHOTS, { recursive: true })
const srv = await startServer({ port: 0, quiet: true })
const base = `http://localhost:${srv.port}`
const SIZES = [[390, 844], [360, 640], [844, 390], [568, 320]]
let fail = 0, total = 0
const check = (ok, label) => { total++; console.log(ok ? 'OK  ' : 'NG  ', label); if (!ok) fail++ }

// はみ出し検査: 見えている要素が画面の外に出ていないか、ページが縦に伸びていないか、押せる所が44px以上か
async function layoutProblems(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = []
    const de = document.documentElement
    if (Math.max(de.scrollHeight, document.body.scrollHeight) > H + 1) out.push(`ページが縦に伸びている ${de.scrollHeight}>${H}`)
    if (de.scrollWidth > W + 1) out.push(`ページが横に伸びている ${de.scrollWidth}>${W}`)
    for (const el of document.querySelectorAll('main *, .top *, .modal *')) {
      if (el.closest('[hidden]')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      if (el.closest('.scroll, .res-scroll, .labels, .res-fx, svg')) continue // 中だけスクロールする枠・3D の頭上の札・紙吹雪
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.bottom > H + 1 || r.right > W + 1 || r.left < -1 || r.top < -1) out.push(`はみ出し ${el.tagName}#${el.id}.${String(el.className).slice(0, 20)} ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`)
      if ((el.tagName === 'BUTTON' || el.tagName === 'SUMMARY' || el.tagName === 'INPUT') && r.height < 43.5) out.push(`小さいボタン ${el.id || el.textContent.trim().slice(0, 10)} ${Math.round(r.height)}px`)
    }
    // ボタンの上に別のものがかぶっていないか（真ん中を押したら、そのボタンに届くか）。開いた板の下になる操作ボタンは除く
    const modal = !document.querySelector('#howto').hidden
    for (const b of document.querySelectorAll('.card button, .g-tabs button, .g-hud button, .g-foot button, .sheet-h button, .dtabs button, .modal button')) {
      if (b.closest('[hidden]') || !b.offsetParent || (modal && !b.closest('.modal')) || b.closest('details:not([open]) > :not(summary)')) continue
      const r = b.getBoundingClientRect()
      if (!r.width) continue
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (top && top !== b && !b.contains(top) && !top.closest('.g-banner, .g-big, .toast, .res-fx')) out.push(`かぶり ${b.id || b.textContent.trim().slice(0, 8)} の上に ${top.tagName}.${String(top.className).slice(0, 16)}`)
    }
    return out.slice(0, 5)
  })
}

const GPU = { channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
async function launch(bname, bt, n, errors) {
  const browser = await bt.launch(bname === 'chromium' ? GPU : {})
  const pages = []
  for (let i = 0; i < n; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: bname === 'chromium' })
    const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => m.type() === 'error' && errors.push(m.text()))
    p.on('requestfailed', r => errors.push('requestfailed ' + r.url()))
    p.on('response', r => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`))
    pages.push(p)
  }
  return { browser, pages }
}
async function joinAll(pages, names) {
  const [host] = pages
  await host.goto(base)
  await host.fill('#name', names[0]); await host.click('#createBtn'); await host.waitForSelector('#lobby:not([hidden])')
  const invite = await host.inputValue('#invite')
  for (const [i, g] of pages.slice(1).entries()) {
    await g.goto(invite); await g.fill('#name', names[i + 1]); await g.click('#joinBtn'); await g.waitForSelector('#lobby:not([hidden])')
  }
  await host.waitForFunction(n => document.querySelectorAll('#players li').length === n, pages.length)
  return invite
}
async function choose(page, id) {
  for (let i = 0; i < 4; i++) {
    if (await page.getAttribute('#scenarioPick .pk-body', 'data-id') === id) return
    await page.click('#scenarioPick .pk-btn[data-d="1"]')
  }
  throw new Error(`シナリオ ${id} を選べない`)
}

// ONLY=webkit などで片方だけ、SKIP8=1 で8人の回を飛ばせる（直している途中の確認用）
for (const [bname, bt, SC] of [['chromium', chromium, 'mansion'], ['webkit', webkit, 'lodge']].filter(([n]) => !process.env.ONLY || process.env.ONLY === n)) {
  if (process.env.ONLY === '8') break
  const t0 = Date.now()
  const errors = []
  const { browser, pages } = await launch(bname, bt, 4, errors)
  const shot = async (name, page) => {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${SHOTS}${bname}-${name}-${w}x${h}.png` })
      const probs = await layoutProblems(page)
      check(probs.length === 0, `${bname}: ${name} ${w}x${h} 一画面に収まる ${probs.join(' / ')}`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
  }
  const [host, g1] = pages
  await host.goto(base)
  await host.waitForSelector('#home:not([hidden])')
  check((await host.title()).startsWith('犯人は誰だ'), `${bname}: タイトル（${await host.title()}）`)
  check(await host.isVisible('.logo-svg'), `${bname}: ロゴが出る`)
  await shot('home', host)
  await host.click('#howBtn'); await shot('howto', host); await host.click('#howClose')
  const invite = await joinAll(pages, ['ホスト', 'あきら', 'Bob', 'ながいなまえのひとです'])
  check(/\/r\/[A-Z0-9]{4}$/.test(invite), `${bname}: 招待URLが出る ${invite}`)
  check(await g1.isHidden('#scenarioPick .pk-btn'), `${bname}: シナリオを選べるのはホストだけ`)
  await choose(host, SC)
  await g1.waitForFunction(c => document.querySelector('#scenarioPick .pk-body')?.dataset.id === c, SC, { timeout: 3000 }).then(() => check(true, `${bname}: ホストが選んだシナリオ（${SC}）が参加者にも見える`), () => check(false, `${bname}: 参加者にシナリオが届かない`))
  await shot('lobby', host)
  await shot('lobby-guest', g1)
  await host.click('#startBtn')
  for (const g of pages) await g.waitForSelector('#game:not([hidden])')
  check(await host.evaluate(() => window.__wdi.scenario) === SC, `${bname}: 選んだシナリオで始まる`)
  await host.waitForTimeout(800)
  check(await host.evaluate(() => window.__wdiv.mode()) === '3d', `${bname}: 3D で描いている`)
  const v0 = await host.evaluate(() => window.__wdiv.variance())
  check(v0 > 150, `${bname}: 役割の確認で 3D の現場が描けている（画素の分散 ${Math.round(v0)}）`)
  const r = await play.playToEnd(pages, { shot, srv, check: (ok, l) => check(ok, `${bname}: ${l}`) })
  for (const g of pages) await g.waitForSelector('#result:not([hidden])', { timeout: 20000 })
  check(/事件解決/.test(await host.textContent('#resultTitle')), `${bname}: 犯人に票が集まると事件解決（${await host.textContent('#resultTitle')}）`)
  const head = await host.textContent('#resultHead')
  const cname = await host.textContent('.res-culprit b')
  check(head.includes(cname) && cname.length > 0, `${bname}: 号外の見出しに犯人の名前（${head}）`)
  check(await host.textContent('.big-stamp') === '逮捕', `${bname}: 逮捕のハンコ`)
  check(await host.locator('.aw').count() === 4, `${bname}: 4人全員に称号`)
  check(/1\s*回/.test(await host.textContent('.recs')), `${bname}: この端末の記録が増える（${(await host.textContent('.recs')).replace(/\s+/g, ' ')}）`)
  await host.waitForTimeout(2200) // 見出しとハンコの演出が終わってから撮る
  await shot('result', host)
  const ci = r.ids.indexOf(r.culpritId)
  await shot('result-culprit', pages[ci])
  check(/あなたの負け/.test(await pages[ci].textContent('.res-you')), `${bname}: 犯人の画面は「あなたの負け」`)
  check(await g1.isHidden('#rematchBtn'), `${bname}: 再戦ボタンはホストだけ`)
  await host.click('#rematchBtn')
  for (const g of pages) await g.waitForSelector('#game:not([hidden])')
  await host.waitForFunction(() => document.body.dataset.phase === 'intro')
  check(true, `${bname}: 再戦できる（役割の確認から始まる）`)
  await host.waitForTimeout(800)
  const v1 = await host.evaluate(() => window.__wdiv.variance())
  check(v1 > 150, `${bname}: 再戦でも 3D が描けている（画素の分散 ${Math.round(v1)}）`)
  const fps = await host.evaluate(() => window.__wdiv.fps())
  console.log(`     ${bname}: fps ${fps.toFixed(1)}（headless・4画面同時の参考値。スマホ相当は tools/fps.mjs）`)
  // WebGL が使えない端末の代わりに ?2d で開く: 2D の地図に戻る
  {
    const p = pages[3]
    await p.goto(base + '/?2d')
    await p.waitForSelector('#game:not([hidden])', { timeout: 10000 })
    await p.waitForTimeout(500)
    check(await p.evaluate(() => window.__wdiv.mode()) === '2d', `${bname}: ?2d では 2D の描画に戻る（つなぎ直しても同じ席に戻る）`)
    for (const q of pages) await q.click('#g-ready').catch(() => {})
    await p.waitForSelector('#g-ctrl:not([hidden])', { timeout: 10000 })
    await p.waitForTimeout(500)
    const lum = await p.evaluate(() => { const c = document.querySelector('#g-cv'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let s1 = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s1 += l; s2 += l * l; n++ } return s2 / n - (s1 / n) ** 2 })
    check(lum > 150, `${bname}: 2D の地図が描けている（画素の分散 ${Math.round(lum)}）`)
    await shot('explore-2d', p)
  }
  // 起動エラーの見張り（8秒/20秒）が、正常に起動した画面で誤って出ない
  const wait = 21000 - (Date.now() - t0); if (wait > 0) await host.waitForTimeout(wait)
  check((await Promise.all(pages.map(p => p.isHidden('#bootErr')))).every(Boolean), `${bname}: 20秒たっても起動エラーの表示は出ない`)
  check(errors.length === 0, `${bname}: コンソールエラー0件 ${errors.slice(0, 3).join(' / ')}`)
  await browser.close()
}

// 8人（最大人数）: ロビー・役割・探索・推理・投票・結果が収まるか。船のシナリオで最後まで
if (!process.env.SKIP8) {
  const errors = []
  const { browser, pages } = await launch('webkit', webkit, 8, errors)
  const [host] = pages
  await joinAll(pages, ['ホスト', ...Array.from({ length: 7 }, (_, i) => 'なかまのなまえ' + (i + 1))])
  check(true, 'webkit 8人: ロビーにそろう')
  const fit = async name => { for (const [w, h] of SIZES) { await host.setViewportSize({ width: w, height: h }); await host.waitForTimeout(300); await host.screenshot({ path: `${SHOTS}webkit8-${name}-${w}x${h}.png` }); const pr = await layoutProblems(host); check(pr.length === 0, `webkit 8人: ${name} ${w}x${h} 収まる ${pr.join(' / ')}`) } await host.setViewportSize({ width: 390, height: 844 }) }
  await fit('lobby')
  await choose(host, 'ship')
  await host.click('#startBtn')
  await host.waitForSelector('#g-ready')
  const roles = await Promise.all(pages.map(p => p.evaluate(() => window.__wdi.role)))
  check(['culprit', 'detective', 'forensic', 'witness'].every(r => roles.filter(x => x === r).length === 1) && roles.filter(x => x === 'resident').length === 4, `webkit 8人: 役割の配り方（${roles.join(',')}）`)
  for (const p of pages) await p.click('#g-ready')
  await host.waitForSelector('#g-ctrl:not([hidden])')
  await fit('explore')
  for (const p of pages) await p.click('#g-done')
  await host.waitForFunction(() => document.body.dataset.phase === 'discuss')
  await fit('discuss')
  for (const p of pages) await p.click('#g-ready')
  await host.waitForFunction(() => document.body.dataset.phase === 'vote')
  // 票を割る（2人ずつ4人に）→ 同票で犯人の逃げ切り
  const ids = await Promise.all(pages.map(p => p.evaluate(() => window.__wdiYou)))
  for (const [i, p] of pages.entries()) await p.click(`.vbtn[data-id="${ids[(Math.floor(i / 2) * 2 + 2) % 8]}"]`)
  await host.waitForSelector('#result:not([hidden])', { timeout: 20000 })
  check(/逃げ切り/.test(await host.textContent('#resultTitle')), `webkit 8人: 同票だと犯人の逃げ切り（${await host.textContent('#resultHead')}）`)
  await host.waitForTimeout(2200)
  await fit('result')
  check(errors.length === 0, `webkit 8人: コンソールエラー0件 ${errors.slice(0, 3).join(' / ')}`)
  await browser.close()
}

await srv.close()
console.log(fail ? `NG ${fail}/${total}件` : `すべてOK（${total}項目）`)
process.exit(fail ? 1 : 0)
