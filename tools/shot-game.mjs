// ゲーム中の各場面（役割・探索・停電・手帳・推理・投票・結果）を4サイズで撮る（見た目の確認用）。tools/shots/game-*.png
// 使い方: node tools/shot-game.mjs [シナリオ]   GPU を使う headless Chromium で4人つなぐ。サーバーの時計を進めて停電と嵐も撮る
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { startServer } from '../server.mjs'
const SHOTS = new URL('./shots/', import.meta.url).pathname
await mkdir(SHOTS, { recursive: true })
const SC = process.argv[2] || 'mansion'
const SIZES = [[390, 844], [360, 640], [844, 390], [568, 320]]
const srv = await startServer({ port: 0, quiet: true })
const base = `http://localhost:${srv.port}`
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const errs = []
const pages = []
for (let i = 0; i < 4; i++) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', hasTouch: true, isMobile: true })).newPage()
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  pages.push(p)
}
const [h] = pages
const shot = async (name, p = h) => { for (const [w, hh] of SIZES) { await p.setViewportSize({ width: w, height: hh }); await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}game-${SC}-${name}-${w}x${hh}.png` }) } await p.setViewportSize({ width: 390, height: 844 }) }
await h.goto(base); await h.fill('#name', 'たろう'); await h.click('#createBtn'); await h.waitForSelector('#lobby:not([hidden])')
for (let i = 0; i < 4 && await h.getAttribute('#scenarioPick .pk-body', 'data-id') !== SC; i++) await h.click('#scenarioPick .pk-btn[data-d="1"]')
const inv = await h.inputValue('#invite')
for (const [i, nm] of [[1, 'はなこ'], [2, 'けんた'], [3, 'とても長い名前のひと']]) { await pages[i].goto(inv); await pages[i].fill('#name', nm); await pages[i].click('#joinBtn'); await pages[i].waitForSelector('#lobby:not([hidden])') }
await h.click('#startBtn')
await h.waitForSelector('#g-ready'); await h.waitForTimeout(1200)
const roles = await Promise.all(pages.map(p => p.evaluate(() => window.__wdi.role)))
const cul = pages[roles.indexOf('culprit')]
await shot('intro'); await shot('intro-culprit', cul)
for (const p of pages) await p.click('#g-ready')
await h.waitForSelector('#g-ctrl:not([hidden])')
await h.keyboard.down('ArrowUp'); await h.waitForTimeout(700); await h.keyboard.up('ArrowUp')
await h.waitForTimeout(1500)
await shot('explore')
await shot('explore-culprit', cul)
await h.click('#t-note'); await shot('note'); await h.click('[data-act="close"]')
await h.click('#t-people'); await shot('people'); await h.click('[data-act="close"]')
// 時計を進めて停電・嵐
const room = [...srv.rooms.rooms.values()][0]
const adv = s => { for (let t = 0; t < s; t += 0.1) room.game.tick(0.1) }
const E = room.game.view(Object.keys(room.game._debug.pos)[0]).explore
adv(E * 0.23); await h.waitForTimeout(400); await shot('dark')
adv(E * 0.42); await h.waitForTimeout(3000); await shot('storm')
await h.click('#g-zoom'); await h.waitForTimeout(1200); await shot('zoom'); await h.click('#g-zoom')
for (const p of pages) await p.click('#g-done')
await h.waitForFunction(() => document.body.dataset.phase === 'discuss'); await h.waitForTimeout(1200)
await shot('discuss')
for (const p of pages) await p.click('#g-ready')
await h.waitForFunction(() => document.body.dataset.phase === 'vote'); await h.waitForTimeout(800)
await h.click('.vbtn'); await h.waitForTimeout(500)
await shot('vote')
for (const p of pages.slice(1)) await p.click('.vbtn')
await h.waitForSelector('#result:not([hidden])'); await h.waitForTimeout(2600)
await shot('result'); await shot('result-culprit', cul)
console.log('errors', errs.length, errs.slice(0, 5))
await b.close(); await srv.close()
