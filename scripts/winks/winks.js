// Palique's winks, drawn on a canvas and with synthesized sound. preview.html plays them
// and record.ts records them into src/renderer/src/assets/winks/<id>.webm (VP9 with alpha
// + Opus, the format the app plays). To change one: edit it here, check it in
// preview.html, then run `node scripts/winks/record.ts <id>`. New ids also need a label in
// src/renderer/src/winks.ts.
/* eslint-disable */

const W = 480,
  H = 360,
  DUR = 3.6,
  GAP = 0.8
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const seg = (t, a, b) => clamp((t - a) / (b - a))
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
const back = (x) => {
  const c = 1.9
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
}
const lerp = (a, b, x) => a + (b - a) * x
const INK = '#4a2a12'

function heart(c, x, y, s, color = '#e8344e') {
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.beginPath()
  c.moveTo(0, 6)
  c.bezierCurveTo(-14, -4, -8, -16, 0, -8)
  c.bezierCurveTo(8, -16, 14, -4, 0, 6)
  c.fillStyle = color
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 45%)'
  c.beginPath()
  c.ellipse(-5, -7, 2.5, 1.6, -0.6, 0, 7)
  c.fill()
  c.restore()
}
function tear(c, x, y, s) {
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.beginPath()
  c.moveTo(0, -8)
  c.quadraticCurveTo(7, 2, 0, 6)
  c.quadraticCurveTo(-7, 2, 0, -8)
  c.fillStyle = '#5fc1ff'
  c.fill()
  c.restore()
}
function text(c, str, x, y, size, color, alpha = 1, rot = 0) {
  c.save()
  c.globalAlpha = alpha
  c.translate(x, y)
  c.rotate(rot)
  c.font = `900 ${size}px "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineWidth = size / 6
  c.strokeStyle = '#fff'
  c.strokeText(str, 0, 0)
  c.fillStyle = color
  c.fillText(str, 0, 0)
  c.restore()
}

// The face: radius 80 around (0,0); expressions picked by name.
function face(c, o = {}) {
  const {
    eyes = 'open',
    mouth = 'smile',
    blush = 0,
    red = 0,
    brows = 0,
    wobble = 0,
    eyeScale = 1
  } = o
  const g = c.createRadialGradient(-26, -32, 10, 0, 0, 86)
  g.addColorStop(0, '#fff6a8')
  g.addColorStop(0.45, '#ffd84a')
  g.addColorStop(1, '#f2a516')
  c.save()
  c.beginPath()
  c.arc(0, 0, 80, 0, 7)
  c.fillStyle = g
  c.fill()
  if (red) {
    // angry flush rising from the chin
    c.save()
    c.clip()
    const level = lerp(90, -90, red)
    const rg = c.createLinearGradient(0, level - 30, 0, 90)
    rg.addColorStop(0, 'rgb(232 52 40 / 0)')
    rg.addColorStop(0.35, 'rgb(232 52 40 / 0.9)')
    rg.addColorStop(1, 'rgb(190 30 20 / 0.95)')
    c.fillStyle = rg
    c.fillRect(-90, level - 30, 180, 200)
    c.restore()
  }
  c.lineWidth = 3
  c.strokeStyle = 'rgb(160 90 10 / 0.55)'
  c.stroke()
  c.fillStyle = 'rgb(255 255 255 / 0.55)'
  c.beginPath()
  c.ellipse(-30, -44, 22, 11, -0.5, 0, 7)
  c.fill()
  if (blush) {
    c.fillStyle = `rgb(255 110 120 / ${0.55 * blush})`
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(s * 46, 18, 15, 9, 0, 0, 7)
      c.fill()
    }
  }
  // eyes
  c.fillStyle = INK
  c.strokeStyle = INK
  c.lineCap = 'round'
  c.lineWidth = 7
  const eye = (x, kind) => {
    c.save()
    c.translate(x, -14)
    c.scale(eyeScale, eyeScale)
    if (kind === 'open') {
      c.beginPath()
      c.ellipse(0, 0, 9, 14, 0, 0, 7)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(-3, -5, 3.5, 0, 7)
      c.fill()
    } else if (kind === 'happy') {
      c.beginPath()
      c.arc(0, 6, 12, Math.PI * 1.1, Math.PI * 1.9)
      c.stroke()
    } else if (kind === 'closed') {
      c.beginPath()
      c.arc(0, -4, 12, Math.PI * 0.15, Math.PI * 0.85)
      c.stroke()
    } else if (kind === 'heart') heart(c, 0, 2, 1.55)
    else if (kind === 'wide') {
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(0, 0, 17, 0, 7)
      c.fill()
      c.lineWidth = 3
      c.stroke()
      c.fillStyle = INK
      c.beginPath()
      c.arc(0, 2, 6, 0, 7)
      c.fill()
    } else if (kind === 'sad') {
      c.beginPath()
      c.ellipse(0, 3, 8, 11, 0, 0, 7)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(-3, -1, 3, 0, 7)
      c.fill()
    }
    c.restore()
  }
  const [l, r] = Array.isArray(eyes) ? eyes : [eyes, eyes]
  eye(-28, l)
  eye(28, r)
  if (brows) {
    // >0 angry, <0 worried
    c.lineWidth = 7
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(s * 44, -40 - brows * s * 0 + (brows > 0 ? -8 : 6))
      c.lineTo(s * 14, -40 + (brows > 0 ? 6 : -10))
      c.stroke()
    }
  }
  // mouth
  c.lineWidth = 7
  c.save()
  c.translate(0, 30)
  if (mouth === 'smile') {
    c.beginPath()
    c.arc(0, -16, 34, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  } else if (mouth === 'grin' || mouth === 'laugh') {
    const open = mouth === 'laugh' ? 30 + wobble * 6 : 18
    c.beginPath()
    c.moveTo(-36, -6)
    c.quadraticCurveTo(0, -12, 36, -6)
    c.quadraticCurveTo(0, open + 10, -36, -6)
    c.closePath()
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
    c.save()
    c.clip()
    c.fillStyle = '#ff7b8a'
    c.beginPath()
    c.ellipse(0, open + 2, 18, 12, 0, 0, 7)
    c.fill()
    c.fillStyle = '#fff'
    c.fillRect(-30, -12, 60, 8)
    c.restore()
  } else if (mouth === 'o') {
    c.beginPath()
    c.ellipse(0, 4, 12, 16 + wobble * 3, 0, 0, 7)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  } else if (mouth === 'kiss') {
    c.fillStyle = '#e8344e'
    c.beginPath()
    c.ellipse(-6, 0, 10, 8, 0.4, 0, 7)
    c.ellipse(6, 0, 10, 8, -0.4, 0, 7)
    c.fill()
    c.lineWidth = 3
    c.strokeStyle = '#9b1b2c'
    c.beginPath()
    c.moveTo(-14, 1)
    c.lineTo(14, 1)
    c.stroke()
  } else if (mouth === 'frown') {
    c.beginPath()
    c.arc(0, 26, 30, Math.PI * 1.22, Math.PI * 1.78)
    c.stroke()
  } else if (mouth === 'wail') {
    c.beginPath()
    c.moveTo(-30, 14)
    c.quadraticCurveTo(-8, -18 - wobble * 4, 0, -12)
    c.quadraticCurveTo(8, -18 + wobble * 4, 30, 14)
    c.quadraticCurveTo(0, 26, -30, 14)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  } else if (mouth === 'smirk') {
    c.beginPath()
    c.moveTo(-26, -2)
    c.quadraticCurveTo(6, 10, 32, -10)
    c.stroke()
  }
  c.restore()
  c.restore()
}

function shades(c, glint) {
  c.save()
  c.translate(0, -12)
  c.fillStyle = '#16161c'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 6, -10)
    c.lineTo(s * 50, -12)
    c.quadraticCurveTo(s * 52, 18, s * 30, 20)
    c.quadraticCurveTo(s * 8, 18, s * 6, -10)
    c.fill()
  }
  c.fillRect(-10, -12, 20, 7)
  c.lineWidth = 5
  c.strokeStyle = '#16161c'
  c.beginPath()
  c.moveTo(-50, -10)
  c.lineTo(-76, -18)
  c.moveTo(50, -10)
  c.lineTo(76, -18)
  c.stroke()
  if (glint >= 0 && glint <= 1) {
    c.save()
    c.beginPath()
    for (const s of [-1, 1]) {
      c.moveTo(s * 6, -10)
      c.lineTo(s * 50, -12)
      c.quadraticCurveTo(s * 52, 18, s * 30, 20)
      c.quadraticCurveTo(s * 8, 18, s * 6, -10)
    }
    c.clip()
    c.globalAlpha = 0.85
    c.fillStyle = '#fff'
    const x = lerp(-80, 80, glint)
    c.beginPath()
    c.moveTo(x - 6, -14)
    c.lineTo(x + 6, -14)
    c.lineTo(x - 8, 24)
    c.lineTo(x - 20, 24)
    c.fill()
    c.restore()
  }
  c.restore()
}

function sparkle(c, x, y, s, a) {
  c.save()
  c.globalAlpha = a
  c.translate(x, y)
  c.scale(s, s)
  c.fillStyle = '#fff'
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 3 : 12
    const ang = (i * Math.PI) / 4
    c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r)
  }
  c.fill()
  c.restore()
}

// ---------- Characters ----------
const SKIN = '#ffd2a6',
  SKIN_DARK = '#e9a877'
function capOn(c, color = '#e53935', backwards = false) {
  c.save()
  c.fillStyle = color
  c.beginPath()
  c.arc(0, -18, 72, Math.PI * 1.02, Math.PI * 1.98)
  c.closePath()
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.25)'
  c.beginPath()
  c.ellipse(-20, -66, 24, 9, -0.2, 0, 7)
  c.fill()
  c.fillStyle = color
  c.beginPath()
  if (backwards) {
    c.ellipse(-62, -26, 34, 9, 0.35, 0, 7)
  } else {
    c.ellipse(46, -22, 46, 10, -0.08, 0, 7)
  }
  c.fill()
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(0, -88, 7, 0, 7)
  c.fill()
  c.restore()
}
function kidHead(c, o = {}) {
  const {
    eyes = 'open',
    mouth = 'grin',
    cap = '#e53935',
    backwards = false,
    tongue = 0,
    blush = 0.5
  } = o
  c.save()
  c.fillStyle = SKIN
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 70, 4, 13, 18, 0, 0, 7)
    c.fill()
  }
  const g = c.createRadialGradient(-20, -24, 8, 0, 0, 80)
  g.addColorStop(0, '#ffe6cc')
  g.addColorStop(1, SKIN)
  c.beginPath()
  c.ellipse(0, 0, 70, 74, 0, 0, 7)
  c.fillStyle = g
  c.fill()
  c.lineWidth = 3
  c.strokeStyle = SKIN_DARK
  c.stroke()
  c.fillStyle = '#7a4a22'
  for (let i = -2; i <= 2; i++) {
    c.beginPath()
    c.ellipse(i * 14, -50, 10, 7, i * 0.3, 0, 7)
    c.fill()
  }
  capOn(c, cap, backwards)
  c.fillStyle = `rgb(255 120 120 / ${0.45 * blush})`
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 42, 20, 13, 8, 0, 0, 7)
    c.fill()
  }
  c.fillStyle = INK
  c.strokeStyle = INK
  c.lineCap = 'round'
  c.lineWidth = 6
  const eye = (x, kind) => {
    c.save()
    c.translate(x, -6)
    if (kind === 'open') {
      c.beginPath()
      c.ellipse(0, 0, 7, 10, 0, 0, 7)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(-2, -4, 2.6, 0, 7)
      c.fill()
    } else if (kind === 'squint') {
      c.beginPath()
      c.moveTo(-10, -6)
      c.lineTo(8, 0)
      c.lineTo(-10, 6)
      c.stroke()
    } else if (kind === 'squintR') {
      c.beginPath()
      c.moveTo(10, -6)
      c.lineTo(-8, 0)
      c.lineTo(10, 6)
      c.stroke()
    } else if (kind === 'happy') {
      c.beginPath()
      c.arc(0, 5, 10, Math.PI * 1.1, Math.PI * 1.9)
      c.stroke()
    }
    c.restore()
  }
  const [l, r] = Array.isArray(eyes) ? eyes : [eyes, eyes]
  eye(-24, l)
  eye(24, r)
  c.save()
  c.translate(0, 30)
  if (mouth === 'grin') {
    c.beginPath()
    c.arc(0, -14, 26, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  } else if (mouth === 'laugh') {
    c.beginPath()
    c.moveTo(-26, -4)
    c.quadraticCurveTo(0, -8, 26, -4)
    c.quadraticCurveTo(0, 30, -26, -4)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  } else if (mouth === 'tongue') {
    c.beginPath()
    c.moveTo(-24, -2)
    c.quadraticCurveTo(0, 8, 24, -2)
    c.stroke()
    c.save()
    c.translate(0, 2)
    c.rotate(Math.sin(tongue * 20) * 0.25)
    const len = 18 + tongue * 18
    c.fillStyle = '#ff6b81'
    c.beginPath()
    c.moveTo(-13, 0)
    c.lineTo(-13, len - 10)
    c.quadraticCurveTo(0, len + 10, 13, len - 10)
    c.lineTo(13, 0)
    c.fill()
    c.strokeStyle = '#d94660'
    c.lineWidth = 2.5
    c.beginPath()
    c.moveTo(0, 3)
    c.lineTo(0, len - 6)
    c.stroke()
    c.restore()
  } else if (mouth === 'o') {
    c.beginPath()
    c.ellipse(0, 2, 9, 12, 0, 0, 7)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  }
  c.restore()
  c.restore()
}
function kidBody(c, shirt = '#2f7de1') {
  c.save()
  c.fillStyle = shirt
  c.beginPath()
  c.moveTo(-46, 70)
  c.quadraticCurveTo(-56, 160, -44, 190)
  c.lineTo(44, 190)
  c.quadraticCurveTo(56, 160, 46, 70)
  c.quadraticCurveTo(0, 56, -46, 70)
  c.fill()
  c.fillStyle = '#fff'
  c.font = '900 34px system-ui, sans-serif'
  c.textAlign = 'center'
  c.fillText('P', 0, 140)
  c.restore()
}
function arm(c, x, y, angle, len = 70, color = '#2f7de1', hand = true) {
  c.save()
  c.translate(x, y)
  c.rotate(angle)
  c.strokeStyle = color
  c.lineCap = 'round'
  c.lineWidth = 22
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(0, len)
  c.stroke()
  if (hand) {
    c.fillStyle = SKIN
    c.beginPath()
    c.arc(0, len + 6, 14, 0, 7)
    c.fill()
    c.strokeStyle = SKIN_DARK
    c.lineWidth = 2.5
    c.stroke()
  }
  c.restore()
}

// A fixed splat outline, so it doesn't flicker frame to frame.
const SPLAT = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * Math.PI * 2,
  r: 0.75 + ((i * 37) % 11) / 22,
  d: (i * 53) % 7
}))
function splat(c, x, y, size, alpha) {
  c.save()
  c.globalAlpha = alpha
  c.translate(x, y)
  c.scale(size, size)
  const g = c.createRadialGradient(-20, -20, 10, 0, 0, 130)
  g.addColorStop(0, 'rgb(200 240 255 / 0.95)')
  g.addColorStop(1, 'rgb(70 170 255 / 0.85)')
  c.fillStyle = g
  c.beginPath()
  // Smooth blob: curves through the midpoints between the outline points.
  const pts = SPLAT.map(({ a, r }) => [Math.cos(a) * 100 * r, Math.sin(a) * 100 * r])
  const mid = (i) => {
    const [x1, y1] = pts[i % pts.length],
      [x2, y2] = pts[(i + 1) % pts.length]
    return [(x1 + x2) / 2, (y1 + y2) / 2]
  }
  c.moveTo(...mid(0))
  for (let i = 1; i <= pts.length; i++) c.quadraticCurveTo(...pts[i % pts.length], ...mid(i))
  c.closePath()
  c.fill()
  SPLAT.forEach(({ a, r, d }) => {
    c.beginPath()
    c.arc(Math.cos(a) * (130 + d * 12) * r, Math.sin(a) * (130 + d * 12) * r, 6 + d * 2, 0, 7)
    c.fill()
  })
  c.fillStyle = 'rgb(255 255 255 / 0.6)'
  c.beginPath()
  c.ellipse(-34, -38, 26, 12, -0.6, 0, 7)
  c.fill()
  c.restore()
}

function pig(c, t, dance) {
  const sway = Math.sin(t * 7) * dance
  c.save()
  // legs
  c.strokeStyle = '#f48fb1'
  c.lineCap = 'round'
  c.lineWidth = 20
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 26, 70)
    c.lineTo(s * 30 + s * Math.max(0, Math.sin(t * 7 * s)) * 16 * dance, 130)
    c.stroke()
  }
  c.fillStyle = '#7a3b52'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 30 + s * Math.max(0, Math.sin(t * 7 * s)) * 16 * dance, 136, 13, 7, 0, 0, 7)
    c.fill()
  }
  // hips and body
  c.rotate(sway * 0.22)
  c.strokeStyle = '#f48fb1'
  c.lineWidth = 5
  c.beginPath()
  c.arc(70, 30, 10, 0, Math.PI * 1.6)
  c.stroke()
  const g = c.createRadialGradient(-20, -10, 10, 0, 20, 90)
  g.addColorStop(0, '#ffd1e0')
  g.addColorStop(1, '#f48fb1')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, 30, 66, 58, 0, 0, 7)
  c.fill()
  // arms: one up waving, one on the hip
  c.strokeStyle = '#f48fb1'
  c.lineWidth = 16
  c.beginPath()
  c.moveTo(-50, 10)
  c.quadraticCurveTo(
    -90,
    -40 + Math.sin(t * 7) * 10 * dance,
    -70 + Math.sin(t * 14) * 14 * dance,
    -90
  )
  c.stroke()
  c.beginPath()
  c.moveTo(52, 16)
  c.quadraticCurveTo(84, 40, 56, 58)
  c.stroke()
  // head
  c.translate(0, -50)
  c.rotate(-sway * 0.35)
  c.fillStyle = '#f48fb1'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 22, -38)
    c.lineTo(s * 46, -62)
    c.lineTo(s * 48, -26)
    c.fill()
  }
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, -6, 52, 46, 0, 0, 7)
  c.fill()
  c.fillStyle = '#ff9ec0'
  c.beginPath()
  c.ellipse(0, 10, 22, 15, 0, 0, 7)
  c.fill()
  c.fillStyle = '#c2577a'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 8, 10, 4, 6, 0, 0, 7)
    c.fill()
  }
  // half-closed flirty eyes with lashes
  c.strokeStyle = INK
  c.lineWidth = 4
  c.lineCap = 'round'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 20, -16, 9, Math.PI * 0.05, Math.PI * 0.95)
    c.stroke()
    for (let k = 0; k < 3; k++) {
      c.beginPath()
      c.moveTo(s * 20 + (k - 1) * 6, -14)
      c.lineTo(s * 20 + (k - 1) * 8, -6 + 0)
      c.stroke()
    }
  }
  c.fillStyle = '#e8344e'
  c.beginPath()
  c.ellipse(0, 32, 9, 5, 0, 0, 7)
  c.fill()
  c.restore()
}
function discoBall(c, x, y, t, a) {
  c.save()
  c.globalAlpha = a
  c.translate(x, y)
  c.strokeStyle = '#ccc'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(0, -60)
  c.lineTo(0, -26)
  c.stroke()
  c.beginPath()
  c.arc(0, 0, 26, 0, 7)
  c.clip()
  for (let i = -4; i < 5; i++)
    for (let j = -4; j < 5; j++) {
      const v = (Math.sin(i * 1.7 + j * 2.3 + t * 8) + 1) / 2
      c.fillStyle = `hsl(${200 + v * 60} 20% ${55 + v * 40}%)`
      c.fillRect(i * 7, j * 7, 6, 6)
    }
  c.restore()
}

// Shared entrance/exit: pop in, fade out.
function enter(c, t, x = W / 2, y = H / 2 + 10, size = 1) {
  const s = back(seg(t, 0, 0.45)) * size * (1 - 0.15 * seg(t, DUR - 0.4, DUR))
  c.globalAlpha = 1 - seg(t, DUR - 0.35, DUR)
  c.translate(x, y)
  c.scale(s, s)
}

const WINKS = [
  {
    id: 'globo',
    name: 'Globo de agua',
    desc: 'Un chaval con gorra coge impulso, te lanza un globo de agua y ¡splash! contra la pantalla; luego chorrea y se ríe.',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.35, DUR)
      // kid on the left, small, winding up and throwing
      const inK = back(seg(t, 0, 0.4))
      c.save()
      c.globalAlpha = fade
      c.translate(lerp(-80, 120, inK), H - 120)
      c.scale(0.55, 0.55)
      kidBody(c)
      const wind = seg(t, 0.35, 0.8),
        throwT = seg(t, 0.8, 0.95)
      const ang = throwT > 0 ? lerp(-2.6, 0.9, ease(throwT)) : lerp(0.3, -2.6, ease(wind))
      arm(c, -46, 84, 0.3)
      arm(c, 46, 84, ang)
      if (t < 0.85) {
        c.save()
        c.translate(46, 84)
        c.rotate(ang)
        c.fillStyle = '#4fb3ff'
        c.beginPath()
        c.arc(0, 92, 20, 0, 7)
        c.fill()
        c.restore()
      }
      c.translate(0, 0)
      kidHead(c, {
        eyes: t > 1.5 ? 'happy' : 'open',
        mouth: t > 1.5 ? 'laugh' : t > 0.8 ? 'o' : 'grin'
      })
      c.restore()
      // balloon flying at the screen, growing
      const fly = seg(t, 0.85, 1.4)
      if (fly > 0 && fly < 1) {
        const k = ease(fly)
        c.save()
        c.globalAlpha = fade
        const bx = lerp(150, W / 2, k),
          by = lerp(H - 170, H / 2 - 20, k) - Math.sin(k * Math.PI) * 60,
          r = lerp(12, 70, k ** 2)
        const g = c.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r)
        g.addColorStop(0, '#d8f2ff')
        g.addColorStop(1, '#2f9cf0')
        c.fillStyle = g
        c.beginPath()
        c.arc(bx, by, r, 0, 7)
        c.fill()
        c.fillStyle = '#2f9cf0'
        c.beginPath()
        c.moveTo(bx, by + r)
        c.lineTo(bx - 6, by + r + 10)
        c.lineTo(bx + 6, by + r + 10)
        c.fill()
        c.restore()
      }
      // splash on the "glass", then drips
      const sp = seg(t, 1.4, 1.55)
      if (t >= 1.4) {
        splat(c, W / 2, H / 2 - 20, 0.6 + back(sp) * 0.9, 0.95 * fade)
        for (let i = 0; i < 7; i++) {
          const d = seg(t, 1.6 + i * 0.12, 3.3)
          const x = W / 2 - 110 + i * 36,
            y0 = H / 2 + 30 + (i % 3) * 14
          c.save()
          c.globalAlpha = 0.85 * fade
          c.fillStyle = '#6cc4ff'
          c.fillRect(x - 5, y0, 10, d * 120)
          c.beginPath()
          c.arc(x, y0 + d * 120, 8, 0, 7)
          c.fill()
          c.restore()
        }
        if (t > 1.45 && t < 2.4)
          text(
            c,
            '¡SPLASH!',
            W / 2,
            52,
            40 + back(seg(t, 1.45, 1.7)) * 6,
            '#1677d2',
            fade * (1 - seg(t, 2.1, 2.4)),
            -0.08
          )
      }
    }
  },
  {
    id: 'cerdo',
    name: 'Cerdo bailón',
    desc: 'Se encienden luces de discoteca, baja una bola de espejos y un cerdo mueve las caderas con mucha intención.',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.35, DUR)
      const lights = seg(t, 0, 0.4) * fade
      // beams sweeping from the top
      const colors = ['255 70 160', '80 200 255', '255 220 60', '140 255 120']
      colors.forEach((col, i) => {
        const a = Math.sin(t * 2.2 + i * 1.6) * 0.6
        c.save()
        c.globalAlpha = 0.32 * lights
        c.translate(W / 2 + (i - 1.5) * 70, -10)
        c.rotate(a)
        const g = c.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, `rgb(${col} / 1)`)
        g.addColorStop(1, `rgb(${col} / 0)`)
        c.fillStyle = g
        c.beginPath()
        c.moveTo(-8, 0)
        c.lineTo(8, 0)
        c.lineTo(70, H + 20)
        c.lineTo(-70, H + 20)
        c.fill()
        c.restore()
      })
      discoBall(c, W / 2, lerp(-40, 50, ease(seg(t, 0, 0.6))), t, fade)
      // floor spots
      for (let i = 0; i < 5; i++) {
        c.save()
        c.globalAlpha = 0.35 * lights
        c.fillStyle = `rgb(${colors[(i + Math.floor(t * 4)) % 4]})`
        c.beginPath()
        c.ellipse(80 + i * 80, H - 22, 34, 9, 0, 0, 7)
        c.fill()
        c.restore()
      }
      // the pig
      const inP = back(seg(t, 0.3, 0.8))
      c.save()
      c.globalAlpha = fade
      c.translate(W / 2, H - 150 + (1 - inP) * 260 - Math.abs(Math.sin(t * 7)) * 8 * seg(t, 0.8, 1))
      c.scale(0.8, 0.8)
      pig(c, t, seg(t, 0.8, 1.1))
      c.restore()
      for (let i = 0; i < 4; i++) {
        const p = (t * 0.7 + i / 4) % 1
        if (t > 0.9)
          text(
            c,
            i % 2 ? '♪' : '♫',
            70 + i * 110 + Math.sin(p * 6) * 10,
            lerp(H - 60, 60, p),
            30,
            `rgb(${colors[i]})`,
            Math.sin(p * Math.PI) * fade
          )
      }
    }
  },
  {
    id: 'burla',
    name: 'Crío burlón',
    desc: 'Un crío con la gorra del revés se pone las manos en las orejas, menea los dedos y te saca la lengua. ¡Nananá!',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.35, DUR)
      const inK = back(seg(t, 0, 0.45))
      const mock = seg(t, 0.6, 0.8)
      c.save()
      c.globalAlpha = fade
      c.translate(W / 2, H / 2 + 30 + (1 - inK) * 300)
      c.scale(1.1, 1.1)
      c.rotate(Math.sin(t * 9) * 0.08 * mock)
      kidHead(c, {
        backwards: true,
        eyes: mock > 0.5 ? ['squint', 'open'] : 'open',
        mouth: mock > 0.5 ? 'tongue' : 'grin',
        tongue: mock > 0.5 ? (Math.sin(t * 8) + 1) / 2 : 0,
        cap: '#1e9e5a'
      })
      // hands on the ears, wiggling fingers
      for (const s of [-1, 1]) {
        c.save()
        c.translate(s * 84, -6 + (1 - mock) * 120)
        c.globalAlpha = mock * fade
        c.fillStyle = SKIN
        c.strokeStyle = SKIN_DARK
        c.lineWidth = 2.5
        c.beginPath()
        c.ellipse(0, 0, 16, 20, 0, 0, 7)
        c.fill()
        c.stroke()
        for (let f = 0; f < 4; f++) {
          const wig = Math.sin(t * 22 + f * 0.9) * 0.35
          c.save()
          c.rotate(s * (-0.9 + f * 0.42) + wig)
          c.beginPath()
          c.roundRect(-5, -44, 10, 30, 5)
          c.fill()
          c.stroke()
          c.restore()
        }
        c.restore()
      }
      c.restore()
      if (t > 0.9 && t < DUR - 0.3) {
        text(
          c,
          '¡Nananá!',
          W / 2 - 120,
          92 + Math.sin(t * 8) * 6,
          30,
          '#1e9e5a',
          seg(t, 0.9, 1.1) * fade,
          -0.15
        )
        text(
          c,
          ':P',
          W / 2 + 140,
          80 + Math.cos(t * 8) * 6,
          34,
          '#ff4f7a',
          seg(t, 1.2, 1.4) * fade,
          0.2
        )
      }
    }
  },
  {
    id: 'beso',
    name: 'Beso',
    desc: 'Guiña un ojo, pone morritos y te lanza un corazón que se acerca hasta reventar en corazoncitos.',
    draw(c, t) {
      c.save()
      enter(c, t)
      const lean = Math.sin(seg(t, 0.9, 1.3) * Math.PI) * 0.12
      c.rotate(lean)
      const eyes = t > 0.55 && t < 1.0 ? ['open', 'closed'] : t >= 1.0 ? 'closed' : 'open'
      face(c, { eyes, mouth: t >= 0.95 ? 'kiss' : 'smile', blush: seg(t, 0.9, 1.3) })
      c.restore()
      const ht = seg(t, 1.25, 2.4)
      if (ht > 0 && ht < 1) {
        const k = ease(ht)
        heart(
          c,
          lerp(W / 2 + 4, W / 2 + 60, k),
          lerp(H / 2 + 40, H / 2 - 40, k),
          lerp(0.8, 9, k ** 2)
        )
      }
      const bt = seg(t, 2.4, 3.3)
      if (bt > 0 && bt < 1)
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2,
            d = 40 + 190 * ease(bt)
          c.save()
          c.globalAlpha = 1 - bt
          heart(
            c,
            W / 2 + 60 + Math.cos(a) * d,
            H / 2 - 40 + Math.sin(a) * d * 0.8,
            1.6 + (i % 3) * 0.5
          )
          c.restore()
        }
    }
  },
  {
    id: 'carcajada',
    name: 'Carcajada',
    desc: 'Se parte de risa: bota y se balancea, le saltan las lágrimas y aparecen «JA» por todas partes.',
    draw(c, t) {
      const laugh = seg(t, 0.4, 0.55) * (1 - seg(t, 3.0, 3.2))
      c.save()
      enter(c, t)
      c.translate(0, -Math.abs(Math.sin(t * 12)) * 18 * laugh)
      c.rotate(Math.sin(t * 6) * 0.16 * laugh)
      face(c, {
        eyes: laugh > 0.3 ? 'happy' : 'open',
        mouth: laugh > 0.3 ? 'laugh' : 'grin',
        wobble: Math.sin(t * 24),
        blush: laugh * 0.8
      })
      if (laugh > 0.3)
        for (let i = 0; i < 6; i++) {
          const p = (t * 1.6 + i / 6) % 1
          for (const s of [-1, 1])
            tear(
              c,
              s * (34 + p * 70),
              -10 - Math.sin(p * Math.PI) * 50 + p * 70,
              1.2 * (1 - p * 0.4)
            )
        }
      c.restore()
      const spots = [
        [100, 70, -0.3],
        [380, 80, 0.25],
        [70, 250, 0.2],
        [410, 260, -0.2],
        [240, 40, 0]
      ]
      spots.forEach(([x, y, r], i) => {
        const p = seg(t, 0.6 + i * 0.35, 1.3 + i * 0.35)
        if (p > 0 && p < 1 && t < DUR - 0.3)
          text(
            c,
            'JA',
            x,
            y,
            22 + back(Math.min(1, p * 2.5)) * 22,
            '#ff8a00',
            1 - seg(p, 0.7, 1),
            r
          )
      })
    }
  },
  {
    id: 'enamorado',
    name: 'Enamorado',
    desc: 'Se le ponen los ojos de corazón, que laten, se ruboriza y suben corazones a su alrededor.',
    draw(c, t) {
      for (let i = 0; i < 9; i++) {
        const p = seg(t, 0.5 + i * 0.22, 2.6 + i * 0.22)
        if (p > 0 && p < 1) {
          c.save()
          c.globalAlpha = Math.sin(p * Math.PI)
          heart(
            c,
            60 + i * 45 + Math.sin(p * 8 + i) * 14,
            lerp(H + 20, -20, p),
            1.2 + (i % 3) * 0.6,
            i % 2 ? '#ff5c8a' : '#e8344e'
          )
          c.restore()
        }
      }
      c.save()
      enter(c, t)
      c.translate(0, Math.sin(t * 3) * 6)
      c.rotate(Math.sin(t * 2.4) * 0.06)
      const love = seg(t, 0.55, 0.75)
      const beat = 1 + Math.max(0, Math.sin(t * 9)) * 0.22
      face(c, {
        eyes: love > 0.5 ? 'heart' : 'open',
        eyeScale: love > 0.5 ? beat : 1,
        mouth: 'smile',
        blush: love
      })
      c.restore()
    }
  },
  {
    id: 'enfadado',
    name: 'Enfadado',
    desc: 'Frunce el ceño, se va poniendo rojo desde la barbilla, echa humo por la cabeza y tiembla de rabia.',
    draw(c, t) {
      const anger = seg(t, 0.5, 2.2)
      const shake = anger * 7 * (1 - seg(t, 3.0, 3.3))
      c.save()
      enter(c, t)
      c.translate(Math.sin(t * 70) * shake, Math.cos(t * 55) * shake * 0.5)
      face(c, {
        eyes: 'open',
        brows: anger > 0.05 ? 1 : 0,
        mouth: anger > 0.15 ? 'frown' : 'smile',
        red: ease(anger)
      })
      c.restore()
      for (let i = 0; i < 8; i++) {
        const p = ((t - 1.0) * 1.3 + i / 8) % 1
        if (t > 1.0 && t < DUR - 0.3)
          for (const s of [-1, 1]) {
            c.save()
            c.globalAlpha = (1 - p) * 0.85
            c.fillStyle = '#fff'
            c.beginPath()
            c.arc(W / 2 + s * (60 + p * 60), H / 2 - 60 - p * 90, 10 + p * 22, 0, 7)
            c.fill()
            c.restore()
          }
      }
      if (t > 2.2 && t < DUR - 0.3)
        text(c, 'GRRR!', W / 2, 46, 34 + Math.sin(t * 30) * 2, '#d8261b', seg(t, 2.2, 2.4))
    }
  },
  {
    id: 'llorando',
    name: 'Llorando',
    desc: 'Pone cara de pena y rompe a llorar a chorros; debajo se le va formando un charco.',
    draw(c, t) {
      const cry = seg(t, 0.7, 0.9) * (1 - seg(t, 3.1, 3.3))
      const puddle = ease(seg(t, 1.0, 3.0))
      if (puddle) {
        c.save()
        c.globalAlpha = 0.75 * (1 - seg(t, DUR - 0.35, DUR))
        c.fillStyle = '#5fc1ff'
        c.beginPath()
        c.ellipse(W / 2, H - 34, 40 + puddle * 170, 8 + puddle * 16, 0, 0, 7)
        c.fill()
        c.restore()
      }
      c.save()
      enter(c, t)
      c.translate(0, Math.sin(t * 20) * 2 * cry)
      face(c, {
        eyes: cry ? 'closed' : 'sad',
        brows: -1,
        mouth: cry ? 'wail' : 'frown',
        wobble: Math.sin(t * 18)
      })
      if (cry)
        for (let i = 0; i < 14; i++) {
          const p = (t * 1.8 + i / 14) % 1
          for (const s of [-1, 1])
            tear(c, s * (30 + p * 120), -6 - Math.sin(p * Math.PI * 0.9) * 40 + p * p * 190, 1.4)
        }
      c.restore()
    }
  },
  {
    id: 'chulo',
    name: 'Chulo',
    desc: 'Entra sonriendo, le caen unas gafas de sol que encajan con un rebote y un destello. El (H) de toda la vida.',
    draw(c, t) {
      const slide = back(seg(t, 0, 0.5))
      c.save()
      c.globalAlpha = 1 - seg(t, DUR - 0.35, DUR)
      c.translate(lerp(-120, W / 2, slide), H / 2 + 10)
      c.rotate((1 - slide) * -0.8 + seg(t, 1.6, 2.0) * -0.12)
      face(c, { eyes: 'open', mouth: t > 1.5 ? 'smirk' : 'smile' })
      const drop = seg(t, 0.7, 1.15)
      const y =
        drop < 1 ? lerp(-260, 0, drop ** 2) : -Math.abs(Math.sin(seg(t, 1.15, 1.45) * Math.PI)) * 14
      if (t > 0.7) {
        c.save()
        c.translate(0, y)
        shades(c, seg(t, 1.6, 2.1))
        c.restore()
      }
      c.restore()
      const stars = [
        [W / 2 - 120, H / 2 - 90],
        [W / 2 + 130, H / 2 - 70],
        [W / 2 + 110, H / 2 + 100]
      ]
      stars.forEach(([x, y], i) => {
        const p = seg(t, 1.9 + i * 0.2, 2.7 + i * 0.2)
        if (p > 0 && p < 1) sparkle(c, x, y, 1 + Math.sin(p * Math.PI), Math.sin(p * Math.PI))
      })
    }
  }
]

// ---------- Sound, synthesized: each wink schedules its own on an AudioContext ----------
function makeSound(ac, out) {
  const at = (s) => ac.currentTime + s
  const env = (g, start, dur, peak, attack = 0.01) => {
    g.gain.setValueAtTime(0.0001, at(start))
    g.gain.exponentialRampToValueAtTime(peak, at(start + attack))
    g.gain.exponentialRampToValueAtTime(0.0001, at(start + dur))
  }
  const tone = (freq, start, dur, { type = 'sine', gain = 0.2, to, attack, lp } = {}) => {
    const o = ac.createOscillator(),
      g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, at(start))
    if (to) o.frequency.exponentialRampToValueAtTime(to, at(start + dur))
    let node = o
    if (lp) {
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = lp
      o.connect(f)
      node = f
    }
    node.connect(g)
    g.connect(out)
    env(g, start, dur, gain, attack)
    o.start(at(start))
    o.stop(at(start + dur + 0.05))
    return o
  }
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const noise = (
    start,
    dur,
    { type = 'bandpass', from = 1000, to, q = 1, gain = 0.3, attack } = {}
  ) => {
    const s = ac.createBufferSource()
    s.buffer = buf
    s.loop = true
    const f = ac.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(from, at(start))
    if (to) f.frequency.exponentialRampToValueAtTime(to, at(start + dur))
    const g = ac.createGain()
    s.connect(f)
    f.connect(g)
    g.connect(out)
    env(g, start, dur, gain, attack)
    s.start(at(start))
    s.stop(at(start + dur + 0.05))
  }
  return { tone, noise }
}
const SOUNDS = {
  globo({ tone, noise }) {
    noise(0.75, 0.6, { from: 300, to: 2400, q: 2, gain: 0.25, attack: 0.4 })
    tone(140, 1.4, 0.25, { to: 50, gain: 0.5 })
    noise(1.4, 0.8, { type: 'lowpass', from: 5000, to: 300, gain: 0.7 })
    ;[1.75, 2.05, 2.4, 2.7, 3.0].forEach((s, i) =>
      tone(900 + i * 80, s, 0.12, { to: 1500, gain: 0.12 })
    )
    ;[1.8, 1.95, 2.1, 2.25].forEach((s, i) =>
      tone(i % 2 ? 620 : 700, s, 0.1, { type: 'square', gain: 0.05, lp: 1800 })
    )
  },
  cerdo({ tone, noise }) {
    for (let b = 0.4; b < 3.4; b += 0.5) tone(150, b, 0.25, { to: 45, gain: 0.55 })
    for (let h = 0.65; h < 3.4; h += 0.5)
      noise(h, 0.06, { type: 'highpass', from: 7000, gain: 0.18 })
    ;[55, 55, 73.4, 65.4, 55, 55, 82.4, 73.4, 55, 55, 73.4, 65.4].forEach((f, i) =>
      tone(f, 0.4 + i * 0.25, 0.22, { type: 'sawtooth', gain: 0.18, lp: 400 })
    )
    for (const s of [1.3, 1.5, 2.7, 2.9])
      tone(320, s, 0.16, { to: 190, type: 'sawtooth', gain: 0.14, lp: 1200 })
  },
  burla({ tone, noise }) {
    ;[
      [784, 0.8],
      [659, 1.1],
      [880, 1.4],
      [784, 1.7],
      [659, 2.0]
    ].forEach(([f, s]) => tone(f, s, 0.26, { type: 'square', gain: 0.07, lp: 2500 }))
    noise(2.5, 0.6, { from: 160, q: 4, gain: 0.5 })
    tone(90, 2.5, 0.6, { type: 'sawtooth', gain: 0.12, lp: 600 })
  },
  beso({ tone, noise }) {
    tone(500, 0.6, 0.12, { to: 900, gain: 0.08 })
    noise(1.05, 0.1, { from: 1300, q: 3, gain: 0.5 })
    tone(380, 1.05, 0.18, { to: 900, gain: 0.18 })
    tone(300, 1.3, 1.1, { to: 900, gain: 0.06, attack: 0.5 })
    ;[1320, 1760, 2093, 2637].forEach((f, i) =>
      tone(f, 2.4 + i * 0.07, 0.6, { type: 'triangle', gain: 0.12 })
    )
  },
  carcajada({ tone }) {
    for (let i = 0; i < 12; i++)
      tone(330 - i * 7, 0.6 + i * 0.18, 0.13, {
        type: 'square',
        gain: 0.09,
        lp: 1400,
        to: 300 - i * 7
      })
  },
  enamorado({ tone }) {
    for (const s of [0.6, 1.4, 2.2]) {
      tone(70, s, 0.18, { to: 45, gain: 0.6 })
      tone(70, s + 0.2, 0.18, { to: 45, gain: 0.45 })
    }
    ;[523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.75 + i * 0.28, 0.7, { type: 'triangle', gain: 0.08 })
    )
  },
  enfadado({ tone, noise }) {
    const o = tone(70, 0.5, 2.3, { type: 'sawtooth', gain: 0.22, lp: 500, attack: 0.6 })
    noise(1.0, 2.1, { type: 'highpass', from: 4000, gain: 0.12, attack: 0.3 })
    for (let i = 0; i < 6; i++)
      tone(110, 2.2 + i * 0.07, 0.07, { type: 'sawtooth', gain: 0.2, lp: 900 })
    void o
  },
  llorando({ tone }) {
    for (const [s, d] of [
      [0.8, 1.0],
      [1.9, 1.1]
    ]) {
      const o = tone(620, s, d, { to: 380, gain: 0.12, attack: 0.15 })
      const lfo = o.context.createOscillator(),
        lg = o.context.createGain()
      lfo.frequency.value = 7
      lg.gain.value = 25
      lfo.connect(lg)
      lg.connect(o.frequency)
      lfo.start()
      lfo.stop(o.context.currentTime + 3.6)
    }
    ;[1.2, 1.6, 2.1, 2.5, 2.9].forEach((s) => tone(1000, s, 0.1, { to: 1700, gain: 0.08 }))
  },
  chulo({ tone, noise }) {
    noise(0, 0.45, { from: 600, to: 2000, q: 1.5, gain: 0.18, attack: 0.3 })
    tone(1600, 0.7, 0.42, { to: 600, gain: 0.1, type: 'sine' })
    noise(1.15, 0.05, { type: 'highpass', from: 3000, gain: 0.4 })
    tone(2637, 1.65, 0.6, { type: 'triangle', gain: 0.1 })
    tone(3136, 1.75, 0.6, { type: 'triangle', gain: 0.08 })
  }
}

// ---------- The first three winks (once placeholders), now made here too ----------
WINKS.push(
  {
    id: 'burbuja',
    name: 'Burbuja',
    desc: 'Una sirena sentada en una roca sopla por un aro y llena la pantalla de pompas de jabón irisadas, que acaban explotando.',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.3, DUR)
      const inM = back(seg(t, 0, 0.5))
      const mx = 130
      const my = H - 60 + (1 - inM) * 220
      // Bubbles: each starts at the wand when blown, floats up and right, pops at its end.
      const wand = [mx + 62, my - 128]
      for (let i = 0; i < 9; i++) {
        const born = 0.8 + i * 0.22
        const life = 1.4 + (i % 3) * 0.4
        const p = seg(t, born, born + life)
        if (p <= 0) continue
        const bx = wand[0] + p * (150 + (i % 4) * 60) + Math.sin(t * 3 + i) * 12
        const by = wand[1] - p * (120 + (i % 3) * 50)
        const r = (10 + (i % 4) * 7) * Math.min(1, p * 4)
        if (p < 1) bubble(c, bx, by, r, t, fade)
        const pop = seg(t, born + life, born + life + 0.3)
        if (pop > 0 && pop < 1) sparkle(c, bx, by, 0.6, (1 - pop) * fade)
      }
      c.save()
      c.globalAlpha = fade
      c.translate(mx, my)
      mermaid(c, t, seg(t, 0.7, 2.9))
      c.restore()
    }
  },
  {
    id: 'ovni',
    name: 'Ovni',
    desc: 'Llega un ovni con sus lucecitas, enciende el rayo y se lleva a una vaca que pastaba tan tranquila. Luego sale disparado.',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.25, DUR)
      const ground = H - 40
      // Ship: flies in, hovers, then zips away up-right.
      const arrive = ease(seg(t, 0, 0.7))
      const leave = seg(t, 2.9, 3.4)
      const ux = lerp(-90, W / 2, arrive) + leave ** 2 * 420 + Math.sin(t * 3) * 6 * (1 - leave)
      const uy = lerp(40, 90, arrive) - leave ** 2 * 260 + Math.sin(t * 4) * 5
      // Beam
      const beam = seg(t, 0.8, 1.0) * (1 - seg(t, 2.6, 2.8))
      if (beam > 0) {
        c.save()
        c.globalAlpha = 0.55 * beam * fade
        const g = c.createLinearGradient(0, uy, 0, ground)
        g.addColorStop(0, 'rgb(190 255 140 / 0.9)')
        g.addColorStop(1, 'rgb(190 255 140 / 0.15)')
        c.fillStyle = g
        c.beginPath()
        c.moveTo(ux - 26, uy + 14)
        c.lineTo(ux + 26, uy + 14)
        c.lineTo(ux + 95, ground + 12)
        c.lineTo(ux - 95, ground + 12)
        c.closePath()
        c.fill()
        for (let i = 0; i < 6; i++) {
          const p = (t * 1.5 + i / 6) % 1
          c.fillStyle = 'rgb(255 255 255 / 0.7)'
          c.beginPath()
          c.arc(ux + Math.sin(i * 2.1 + t * 3) * 50 * (1 - p), lerp(ground, uy + 20, p), 2.5, 0, 7)
          c.fill()
        }
        c.restore()
      }
      // Cow: grazing, then lifted, spinning, shrinking into the ship.
      const lift = ease(seg(t, 1.1, 2.6))
      if (lift < 1) {
        c.save()
        c.globalAlpha = fade
        c.translate(lerp(W / 2, ux, lift), lerp(ground - 34, uy + 20, lift))
        c.rotate(Math.sin(t * 5) * 0.5 * lift)
        c.scale(1 - lift * 0.75, 1 - lift * 0.75)
        cow(c, t, lift)
        c.restore()
      }
      if (t > 1.3 && t < 2.3)
        text(
          c,
          '¡MUUU!',
          W / 2 + 120,
          ground - 120 - lift * 40,
          28,
          '#5d4037',
          fade * (1 - seg(t, 2.0, 2.3)),
          0.12
        )
      c.save()
      c.globalAlpha = fade
      c.translate(ux, uy)
      c.rotate(Math.sin(t * 2) * 0.06 - leave * 0.3)
      ufo(c, t)
      c.restore()
    }
  },
  {
    id: 'ola',
    name: 'Ola',
    desc: 'Entra una ola con espuma y rumor de mar, y un surfista la cabalga haciendo los cuernos rockeros con la mano.',
    draw(c, t) {
      const fade = 1 - seg(t, DUR - 0.4, DUR)
      const reveal = ease(seg(t, 0, 0.9))
      const swell = Math.sin(seg(t, 0, DUR) * Math.PI)
      const mid = H / 2 + 30
      const amp = 22 + swell * 26
      const waveY = (x, k = 0) =>
        mid + Math.sin(x / 48 - t * 4 + k) * amp + Math.sin(x / 23 + t * 2.5) * 6
      const right = W * reveal
      c.save()
      c.globalAlpha = fade
      const g = c.createLinearGradient(0, mid - amp, 0, mid + 90)
      g.addColorStop(0, 'rgb(80 220 240 / 0.95)')
      g.addColorStop(1, 'rgb(30 100 220 / 0.0)')
      c.fillStyle = g
      c.beginPath()
      c.moveTo(0, waveY(0))
      for (let x = 0; x <= right; x += 6) c.lineTo(x, waveY(x))
      c.lineTo(right, mid + 110)
      c.lineTo(0, mid + 110)
      c.closePath()
      c.fill()
      // Crest line and foam dots riding it.
      c.lineWidth = 5
      c.strokeStyle = 'rgb(255 255 255 / 0.85)'
      c.beginPath()
      for (let x = 0; x <= right; x += 6) x ? c.lineTo(x, waveY(x)) : c.moveTo(x, waveY(x))
      c.stroke()
      c.fillStyle = '#fff'
      for (let i = 0; i < 14; i++) {
        const fx = ((i * 37 + t * 90) % (W + 40)) - 20
        if (fx < right) {
          c.beginPath()
          c.arc(fx, waveY(fx) - 8 - (i % 3) * 5, 3 + (i % 2) * 2, 0, 7)
          c.fill()
        }
      }
      c.restore()
      // The surfer rides the crest, tilting with it, and throws the horns.
      const ride = seg(t, 0.3, 3.4)
      if (ride > 0 && ride < 1) {
        const sx = lerp(-60, W + 60, ride)
        const slope = Math.atan2(waveY(sx + 6) - waveY(sx - 6), 12)
        c.save()
        c.globalAlpha = fade
        c.translate(sx, waveY(sx) - 4)
        c.rotate(slope * 0.8)
        c.scale(0.62, 0.62)
        surfer(c, t, seg(t, 1.2, 1.5))
        c.restore()
        if (t > 1.5 && t < 2.8)
          text(
            c,
            '¡YEAH!',
            sx + 40,
            waveY(sx) - 150,
            30,
            '#ff6d00',
            fade * (1 - seg(t, 2.5, 2.8)),
            -0.15
          )
      }
    }
  }
)

// A rock hand: fist with the index and little fingers up. Fingers point up (-y).
function hornHand(c) {
  c.fillStyle = SKIN
  c.strokeStyle = SKIN_DARK
  c.lineWidth = 2.5
  // Index and little finger up and apart, leaning outwards.
  for (const [fx, tilt] of [
    [-11, -0.18],
    [11, 0.18]
  ]) {
    c.save()
    c.translate(fx, -8)
    c.rotate(tilt)
    c.beginPath()
    c.roundRect(-5, -32, 10, 32, 5)
    c.fill()
    c.stroke()
    c.restore()
  }
  c.beginPath()
  c.ellipse(0, -2, 16, 14, 0, 0, 7)
  c.fill()
  c.stroke()
  // Folded middle fingers and the thumb across them.
  c.beginPath()
  c.moveTo(-5, -14)
  c.lineTo(-5, -9)
  c.moveTo(5, -14)
  c.lineTo(5, -9)
  c.stroke()
  c.beginPath()
  c.roundRect(-10, -6, 20, 8, 4)
  c.fill()
  c.stroke()
}

function surfer(c, t, rock) {
  const SUIT = '#263238'
  // Board
  c.fillStyle = '#ff7043'
  c.beginPath()
  c.ellipse(0, 0, 78, 10, 0, 0, 7)
  c.fill()
  c.fillStyle = '#fff'
  c.fillRect(-60, -2, 120, 4)
  // Legs, knees a bit bent
  c.strokeStyle = SUIT
  c.lineCap = 'round'
  c.lineWidth = 14
  c.beginPath()
  c.moveTo(-22, -6)
  c.lineTo(-16, -34)
  c.lineTo(-12, -60)
  c.moveTo(20, -6)
  c.lineTo(10, -34)
  c.lineTo(10, -60)
  c.stroke()
  // Wetsuit torso with a stripe
  c.fillStyle = SUIT
  c.beginPath()
  c.roundRect(-20, -122, 40, 68, 14)
  c.fill()
  c.fillStyle = '#26c6da'
  c.fillRect(-20, -100, 40, 6)
  // Left arm out for balance
  arm(c, -18, -110, 1.9 + Math.sin(t * 5) * 0.15, 46, SUIT)
  // Head (the kid's, cap backwards)
  c.save()
  c.translate(0, -160)
  c.scale(0.5, 0.5)
  kidHead(c, {
    backwards: true,
    cap: '#ff9800',
    eyes: rock > 0.5 ? 'happy' : 'open',
    mouth: rock > 0.5 ? 'laugh' : 'grin'
  })
  c.restore() // Right arm, drawn over the head: from down to raised to the side, with the horns.
  const angle = lerp(-0.9, -2.35, ease(rock)) + Math.sin(t * 9) * 0.08 * rock
  arm(c, 18, -110, angle, 50, SUIT, false)
  c.save()
  c.translate(18 - Math.sin(angle) * 58, -110 + Math.cos(angle) * 58)
  c.rotate(angle + Math.PI)
  c.scale(1.3, 1.3)
  hornHand(c)
  c.restore()
}

SOUNDS.burbuja = ({ tone }) => {
  // A harp glissando as she appears, a bloop per bubble and soft pops.
  ;[523, 587, 659, 784, 880, 1047, 1175, 1319].forEach((f, i) =>
    tone(f, 0.05 + i * 0.06, 0.8, { type: 'triangle', gain: 0.06 })
  )
  for (let i = 0; i < 9; i++)
    tone(260 + (i % 4) * 60, 0.8 + i * 0.22, 0.16, { to: 700, gain: 0.08 })
  for (let i = 0; i < 9; i++) {
    const end = 0.8 + i * 0.22 + 1.4 + (i % 3) * 0.4
    if (end < 3.5) tone(1200, end, 0.05, { to: 400, type: 'triangle', gain: 0.12 })
  }
}
SOUNDS.ovni = ({ tone }) => {
  // Theremin-like wobble while it flies, a hum for the beam, the cow, and the zip away.
  const o = tone(700, 0, 0.9, { gain: 0.08, to: 500, attack: 0.2 })
  const lfo = o.context.createOscillator()
  const depth = o.context.createGain()
  lfo.frequency.value = 6
  depth.gain.value = 40
  lfo.connect(depth)
  depth.connect(o.frequency)
  lfo.start()
  lfo.stop(o.context.currentTime + 1)
  tone(110, 0.85, 1.9, { type: 'sawtooth', gain: 0.07, lp: 500, attack: 0.15 })
  tone(150, 1.3, 0.8, { type: 'sawtooth', gain: 0.18, lp: 700, to: 105, attack: 0.08 })
  tone(300, 2.9, 0.45, { to: 2400, gain: 0.1 })
}
SOUNDS.ola = ({ noise, tone }) => {
  noise(0, 3.5, { type: 'lowpass', from: 500, to: 1400, gain: 0.35, attack: 1.2 })
  noise(0.6, 2.6, { from: 2500, q: 0.7, gain: 0.08, attack: 1 })
  tone(90, 0.2, 3.2, { gain: 0.08, attack: 1.2 })
  // Surf guitar twang when the horns go up.
  ;[
    [196, 1.25],
    [262, 1.4],
    [294, 1.55],
    [392, 1.7]
  ].forEach(([f, s]) => tone(f, s, 0.35, { type: 'sawtooth', gain: 0.07, lp: 1800, to: f * 0.97 }))
}

function ufo(c, t) {
  // Glass dome with a little green pilot
  c.fillStyle = 'rgb(170 230 255 / 0.75)'
  c.beginPath()
  c.ellipse(0, -10, 30, 26, 0, Math.PI, 0)
  c.fill()
  c.fillStyle = '#7ee05a'
  c.beginPath()
  c.arc(0, -14, 10, 0, 7)
  c.fill()
  c.fillStyle = INK
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 4, -15, 2.4, 3.6, 0, 0, 7)
    c.fill()
  }
  // Saucer
  const g = c.createLinearGradient(0, -12, 0, 16)
  g.addColorStop(0, '#eef2f7')
  g.addColorStop(1, '#7d8a99')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, 2, 70, 16, 0, 0, 7)
  c.fill()
  c.strokeStyle = '#5b6675'
  c.lineWidth = 2
  c.stroke()
  // Blinking lights around the rim
  for (let i = 0; i < 7; i++) {
    const on = Math.floor(t * 8 + i) % 3 === 0
    c.fillStyle = on ? '#ffeb3b' : '#c9a227'
    c.beginPath()
    c.arc(-54 + i * 18, 6, on ? 4.5 : 3.5, 0, 7)
    c.fill()
  }
}

function cow(c, t, lift) {
  const kick = Math.sin(t * 14) * 0.5 * lift
  // Legs (kicking once lifted)
  c.strokeStyle = '#f5f5f5'
  c.lineCap = 'round'
  c.lineWidth = 9
  for (const [x, k] of [
    [-34, kick],
    [-18, -kick],
    [18, kick],
    [34, -kick]
  ]) {
    c.beginPath()
    c.moveTo(x, 10)
    c.lineTo(x + Math.sin(k) * 14, 38)
    c.stroke()
  }
  c.fillStyle = '#424242'
  for (const [x, k] of [
    [-34, kick],
    [-18, -kick],
    [18, kick],
    [34, -kick]
  ]) {
    c.beginPath()
    c.arc(x + Math.sin(k) * 14, 40, 5, 0, 7)
    c.fill()
  }
  // Body with spots
  c.fillStyle = '#fafafa'
  c.beginPath()
  c.ellipse(0, 0, 48, 26, 0, 0, 7)
  c.fill()
  c.strokeStyle = '#bdbdbd'
  c.lineWidth = 2
  c.stroke()
  c.fillStyle = '#212121'
  for (const [x, y, rx, ry] of [
    [-18, -8, 12, 9],
    [14, 6, 10, 8],
    [30, -10, 7, 6]
  ]) {
    c.beginPath()
    c.ellipse(x, y, rx, ry, 0.3, 0, 7)
    c.fill()
  }
  // Tail
  c.strokeStyle = '#424242'
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(47, -4)
  c.quadraticCurveTo(62, 4 + Math.sin(t * 6) * 6, 58, 20)
  c.stroke()
  // Head
  c.save()
  c.translate(-54, -14)
  c.fillStyle = '#fafafa'
  c.beginPath()
  c.ellipse(0, 0, 20, 17, 0, 0, 7)
  c.fill()
  c.strokeStyle = '#bdbdbd'
  c.lineWidth = 2
  c.stroke()
  c.fillStyle = '#ffb3c1'
  c.beginPath()
  c.ellipse(-6, 9, 13, 9, 0, 0, 7)
  c.fill()
  c.fillStyle = '#c2577a'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(-6 + s * 5, 9, 2, 0, 7)
    c.fill()
  }
  c.fillStyle = '#e0c068'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 8, -14)
    c.lineTo(s * 14, -26)
    c.lineTo(s * 4, -16)
    c.fill()
  }
  // Eyes: calm while grazing, wide open once lifted
  c.fillStyle = INK
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 7, -3, lift > 0.05 ? 4 : 2.5, 0, 7)
    c.fill()
  }
  c.restore()
}

function bubble(c, x, y, r, t, alpha = 1) {
  c.save()
  c.globalAlpha = alpha
  c.translate(x, y)
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
  g.addColorStop(0, 'rgb(255 255 255 / 0.15)')
  g.addColorStop(0.7, 'rgb(255 170 230 / 0.25)')
  g.addColorStop(0.88, 'rgb(150 210 255 / 0.55)')
  g.addColorStop(1, 'rgb(255 120 200 / 0.8)')
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, r, 0, 7)
  c.fill()
  c.lineWidth = Math.max(1.5, r / 14)
  c.strokeStyle = `hsl(${(t * 140 + x) % 360} 90% 70% / 0.9)`
  c.stroke()
  c.fillStyle = 'rgb(255 255 255 / 0.85)'
  c.beginPath()
  c.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.7, 0, 7)
  c.fill()
  c.restore()
}

// Sitting on a rock, tail curled to the side, blowing through a bubble wand. `blowing`
// 0..1 is the stretch of time she's blowing (cheeks puffing in pulses).
function mermaid(c, t, blowing) {
  const sway = Math.sin(t * 2.2) * 0.05
  // Rock
  c.fillStyle = '#8d8f99'
  c.beginPath()
  c.ellipse(0, 18, 86, 30, 0, Math.PI, 0)
  c.lineTo(86, 26)
  c.lineTo(-86, 26)
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.18)'
  c.beginPath()
  c.ellipse(-26, 0, 30, 9, -0.2, 0, 7)
  c.fill()
  c.rotate(sway)
  // Tail: curls down the rock to a fin that flaps.
  c.fillStyle = '#1fb5a8'
  c.beginPath()
  c.moveTo(-24, -40)
  c.quadraticCurveTo(-36, 10, 10, 6)
  c.quadraticCurveTo(58, 2, 78, 14)
  c.lineTo(70, 28)
  c.quadraticCurveTo(40, 22, 6, 26)
  c.quadraticCurveTo(-52, 30, -40, -40)
  c.fill()
  c.strokeStyle = 'rgb(255 255 255 / 0.35)'
  c.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    c.beginPath()
    c.arc(-30 + i * 16, 10 + (i % 2) * 6, 6, 0.2, Math.PI - 0.2)
    c.stroke()
  }
  c.save()
  c.translate(80, 18)
  c.rotate(Math.sin(t * 5) * 0.35)
  c.fillStyle = '#4dd0c4'
  c.beginPath()
  c.moveTo(0, 0)
  c.quadraticCurveTo(26, -26, 34, -6)
  c.quadraticCurveTo(22, 0, 34, 8)
  c.quadraticCurveTo(26, 26, 0, 0)
  c.fill()
  c.restore()
  // Long wavy hair behind the body
  c.fillStyle = '#e8473f'
  c.beginPath()
  c.moveTo(-40, -150)
  for (let y = -150; y <= -40; y += 10) c.lineTo(-44 + Math.sin(y / 14 + t * 3) * 7, y)
  for (let y = -40; y >= -150; y -= 10) c.lineTo(36 + Math.sin(y / 14 + t * 3 + 1) * 7, y)
  c.fill()
  // Torso with a shell top
  c.fillStyle = SKIN
  c.beginPath()
  c.roundRect(-22, -112, 44, 76, 16)
  c.fill()
  c.fillStyle = '#9c6ade'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 10, -86, 11, Math.PI, 0)
    c.fill()
  }
  // Arm holding the wand up to her mouth
  c.strokeStyle = SKIN
  c.lineCap = 'round'
  c.lineWidth = 12
  c.beginPath()
  c.moveTo(18, -100)
  c.quadraticCurveTo(44, -90, 52, -118)
  c.stroke()
  c.strokeStyle = '#ffca28'
  c.lineWidth = 4
  c.beginPath()
  c.moveTo(52, -118)
  c.lineTo(60, -126)
  c.stroke()
  c.beginPath()
  c.arc(62, -128, 9, 0, 7)
  c.stroke()
  // Head
  c.save()
  c.translate(0, -146)
  c.fillStyle = SKIN
  c.beginPath()
  c.arc(0, 0, 30, 0, 7)
  c.fill()
  c.strokeStyle = SKIN_DARK
  c.lineWidth = 2
  c.stroke()
  // Bangs and a starfish clip
  c.fillStyle = '#e8473f'
  c.beginPath()
  c.arc(0, -6, 31, Math.PI * 1.05, Math.PI * 1.95)
  c.quadraticCurveTo(10, -16, -2, -10)
  c.quadraticCurveTo(-14, -14, -30, -12)
  c.fill()
  c.fillStyle = '#ffb74d'
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4 : 9
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    c.lineTo(-20 + Math.cos(a) * r, -24 + Math.sin(a) * r)
  }
  c.fill()
  // Eyes with lashes, closed while she blows
  const blowingNow = blowing > 0 && blowing < 1
  const puff = blowingNow ? (Math.sin(t * 6) + 1) / 2 : 0
  c.strokeStyle = INK
  c.fillStyle = INK
  c.lineWidth = 2.5
  for (const s of [-1, 1]) {
    if (blowingNow) {
      c.beginPath()
      c.arc(s * 11, 0, 5, Math.PI * 0.1, Math.PI * 0.9)
      c.stroke()
    } else {
      c.beginPath()
      c.ellipse(s * 11, 0, 3.5, 5, 0, 0, 7)
      c.fill()
    }
    // A lash at the outer corner of each eye
    c.beginPath()
    c.moveTo(s * 15, 1)
    c.lineTo(s * 20, -1)
    c.stroke()
  }
  c.fillStyle = `rgb(255 120 140 / ${0.4 + puff * 0.4})`
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 17, 10, 6 + puff * 3, 4 + puff * 2, 0, 0, 7)
    c.fill()
  }
  // Mouth: a little "o" while blowing, a smile otherwise
  c.fillStyle = '#c2185b'
  c.strokeStyle = '#c2185b'
  if (blowingNow) {
    c.beginPath()
    c.ellipse(6, 14, 4, 5, 0, 0, 7)
    c.fill()
  } else {
    c.beginPath()
    c.arc(0, 8, 10, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  }
  c.restore()
}
