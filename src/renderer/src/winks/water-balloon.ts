// The kid with the cap winds up and throws a water balloon at your screen: splash on the
// glass, drips, and he laughs holding his belly.
import { arm, handAt, kidBody, kidHead } from './kid'
import {
  H,
  W,
  back,
  blink,
  ease,
  easeIn,
  fadeOut,
  jitter,
  lerp,
  seg,
  shadow,
  squash,
  text,
  type Ctx,
  type Wink
} from './kit'

const DUR = 4.2
const RELEASE = 1.22 // the balloon leaves his hand
const HIT = 1.62 // and hits the glass
const KID_X = 112
const KID_Y = H - 150
const KID_SCALE = 0.5
const TARGET: [number, number] = [W / 2 + 50, H / 2 - 40]
const SHIRT = '#2f7de1'

// Throwing arm (his left, our right): rests holding the balloon, winds up behind his
// head, holds a beat, then whips over.
function throwArm(t: number): [number, number] {
  if (t < 0.55) return [-0.5, -0.9]
  if (t < 1.0) {
    const k = ease(seg(t, 0.55, 1.0))
    return [lerp(-0.5, -2.35, k), lerp(-0.9, -0.75, k)]
  }
  if (t < 1.1) return [-2.35 - Math.sin(seg(t, 1.0, 1.1) * Math.PI) * 0.08, -0.75]
  const k = easeIn(seg(t, 1.1, RELEASE))
  const follow = back(seg(t, RELEASE, 1.5))
  return t < RELEASE
    ? [lerp(-2.35, -0.9, k), lerp(-0.75, -0.2, k)]
    : [lerp(-0.9, -0.35, follow), -0.2]
}

// Body lean: back for the wind-up, forward through the throw, settling.
const lean = (t: number): number =>
  t < 1.0
    ? -0.14 * ease(seg(t, 0.55, 1.0))
    : t < 1.5
      ? lerp(-0.14, 0.2, back(seg(t, 1.05, 1.35)))
      : lerp(0.2, 0, ease(seg(t, 1.5, 1.9)))

function balloon(c: Ctx, x: number, y: number, r: number, wobble: number): void {
  c.save()
  c.translate(x, y)
  c.rotate(wobble * 0.3)
  squash(c, 1 + wobble * 0.12)
  const g = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r)
  g.addColorStop(0, '#e3f6ff')
  g.addColorStop(0.5, '#6cc4ff')
  g.addColorStop(1, '#1f86e0')
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, r, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#1f86e0'
  c.beginPath()
  c.moveTo(0, r * 0.95)
  c.lineTo(-r * 0.16, r * 1.22)
  c.lineTo(r * 0.16, r * 1.22)
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.7)'
  c.beginPath()
  c.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

// A fixed splat outline (so it doesn't flicker), smoothed through the midpoints.
const SPLAT = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * Math.PI * 2,
  r: 0.75 + ((i * 37) % 11) / 22,
  d: (i * 53) % 7
}))

