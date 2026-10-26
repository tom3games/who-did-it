// 画面で使う絵（SVG の文字列）。似顔絵・アイコン・ロゴ・シナリオの見取り図。絵文字は使わない。
export const COLORS = ['#ff6b6b', '#4da3ff', '#ffd23f', '#3fcf8e', '#b884ff', '#ff9f43', '#2fd3e0', '#ff7eb6']
const INK = '#1d1530'
const SKIN = '#ffd9b3'

// ---------- 似顔絵（ちびキャラの顔）。look は帽子・小物、face は表情
const FACES = {
  calm: `<circle cx="25" cy="32" r="2.4" fill="${INK}"/><circle cx="39" cy="32" r="2.4" fill="${INK}"/><path d="M28 39q4 3 8 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  happy: `<path d="M21 33q4-5 8 0M35 33q4-5 8 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M26 38h12q-1 7-6 7t-6-7z" fill="#8a1f2b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  shock: `<circle cx="25" cy="31" r="4.2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="31" r="4.2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="25" cy="31" r="1.6" fill="${INK}"/><circle cx="39" cy="31" r="1.6" fill="${INK}"/><ellipse cx="32" cy="42" rx="3.4" ry="4.4" fill="#8a1f2b" stroke="${INK}" stroke-width="2"/>`,
  smug: `<path d="M21 31h8M35 31h8" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M22 28l6 1M42 28l-6 1" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M27 40q6 2 10-3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  cry: `<path d="M21 29l6 3-6 3M43 29l-6 3 6 3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 43q2.5-3 5 0t5 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M20 36q-2 5 0 7q2-2 0-7zM44 36q-2 5 0 7q2-2 0-7z" fill="#6fc8ff" stroke="${INK}" stroke-width="1.2"/>`,
  think: `<circle cx="25" cy="32" r="2.2" fill="${INK}"/><circle cx="39" cy="32" r="2.2" fill="${INK}"/><path d="M21 27l7-2M36 26l7 1" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M28 41h7" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M47 22q-3 4 0 6q3-2 0-6z" fill="#6fc8ff" stroke="${INK}" stroke-width="1.2"/>`,
  angry: `<path d="M21 27l7 3M43 27l-7 3" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="25" cy="33" r="2.2" fill="${INK}"/><circle cx="39" cy="33" r="2.2" fill="${INK}"/><rect x="26" y="39" width="12" height="5" rx="1" fill="#fff" stroke="${INK}" stroke-width="2"/>`,
  dizzy: `<path d="M22 29l6 6M28 29l-6 6M36 29l6 6M42 29l-6 6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M27 42q5-3 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
}

