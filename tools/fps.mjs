// 3D の fps を測る（GPU を使う headless Chromium）。スマホ相当（390x844・画素比3・タッチ）と横持ち（844x390）で、
// 3つのシナリオを4人で開始し、探索中に歩き回る画面（ホスト）を6秒ずつ測る。画質の段（2=高 1=中 0=低）も出す。
// 使い方: node tools/fps.mjs   ほかの重い処理が同時に走っていると下がるので、値は参考。空のページの fps も最初に測る
import { chromium } from 'playwright'
import { startServer } from '../server.mjs'
import { SCENARIOS } from '../public/scenarios/index.mjs'
const srv = await startServer({ port: 0, quiet: true })
const base = `http://localhost:${srv.port}`
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
{ // 基準: 何も描かないページの rAF の回数
  const p = await (await b.newContext()).newPage()
  await p.setContent('<p>idle</p>')
  const f = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const k = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(k); else r(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(k) }))
  console.log(`空のページ fps ${f.toFixed(1)}`)
  await p.context().close()
}
for (const [w, h] of [[390, 844], [844, 390]]) {
  for (const sc of SCENARIOS) {
    const ps = []
    for (let i = 0; i < 4; i++) ps.push(await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: i ? 1 : 3, isMobile: true, hasTouch: true, locale: 'ja-JP' })).newPage())
    const [hp] = ps
    await hp.goto(base); await hp.fill('#name', 'A'); await hp.click('#createBtn'); await hp.waitForSelector('#lobby:not([hidden])')
    for (let i = 0; i < 4 && await hp.getAttribute('#scenarioPick .pk-body', 'data-id') !== sc.id; i++) await hp.click('#scenarioPick .pk-btn[data-d="1"]')
    const inv = await hp.inputValue('#invite')
    for (const p of ps.slice(1)) { await p.goto(inv); await p.fill('#name', 'B'); await p.click('#joinBtn'); await p.waitForSelector('#lobby:not([hidden])') }
    await hp.click('#startBtn'); await hp.waitForSelector('#g-ready')
    for (const p of ps) await p.click('#g-ready')
    await hp.waitForSelector('#g-ctrl:not([hidden])')
    // 他の3人は裏で閉じた画面にする（測るのはホストの画面だけ）
    for (const p of ps.slice(1)) await p.evaluate(() => { document.querySelector('#game').hidden = true })
    const t0 = Date.now(); let k = 0
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']
    while (Date.now() - t0 < 6000) { const key = keys[k++ % keys.length]; await hp.keyboard.down(key); await hp.waitForTimeout(600); await hp.keyboard.up(key) }
    const r = await hp.evaluate(() => ({ fps: window.__wdiv.fps(), tier: window.__wdiv.tier() }))
    console.log(`${w}x${h} 画素比3 ${sc.id.padEnd(8)} fps ${r.fps.toFixed(1)} 画質 ${r.tier}`)
    for (const p of ps) await p.context().close()
  }
}
await b.close(); await srv.close()