function splat(c: Ctx, x: number, y: number, size: number, alpha: number): void {
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  c.scale(size, size)
  const g = c.createRadialGradient(-20, -20, 10, 0, 0, 130)
  g.addColorStop(0, 'rgb(215 245 255 / 0.95)')
  g.addColorStop(1, 'rgb(70 170 255 / 0.85)')
  c.fillStyle = g
  const pts = SPLAT.map(({ a, r }) => [Math.cos(a) * 100 * r, Math.sin(a) * 100 * r])
  const mid = (i: number): [number, number] => {
    const [x1, y1] = pts[i % pts.length]
    const [x2, y2] = pts[(i + 1) % pts.length]
    return [(x1 + x2) / 2, (y1 + y2) / 2]
  }
  c.beginPath()
  c.moveTo(...mid(0))
  for (let i = 1; i <= pts.length; i++) {
    const [px, py] = pts[i % pts.length]
    c.quadraticCurveTo(px, py, ...mid(i))
  }
  c.closePath()
  c.fill()
  for (const { a, r, d } of SPLAT) {
    c.beginPath()
    c.arc(
      Math.cos(a) * (130 + d * 12) * r,
      Math.sin(a) * (130 + d * 12) * r,
      6 + d * 2,
      0,
      Math.PI * 2
    )
    c.fill()
  }
  c.fillStyle = 'rgb(255 255 255 / 0.6)'
  c.beginPath()
  c.ellipse(-34, -38, 26, 12, -0.6, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

function kid(c: Ctx, t: number): void {
  const laughing = t > HIT + 0.12
  const bounce = laughing ? Math.abs(Math.sin(t * 13)) * 10 * (1 - seg(t, 3.5, 3.9)) : 0
  const breath = 1 + Math.sin(t * 3.2) * 0.015
  const wind = seg(t, 0.55, 1.0)
  const stretch = t < RELEASE ? 1 - wind * 0.05 : 1 + (1 - seg(t, RELEASE, 1.5)) * 0.06
  const l = lean(t)
  c.save()
  c.translate(KID_X, KID_Y + (1 - back(seg(t, 0, 0.45))) * 220 - bounce)
  c.scale(KID_SCALE, KID_SCALE)
  shadow(c, 0, 248 + bounce * 2, 80, 0.22)
  c.translate(0, 230)
  c.rotate(l + (laughing ? Math.sin(t * 7) * 0.06 : 0))
  squash(c, stretch * breath)
  c.translate(0, -230)
  kidBody(c, SHIRT, '#37474f', laughing ? Math.abs(Math.sin(t * 6.5)) : 0)
  const [sh, el] = throwArm(t)
  // Holding his belly while he laughs; otherwise the free arm balances the throw.
  if (laughing) {
    arm(c, -46, 84, -0.25, -1.1, SHIRT, 'open')
    arm(c, 46, 84, 0.25, 1.1, SHIRT, 'open')
  } else {
    arm(c, -46, 84, 0.35 + l * 1.5, 0.2, SHIRT, 'fist')
  }
  kidHead(c, {
    eyes: laughing ? 'happy' : 'open',
    mouth: laughing ? 'laugh' : t > RELEASE - 0.15 ? 'o' : t > 0.55 ? 'smirk' : 'grin',
    laugh: 0.55 + Math.abs(Math.sin(t * 14)) * 0.45,
    lid: blink(t, 2.2, 0.9),
    look: t > RELEASE && !laughing ? 1 : t > 0.3 && t < 0.55 ? 0.6 : 0,
    brows: t > RELEASE && !laughing ? 8 : t > 0.55 && t < RELEASE ? -2 : undefined,
    capTilt: -lean(t - 0.1) * 0.9 + (laughing ? Math.sin(t * 13 - 0.6) * 0.05 : 0),
    blush: laughing ? 0.9 : 0.5
  })
  // The throwing arm goes over the head, so it's drawn last.
  if (!laughing) {
    if (t < RELEASE) {
      // Cradled at the fingertips, wherever the arm points.
      const [hx, hy] = handAt(46, 84, sh, el)
      const a = sh + el
      balloon(c, hx - Math.sin(a) * 22, hy + Math.cos(a) * 22, 26, Math.sin(t * 9) * 0.4)
    }
    arm(c, 46, 84, sh, el, SHIRT, t < RELEASE ? 'open' : 'fist')
  }
  c.restore()
}

// Kid space → canvas, for where the balloon leaves the hand.
function releasePoint(): [number, number] {
  const [sh, el] = throwArm(RELEASE)
  const [hx, hy] = handAt(46, 84, sh, el)
  const a = sh + el
  return [KID_X + (hx - Math.sin(a) * 22) * KID_SCALE, KID_Y + (hy + Math.cos(a) * 22) * KID_SCALE]
}

export const wink: Wink = {
  id: 'water-balloon',
  dur: DUR,
  still: 2.0,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    c.save()
    c.globalAlpha = fade
    // The impact shakes everything for a moment.
    const shake = 9 * (1 - seg(t, HIT, HIT + 0.4)) * (t >= HIT ? 1 : 0)
    c.translate(jitter(t, 1) * shake, jitter(t, 2) * shake)
    kid(c, t)
    // Flight: it grows as it comes at you, wobbling like water does.
    const fly = seg(t, RELEASE, HIT)
    if (fly > 0 && fly < 1) {
      const [sx, sy] = releasePoint()
      const k = easeIn(fly) * 0.6 + fly * 0.4
      const x = lerp(sx, TARGET[0], k)
      const y = lerp(sy, TARGET[1], k) - Math.sin(fly * Math.PI) * 70
      balloon(c, x, y, lerp(13, 78, k ** 1.6), Math.sin(t * 34))
    }
    if (t >= HIT) {
      const pop = seg(t, HIT, HIT + 0.18)
      const slide = ease(seg(t, HIT + 0.3, DUR)) * 14
      // Bursting droplets fly out and fall.
      for (let i = 0; i < 18; i++) {
        const tau = t - HIT
        const a = (i / 18) * Math.PI * 2 + 0.2
        const v = 160 + (i % 5) * 45
        const px = TARGET[0] + Math.cos(a) * v * tau
        const py = TARGET[1] + Math.sin(a) * v * tau + 0.5 * 700 * tau * tau
        const r = (5 + (i % 3) * 2) * (1 - seg(tau, 0.25, 0.75))
        if (r > 0) {
          c.fillStyle = 'rgb(108 196 255 / 0.9)'
          c.beginPath()
          c.arc(px, py, r, 0, Math.PI * 2)
          c.fill()
        }
      }
      splat(c, TARGET[0], TARGET[1] + slide, 0.5 + back(pop) * 1.0, 0.92)
      // Drips run down the glass, speeding up, each dropping a bead at the end.
      for (let i = 0; i < 7; i++) {
        const start = HIT + 0.15 + i * 0.13
        const tau = Math.max(0, t - start)
        const x = TARGET[0] - 105 + i * 35 + (i % 2) * 6
        const y0 = TARGET[1] + 55 + (i % 3) * 14 + slide
        const len = Math.min(150, 40 * tau + 60 * tau * tau)
        if (tau <= 0) continue
        c.fillStyle = 'rgb(108 196 255 / 0.88)'
        c.beginPath()
        c.roundRect(x - 5, y0 - 4, 10, len + 4, 5)
        c.fill()
        c.beginPath()
        c.ellipse(x, y0 + len, 8, 9, 0, 0, Math.PI * 2)
        c.fill()
        const drop = tau - 1.1
        if (drop > 0) {
          c.beginPath()
          c.ellipse(x, y0 + 150 + 0.5 * 900 * drop * drop, 5, 7, 0, 0, Math.PI * 2)
          c.fill()
        }
      }
      text(
        c,
        '¡SPLASH!',
        W / 2 + 40,
        48,
        42 * back(seg(t, HIT, HIT + 0.25)),
        '#1677d2',
        1 - seg(t, 2.5, 2.8),
        -0.08 + jitter(t, 3) * 0.03 * (1 - seg(t, HIT, HIT + 0.4))
      )
      // A white flash on the glass at the moment of the hit.
      c.fillStyle = `rgb(255 255 255 / ${0.55 * (1 - seg(t, HIT, HIT + 0.16))})`
      c.fillRect(-20, -20, W + 40, H + 40)
    }
    c.restore()
  },
  sound({ tone, noise }) {
    // Wind-up swish, the throw, the whistle of the flight, the splash, drips and giggles.
    noise(0.6, 0.45, { from: 400, to: 1200, q: 2, gain: 0.12, attack: 0.3 })
    noise(1.1, 0.16, { from: 900, to: 3000, q: 1.5, gain: 0.3, attack: 0.04 })
    tone(500, RELEASE, HIT - RELEASE, { to: 1300, gain: 0.05, attack: 0.1 })
    tone(140, HIT, 0.3, { to: 45, gain: 0.55 })
    noise(HIT, 0.9, { type: 'lowpass', from: 5000, to: 300, gain: 0.75 })
    ;[2.0, 2.3, 2.65, 2.95, 3.3].forEach((s, i) =>
      tone(900 + i * 90, s, 0.12, { to: 1600, gain: 0.1 })
    )
    for (let i = 0; i < 7; i++) {
      tone(i % 2 ? 640 : 720, 1.85 + i * 0.13, 0.1, { type: 'square', gain: 0.05, lp: 1800 })
    }
  }
}
