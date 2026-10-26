// ゲーム中の 3D 描画（Three.js）。動きと秘密の判定はサーバーがするので、ここは届いたものを立体で見せるだけ。
// 地図の1マス = 1 単位。マス (x, y) は 3D の (x, 0, y)。カメラは南（手前）の斜め上から北を見下ろす向きで固定なので、
// スティックの上 = 画面の奥 = 地図の上、がいつも一致する。自分より手前の壁は低くして、自分と部屋の中が隠れないようにする。
// 自分の部屋以外は暗い（そこにいる人はサーバーから届かない）。停電中は手元のランタンだけになる。
import * as THREE from './vendor/three.module.js'
import { COLORS } from './art.js'

const WALL_H = 1.25, LOW_H = 0.2
const INK = 0x1d1530
const THEMES = {
  mansion: { bg: 0x1b1630, fog: 0x1b1630, hemiSky: 0x8f8cc8, hemiGround: 0x2a2030, moon: 0xaab8ff, wall: 0xb98f6a, wallpaper: '#8c5a4a', stripe: '#7a4a3d', cap: 0x3d2a24, ground: 0x1f3324, room: 0xffc98a },
  ship: { bg: 0x101a33, fog: 0x101a33, hemiSky: 0x8fb0e0, hemiGround: 0x1a2440, moon: 0xb8ccff, wall: 0xe8e2d4, wallpaper: '#e8e2d4', stripe: '#d6cfbf', cap: 0x23305e, ground: 0x0e2a4a, room: 0xffd9a0 },
  lodge: { bg: 0x23304a, fog: 0x2b3a58, hemiSky: 0xbcd0ff, hemiGround: 0x3a3a48, moon: 0xd6e2ff, wall: 0x9a6438, wallpaper: '#9a6438', stripe: '#87552e', cap: 0x5a3a22, ground: 0xdfe8f5, room: 0xffc27a }
}
const SHOE = { boots: 0x3f6b3a, snowboot: 0x6b4a2b, leather: 0x1c1c22, sneaker: 0xf4f1ea, heel: 0xd3312c, slipper: 0xffb3c7 }
const TALL_SHOE = new Set(['boots', 'snowboot'])

