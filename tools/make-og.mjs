// OGP 画像（public/og.png, 1200x630）を作る。使い方: node tools/make-og.mjs
// 1) サーバーを立てて4人で屋敷の探索を始め、4人を廊下に並べた 3D の画面だけを撮る（HUD は隠す）
// 2) その上に題字のロゴ（art.js の LOGO）と一言を重ねる
import { chromium } from 'playwright'
import { startServer } from '../server.mjs'
import { LOGO } from '../public/art.js'

const OUT = new URL('../public/og.png', import.meta.url).pathname
const srv = await startServer({ port: 0, quiet: true })
const base = `http://localhost:${srv.port}`
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const pages = []
// ホストの画面は横 1400 で撮り、左の 1200 を使う（ホストが右寄り、その右に3人が並ぶ）
for (let i = 0; i < 4; i++) pages.push(await (await b.newContext({ viewport: i ? { width: 390, height: 844 } : { width: 1400, height: 630 }, deviceScaleFactor: i ? 1 : 2, locale: 'ja-JP' })).newPage())
const [h] = pages
await h.goto(base); await h.fill('#name', 'たろう'); await h.click('#createBtn'); await h.waitForSelector('#lobby:not([hidden])')
const inv = await h.inputValue('#invite')
for (const [i, nm] of [[1, 'はなこ'], [2, 'けんた'], [3, 'みお']]) { await pages[i].goto(inv); await pages[i].fill('#name', nm); await pages[i].click('#joinBtn'); await pages[i].waitForSelector('#lobby:not([hidden])') }
await h.click('#startBtn'); await h.waitForSelector('#g-ready')
for (const p of pages) await p.click('#g-ready')
await h.waitForSelector('#g-ctrl:not([hidden])')
const room = [...srv.rooms.rooms.values()][0]
const d = room.game._debug
const ids = await Promise.all(pages.map(p => p.evaluate(() => window.__wdiYou)))
const at = [[3.4, 5.7], [4.4, 6.3], [5.4, 5.6], [6.3, 6.3]]
ids.forEach((id, i) => Object.assign(d.pos[id], { x: at[i][0], y: at[i][1], room: 'H', dx: 0, dy: 0, busy: null }))
await h.waitForTimeout(2500) // 歩き終えてこちらを向くまで
await h.addStyleTag({ content: '.g-hud,.g-ctrl,.g-tabs,.g-ticker,.g-mini,.g-banner,.g-big,.labels,.vignette,#quitBtn{display:none!important}' })
await h.waitForTimeout(300)
const shot = await h.locator('#g-view').screenshot()
const bg = 'data:image/png;base64,' + shot.toString('base64')
const og = await (await b.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await og.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@900&display=swap"><style>
  body{margin:0;width:1200px;height:630px;position:relative;overflow:hidden;font-family:"M PLUS Rounded 1c",sans-serif;background:#1b1630}
  .bg{position:absolute;left:0;top:0;width:1400px;height:630px;object-fit:cover}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(18,12,34,.82) 0,rgba(18,12,34,.55) 36%,rgba(18,12,34,0) 56%),radial-gradient(ellipse at 70% 60%,transparent 50%,rgba(10,6,20,.6) 100%)}
  .logo{position:absolute;left:10px;top:40px;width:560px;filter:drop-shadow(0 8px 0 rgba(0,0,0,.35))}
  .logo svg{width:100%;height:auto}
  .hand{position:absolute;margin:0;font-weight:900;color:#fff;font-size:34px;line-height:1.3;transform:rotate(-3deg);text-shadow:3px 0 0 #1d1530,-3px 0 0 #1d1530,0 3px 0 #1d1530,0 -3px 0 #1d1530,2px 2px 0 #1d1530,-2px 2px 0 #1d1530,2px -2px 0 #1d1530,-2px -2px 0 #1d1530}
  .tag{position:absolute;left:44px;bottom:40px;font-family:"Dela Gothic One",sans-serif;font-size:30px;color:#1d1530;background:#ffc94a;border:4px solid #1d1530;border-radius:16px;padding:8px 22px;box-shadow:0 6px 0 #1d1530}
</style></head><body><img class="bg" src="${bg}"><div class="shade"></div><div class="logo">${LOGO}</div>
<p class="hand" style="left:60px;top:362px">仲間の中に犯人がいる！<br><span style="color:#ffc94a">証拠は隠され、偽物もまざる。</span></p>
<span class="tag">4〜8人・スマホで遊べる</span></body></html>`)
await og.waitForLoadState('networkidle').catch(() => {})
await og.evaluate(() => document.fonts.ready)
await og.waitForTimeout(300)
await og.screenshot({ path: OUT })
await b.close(); await srv.close()
console.log('public/og.png')