function hat(look, color) {
  switch (look) {
    case 'tophat': return `<rect x="20" y="4" width="24" height="12" rx="2" fill="#24203a" stroke="${INK}" stroke-width="2.4"/><rect x="20" y="12" width="24" height="3" fill="${color}"/><rect x="14" y="15" width="36" height="4" rx="2" fill="#24203a" stroke="${INK}" stroke-width="2.4"/>`
    case 'chef': return `<path d="M20 18q-6-1-5-7q1-6 8-4q2-5 9-5t9 5q7-2 8 4t-5 7z" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><rect x="20" y="16" width="24" height="5" fill="#fff" stroke="${INK}" stroke-width="2.4"/>`
    case 'straw': return `<ellipse cx="32" cy="17" rx="24" ry="5" fill="#f2c96a" stroke="${INK}" stroke-width="2.4"/><path d="M21 16q1-11 11-11t11 11z" fill="#f2c96a" stroke="${INK}" stroke-width="2.4"/><rect x="21" y="12" width="22" height="3" fill="${color}"/>`
    case 'cap': return `${hair()}<path d="M15 21q0-14 17-14t17 14z" fill="${color}" stroke="${INK}" stroke-width="2.4"/><path d="M40 20q12-1 15 3H38z" fill="${color}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`
    case 'mirror': return `${hair()}<path d="M15 20q17-6 34 0" fill="none" stroke="#5a5a6e" stroke-width="3"/><circle cx="32" cy="16" r="6" fill="#dfe9f3" stroke="${INK}" stroke-width="2.2"/><circle cx="32" cy="16" r="2.4" fill="#fff"/>`
    case 'beret': return `${hair()}<path d="M13 19q2-13 20-12q16 1 18 9q-17 5-38 3z" fill="#d9324a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M33 7l1-4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
    case 'maid': return `${hair()}<path d="M17 17q15-9 30 0l-2 3q-13-6-26 0z" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M20 15l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3" fill="none" stroke="${INK}" stroke-width="1.4"/>`
    case 'captain': return `<path d="M15 18q0-11 17-12t17 12z" fill="#fff" stroke="${INK}" stroke-width="2.4"/><rect x="15" y="16" width="34" height="5" fill="#1f2a5c" stroke="${INK}" stroke-width="2.2"/><path d="M18 21q14 5 28 0" fill="#111" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="12" r="3" fill="#ffc94a" stroke="${INK}" stroke-width="1.6"/>`
    case 'helmet': return `<path d="M13 21q0-16 19-16t19 16z" fill="#ffc83a" stroke="${INK}" stroke-width="2.4"/><rect x="11" y="19" width="42" height="4" rx="2" fill="#ffc83a" stroke="${INK}" stroke-width="2.2"/><path d="M32 6v13" stroke="${INK}" stroke-width="2"/>`
    case 'ribbon': return `${hair()}<path d="M32 10l-10-6v12zM32 10l10-6v12z" fill="${color}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="32" cy="10" r="3" fill="${color}" stroke="${INK}" stroke-width="2"/>`
    case 'knit': return `<path d="M14 22q0-16 18-16t18 16z" fill="${color}" stroke="${INK}" stroke-width="2.4"/><rect x="13" y="19" width="38" height="5" rx="2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="5" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    case 'glasses': return hair()
    case 'bowtie': return hair()
    default: return hair()
  }
}
const hair = () => `<path d="M14 26q-2-17 18-18q20 1 18 18q-5-7-18-8q-13 1-18 8z" fill="#3b2a24" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
function extra(look) {
  if (look === 'glasses') return `<circle cx="25" cy="32" r="5" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="32" r="5" fill="none" stroke="${INK}" stroke-width="2"/><path d="M30 32h4" stroke="${INK}" stroke-width="2"/>`
  if (look === 'bowtie') return `<path d="M32 55l-7-4v8zM32 55l7-4v8z" fill="#d9324a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`
  if (look === 'tophat') return `<path d="M27 37q-3 0-4 2M37 37q3 0 4 2" fill="none" stroke="#3b2a24" stroke-width="2.4" stroke-linecap="round"/>`
  return ''
}

export function portrait({ color = 0, look = 'cap', face = 'calm', size = 40, cls = '' } = {}) {
  const c = COLORS[color % COLORS.length]
  return `<svg class="pt ${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M10 64q0-14 22-14t22 14z" fill="${c}" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="32" cy="31" r="18" fill="${SKIN}" stroke="${INK}" stroke-width="2.4"/>
    ${hat(look, c)}
    <ellipse cx="20" cy="38" rx="3.5" ry="2.2" fill="#ff8f9a" opacity=".55"/><ellipse cx="44" cy="38" rx="3.5" ry="2.2" fill="#ff8f9a" opacity=".55"/>
    ${FACES[face] || FACES.calm}${extra(look)}
  </svg>`
}

// ---------- アイコン（線と面の自前SVG）
const P = {
  search: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M14.5 14.5l6 6" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  pin: '<rect x="3" y="4" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="8" cy="9" r="1.8" fill="currentColor"/><circle cx="16" cy="9" r="1.8" fill="currentColor"/><path d="M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  people: '<circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 14c3 0 5 2 5 5" fill="none" stroke="currentColor" stroke-width="2"/>',
  check: '<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  hide: '<path d="M4 15l7-7 6 6-4 4H8z" fill="currentColor"/><path d="M13 6l3-3 5 5-3 3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 21h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plant: '<path d="M3 9q9-6 18 0v3q-1 7-9 9q-8-2-9-9z" fill="currentColor"/><path d="M7 11q2-2 4 0M13 11q2-2 4 0" stroke="#1d1530" stroke-width="2" fill="none" stroke-linecap="round"/>',
  bolt: '<path d="M13 2L4 14h7l-2 8 9-12h-7z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  moon: '<path d="M20 15A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 11z" fill="currentColor"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  bulb: '<path d="M8 15a6 6 0 1 1 8 0v3H8z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 21h6M4 4l16 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  zoom: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.5 14.5l6 6M7 10h6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  zoomin: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.5 14.5l6 6M7 10h6M10 7v6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  vote: '<rect x="4" y="11" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 11V4h8v7M10 8l2 2 3-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>',
  talk: '<path d="M4 5h16v10H10l-5 4v-4H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  mask: '<path d="M3 8q9-5 18 0v4q-2 6-9 8q-7-2-9-8z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 11h3M14 11h3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  role: '<rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="10" r="3" fill="currentColor"/><path d="M8 17q4-4 8 0" stroke="currentColor" stroke-width="2.2" fill="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  left: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  culprit: '<path d="M3 16c3-2 15-2 18 0l-1 3H4z" fill="currentColor"/><path d="M7 16l1.2-9h7.6L17 16" fill="currentColor"/><rect x="5" y="10" width="14" height="2" fill="#1d1530"/>',
  detective: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.5 14.5l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  forensic: '<path d="M9 3h6M10 3v6l-5 10h14l-5-10V3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 15h10" stroke="currentColor" stroke-width="2"/>',
  witness: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
  resident: '<path d="M4 11l8-7 8 7v9H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" fill="currentColor"/>'
}
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`

// ---------- ロゴ（ホームの大きな題字）
export const LOGO = `<svg class="logo-svg" viewBox="0 0 440 250" role="img" aria-label="犯人は誰だ？">
  <defs>
    <linearGradient id="lgGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".5" stop-color="#ffc94a"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>
    <radialGradient id="lgSpot" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff6c9" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="220" cy="140" rx="210" ry="110" fill="url(#lgSpot)"/>
  <g transform="rotate(-5 220 125)">
    <path d="M20 58 L74 40 L120 52 L176 26 L246 42 L300 20 L360 38 L418 30 L404 96 L424 142 L392 178 L410 222 L340 210 L270 228 L196 210 L122 226 L66 204 L24 214 L36 160 L8 118 Z" fill="${INK}"/>
    <path d="M8 92l-8 4M414 64l14-6M386 222l14 10M50 218l-10 12M296 14l6-10" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <text x="44" y="100" font-family="Dela Gothic One, Hiragino Sans, sans-serif" font-size="58" fill="#ffffff" stroke="${INK}" stroke-width="4" paint-order="stroke">犯人は</text>
    <text x="52" y="196" font-family="Dela Gothic One, Hiragino Sans, sans-serif" font-size="92" fill="url(#lgGold)" stroke="${INK}" stroke-width="6" paint-order="stroke">誰だ</text>
    <g transform="translate(330 128)">
      <circle r="44" fill="rgba(170,220,255,.18)" stroke="#fff" stroke-width="9"/>
      <circle r="44" fill="none" stroke="${INK}" stroke-width="3"/>
      <path d="M30 32l40 40" stroke="#c9873a" stroke-width="16" stroke-linecap="round"/>
      <path d="M30 32l40 40" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <text x="-2" y="26" text-anchor="middle" font-family="Dela Gothic One, Hiragino Sans, sans-serif" font-size="74" fill="#ff5a5f" stroke="${INK}" stroke-width="4" paint-order="stroke">？</text>
      <path d="M-26-20q8-14 22-16" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>
    </g>
  </g>
</svg>`

// ---------- シナリオの見取り図（地図のデータから描く）
const FLOOR_COL = { wood: '#a8794a', carpet: '#7b4c8f', rug: '#9c3b3b', parquet: '#b98a55', tile: '#b9c3c9', stone: '#8a8478', grass: '#4f9a52', deck: '#c39a62', metal: '#6f7a86' }
export const floorColor = k => FLOOR_COL[k] || '#a8794a'
export function mapThumb(sc, { w = 120 } = {}) {
  const T = 10, W = sc.map[0].length, H = sc.map.length
  let r = ''
  sc.map.forEach((row, y) => [...row].forEach((c, x) => {
    const fill = c === '#' ? INK : c === '+' ? '#e2b26a' : floorColor(sc.floors?.[c])
    r += `<rect x="${x * T}" y="${y * T}" width="${T + 0.3}" height="${T + 0.3}" fill="${fill}"/>`
  }))
  for (const s of sc.spots) r += s.noClue
    ? `<path d="M${s.x * T + 2} ${s.y * T + 2}l6 6M${s.x * T + 8} ${s.y * T + 2}l-6 6" stroke="#ff5a5f" stroke-width="2.4" stroke-linecap="round"/>`
    : `<circle cx="${(s.x + 0.5) * T}" cy="${(s.y + 0.5) * T}" r="2.2" fill="#ffe7a8"/>`
  return `<svg class="thumb" width="${w}" viewBox="0 0 ${W * T} ${H * T}" aria-hidden="true">${r}</svg>`
}
