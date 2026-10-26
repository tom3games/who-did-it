// 公開中のサーバーに、chromium と webkit から1人ずつ（計4人。最低人数が4なので各ブラウザ2人）つないで動くかを見る。
// OGP（og:image が絶対URL・画像が取れる）と、20秒たっても起動エラーの表示が出ないことも確かめる。
// 使い方: BASE=https://xxxx.trycloudflare.com node tools/live-check.mjs   （BASE を省くと http://localhost:8102）
import { chromium, webkit } from 'playwright'
const BASE = (process.env.BASE || 'http://localhost:8102').replace(/\/$/, '')
let fail = 0
const check = (ok, l) => { console.log(ok ? 'OK  ' : 'NG  ', l); if (!ok) fail++ }
const html = await (await fetch(BASE + '/')).text()
const og = html.match(/property="og:image" content="([^"]+)"/)?.[1]
check(/^https?:\/\//.test(og || ''), `og:image が絶対URL（${og}）`)
const img = await fetch(og)
const buf = Buffer.from(await img.arrayBuffer())
check(img.ok && img.headers.get('content-type') === 'image/png' && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630, `og.png が取れる（${img.status} ${img.headers.get('content-type')} ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}）`)
const errors = []
const bs = [await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }), await webkit.launch()]
const pages = []
for (const b of bs) for (let i = 0; i < 2; i++) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true })).newPage()
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()))
  pages.push(p)
}
const t0 = Date.now()
const [h] = pages
await h.goto(BASE); await h.fill('#name', 'live1'); await h.click('#createBtn'); await h.waitForSelector('#lobby:not([hidden])', { timeout: 20000 })
const inv = await h.inputValue('#invite')
check(inv.startsWith(BASE), `招待URLが公開URL（${inv}）`)
for (const [i, p] of pages.slice(1).entries()) { await p.goto(inv); await p.fill('#name', 'live' + (i + 2)); await p.click('#joinBtn'); await p.waitForSelector('#lobby:not([hidden])', { timeout: 20000 }) }
await h.click('#startBtn')
for (const p of pages) await p.waitForFunction(() => ['intro', 'explore'].includes(window.__wdi?.phase), null, { timeout: 30000 })
check(true, 'chromium 2人・webkit 2人で始まる')
for (const p of pages) if (await p.evaluate(() => window.__wdi.phase === 'intro')) await p.click('#g-ready', { timeout: 5000 }).catch(() => {}) // 重い環境では役割の確認（15秒）が先に終わることがある
for (const p of pages) await p.waitForSelector('#g-ctrl:not([hidden])', { timeout: 20000 })
const modes = await Promise.all(pages.map(p => p.evaluate(() => window.__wdiv.mode())))
check(modes.every(m => m === '3d'), `全員 3D（${modes}）`)
const w = pages[2]
const y0 = await w.evaluate(() => window.__wdi.me.y)
await w.keyboard.down('ArrowUp'); await w.waitForTimeout(600); await w.keyboard.up('ArrowUp'); await w.waitForTimeout(500)
const y1 = await w.evaluate(() => window.__wdi.me.y)
check(y1 < y0 - 0.3 || y1 === y0, `webkit から歩く操作が届く（y ${y0} → ${y1}${y1 === y0 ? '・壁' : ''}）`)
for (const p of pages) await p.click('#g-done')
await h.waitForFunction(() => document.body.dataset.phase === 'discuss', null, { timeout: 20000 })
for (const p of pages) await p.click('#g-ready')
for (const p of pages) await p.waitForFunction(() => document.body.dataset.phase === 'vote', null, { timeout: 20000 })
for (const p of pages) await p.click('.vbtn')
for (const p of pages) await p.waitForSelector('#result:not([hidden])', { timeout: 20000 })
check(true, `最後まで遊べて結果が出る（${await w.textContent('#resultHead')}）`)
const wait = 21000 - (Date.now() - t0); if (wait > 0) await h.waitForTimeout(wait)
check((await Promise.all(pages.map(p => p.isHidden('#bootErr')))).every(Boolean), '20秒たっても起動エラーの表示は出ない')
check(errors.length === 0, `コンソールエラー0件 ${errors.slice(0, 3).join(' / ')}`)
for (const b of bs) await b.close()
console.log(fail ? `NG ${fail}件` : 'すべてOK')
process.exit(fail ? 1 : 0)