const matCache = new Map()
const lam = c => { let m = matCache.get('l' + c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); matCache.set('l' + c, m) } return m }
let gradTex = null
function toon(c) {
  if (!gradTex) {
    gradTex = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
    gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true
  }
  let m = matCache.get('t' + c); if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradTex }); matCache.set('t' + c, m) } return m
}
const INKMAT = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
function outline(mesh, k = 1.07) { const o = new THREE.Mesh(mesh.geometry, INKMAT); o.scale.setScalar(k); mesh.add(o); return o }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------- 顔（表情ごとに1枚の絵）
function faceTexture(kind) {
  return canvasTex(128, 128, g => {
    g.strokeStyle = '#1b130d'; g.fillStyle = '#1b130d'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'
    const eye = (x, y, r = 9) => { g.fillStyle = '#1b130d'; g.beginPath(); g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 2, y - 3, r * 0.3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1b130d' }
    if (kind === 'happy') {
      g.beginPath(); g.arc(42, 60, 11, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
      g.beginPath(); g.arc(86, 60, 11, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
      g.fillStyle = '#7a1d1d'; g.beginPath(); g.arc(64, 78, 18, 0, Math.PI); g.closePath(); g.fill(); g.stroke()
    } else if (kind === 'shock') {
      g.lineWidth = 5; g.fillStyle = '#fff'
      for (const x of [42, 86]) { g.beginPath(); g.arc(x, 56, 13, 0, Math.PI * 2); g.fill(); g.stroke() }
      g.fillStyle = '#1b130d'; g.beginPath(); g.arc(42, 56, 4.5, 0, Math.PI * 2); g.arc(86, 56, 4.5, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#7a1d1d'; g.beginPath(); g.ellipse(64, 94, 11, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    } else if (kind === 'search') { // 目をこらす（片目を細めて口をとがらせる）
      g.beginPath(); g.moveTo(30, 58); g.lineTo(54, 58); g.stroke()
      eye(86, 58, 11)
      g.lineWidth = 6; g.beginPath(); g.moveTo(74, 40); g.lineTo(98, 44); g.stroke()
      g.beginPath(); g.ellipse(66, 88, 7, 6, 0, 0, Math.PI * 2); g.stroke()
    } else if (kind === 'worry') {
      eye(44, 62); eye(84, 62)
      g.beginPath(); g.moveTo(30, 46); g.lineTo(52, 40); g.moveTo(98, 46); g.lineTo(76, 40); g.stroke()
      g.beginPath(); g.moveTo(48, 96); g.quadraticCurveTo(56, 88, 64, 96); g.quadraticCurveTo(72, 104, 80, 96); g.stroke()
      g.fillStyle = '#7fd3ff'; g.beginPath(); g.moveTo(108, 26); g.quadraticCurveTo(122, 48, 108, 54); g.quadraticCurveTo(94, 48, 108, 26); g.fill()
    } else if (kind === 'think') {
      eye(44, 60); eye(84, 60)
      g.beginPath(); g.moveTo(30, 42); g.lineTo(54, 38); g.moveTo(76, 36); g.lineTo(98, 40); g.stroke()
      g.beginPath(); g.moveTo(52, 90); g.lineTo(78, 90); g.stroke()
    } else if (kind === 'smug') {
      g.beginPath(); g.moveTo(30, 58); g.lineTo(54, 58); g.moveTo(74, 58); g.lineTo(98, 58); g.stroke()
      g.lineWidth = 5; g.beginPath(); g.moveTo(32, 48); g.lineTo(52, 52); g.moveTo(96, 48); g.lineTo(76, 52); g.stroke()
      g.lineWidth = 7; g.beginPath(); g.moveTo(48, 86); g.quadraticCurveTo(70, 94, 84, 78); g.stroke()
    } else if (kind === 'dizzy') {
      for (const x of [42, 86]) { g.beginPath(); g.moveTo(x - 10, 50); g.lineTo(x + 10, 68); g.moveTo(x + 10, 50); g.lineTo(x - 10, 68); g.stroke() }
      g.beginPath(); g.ellipse(64, 92, 9, 6, 0, 0, Math.PI * 2); g.stroke()
    } else {
      eye(44, 60); eye(84, 60)
      g.beginPath(); g.arc(64, 78, 13, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke()
    }
    g.fillStyle = 'rgba(255,110,110,.45)'; g.beginPath(); g.ellipse(24, 84, 11, 7, 0, 0, Math.PI * 2); g.ellipse(104, 84, 11, 7, 0, 0, Math.PI * 2); g.fill()
  })
}
const FACE_KINDS = ['calm', 'happy', 'shock', 'search', 'worry', 'think', 'smug', 'dizzy']
// 顔に重ねる小物（眼鏡・口ひげ）
function overlayTexture(kind) {
  return canvasTex(128, 128, g => {
    g.strokeStyle = '#1b130d'; g.lineWidth = 6
    if (kind === 'glasses') { g.beginPath(); g.arc(43, 60, 17, 0, Math.PI * 2); g.moveTo(103, 60); g.arc(86, 60, 17, 0, Math.PI * 2); g.moveTo(60, 58); g.lineTo(69, 58); g.stroke() }
    if (kind === 'mustache') { g.fillStyle = '#3b2a24'; g.beginPath(); g.moveTo(64, 74); g.quadraticCurveTo(40, 66, 30, 84); g.quadraticCurveTo(48, 80, 64, 82); g.quadraticCurveTo(80, 80, 98, 84); g.quadraticCurveTo(88, 66, 64, 74); g.fill() }
  })
}

// 頭の上の印（? / 調べた / 自分の痕跡 / 調べている虫めがね / 鍵）
function badgeTexture(kind) {
  return canvasTex(96, 96, g => {
    g.lineWidth = 6; g.strokeStyle = '#1d1530'
    if (kind === 'q' || kind === 'ok') {
      g.fillStyle = kind === 'q' ? '#ffc94a' : '#3fcf8e'
      g.beginPath(); g.arc(48, 44, 30, 0, Math.PI * 2); g.fill(); g.stroke()
      g.beginPath(); g.moveTo(40, 72); g.lineTo(48, 90); g.lineTo(56, 72); g.fill(); g.stroke()
      g.fillStyle = kind === 'q' ? '#1d1530' : '#fff'
      if (kind === 'q') { g.font = '900 42px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 48, 47) }
      else { g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(34, 45); g.lineTo(45, 56); g.lineTo(62, 34); g.stroke() }
    } else if (kind === 'trace') {
      g.fillStyle = '#ff3b4a'; g.beginPath(); g.moveTo(48, 8); g.lineTo(84, 48); g.lineTo(48, 88); g.lineTo(12, 48); g.closePath(); g.fill(); g.stroke()
      g.fillStyle = '#fff'; g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 48, 50)
    } else if (kind === 'lens') {
      g.fillStyle = '#fff8ea'; g.beginPath(); g.roundRect(8, 8, 80, 70, 18); g.fill(); g.stroke()
      g.beginPath(); g.moveTo(36, 76); g.lineTo(48, 92); g.lineTo(58, 76); g.fill(); g.stroke()
      g.lineWidth = 7; g.beginPath(); g.arc(42, 38, 15, 0, Math.PI * 2); g.stroke(); g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(53, 49); g.lineTo(68, 64); g.stroke()
    } else if (kind === 'lock') {
      g.fillStyle = '#ff3b4a'; g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill(); g.stroke()
      g.fillStyle = '#fff'; g.fillRect(30, 46, 36, 26); g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(48, 44, 11, Math.PI, 0); g.stroke()
    } else if (kind === 'vote') {
      g.fillStyle = '#ff3b4a'; g.beginPath(); g.arc(48, 48, 38, 0, Math.PI * 2); g.fill(); g.stroke()
      g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(30, 48); g.lineTo(43, 61); g.lineTo(66, 34); g.stroke()
    }
  })
}

// ---------- 床の絵（部屋ごとの張り方）
const TP = 48
function paintFloor(sc) {
  const W = sc.map[0].length, H = sc.map.length
  const c = document.createElement('canvas'); c.width = W * TP; c.height = H * TP
  const g = c.getContext('2d')
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = sc.map[y][x], X = x * TP, Y = y * TP
    if (ch === '#') { g.fillStyle = '#1d1530'; g.fillRect(X, Y, TP, TP); continue }
    if (ch === '+') { g.fillStyle = '#9b6a3c'; g.fillRect(X, Y, TP, TP); g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 4; i++) g.fillRect(X, Y + i * 12, TP, 2); continue }
    const kind = sc.floors?.[ch] || 'wood'
    if (kind === 'wood' || kind === 'deck') {
      const base = kind === 'deck' ? [196, 150, 96] : [150, 102, 62]
      for (let i = 0; i < 4; i++) {
        const k = 0.85 + rnd() * 0.25
        g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`
        if (kind === 'deck') g.fillRect(X + i * 12, Y, 12, TP); else g.fillRect(X, Y + i * 12, TP, 12)
      }
      g.fillStyle = 'rgba(40,20,10,.45)'
      for (let i = 0; i < 4; i++) kind === 'deck' ? g.fillRect(X + i * 12, Y, 2, TP) : g.fillRect(X, Y + i * 12, TP, 2)
      if (kind === 'deck' && (x + y) % 3 === 0) { g.fillStyle = 'rgba(40,20,10,.5)'; g.fillRect(X + 4, Y + 20, 2, 2); g.fillRect(X + 28, Y + 6, 2, 2) }
    } else if (kind === 'parquet') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const k = (i + j + x + y) % 2 ? 1 : 0.82
        g.fillStyle = `rgb(${185 * k | 0},${138 * k | 0},${85 * k | 0})`; g.fillRect(X + i * 24, Y + j * 24, 24, 24)
        g.fillStyle = 'rgba(60,30,10,.3)'
        for (let s = 0; s < 3; s++) (i + j + x + y) % 2 ? g.fillRect(X + i * 24 + s * 8, Y + j * 24, 1.5, 24) : g.fillRect(X + i * 24, Y + j * 24 + s * 8, 24, 1.5)
      }
    } else if (kind === 'carpet') {
      g.fillStyle = '#6f3f86'; g.fillRect(X, Y, TP, TP)
      g.fillStyle = 'rgba(255,220,160,.18)'
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(X + 8 + i * 16, Y + 8 + j * 16, 3, 0, Math.PI * 2); g.fill() }
    } else if (kind === 'rug') {
      g.fillStyle = '#7a5434'; g.fillRect(X, Y, TP, TP)
      g.fillStyle = '#a23a3a'; g.fillRect(X, Y + 6, TP, TP - 12)
      g.fillStyle = '#e2b26a'; g.fillRect(X, Y + 9, TP, 3); g.fillRect(X, Y + TP - 12, TP, 3)
      g.fillStyle = 'rgba(226,178,106,.35)'; g.beginPath(); g.moveTo(X + 24, Y + 16); g.lineTo(X + 32, Y + 24); g.lineTo(X + 24, Y + 32); g.lineTo(X + 16, Y + 24); g.fill()
    } else if (kind === 'tile') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#e9eef0' : '#9fb0b8'; g.fillRect(X + i * 24, Y + j * 24, 24, 24) }
    } else if (kind === 'stone') {
      g.fillStyle = '#8a8478'; g.fillRect(X, Y, TP, TP)
      g.strokeStyle = 'rgba(30,25,20,.5)'; g.lineWidth = 2
      g.strokeRect(X + 1, Y + 1, 26, 22); g.strokeRect(X + 27, Y + 1, 20, 22); g.strokeRect(X + 1, Y + 23, 16, 24); g.strokeRect(X + 17, Y + 23, 30, 24)
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(X + 4, Y + 4, 18, 6)
    } else if (kind === 'grass') {
      g.fillStyle = '#3f7d42'; g.fillRect(X, Y, TP, TP)
      g.strokeStyle = 'rgba(160,220,120,.45)'; g.lineWidth = 2
      for (let i = 0; i < 9; i++) { const a = X + rnd() * TP, b = Y + rnd() * TP; g.beginPath(); g.moveTo(a, b); g.lineTo(a + 2, b - 6); g.stroke() }
      if ((x * 7 + y * 3) % 5 === 0) { g.fillStyle = '#e6d06a'; g.beginPath(); g.arc(X + 30, Y + 30, 3, 0, Math.PI * 2); g.fill() }
    } else if (kind === 'metal') {
      g.fillStyle = '#6f7a86'; g.fillRect(X, Y, TP, TP)
      g.fillStyle = 'rgba(255,255,255,.18)'
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.save(); g.translate(X + 6 + i * 12, Y + 6 + j * 12); g.rotate((i + j) % 2 ? 0.7 : -0.7); g.fillRect(-4, -1, 8, 2); g.restore() }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(X + 0.5, Y + 0.5, TP - 1, TP - 1)
    }
    // 壁ぎわの影
    g.fillStyle = 'rgba(0,0,0,.22)'
    if (sc.map[y - 1]?.[x] === '#') g.fillRect(X, Y, TP, 8)
    if (sc.map[y][x - 1] === '#') g.fillRect(X, Y, 5, TP)
  }
  // 遺体のまわりのチョークの線
  const body = sc.spots.find(s => s.icon === 'body')
  if (body) {
    const X = (body.x + 0.5) * TP, Y = (body.y + 0.5) * TP
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.setLineDash([7, 5])
    g.beginPath(); g.ellipse(X, Y, TP * 0.62, TP * 0.4, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([])
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// ---------- 家具（マス1つに収まる大きさ。北の壁ぎわなら奥に寄せる）
function box(p, w, h, d, c, x = 0, y = 0, z = 0, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || lam(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; p.add(m); return m
}
function cyl(p, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lam(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; p.add(m); return m
}
function sph(p, r, c, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), lam(c)); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m
}
const glow = c => { let m = matCache.get('g' + c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); matCache.set('g' + c, m) } return m }

function furniture(icon, theme) {
  const g = new THREE.Group()
  const wood = 0x8a5a33, dark = 0x4a3020
  switch (icon) {
    case 'desk': box(g, 0.9, 0.06, 0.55, wood, 0, 0.62); for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) box(g, 0.06, 0.62, 0.06, dark, x, 0, z); box(g, 0.28, 0.01, 0.2, 0xf6f0e0, -0.12, 0.68, 0.05); cyl(g, 0.02, 0.05, 0.25, 0xd8b04a, 0.3, 0.68, -0.1); sph(g, 0.08, 0xffe9a8, 0.3, 0.96, -0.1).material = glow(0xffe9a8); break
    case 'shelf': box(g, 0.92, 1.15, 0.36, dark, 0, 0, -0.26); for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) box(g, 0.1, 0.24, 0.24, [0xc0392b, 0x2e86de, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22][(i + r) % 6], -0.33 + i * 0.13, 0.1 + r * 0.35, -0.16); break
    case 'bed': box(g, 0.92, 0.3, 0.95, wood); box(g, 0.86, 0.14, 0.88, 0xf4efe6, 0, 0.3); box(g, 0.86, 0.1, 0.55, theme === 'lodge' ? 0x3a6ea5 : 0x9b3b5a, 0, 0.42, 0.15); box(g, 0.5, 0.1, 0.22, 0xffffff, 0, 0.44, -0.3); box(g, 0.92, 0.6, 0.08, dark, 0, 0, -0.45); break
    case 'dresser': box(g, 0.8, 0.62, 0.4, wood, 0, 0, -0.2); box(g, 0.7, 0.02, 0.02, 0xd8b04a, 0, 0.3, 0.01); { const m = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), lam(0xbfd8ea)); m.position.set(0, 0.98, -0.37); g.add(m) } box(g, 0.56, 0.56, 0.04, 0xd8b04a, 0, 0.7, -0.4); break
    case 'vase': box(g, 0.5, 0.5, 0.5, dark); cyl(g, 0.12, 0.09, 0.35, 0x3b6fb6, 0, 0.5); for (const [x, z] of [[0, 0], [0.08, 0.05], [-0.08, 0.04]]) sph(g, 0.08, 0xffffff, x, 0.92, z); break
    case 'clock': box(g, 0.42, 1.4, 0.32, dark, 0, 0, -0.2); { const m = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), lam(0xf6f0e0)); m.position.set(0, 1.12, -0.03); g.add(m) } cyl(g, 0.06, 0.06, 0.02, 0xd8b04a, 0, 0.45, -0.03); break
    case 'table': cyl(g, 0.46, 0.46, 0.06, wood, 0, 0.6, 0, 20); cyl(g, 0.06, 0.12, 0.6, dark); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; cyl(g, 0.09, 0.09, 0.02, 0xffffff, Math.cos(a) * 0.28, 0.66, Math.sin(a) * 0.28) } sph(g, 0.08, 0xff7a6b, 0, 0.72, 0); break
    case 'cupboard': box(g, 0.86, 1.1, 0.4, theme === 'ship' ? 0xdfe6ea : wood, 0, 0, -0.24); box(g, 0.02, 1.0, 0.02, 0x2b2b2b, 0, 0.05, -0.03); box(g, 0.36, 0.42, 0.01, 0xa8d8ea, -0.2, 0.6, -0.03); box(g, 0.36, 0.42, 0.01, 0xa8d8ea, 0.2, 0.6, -0.03); break
    case 'stove': box(g, 0.82, 0.62, 0.62, 0x3a3a42); box(g, 0.5, 0.26, 0.02, 0x111111, 0, 0.12, 0.31); { const f = box(g, 0.34, 0.14, 0.02, 0xff8a2a, 0, 0.14, 0.32); f.material = glow(0xff8a2a) } cyl(g, 0.16, 0.14, 0.18, 0x9aa4ad, -0.15, 0.62); cyl(g, 0.06, 0.06, 0.5, 0x2a2a2a, 0.3, 0.62, -0.2); break
    case 'sink': box(g, 0.86, 0.6, 0.55, 0xd8d2c4); box(g, 0.5, 0.04, 0.34, 0x5d7380, 0, 0.6); cyl(g, 0.02, 0.02, 0.24, 0xc0c8d0, 0, 0.6, -0.2); break
    case 'umbrella': cyl(g, 0.16, 0.14, 0.42, 0x6b4a2b); for (const [x, c] of [[-0.07, 0xd9324a], [0.06, 0x2e86de], [0, 0x27ae60]]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), lam(c)); m.position.set(x, 0.66, x * 0.5); m.rotation.z = -x * 2; m.castShadow = true; g.add(m) } break
    case 'shoebox': box(g, 0.86, 0.46, 0.4, wood, 0, 0, -0.22); for (const [x, c] of [[-0.25, 0x1c1c22], [0, 0x3f6b3a], [0.25, 0xd3312c]]) box(g, 0.16, 0.08, 0.26, c, x, 0.46, -0.2); break
    case 'pot': cyl(g, 0.24, 0.17, 0.34, 0xb9643a); for (const [x, y, z] of [[0, 0.62, 0], [0.12, 0.52, 0.05], [-0.12, 0.54, -0.04], [0.04, 0.5, -0.12]]) sph(g, 0.15, 0x3f9b4a, x, y, z); break
    case 'can': cyl(g, 0.15, 0.17, 0.3, 0x4f8fb3, -0.12, 0, 0); { const s = cyl(g, 0.025, 0.04, 0.32, 0x4f8fb3, 0.08, 0.16, 0); s.rotation.z = -0.9 } cyl(g, 0.15, 0.17, 0.3, 0x5fa86a, 0.2, 0, -0.2); break
    case 'safe': box(g, 0.66, 0.7, 0.55, 0x3d4450, 0, 0, -0.15); cyl(g, 0.09, 0.09, 0.04, 0xc9c9c9, 0.1, 0.42, 0.13).rotation.x = Math.PI / 2; box(g, 0.04, 0.2, 0.04, 0xc9c9c9, -0.18, 0.28, 0.14); break
    case 'trunk': box(g, 0.78, 0.46, 0.5, 0x8a4b2a); box(g, 0.8, 0.04, 0.52, 0x3a2414, 0, 0.46); for (const x of [-0.22, 0.22]) box(g, 0.05, 0.48, 0.52, 0xd8b04a, x, 0, 0); break
    case 'piano': box(g, 0.92, 0.5, 0.7, 0x141414, 0, 0.32); box(g, 0.8, 0.04, 0.16, 0xffffff, 0, 0.62, 0.36); { const lid = box(g, 0.9, 0.03, 0.66, 0x222222, 0, 0.9, -0.05); lid.rotation.x = -0.5 } for (const x of [-0.38, 0.38]) box(g, 0.07, 0.32, 0.07, 0x141414, x, 0, 0.25); break
    case 'counter': box(g, 0.92, 0.85, 0.42, 0x6b3a22, 0, 0, -0.1); box(g, 0.98, 0.05, 0.5, 0x2b1a12, 0, 0.85, -0.1); for (const [x, c] of [[-0.3, 0x2e7d32], [-0.15, 0x8e2c2c], [0.2, 0xe0b04a]]) cyl(g, 0.04, 0.05, 0.26, c, x, 0.9, -0.22); for (const x of [0.02, 0.32]) cyl(g, 0.05, 0.03, 0.1, 0xcfe8f5, x, 0.9, 0.02); break
    case 'buoy': cyl(g, 0.04, 0.04, 0.9, 0x9aa4ad, 0, 0, -0.3); { const t = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 10, 20), lam(0xe8402f)); t.position.set(0, 0.7, -0.24); t.castShadow = true; g.add(t); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.083, 6, 4, 0.35), lam(0xffffff)); s.position.copy(t.position); s.rotation.z = i * Math.PI / 2; g.add(s) } } break
    case 'sofa': box(g, 0.9, 0.36, 0.6, theme === 'lodge' ? 0x7a3a2a : 0x2f6f8f); box(g, 0.9, 0.42, 0.16, theme === 'lodge' ? 0x6a3022 : 0x285f7a, 0, 0.36, -0.22); for (const x of [-0.42, 0.42]) box(g, 0.1, 0.22, 0.6, theme === 'lodge' ? 0x6a3022 : 0x285f7a, x, 0.36); box(g, 0.26, 0.2, 0.08, 0xffd27a, -0.2, 0.36, -0.1); break
    case 'boiler': { const c = cyl(g, 0.34, 0.34, 0.86, 0x7d8790, 0, 0.36, 0, 16); c.rotation.z = Math.PI / 2; c.position.y = 0.4 } for (const x of [-0.35, 0.35]) box(g, 0.08, 0.36, 0.5, 0x3a3f46, x); cyl(g, 0.06, 0.06, 0.6, 0xb5743a, 0.2, 0.7, -0.1); { const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lam(0xf6f0e0)); m.position.set(-0.15, 0.45, 0.35); g.add(m) } break
    case 'deckchair': { const s = box(g, 0.5, 0.04, 0.8, 0x2e86de, 0, 0.28, 0.05); s.rotation.x = 0.1; const b = box(g, 0.5, 0.04, 0.5, 0x2e86de, 0, 0.3, -0.38); b.rotation.x = -1.0 } for (const x of [-0.26, 0.26]) box(g, 0.04, 0.3, 0.9, 0xd8c098, x, 0, 0); box(g, 0.3, 0.02, 0.4, 0xffffff, 0, 0.36, 0.1); break
    case 'barrel': cyl(g, 0.28, 0.24, 0.72, 0x8a5a33, 0, 0, 0, 16); for (const y of [0.12, 0.56]) cyl(g, 0.285, 0.285, 0.05, 0x3a3a3a, 0, y, 0, 16); break
    case 'boat': { const h = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lam(0xff7a1a)); h.scale.set(0.8, 0.7, 1.05); h.position.y = 0.55; h.castShadow = true; g.add(h) } box(g, 0.66, 0.04, 0.9, 0x2b4a7a, 0, 0.54); for (const z of [-0.3, 0.3]) box(g, 0.06, 0.55, 0.06, 0x9aa4ad, 0, 0, z); break
    case 'crate': box(g, 0.7, 0.62, 0.7, 0xb5874e); for (const x of [-0.33, 0.33]) box(g, 0.05, 0.62, 0.72, 0x7a5430, x); box(g, 0.72, 0.06, 0.72, 0x7a5430, 0, 0.3); if (theme === 'ship') for (let i = 0; i < 5; i++) sph(g, 0.07, 0xd9324a, -0.2 + i * 0.1, 0.66, (i % 2) * 0.1 - 0.05); break
    case 'fireplace': box(g, 0.95, 0.95, 0.42, 0x8a8478, 0, 0, -0.3); box(g, 0.5, 0.42, 0.04, 0x1a1210, 0, 0.08, -0.08); { const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), glow(0xff8a2a)); f.position.set(0, 0.24, -0.15); g.add(f); const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), glow(0xffd36a)); f2.position.set(0.1, 0.2, -0.12); g.add(f2) } box(g, 1.02, 0.08, 0.5, 0x5a3a22, 0, 0.95, -0.3); box(g, 0.5, 0.6, 0.3, 0x8a8478, 0, 1.0, -0.36); break
    case 'billiard': box(g, 0.94, 0.12, 0.8, 0x2f8a4a, 0, 0.55); box(g, 0.98, 0.08, 0.84, 0x5a3a22, 0, 0.5); for (const [x, z] of [[-0.4, -0.32], [0.4, -0.32], [-0.4, 0.32], [0.4, 0.32]]) box(g, 0.08, 0.5, 0.08, 0x5a3a22, x, 0, z); for (const [x, z, c] of [[0, 0, 0xffffff], [0.2, -0.1, 0xd9324a], [-0.15, 0.12, 0xf1c40f], [0.1, 0.2, 0x111111]]) sph(g, 0.045, c, x, 0.71, z); break
    case 'skis': box(g, 0.9, 0.08, 0.22, wood, 0, 0.9, -0.36); for (let i = 0; i < 5; i++) { const s = box(g, 0.07, 1.25, 0.03, [0xd9324a, 0x2e86de, 0xf1c40f, 0x27ae60, 0x8e44ad][i], -0.32 + i * 0.16, 0, -0.32); s.rotation.x = -0.08 } break
    case 'dryer': box(g, 0.7, 0.55, 0.45, 0xdfe6ea, 0, 0, -0.15); box(g, 0.4, 0.06, 0.02, 0x333333, 0, 0.4, 0.08); for (const x of [-0.16, 0.16]) box(g, 0.16, 0.28, 0.26, 0x6b4a2b, x, 0.55, -0.15); break
    case 'coat': cyl(g, 0.03, 0.03, 1.35, dark, 0, 0, -0.1); cyl(g, 0.2, 0.22, 0.04, dark, 0, 0, -0.1); for (const [a, c] of [[0, 0x7a2a2a], [2.1, 0x2a4a7a], [4.2, 0x5a6a3a]]) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), lam(c)); m.position.set(Math.cos(a) * 0.12, 0.95, -0.1 + Math.sin(a) * 0.12); m.castShadow = true; g.add(m) } break
    default: box(g, 0.7, 0.6, 0.7, wood)
  }
  return g
}

// ---------- ちびキャラ（帽子と小物は肩書きで変わる。靴は「靴」の特徴の色）
function makeChibi(ch, faceMats, ovMats) {
  const color = new THREE.Color(COLORS[ch.color % COLORS.length]).getHex()
  const g = new THREE.Group()
  const body = new THREE.Group(); g.add(body)
  const cloth = toon(color), skin = toon(0xffd9b3), dark = toon(0x2b2f38)
  const shoeKey = ch.traits?.shoe
  const shoeCol = SHOE[shoeKey] ?? 0x4a3a2a
  const legs = [-0.07, 0.07].map(x => {
    const pv = new THREE.Group(); pv.position.set(x, 0.2, 0)
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8), dark); l.position.y = -0.08; l.castShadow = true; pv.add(l)
    const tall = TALL_SHOE.has(shoeKey)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, tall ? 0.14 : 0.06, 0.15), toon(shoeCol)); shoe.position.set(0, tall ? -0.13 : -0.17, 0.03); shoe.castShadow = true; pv.add(shoe)
    body.add(pv); return pv
  })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.1, 6, 12), cloth); torso.position.y = 0.34; torso.castShadow = true; body.add(torso); outline(torso, 1.08)
  const arms = [-1, 1].map(s => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 4, 6), cloth); a.position.set(s * 0.17, 0.34, 0); a.rotation.z = s * 0.35; a.castShadow = true; body.add(a); return a })
  const headG = new THREE.Group(); headG.position.y = 0.66; body.add(headG)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skin); head.castShadow = true; headG.add(head); outline(head, 1.06)
  const hairMat = toon(0x3b2a24)
  const addHair = () => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 10, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.6), hairMat); headG.add(h) }
  const M = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; headG.add(m); return m }
  const look = ch.look
  if (look === 'tophat') { M(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 16), toon(0x24203a), 0, 0.3, 0); M(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18), toon(0x24203a), 0, 0.17, 0); M(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 16), cloth, 0, 0.21, 0); addHair() }
  else if (look === 'chef') { M(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16), toon(0xffffff), 0, 0.24, 0); M(new THREE.SphereGeometry(0.24, 14, 10), toon(0xffffff), 0, 0.4, 0).scale.set(1, 0.7, 1) }
  else if (look === 'straw') { M(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), toon(0xf2c96a), 0, 0.15, 0); M(new THREE.CylinderGeometry(0.17, 0.2, 0.16, 16), toon(0xf2c96a), 0, 0.24, 0); M(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 16), cloth, 0, 0.2, 0) }
  else if (look === 'cap') { addHair(); M(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth, 0, 0.03, 0); M(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 14, 1, false, -Math.PI / 2, Math.PI), cloth, 0, 0.1, 0.17) }
  else if (look === 'mirror') { addHair(); const b = M(new THREE.TorusGeometry(0.245, 0.02, 6, 20), toon(0x5a5a6e), 0, 0.08, 0); b.rotation.x = Math.PI / 2 - 0.2; const d = M(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), toon(0xdfe9f3), 0, 0.14, 0.22); d.rotation.x = Math.PI / 2 - 0.3 }
  else if (look === 'beret') { addHair(); const b = M(new THREE.SphereGeometry(0.27, 16, 8), toon(0xd9324a), 0.04, 0.16, 0); b.scale.set(1, 0.35, 1); b.rotation.z = -0.25 }
  else if (look === 'maid') { addHair(); const b = M(new THREE.TorusGeometry(0.22, 0.035, 6, 18, Math.PI), toon(0xffffff), 0, 0.12, 0.02); b.rotation.y = 0; b.rotation.x = -0.4 }
  else if (look === 'captain') { M(new THREE.CylinderGeometry(0.26, 0.22, 0.12, 18), toon(0xffffff), 0, 0.22, 0); M(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 18), toon(0x1f2a5c), 0, 0.15, 0); M(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 14, 1, false, -Math.PI / 2, Math.PI), toon(0x111111), 0, 0.12, 0.15); M(new THREE.SphereGeometry(0.04, 8, 6), toon(0xffc94a), 0, 0.2, 0.22) }
  else if (look === 'helmet') { M(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), toon(0xffc83a), 0, 0.03, 0); const r = M(new THREE.TorusGeometry(0.26, 0.025, 6, 20), toon(0xffc83a), 0, 0.07, 0); r.rotation.x = Math.PI / 2 }
  else if (look === 'ribbon') { addHair(); for (const s of [-1, 1]) { const c = M(new THREE.ConeGeometry(0.08, 0.16, 8), cloth, s * 0.09, 0.26, 0); c.rotation.z = s * Math.PI / 2 } M(new THREE.SphereGeometry(0.05, 8, 6), cloth, 0, 0.26, 0) }
  else if (look === 'knit') { M(new THREE.SphereGeometry(0.255, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth, 0, 0.03, 0); const f = M(new THREE.TorusGeometry(0.24, 0.045, 8, 20), toon(0xffffff), 0, 0.06, 0); f.rotation.x = Math.PI / 2; M(new THREE.SphereGeometry(0.07, 10, 8), toon(0xffffff), 0, 0.3, 0) }
  else addHair()
  if (look === 'bowtie') for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), toon(0xd9324a)); c.position.set(s * 0.05, 0.48, 0.12); c.rotation.z = s * Math.PI / 2; body.add(c) }
  const face = new THREE.Sprite(faceMats.calm); face.scale.set(0.34, 0.34, 1); face.renderOrder = 4; g.add(face)
  let over = null
  if (look === 'glasses' || look === 'tophat') { over = new THREE.Sprite(ovMats[look === 'glasses' ? 'glasses' : 'mustache']); over.scale.set(0.34, 0.34, 1); over.renderOrder = 5; g.add(over) }
  const lens = new THREE.Sprite(ovMats.lens); lens.scale.set(0.3, 0.3, 1); lens.position.set(0.22, 1.12, 0); lens.visible = false; lens.renderOrder = 6; g.add(lens)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; g.add(shadow)
  return { g, body, legs, arms, headG, face, over, lens, faceKind: 'calm', yaw: 0, phase: Math.random() * 6 }
}

// 床に倒れている人（遺体。目はバツで、こわくない程度に）
function victim(faceMats, theme) {
  const g = new THREE.Group()
  const b = makeChibi({ color: 1, look: theme === 'ship' ? 'captain' : theme === 'lodge' ? 'knit' : 'tophat', traits: {} }, faceMats, {})
  b.body.rotation.x = -Math.PI / 2; b.body.position.set(0, 0.16, 0.3)
  b.face.material = faceMats.dizzy; b.face.position.set(0, 0.44, -0.36); b.face.scale.set(0.3, 0.3, 1)
  b.g.children.filter(o => o.isSprite && o !== b.face).forEach(o => (o.visible = false))
  b.body.children.forEach(o => (o.material = o.material === INKMAT ? INKMAT : lam(0xb8b0c8)))
  g.add(b.g)
  return g
}

export function createView3D(canvas) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    if (!renderer.getContext()) throw new Error('no gl')
  } catch { return null }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const coarse = matchMedia('(pointer: coarse)').matches
  let tier = coarse ? 1 : 2 // 2=高 1=中 0=低。fps が出なければ下げる
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140)
  const faceMats = Object.fromEntries(FACE_KINDS.map(k => [k, new THREE.SpriteMaterial({ map: faceTexture(k), depthWrite: false })]))
  const ovMats = {
    glasses: new THREE.SpriteMaterial({ map: overlayTexture('glasses'), depthWrite: false }),
    mustache: new THREE.SpriteMaterial({ map: overlayTexture('mustache'), depthWrite: false }),
    lens: new THREE.SpriteMaterial({ map: badgeTexture('lens'), depthWrite: false, depthTest: false })
  }
  const badgeMats = Object.fromEntries(['q', 'ok', 'trace', 'lock', 'vote'].map(k => [k, new THREE.SpriteMaterial({ map: badgeTexture(k), depthWrite: false })]))

  let S = null // いまのシナリオの 3D 一式
  let sizeW = 1, sizeH = 1, aspect = 1
  const cam = { x: 0, z: 0, far: false, zoom: 1, snap: true, orbit: 0 }
  const tmpV = new THREE.Vector3()
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const fpsLog = []           // 実際のフレームの間隔（秒）。描画用の dt は 0.1 秒で頭打ちにするので、重さの判定には使わない
  let lastTierCheck = performance.now() + 3000, lastFrameAt = 0
  let flashT = 0

  function setTier(t) {
    tier = Math.max(0, Math.min(2, t))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][tier]))
    renderer.setSize(sizeW, sizeH, false)
    if (!S) return
    renderer.shadowMap.enabled = tier > 0
    S.moon.castShadow = tier > 0
    const ms = tier === 2 ? 1024 : 512
    if (S.moon.shadow.mapSize.x !== ms) { S.moon.shadow.mapSize.set(ms, ms); if (S.moon.shadow.map) { S.moon.shadow.map.dispose(); S.moon.shadow.map = null } }
    if (S.weather) S.weather.visible = tier > 0
  }

  function disposeScene() {
    if (!S) return
    S.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      const m = o.material
      if (m && m !== INKMAT) (Array.isArray(m) ? m : [m]).forEach(x => { if ([...matCache.values()].includes(x) || Object.values(faceMats).includes(x) || Object.values(ovMats).includes(x) || Object.values(badgeMats).includes(x)) return; if (x.map) x.map.dispose(); x.dispose() })
    })
    S = null
  }

  function load(sc, chars) {
    disposeScene()
    const th = THEMES[sc.theme] || THEMES.mansion
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(th.bg)
    scene.fog = new THREE.Fog(th.fog, 14, 34)
    const W = sc.map[0].length, H = sc.map.length
    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.1); scene.add(hemi)
    const moon = new THREE.DirectionalLight(th.moon, 1.1)
    moon.castShadow = true
    moon.shadow.camera.left = -7; moon.shadow.camera.right = 7; moon.shadow.camera.top = 7; moon.shadow.camera.bottom = -7
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 30; moon.shadow.bias = -0.001
    scene.add(moon); scene.add(moon.target)
    // 自分のいる部屋の明かり（電球色）。停電中は消えて、手元のランタンだけになる
    const roomLight = new THREE.PointLight(th.room, 9, 9, 1.2); roomLight.position.set(0, 2.3, 0); scene.add(roomLight)
    const lantern = new THREE.PointLight(0xffd08a, 0, 3.6, 1.3); scene.add(lantern)

    // 床（1枚の絵）
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: paintFloor(sc) }))
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true; scene.add(floor)

    // 外の景色
    const outside = new THREE.Group(); scene.add(outside)
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: th.ground }))
    gnd.rotation.x = -Math.PI / 2; gnd.position.set(W / 2, sc.theme === 'ship' ? -1.4 : -0.02, H / 2); gnd.receiveShadow = sc.theme !== 'ship'; outside.add(gnd)
    let waves = null
    if (sc.theme === 'ship') {
      const wt = canvasTex(128, 128, g => { g.fillStyle = '#0e2a4a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(160,200,255,.35)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); const y = 10 + i * 21; g.moveTo(0, y); g.quadraticCurveTo(32, y - 8, 64, y); g.quadraticCurveTo(96, y + 8, 128, y); g.stroke() } })
      wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(30, 30)
      gnd.material = new THREE.MeshLambertMaterial({ map: wt }); waves = wt
      // 船体と煙突
      const hull = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 1.4, H + 0.8), [lam(0xf4f1ea), lam(0xf4f1ea), lam(0xf4f1ea), lam(0x7a1f2b), lam(0xf4f1ea), lam(0xf4f1ea)])
      hull.position.set(W / 2, -0.71, H / 2); outside.add(hull)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.84, 0.25, H + 0.84), lam(0x1f2a5c)); stripe.position.set(W / 2, -0.9, H / 2); outside.add(stripe)
      const bow = new THREE.Mesh(new THREE.ConeGeometry((W + 0.8) / 2, 6, 4, 1), lam(0xf4f1ea)); bow.rotation.set(-Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.33); bow.position.set(W / 2, -0.75, -3); outside.add(bow)
      for (const [x, c] of [[W * 0.35, 0xd9324a], [W * 0.65, 0xd9324a]]) { const f = cyl(outside, 0.6, 0.7, 2.6, c, x, 0, -1.2); cyl(outside, 0.61, 0.61, 0.5, 0x1d1530, x, 2.6, -1.2); f.castShadow = false }
      for (let i = 0; i < 26; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), glow(0xffe08a)); l.position.set(i % 2 ? -0.42 : W + 0.42, -0.5, 0.5 + (i >> 1) * (H / 13)); outside.add(l) }
    } else if (sc.theme === 'lodge') {
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2, r = Math.max(W, H) * 0.75 + (i % 3) * 2.2
        const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r * 0.9
        const tr = new THREE.Group(); tr.position.set(x, 0, z); outside.add(tr)
        cyl(tr, 0.12, 0.15, 0.6, 0x5a3a22)
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.22, 1.1, 8), lam(k === 2 ? 0xf4f8fc : 0x2f5a3a)); c.position.y = 0.9 + k * 0.6; c.castShadow = true; tr.add(c) }
      }
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(9, 9, 5), lam(0xdfe8f5)); m.position.set(W / 2 - 24 + i * 10, 2, -26 - (i % 2) * 6); outside.add(m) }
    } else {
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2, r = Math.max(W, H) * 0.72 + (i % 2) * 1.5
        const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r * 0.9
        if (i % 3 === 0) { const l = new THREE.Group(); l.position.set(x, 0, z); outside.add(l); cyl(l, 0.05, 0.06, 1.6, 0x222222); const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(0xffd98a)); s.position.y = 1.7; l.add(s) }
        else { const t = new THREE.Mesh(new THREE.SphereGeometry(0.8 + (i % 4) * 0.2, 10, 8), lam(0x1f4a2a)); t.position.set(x, 0.6, z); t.scale.y = 0.8; t.castShadow = true; outside.add(t) }
      }
      // 屋根の端（屋敷の外壁の上に暗い縁）
    }
    // 月
    const moonSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.45, '#f2ecd0'); gr.addColorStop(0.5, 'rgba(240,236,208,.25)'); gr.addColorStop(1, 'rgba(240,236,208,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }), fog: false, depthWrite: false }))
    moonSp.scale.set(9, 9, 1); moonSp.position.set(W * 0.75, 18, -30); scene.add(moonSp)

    // 壁（床に面しているマスだけ）。上の面は濃い色
    const wallTiles = []
    const isFloor = (x, y) => y >= 0 && x >= 0 && y < H && x < W && sc.map[y][x] !== '#'
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (sc.map[y][x] !== '#') continue
      let touch = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) touch = true
      if (touch) wallTiles.push({ x, y, h: WALL_H, want: WALL_H })
    }
    const wallTex = canvasTex(64, 64, g => { g.fillStyle = th.wallpaper; g.fillRect(0, 0, 64, 64); g.fillStyle = th.stripe; for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 6, 64); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 54, 64, 10) })
    const wallSide = new THREE.MeshLambertMaterial({ map: wallTex }), wallTop = new THREE.MeshLambertMaterial({ color: th.cap })
    const wgeo = new THREE.BoxGeometry(1, 1, 1); wgeo.translate(0, 0.5, 0)
    const walls = new THREE.InstancedMesh(wgeo, [wallSide, wallSide, wallTop, wallTop, wallSide, wallSide], wallTiles.length)
    walls.castShadow = true; walls.receiveShadow = true
    const dummy = new THREE.Object3D()
    const setWall = (i, h) => { const w = wallTiles[i]; dummy.position.set(w.x + 0.5, 0, w.y + 0.5); dummy.scale.set(1, h, 1); dummy.updateMatrix(); walls.setMatrixAt(i, dummy.matrix) }
    wallTiles.forEach((w, i) => setWall(i, w.h))
    scene.add(walls)

    // 扉（枠と、嵐で閉じたときの板）
    const doors = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (sc.map[y][x] !== '+') continue
      const horiz = sc.map[y][x - 1] === '#' && sc.map[y][x + 1] === '#' // 横に伸びる壁の扉（南北に通る）
      const g = new THREE.Group(); g.position.set(x + 0.5, 0, y + 0.5); if (!horiz) g.rotation.y = Math.PI / 2; scene.add(g)
      for (const s of [-1, 1]) box(g, 0.1, WALL_H, 0.3, 0x5a3a22, s * 0.47)
      const lintel = box(g, 1.04, 0.2, 0.32, 0x5a3a22, 0, WALL_H - 0.2)
      const slab = box(g, 0.86, WALL_H - 0.12, 0.1, 0x8a2a2a, 0, 0); slab.visible = false
      const lock = new THREE.Sprite(badgeMats.lock); lock.scale.set(0.5, 0.5, 1); lock.position.set(0, WALL_H + 0.35, 0); lock.visible = false; lock.renderOrder = 6; g.add(lock)
      doors.push({ x, y, g, lintel, slab, lock, h: 1 })
    }

    // 家具・調べる印・自分の痕跡の印
    const spots = new Map()
    for (const s of sc.spots) {
      const g = s.icon === 'body' ? victim(faceMats, sc.theme) : furniture(s.icon, sc.theme)
      g.position.set(s.x + 0.5, 0, s.y + 0.5)
      // 北が壁でなければ、奥に寄せた家具を手前向きに回さない（いまは全部北向きで置く）
      scene.add(g)
      const bh = s.icon === 'body' ? 0.7 : s.icon === 'clock' || s.icon === 'skis' || s.icon === 'coat' ? 1.7 : s.icon === 'shelf' || s.icon === 'fireplace' || s.icon === 'cupboard' ? 1.5 : 1.25
      const badge = new THREE.Sprite(badgeMats.q); badge.scale.set(0.34, 0.34, 1); badge.position.set(s.x + 0.5, bh, s.y + 0.5); badge.renderOrder = 5; scene.add(badge)
      const trace = new THREE.Sprite(badgeMats.trace); trace.scale.set(0.3, 0.3, 1); trace.position.set(s.x + 0.2, bh + 0.05, s.y + 0.5); trace.visible = false; trace.renderOrder = 6; scene.add(trace)
      if (s.noClue) badge.visible = false
      spots.set(s.id, { s, g, badge, trace, bh })
    }
    // 近くの家具の輪と、タップした行き先の輪
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; scene.add(ring)
    const dest = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.9, depthWrite: false }))
    dest.rotation.x = -Math.PI / 2; dest.position.y = 0.025; dest.visible = false; scene.add(dest)

    // 部屋ごとの暗がり（自分の部屋以外にかぶせる）
    const boxes = {}
    sc.map.forEach((row, y) => [...row].forEach((c, x) => {
      if (!sc.rooms[c]) return
      const b = boxes[c] ||= { x0: x, x1: x, y0: y, y1: y }
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y)
    }))
    const shades = {}
    for (const [c, b] of Object.entries(boxes)) {
      const w = b.x1 - b.x0 + 1, d = b.y1 - b.y0 + 1
      const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 1.9, d + 0.02), new THREE.MeshBasicMaterial({ color: 0x07050e, transparent: true, opacity: 0.6, depthWrite: false }))
      m.position.set(b.x0 + w / 2, 0.95, b.y0 + d / 2); m.renderOrder = 3; scene.add(m)
      shades[c] = { m, op: 0.6, cx: b.x0 + w / 2, cz: b.y0 + d / 2, w, d, b }
    }

    // 人
    const people = new Map()
    for (const ch of chars) { const c = makeChibi(ch, faceMats, ovMats); c.g.visible = false; scene.add(c.g); people.set(ch.id, c) }

    // 面通しの舞台（推理・投票の時に全員が並ぶ。地図の外に置く）
    const LX = -60
    const stage = new THREE.Group(); stage.position.set(LX, 0, 0); scene.add(stage)
    { const fl = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.6, 0.2, 40), lam(0x6b3f24)); fl.position.y = -0.1; fl.receiveShadow = true; stage.add(fl)
      const ct = canvasTex(256, 128, g => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#5a0f1a'); gr.addColorStop(1, '#a0202f'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.06)'; g.fillRect(i * 16, 0, 9, 128) } })
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(13, 5.5), new THREE.MeshLambertMaterial({ map: ct })); cur.position.set(0, 2.6, -1.6); stage.add(cur)
      // 背の高さの目盛り（面通しの壁）
      const hl = canvasTex(512, 256, g => { g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#3a3448'; for (let i = 0; i < 8; i++) { g.lineWidth = i % 2 ? 2 : 5; g.beginPath(); g.moveTo(0, 30 + i * 28); g.lineTo(512, 30 + i * 28); g.stroke() } })
      const hw = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1.6), new THREE.MeshLambertMaterial({ map: hl })); hw.position.set(0, 0.8, -1.55); stage.add(hw)
    }
    const spot = new THREE.SpotLight(0xfff1d0, 30, 16, 0.6, 0.5, 1.2); spot.position.set(LX, 6, 4); spot.target.position.set(LX, 0.4, -0.4); scene.add(spot); scene.add(spot.target)
    const voteRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 28), new THREE.MeshBasicMaterial({ color: 0xff3b4a, transparent: true, opacity: 0.95, depthWrite: false }))
    voteRing.rotation.x = -Math.PI / 2; voteRing.position.y = 0.03; voteRing.visible = false; scene.add(voteRing)

    // 雨・雪（画質が低いときは出さない）
    let weather = null
    if (sc.theme !== 'ship') {
      const N = sc.theme === 'lodge' ? 500 : 650
      const pos = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = Math.random() * 9; pos[i * 3 + 2] = (Math.random() - 0.5) * 22 }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      weather = new THREE.Points(geo, new THREE.PointsMaterial({ color: sc.theme === 'lodge' ? 0xffffff : 0x9fb8ff, size: sc.theme === 'lodge' ? 0.08 : 0.05, transparent: true, opacity: sc.theme === 'lodge' ? 0.9 : 0.55, depthWrite: false }))
      scene.add(weather)
    }

    S = { sc, th, scene, W, H, hemi, moon, roomLight, lantern, floor, walls, wallTiles, setWall, doors, spots, ring, dest, shades, people, LX, stage, spot, voteRing, weather, waves, boxes, snow: sc.theme === 'lodge' }
    cam.snap = true
    setTier(tier)
  }

  // ---------- カメラ
  function placeExplore(px, pz, dt) {
    const k = cam.snap ? 1 : 1 - Math.pow(0.004, dt)
    cam.snap = false
    cam.x += (px - cam.x) * k; cam.z += (pz - cam.z) * k
    cam.zoom += ((cam.far ? 1 : 0) - cam.zoom) * (1 - Math.pow(0.02, dt))
    // 斜め見下ろし（俯角46度）。引きの視点では高く上がって屋敷ぜんぶを見る
    const tilt = (46 + cam.zoom * 16) * Math.PI / 180
    camera.fov = aspect < 1 ? 50 : 40; camera.updateProjectionMatrix()
    const tv = Math.tan(camera.fov * Math.PI / 360), thh = tv * aspect
    // 縦持ちでも横に6マス、横持ちでも縦に5マスは見える距離（近いほど人と家具が大きい）
    let L = Math.max(2.4 / thh, 2.9 / tv)
    L = Math.max(5.2, Math.min(11, L))
    // 引き: 屋敷ぜんぶ
    const Lfar = Math.max((S.W / 2 + 0.8) / thh, (S.H * 0.45 + 1.8) / tv) // 上の HUD と下のタブの分の余白も見込む
    L = L + (Lfar - L) * cam.zoom
    const tx = cam.x + (S.W / 2 - cam.x) * cam.zoom, tz = cam.z + (S.H / 2 - cam.z) * cam.zoom
    camera.position.set(tx, Math.sin(tilt) * L, tz + Math.cos(tilt) * L)
    camera.lookAt(tx, 0.35, tz - 0.45 * (1 - cam.zoom)) // 少し先（奥）を見る
    S.scene.fog.near = L * 1.2; S.scene.fog.far = L * 3.2
    return { tx, tz, L }
  }

  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera)
    return { x: (tmpV.x * 0.5 + 0.5) * sizeW, y: (-tmpV.y * 0.5 + 0.5) * sizeH, behind: tmpV.z > 1 }
  }

  function poseChibi(c, { x, z, face, busy, moving, dt, t, yawTo, scale = 1 }) {
    c.g.position.set(x, 0, z)
    c.g.scale.setScalar(scale)
    if (yawTo != null) { let d = yawTo - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; c.yaw += d * Math.min(1, dt * 12) }
    c.body.rotation.y = c.yaw
    c.phase += dt * (moving ? 12 : busy ? 9 : 2)
    const sw = moving ? Math.sin(c.phase) * 0.6 : 0
    c.legs[0].rotation.x = sw; c.legs[1].rotation.x = -sw
    c.arms[0].rotation.x = -sw * 0.8; c.arms[1].rotation.x = sw * 0.8
    c.body.position.y = moving ? Math.abs(Math.sin(c.phase)) * 0.05 : busy ? Math.abs(Math.sin(c.phase)) * 0.03 : Math.sin(c.phase) * 0.008
    c.headG.rotation.x = busy ? 0.35 : 0
    c.headG.rotation.z = busy ? Math.sin(c.phase * 0.5) * 0.15 : 0
    let away = Math.cos(c.yaw) < -0.45 // カメラ（南）に背を向けている
    if (yawTo == null) away = false
    c.face.visible = !away; if (c.over) c.over.visible = !away
    const fk = faceMats[face] ? face : 'calm'
    if (c.faceKind !== fk) { c.face.material = faceMats[fk]; c.faceKind = fk }
    // 顔は頭の表面より少しカメラ寄りに置く（どの向きを向いていても、上からでも表情が見える。頭の球に埋もれない）
    const hy = 0.66 + c.body.position.y + (busy ? -0.03 : 0)
    tmpV.set(c.g.position.x, c.g.position.y + hy * scale, c.g.position.z)
    tmpV.subVectors(camera.position, tmpV).normalize()
    c.face.position.set(tmpV.x * 0.27, hy + 0.02 + tmpV.y * 0.27 - 0.05, tmpV.z * 0.27)
    if (c.over) c.over.position.set(tmpV.x * 0.29, hy + 0.02 + tmpV.y * 0.29 - 0.05, tmpV.z * 0.29)
    c.lens.visible = !!busy
    if (busy) { c.lens.position.y = 1.18 + Math.sin(t * 6) * 0.04 }
  }

  const api = {
    is3d: true,
    get tier() { return tier },
    load,
    toggleZoom() { cam.far = !cam.far; return cam.far },
    get zoomed() { return cam.far },
    setSize(w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
      if (w === sizeW && h === sizeH) return
      sizeW = w; sizeH = h; aspect = w / h
      renderer.setSize(w, h, false)
      camera.aspect = aspect; camera.updateProjectionMatrix()
    },
    flash() { flashT = performance.now() },
    snap() { cam.snap = true },
    // 画面の点 → 地図の座標（マス単位）
    pick(px, py) {
      if (!S) return null
      ndc.set(px / sizeW * 2 - 1, -(py / sizeH) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.ray.intersectPlane(groundPlane, tmpV)
      if (!hit) return null
      // 家具の上の高さも見る（家具を押したらその家具）
      let best = null, bd = 0.75
      for (const { s, bh } of S.spots.values()) {
        const p = project(s.x + 0.5, bh * 0.6, s.y + 0.5)
        const d = Math.hypot(p.x - px, p.y - py) / Math.max(30, sizeW * 0.06)
        if (d < bd) { bd = d; best = s }
      }
      return { x: hit.x, y: hit.z, spot: best ? best.id : null }
    },
    // f: { mode: 'explore'|'lineup'|'scene', me, others[{id,x,y,busy,moving,face,yaw}], near, checked:Set, traces:Set, env, lineup[{id,face}], myVote, voted:Set, dest:[x,y]|null }
    frame(f) {
      if (!S) return {}
      const now = performance.now(), t = now / 1000
      const dt = Math.min(0.1, f.dt)
      const gap = (now - lastFrameAt) / 1000
      if (lastFrameAt && gap < 3) { fpsLog.push(gap); if (fpsLog.length > 90) fpsLog.shift() } // 3秒以上あいたのは画面を閉じていた間なので数えない
      lastFrameAt = now
      // 2秒ごとに見て、40fps を切っていたら画質を1段下げる（とても重い端末でも数秒で下がるよう、フレーム数ではなく時間で見る）
      if (now > lastTierCheck && fpsLog.length >= 8) {
        lastTierCheck = now + 2000
        const fps = fpsLog.length / fpsLog.reduce((a, b) => a + b, 0)
        if (fps < 40 && tier > 0) { setTier(tier - 1); fpsLog.length = 0 }
      }
      const labels = []
      const dark = !!f.env?.dark
      // 雷の光
      const fl = Math.max(0, 1 - (now - flashT) / 260)
      const flick = fl > 0 ? (Math.sin((now - flashT) / 18) > 0 ? fl : fl * 0.3) : 0
      S.hemi.intensity = (f.mode === 'explore' ? (dark ? 0.3 : 0.9) : 0.95) + flick * 4
      S.moon.intensity = (dark ? 0.35 : 0.9) + flick * 2
      if (S.waves) S.waves.offset.set(t * 0.01, t * 0.02)
      for (const sp of S.spots.values()) sp.g.visible = true
      if (f.mode === 'explore' && f.me) {
        S.stage.visible = false; S.spot.visible = false; S.voteRing.visible = false
        const me = f.me
        const { tx, tz, L } = placeExplore(me.x, me.y, dt)
        S.moon.position.set(tx + 3, 10, tz + 6); S.moon.target.position.set(tx, 0, tz)
        // 部屋の明かりと暗がり
        const b = S.boxes[me.room]
        if (b) S.roomLight.position.set((b.x0 + b.x1 + 1) / 2, 2.3, (b.y0 + b.y1 + 1) / 2)
        S.roomLight.intensity = dark ? 0 : 9
        S.lantern.intensity = dark ? 7 : 0
        S.lantern.position.set(me.x, 1.1, me.y)
        for (const [c, sh] of Object.entries(S.shades)) {
          // 自分の部屋より手前（南）の部屋の暗がりは低くする（高い箱だと、斜めから見たとき自分の部屋の床にかぶる）
          const low = b && sh.b.y0 > b.y1 && cam.zoom < 0.5
          const sy = low ? 0.08 : 1
          if (sh.m.scale.y !== sy) { sh.m.scale.y = sy; sh.m.position.y = 0.95 * sy }
          const want = c === me.room ? 0 : (dark ? 0.82 : cam.zoom > 0.5 ? 0.45 : 0.6)
          sh.op += (want - sh.op) * Math.min(1, dt * 6)
          sh.m.material.opacity = sh.op; sh.m.visible = sh.op > 0.01
        }
        // 手前の壁を低くする（自分より南で、カメラとの間にある壁）
        for (let i = 0; i < S.wallTiles.length; i++) {
          const w = S.wallTiles[i]
          const front = w.y + 0.5 > me.y && w.y + 0.5 - me.y < 4.2 && Math.abs(w.x + 0.5 - me.x) < 4.5
          const want = cam.zoom > 0.5 ? 0.45 : front ? LOW_H : WALL_H
          if (Math.abs(w.h - want) > 0.004) { w.h += (want - w.h) * Math.min(1, dt * 10); S.setWall(i, w.h) }
        }
        S.walls.instanceMatrix.needsUpdate = true
        for (const d of S.doors) {
          const front = d.y + 0.5 > me.y && d.y + 0.5 - me.y < 4.2 && Math.abs(d.x + 0.5 - me.x) < 4.5
          const want = cam.zoom > 0.5 ? 0.36 : front ? LOW_H / WALL_H : 1
          d.h += (want - d.h) * Math.min(1, dt * 10); d.g.scale.y = d.h
          const locked = f.env?.lock && f.env.lock[0] === d.x && f.env.lock[1] === d.y
          d.slab.visible = !!locked; d.lock.visible = !!locked
          d.lock.position.y = (WALL_H + 0.35 + Math.sin(t * 5) * 0.06) / Math.max(0.2, d.h)
          d.lock.scale.set(0.5, 0.5 / Math.max(0.2, d.h), 1)
        }
        // 調べる印
        for (const { s, badge, trace, bh } of S.spots.values()) {
          if (!s.noClue) { badge.material = f.checked?.has(s.id) ? badgeMats.ok : badgeMats.q; badge.position.y = bh + Math.sin(t * 2.4 + s.x) * 0.04 }
          trace.visible = !!f.traces?.has(s.id)
        }
        if (f.near) { const s = f.near; S.ring.visible = true; S.ring.position.set(s.x + 0.5, 0.02, s.y + 0.5); S.ring.material.opacity = 0.55 + 0.4 * Math.sin(t * 6); S.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.04) } else S.ring.visible = false
        if (f.dest) { S.dest.visible = true; S.dest.position.set(f.dest[0], 0.025, f.dest[1]); S.dest.scale.setScalar(1 + (t * 2 % 1) * 0.5); S.dest.material.opacity = 1 - (t * 2 % 1) * 0.7 } else S.dest.visible = false
        // 人
        const seen = new Set()
        for (const o of [...(f.others || []), { ...me, self: true }]) {
          const c = S.people.get(o.id); if (!c) continue
          seen.add(o.id); c.g.visible = true
          poseChibi(c, { x: o.x, z: o.y, face: o.face, busy: o.busy, moving: o.moving, dt, t, yawTo: o.yaw, scale: 1.15 })
          const p = project(o.x, 1.36, o.y)
          labels.push({ id: o.id, x: p.x, y: p.y, self: !!o.self })
        }
        for (const [id, c] of S.people) if (!seen.has(id)) c.g.visible = false
        if (S.weather) {
          const arr = S.weather.geometry.attributes.position.array
          const sp = S.snow ? 0.9 : 9
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] -= dt * sp * (0.8 + (i % 5) * 0.1); if (S.snow) arr[i] += Math.sin(t + i) * dt * 0.3
            if (arr[i + 1] < 0) arr[i + 1] += 9
          }
          S.weather.geometry.attributes.position.needsUpdate = true
          S.weather.position.set(tx, 0, tz)
          S.weather.visible = tier > 0
        }
        void L
      } else if (f.mode === 'lineup') {
        // 面通し: 全員が横一列。投票では自分が選んだ人の足もとに赤い輪
        S.stage.visible = true; S.spot.visible = true; S.ring.visible = false; S.dest.visible = false
        S.roomLight.intensity = 0; S.lantern.intensity = 0
        const list = f.lineup || []
        const n = Math.max(1, list.length), gap = 0.95
        camera.fov = 38; camera.updateProjectionMatrix()
        const tv = Math.tan(camera.fov * Math.PI / 360), thh = tv * aspect
        const wantW = n * gap + 0.4
        const L = Math.max(wantW / 2 / thh, 1.25 / tv, 3.2)
        camera.position.set(S.LX, 0.75 + L * 0.28, L)
        camera.lookAt(S.LX, 0.5, 0)
        S.scene.fog.near = 40; S.scene.fog.far = 90
        for (const [, c] of S.people) c.g.visible = false
        list.forEach((o, i) => {
          const c = S.people.get(o.id); if (!c) return
          c.g.visible = true
          const x = S.LX + (i - (n - 1) / 2) * gap
          const hop = o.hop ? Math.abs(Math.sin(t * 7 + i)) * 0.12 : 0
          poseChibi(c, { x, z: o.id === f.myVote ? 0.25 : 0, face: o.face, busy: false, moving: false, dt, t, yawTo: 0 })
          c.g.position.y = hop
          // 6人以上は札が重なるので、1人おきに足もとへ出す
          const below = n >= 6 && i % 2 === 1
          const p = project(x, below ? -0.32 : 1.15 + hop, 0)
          labels.push({ id: o.id, x: p.x, y: p.y, self: o.self, below })
          if (o.id === f.myVote) { S.voteRing.visible = true; S.voteRing.position.set(x, 0.03, 0.25) }
        })
        if (!f.myVote) S.voteRing.visible = false
        S.spot.position.set(S.LX, 6, 4)
      } else {
        // 現場: 事件の部屋のまわりをゆっくり回る
        S.stage.visible = false; S.spot.visible = false; S.ring.visible = false; S.dest.visible = false; S.voteRing.visible = false
        for (const [, c] of S.people) c.g.visible = false
        const b = S.boxes[S.sc.crimeRoom] || Object.values(S.boxes)[0]
        const cx = (b.x0 + b.x1 + 1) / 2, cz = (b.y0 + b.y1 + 1) / 2
        cam.orbit += dt * 0.25
        camera.fov = 45; camera.updateProjectionMatrix()
        const r = 4.2 / Math.min(1, aspect + 0.25)
        camera.position.set(cx + Math.sin(cam.orbit) * r * 0.6, 4.4, cz + Math.cos(cam.orbit) * r * 0.6 + 2.2)
        camera.lookAt(cx, 0.2, cz)
        S.roomLight.intensity = 9; S.roomLight.position.set(cx, 2.3, cz); S.lantern.intensity = 0
        S.moon.position.set(cx + 3, 10, cz + 6); S.moon.target.position.set(cx, 0, cz)
        for (const [c, sh] of Object.entries(S.shades)) { sh.m.scale.y = sh.b.y0 > b.y1 ? 0.08 : 1; sh.m.position.y = 0.95 * sh.m.scale.y; sh.m.material.opacity = c === S.sc.crimeRoom ? 0 : 0.55; sh.m.visible = c !== S.sc.crimeRoom }
        for (let i = 0; i < S.wallTiles.length; i++) { const w = S.wallTiles[i]; if (w.h !== 0.5) { w.h = 0.5; S.setWall(i, 0.5) } }
        S.walls.instanceMatrix.needsUpdate = true
        for (const d of S.doors) { d.g.scale.y = 0.4; d.slab.visible = false; d.lock.visible = false }
        for (const { badge, trace } of S.spots.values()) { badge.visible = false; trace.visible = false }
        S.scene.fog.near = 12; S.scene.fog.far = 30
      }
      if (f.mode !== 'scene') for (const { s, badge } of S.spots.values()) badge.visible = !s.noClue && f.mode === 'explore'
      renderer.render(S.scene, camera)
      return { labels }
    },
    // 描けているかの確認用: いまの画面の輝度の分散
    variance() {
      if (!S) return 0
      const gl = renderer.getContext()
      renderer.render(S.scene, camera)
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
      const px = new Uint8Array(4)
      let s1 = 0, s2 = 0, nn = 0
      for (let yy = 4; yy < h; yy += Math.max(1, h / 24 | 0)) for (let xx = 4; xx < w; xx += Math.max(1, w / 24 | 0)) {
        gl.readPixels(xx, yy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const l = px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11; s1 += l; s2 += l * l; nn++
      }
      return s2 / nn - (s1 / nn) ** 2
    },
    fps() { return fpsLog.length ? fpsLog.length / fpsLog.reduce((a, b) => a + b, 0) : 0 },
    dispose() { disposeScene(); renderer.dispose() }
  }
  setTier(tier)
  return api
}
