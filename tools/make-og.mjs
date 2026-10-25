// OGP 画像（public/og.png, 1200x630）を作る。屋敷の地図はシナリオのデータから SVG で描く。
// 使い方: node tools/make-og.mjs
import { chromium } from 'playwright'
import mansion from '../public/scenarios/mansion.mjs'

const T = 30
const FLOOR = { S: '#634a35', B: '#4e3d58', H: '#6e3b33', D: '#5d4731', K: '#4a504f', E: '#524b42', G: '#3a5640' }
let tiles = ''
mansion.map.forEach((row, y) => [...row].forEach((c, x) => {
  const fill = c === '#' ? '#141015' : c === '+' ? '#8a6a3c' : FLOOR[c]
  tiles += `<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}" fill="${fill}"/>`
}))
for (const s of mansion.spots) tiles += `<circle cx="${(s.x + 0.5) * T}" cy="${(s.y + 0.5) * T}" r="7" fill="${s.id === 'body' ? '#b02a2a' : '#e8b04a'}" opacity=".9"/>`
const people = [[2.5, 5.5, '#ff7b72'], [7.5, 9.5, '#5aa9ff'], [3.5, 13.5, '#5fd39a'], [8.5, 2.5, '#c38bff']]
for (const [x, y, c] of people) tiles += `<circle cx="${x * T}" cy="${y * T}" r="10" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width="2"/>`
const W = mansion.map[0].length * T, H = mansion.map.length * T

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#17131a;font-family:"Hiragino Sans",sans-serif;color:#f3ece4;
background-image:radial-gradient(ellipse at 30% 40%,transparent 30%,rgba(0,0,0,.6) 100%),repeating-linear-gradient(90deg,rgba(232,176,74,.05) 0 2px,transparent 2px 28px)}
.wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 70px;gap:60px}
.txt{flex:1}
h1{font-family:"Hiragino Mincho ProN",serif;font-size:104px;margin:0;color:#e8b04a;letter-spacing:.04em;line-height:1.1}
p{font-size:34px;margin:22px 0 0;line-height:1.5;color:#e6d9cb}
.tag{display:inline-block;margin-top:30px;font-size:28px;font-weight:800;padding:10px 22px;border:3px solid #e8b04a;border-radius:99px;color:#e8b04a}
.map{position:relative;transform:rotate(3deg);box-shadow:0 20px 60px rgba(0,0,0,.7)}
.lens{position:absolute;left:-70px;top:250px}
</style></head><body><div class="wrap">
<div class="txt"><h1>犯人は<br>誰だ？</h1><p>屋敷を歩いて証拠を探し、<br>仲間の中の犯人を当てる。</p><span class="tag">4〜8人・5分・スマホで遊べる</span></div>
<div class="map"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${tiles}</svg>
<svg class="lens" width="200" height="200" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="rgba(255,240,200,.12)" stroke="#f3ece4" stroke-width="1.6"/><path d="M14.5 14.5l6 6" stroke="#e8b04a" stroke-width="2.6" stroke-linecap="round"/></svg></div>
</div></body></html>`

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
await p.setContent(html)
await p.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
await b.close()
console.log('public/og.png を作りました')
