// The kid with the cap, shared by the water balloon, the tease and the surfer. Drawn
// around the head's center (0, 0): head ~70 wide, body below it, feet near y = 236.
import { INK, SKIN, SKIN_DARK, type Ctx } from './kit'

type Eye = 'open' | 'happy' | 'squint' | 'closed'
type Mouth = 'grin' | 'laugh' | 'tongue' | 'o' | 'smirk'

export type KidFace = {
  eyes?: Eye | [Eye, Eye]
  mouth?: Mouth
  cap?: string
  backwards?: boolean
  capTilt?: number // radians: the cap lags behind head moves (follow-through)
  lid?: number // 1 open, 0 shut: blinks on 'open' eyes
  look?: number // -1 left … 1 right: where the pupils point
  brows?: number // eyebrow lift; omitted = no brows
  tongue?: number // 0…1 how far it sticks out
  laugh?: number // 0…1 how wide a 'laugh' mouth opens
  blush?: number
}

function cap(c: Ctx, color: string, backwards: boolean, tilt: number): void {
  c.save()
  c.translate(0, -50)
  c.rotate(tilt)
  c.translate(0, 50)
  c.fillStyle = color
  c.beginPath()
  c.arc(0, -18, 72, Math.PI * 1.02, Math.PI * 1.98)
  c.closePath()
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.25)'
  c.beginPath()
  c.ellipse(-20, -66, 24, 9, -0.2, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = color
  c.beginPath()
  if (backwards) c.ellipse(-62, -26, 34, 9, 0.35, 0, Math.PI * 2)
  else c.ellipse(46, -22, 46, 10, -0.08, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = 'rgb(0 0 0 / 0.12)'
  c.beginPath()
  if (backwards) c.ellipse(-60, -22, 30, 4, 0.35, 0, Math.PI * 2)
  else c.ellipse(44, -16, 40, 4, -0.08, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(0, -88, 7, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

export function kidHead(c: Ctx, o: KidFace = {}): void {
  const {
    eyes = 'open',
    mouth = 'grin',
    backwards = false,
    capTilt = 0,
    lid = 1,
    look = 0,
    tongue = 0,
    laugh = 1,
    blush = 0.5
  } = o
  c.save()
  // Ears, then the face
  c.fillStyle = SKIN
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 70, 4, 13, 18, 0, 0, Math.PI * 2)
    c.fill()
  }
  const g = c.createRadialGradient(-20, -24, 8, 0, 0, 80)
  g.addColorStop(0, '#ffe6cc')
  g.addColorStop(1, SKIN)
  c.beginPath()
  c.ellipse(0, 0, 70, 74, 0, 0, Math.PI * 2)
  c.fillStyle = g
  c.fill()
  c.lineWidth = 3
  c.strokeStyle = SKIN_DARK
  c.stroke()
  // Hair peeking under the cap
  c.fillStyle = '#7a4a22'
  for (let i = -2; i <= 2; i++) {
    c.beginPath()
    c.ellipse(i * 14, -50, 10, 7, i * 0.3, 0, Math.PI * 2)
    c.fill()
  }
  cap(c, o.cap ?? '#e53935', backwards, capTilt)
  c.fillStyle = `rgb(255 120 120 / ${0.45 * blush})`
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 42, 20, 13, 8, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Eyes
  c.fillStyle = INK
  c.strokeStyle = INK
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = 6
  const eye = (x: number, kind: Eye, side: number): void => {
    c.save()
    c.translate(x, -6)
    if (kind === 'open' && lid > 0.25) {
      c.beginPath()
      c.ellipse(look * 6, 0, 7, 10 * lid, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(look * 6 - 2, -4 * lid, 2.6, 0, Math.PI * 2)
      c.fill()
    } else if (kind === 'open' || kind === 'closed') {
      c.beginPath()
      c.moveTo(-8, 1)
      c.quadraticCurveTo(0, 5, 8, 1)
      c.stroke()
    } else if (kind === 'squint') {
      // A ">" on the left eye, "<" on the right: screwed shut.
      c.beginPath()
      c.moveTo(-9 * side, -6)
      c.lineTo(8 * side, 0)
      c.lineTo(-9 * side, 6)
      c.stroke()
    } else if (kind === 'happy') {
      c.beginPath()
      c.arc(0, 5, 10, Math.PI * 1.1, Math.PI * 1.9)
      c.stroke()
    }
    c.restore()
  }
  const [l, r] = Array.isArray(eyes) ? eyes : [eyes, eyes]
  eye(-24, l, 1)
  eye(24, r, -1)
  if (o.brows !== undefined) {
    c.lineWidth = 5
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(s * 34, -26 - o.brows)
      c.quadraticCurveTo(s * 24, -32 - o.brows * 1.4, s * 14, -27 - o.brows)
      c.stroke()
    }
  }
  // Mouth
  c.lineWidth = 6
  c.save()
  c.translate(0, 30)
  if (mouth === 'grin') {
    c.beginPath()
    c.arc(0, -14, 26, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  } else if (mouth === 'smirk') {
    c.beginPath()
    c.moveTo(-22, -2)
    c.quadraticCurveTo(4, 8, 26, -8)
    c.stroke()
  } else if (mouth === 'laugh') {
    const open = 10 + laugh * 22
    c.beginPath()
    c.moveTo(-26, -4)
    c.quadraticCurveTo(0, -8, 26, -4)
    c.quadraticCurveTo(0, open, -26, -4)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.save()
    c.clip()
    c.fillStyle = '#ff6b81'
    c.beginPath()
    c.ellipse(0, open - 4, 13, 8, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#fff'
    c.fillRect(-20, -9, 40, 6)
    c.restore()
    c.stroke()
  } else if (mouth === 'tongue') {
    c.beginPath()
    c.moveTo(-24, -2)
    c.quadraticCurveTo(0, 8, 24, -2)
    c.stroke()
    c.save()
    c.translate(0, 2)
    c.rotate(Math.sin(tongue * 20) * 0.25)
    const len = 8 + tongue * 28
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
  } else {
    c.beginPath()
    c.ellipse(0, 2, 9, 12, 0, 0, Math.PI * 2)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  }
  c.restore()
  c.restore()
}

// Shirt and trousers below the head. `step` 0…1 lifts one foot (a little dance or run).
export function kidBody(c: Ctx, shirt = '#2f7de1', pants = '#37474f', step = 0): void {
  c.save()
  // Legs first, so the shirt overlaps them
  c.strokeStyle = pants
  c.lineCap = 'round'
  c.lineWidth = 26
  for (const s of [-1, 1]) {
    const lift = s > 0 ? step * 18 : 0
    c.beginPath()
    c.moveTo(s * 20, 168)
    c.lineTo(s * 24, 222 - lift)
    c.stroke()
    c.fillStyle = '#eceff1'
    c.beginPath()
    c.ellipse(s * 30, 236 - lift, 22, 11, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#e53935'
    c.fillRect(s * 30 - 20, 236 - lift, 40, 4)
  }
  c.fillStyle = shirt
  c.beginPath()
  c.moveTo(-46, 70)
  c.quadraticCurveTo(-56, 150, -44, 182)
  c.lineTo(44, 182)
  c.quadraticCurveTo(56, 150, 46, 70)
  c.quadraticCurveTo(0, 56, -46, 70)
  c.fill()
  c.fillStyle = 'rgb(0 0 0 / 0.12)'
  c.fillRect(-46, 170, 92, 12)
  c.fillStyle = '#fff'
  c.font = '900 34px system-ui, sans-serif'
  c.textAlign = 'center'
  c.fillText('P', 0, 136)
  c.restore()
}

type Hand = 'fist' | 'open' | 'horns' | 'none'

// A hand whose fingers point along +y (away from the wrist).
export function hand(c: Ctx, kind: Hand): void {
  if (kind === 'none') return
  c.save()
  c.fillStyle = SKIN
  c.strokeStyle = SKIN_DARK
  c.lineWidth = 2.5
  c.lineJoin = 'round'
  if (kind === 'open') {
    for (let f = 0; f < 4; f++) {
      c.save()
      c.rotate(-0.45 + f * 0.3)
      c.beginPath()
      c.roundRect(-4.5, 6, 9, 22, 4.5)
      c.fill()
      c.stroke()
      c.restore()
    }
    c.save()
    c.rotate(1.2)
    c.beginPath()
    c.roundRect(-4.5, 4, 9, 16, 4.5)
    c.fill()
    c.stroke()
    c.restore()
  }
  if (kind === 'horns') {
    // Index and little finger out and apart: the rock sign.
    for (const [fx, tilt] of [
      [-9, 0.2],
      [9, -0.2]
    ]) {
      c.save()
      c.translate(fx, 4)
      c.rotate(tilt)
      c.beginPath()
      c.roundRect(-5, 0, 10, 30, 5)
      c.fill()
      c.stroke()
      c.restore()
    }
  }
  c.beginPath()
  c.ellipse(0, 2, 15, 14, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  if (kind === 'horns' || kind === 'fist') {
    // Folded fingers and the thumb across them.
    c.beginPath()
    c.moveTo(-5, 8)
    c.lineTo(-5, 13)
    c.moveTo(5, 8)
    c.lineTo(5, 13)
    c.stroke()
    c.beginPath()
    c.roundRect(-10, 2, 20, 8, 4)
    c.fill()
    c.stroke()
  }
  c.restore()
}

// Two-part arm from the shoulder (x, y). Angles in radians, 0 = hanging straight down;
// `elbow` bends the forearm relative to the upper arm.
export function arm(
  c: Ctx,
  x: number,
  y: number,
  shoulder: number,
  elbow: number,
  color: string,
  kind: Hand = 'fist',
  len = 40
): void {
  c.save()
  c.translate(x, y)
  c.rotate(shoulder)
  c.strokeStyle = color
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = 20
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(0, len)
  c.translate(0, len)
  c.rotate(elbow)
  c.lineTo(0, len)
  c.stroke()
  c.translate(0, len + 4)
  hand(c, kind)
  c.restore()
}

// Where an arm's hand ends up, for things it holds or throws.
export function handAt(
  x: number,
  y: number,
  shoulder: number,
  elbow: number,
  len = 40
): [number, number] {
  const ex = x - Math.sin(shoulder) * len
  const ey = y + Math.cos(shoulder) * len
  const a = shoulder + elbow
  return [ex - Math.sin(a) * (len + 6), ey + Math.cos(a) * (len + 6)]
}
