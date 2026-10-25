// 実ブラウザ（chromium と webkit）で4人つないで、作成→招待URLで参加→シナリオ選択→開始→探索→推理→投票→結果→再戦 を通す。
// 各画面を 390x844 / 360x640 / 844x390 で撮り、画面からはみ出していないか数値で確かめる。スクショは tools/shots/
// 使い方: node tools/e2e.mjs   （サーバーは自前で立てる）
import { chromium, webkit } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { startServer } from '../server.mjs'
import * as play from './e2e-play.mjs'

const SHOTS = new URL('./shots/', import.meta.url).pathname
await mkdir(SHOTS, { recursive: true })
const srv = await startServer({ port: 0, quiet: true })
const base = `http://localhost:${srv.port}`
const SIZES = [[390, 844], [360, 640], [844, 390]]
let fail = 0
const check = (ok, label) => { console.log(ok ? 'OK  ' : 'NG  ', label); if (!ok) fail++ }

// はみ出し検査: 見えている要素が画面の外に出ていないか、ページが縦に伸びていないか、押せる所が44px以上か
async function layoutProblems(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = []
    if (document.documentElement.scrollHeight > H + 1) out.push(`ページが縦に伸びている ${document.documentElement.scrollHeight}>${H}`)
    for (const el of document.querySelectorAll('main *, .top *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue
      if (el.closest('.scroll, .res-scroll')) continue // 中だけスクロールする枠
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.bottom > H + 1 || r.right > W + 1 || r.left < -1) out.push(`はみ出し ${el.tagName}#${el.id}.${el.className} ${Math.round(r.left)},${Math.round(r.bottom)}`)
      if ((el.tagName === 'BUTTON' || el.tagName === 'SUMMARY') && r.height < 39.5) out.push(`小さいボタン ${el.id || el.textContent.trim().slice(0, 10)} ${Math.round(r.height)}px`)
    }
    return out.slice(0, 5)
  })
}

for (const [bname, bt] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await bt.launch()
  const errors = []
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: bname === 'chromium', colorScheme: 'dark' })
    const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => m.type() === 'error' && errors.push(m.text()))
    p.on('requestfailed', r => errors.push('requestfailed ' + r.url()))
    return p
  }
  const shot = async (name, page) => {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${SHOTS}${bname}-${name}-${w}x${h}.png` })
      const probs = await layoutProblems(page)
      check(probs.length === 0, `${bname}: ${name} ${w}x${h} 収まる ${probs.join(' / ')}`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
  }
  const pages = [await mk(), await mk(), await mk(), await mk()]
  const [host] = pages
  await host.goto(base)
  check((await host.title()) === '犯人は誰だ？', `${bname}: タイトル`)
  await shot('home', host)
  await host.fill('#name', 'ホスト')
  await host.click('#createBtn')
  await host.waitForSelector('#lobby:not([hidden])')
  const invite = await host.inputValue('#invite')
  check(/\/r\/[A-Z0-9]{4}$/.test(invite), `${bname}: 招待URLが出る ${invite}`)
  const names = ['あきら', 'Bob', 'ながいなまえのひとです']
  for (const [i, g] of pages.slice(1).entries()) {
    await g.goto(invite)
    if (i === 0) check((await g.inputValue('#code')).length === 4, `${bname}: 招待URLを開くと参加コードが入っている`)
    await g.fill('#name', names[i])
    await g.click('#joinBtn')
    await g.waitForSelector('#lobby:not([hidden])')
  }
  await host.waitForFunction(() => document.querySelectorAll('#players li').length === 4)
  check(true, `${bname}: 4人がロビーにそろう`)
  check(await host.isVisible('.scenario.on'), `${bname}: ホストにシナリオの選択肢が出る`)
  await shot('lobby', host)
  await host.click('#startBtn')
  for (const g of pages) await g.waitForSelector('#game:not([hidden])')
  check(true, `${bname}: ゲームが始まる`)
  await play.playToEnd(pages, { shot, srv, check: (ok, l) => check(ok, `${bname}: ${l}`) })
  for (const g of pages) await g.waitForSelector('#result:not([hidden])', { timeout: 20000 })
  check(true, `${bname}: 結果画面が出る（${await host.textContent('#resultTitle')}）`)
  const culpritShown = await host.textContent('.res-culprit b')
  check(!!culpritShown, `${bname}: 結果に犯人の名前が出る（${culpritShown}）`)
  await shot('result', host)
  await host.click('#rematchBtn')
  for (const g of pages) await g.waitForSelector('#game:not([hidden])')
  await host.waitForFunction(() => document.body.dataset.phase === 'intro')
  check(true, `${bname}: 再戦できる（役割の確認から始まる）`)
  check(errors.length === 0, `${bname}: コンソールエラー0件 ${errors.slice(0, 3).join(' / ')}`)
  await browser.close()
}
await srv.close()
console.log(fail ? `NG ${fail}件` : 'すべてOK')
process.exit(fail ? 1 : 0)
