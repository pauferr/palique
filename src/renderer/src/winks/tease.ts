// The kid with the cap on backwards makes sure nobody's looking, then puts his thumbs in
// his ears, wiggles his fingers and sticks his tongue out at you. ¡Nananá!
import { arm, handAt, kidBody, kidHead } from './kid'
import {
  H,
  SKIN,
  SKIN_DARK,
  W,
  back,
  blink,
  ease,
  fadeOut,
  lerp,
  seg,
  shadow,
  squash,
  text,
  type Ctx,
  type Wink
} from './kit'

const DUR = 4.2
const SNAP = 1.15 // hands fly to the ears
const DONE = 3.55 // he stops and plays innocent
const SHIRT = '#ff8f00'
const CAP = '#1e9e5a'

// Where he's looking while he checks the coast is clear: left, right, at you.
const look = (t: number): number =>
  t < 0.55
    ? 0
    : t < 0.8
      ? -ease(seg(t, 0.55, 0.65))
      : t < 1.05
        ? lerp(-1, 1, ease(seg(t, 0.8, 0.92)))
        : lerp(1, 0, ease(seg(t, 1.05, 1.12)))

// An open hand with wiggling fingers, thumb towards the ear.
function earHand(c: Ctx, side: number, t: number, wiggle: number): void {
  c.save()
  c.scale(side, 1)
  c.fillStyle = SKIN
  c.strokeStyle = SKIN_DARK
  c.lineWidth = 2.5
  for (let f = 0; f < 4; f++) {
    const w = Math.sin(t * 24 + f * 1.1) * 0.35 * wiggle
    c.save()
    c.rotate(0.25 + f * 0.33 + w)
    c.beginPath()
    c.roundRect(-5, -46, 10, 32, 5)
    c.fill()
    c.stroke()
    c.restore()
  }
  c.beginPath()
  c.ellipse(0, 0, 17, 21, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.restore()
}

function kid(c: Ctx, t: number): void {
  const up = seg(t, SNAP, SNAP + 0.16) * (1 - seg(t, DONE, DONE + 0.2))
  const mocking = t > SNAP + 0.1 && t < DONE + 0.1
  const rock = mocking ? Math.sin(t * 7.5) : 0
  const hop = mocking ? Math.abs(Math.sin(t * 7.5)) : 0
  const pop = 1 - back(seg(t, 0, 0.45))
  c.save()
  c.translate(W / 2, H / 2 + 40 + pop * 260 - hop * 8)
  c.scale(0.95, 0.95)
  shadow(c, 0, 256, 110, 0.2 * (1 - hop * 0.3))
  // Rock from the feet; a squash on each landing, a stretch on the snap.
  c.translate(0, 236)
  c.rotate(rock * 0.09 + look(t) * 0.05)
  const breath = Math.sin(t * 3) * 0.012
  const landing = mocking ? (1 - hop) * -0.03 : 0
  const snap = up > 0 && up < 1 ? 0.06 : 0
  squash(c, 1 + breath + landing + snap)
  c.translate(0, -236)
  kidBody(c, SHIRT, '#3949ab', mocking ? (rock > 0 ? rock : 0) : 0)
  // Arms swing up to the ears with a little overshoot, and back down at the end.
  const k = back(up)
  const shoulder = lerp(0.25, 2.55, k)
  const elbow = lerp(0.1, 0.55, k)
  arm(c, -46, 84, shoulder, elbow, SHIRT, up > 0.5 ? 'none' : 'fist')
  arm(c, 46, 84, -shoulder, -elbow, SHIRT, up > 0.5 ? 'none' : 'fist')
  c.save()
  c.translate(look(t) * 8, 0)
  c.rotate(rock * 0.04)
  kidHead(c, {
    backwards: true,
    cap: CAP,
    capTilt: -rock * 0.08 - look(t - 0.08) * 0.06,
    eyes: mocking ? (Math.floor(t * 1.6) % 2 ? ['squint', 'open'] : ['open', 'squint']) : 'open',
    mouth: mocking ? 'tongue' : t > 1.05 ? 'smirk' : t > DONE ? 'smirk' : 'grin',
    tongue: mocking ? 0.55 + Math.sin(t * 9) * 0.45 : 0,
    lid: blink(t, 1.9, 0.4),
    look: look(t),
    brows: t > 1.02 && t < SNAP + 0.05 ? 7 : t > DONE ? 4 : undefined,
    blush: mocking ? 0.8 : 0.5
  })
  c.restore()
  // The hands sit over the ears, drawn on top of the head.
  if (up > 0.5) {
    for (const s of [-1, 1]) {
      const [hx, hy] = handAt(s * 46, 84, -s * shoulder, -s * elbow)
      c.save()
      c.translate(lerp(hx, s * 86, seg(up, 0.5, 1)), lerp(hy, -4, seg(up, 0.5, 1)))
      c.rotate(rock * 0.04)
      earHand(c, s, t, mocking ? 1 : 0)
      c.restore()
    }
  }
  c.restore()
}

export const wink: Wink = {
  id: 'tease',
  dur: DUR,
  still: 2.0,
  draw(c, t) {
    c.save()
    c.globalAlpha = fadeOut(t, DUR)
    kid(c, t)
    // ¡Nananá! with each letter bouncing in turn, and a cheeky :P
    const word = '¡Nananá!'
    const show = seg(t, SNAP + 0.15, SNAP + 0.35) * (1 - seg(t, DONE, DONE + 0.25))
    c.font = '900 30px "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif'
    let x = 40
    for (let i = 0; i < word.length; i++) {
      const w = c.measureText(word[i]).width
      const b = Math.max(0, Math.sin(t * 9 - i * 0.7))
      text(c, word[i], x + w / 2, 70 - b * 12 + i * 2, 30, '#1e9e5a', show, -0.12 + b * 0.1)
      x += w + 1
    }
    const p = seg(t, SNAP + 0.45, SNAP + 0.7)
    text(
      c,
      ':P',
      W - 90,
      84 + Math.cos(t * 8) * 6,
      40 * back(p),
      '#ff4f7a',
      p * (1 - seg(t, DONE, DONE + 0.25)),
      0.2 + Math.sin(t * 5) * 0.08
    )
    c.restore()
  },
  sound({ tone, noise }) {
    // Tiptoe plucks while he looks around, a swish for the snap, the taunt twice,
    // a raspberry, and an innocent little whistle at the end.
    ;[0.55, 0.8, 0.92].forEach((s, i) =>
      tone([196, 220, 247][i], s, 0.12, { type: 'triangle', gain: 0.12 })
    )
    noise(SNAP, 0.14, { from: 1200, to: 3500, q: 1.5, gain: 0.22 })
    const taunt: [number, number][] = [
      [784, 0],
      [659, 0.28],
      [880, 0.56],
      [784, 0.84],
      [659, 1.12]
    ]
    for (const rep of [0, 1.5]) {
      for (const [f, s] of taunt) {
        tone(f, SNAP + 0.25 + rep + s, 0.24, { type: 'square', gain: 0.06, lp: 2500 })
      }
    }
    noise(3.0, 0.45, { from: 160, q: 4, gain: 0.45 })
    tone(90, 3.0, 0.45, { type: 'sawtooth', gain: 0.1, lp: 600 })
    tone(1100, DONE + 0.05, 0.18, { to: 1500, gain: 0.05 })
    tone(1500, DONE + 0.25, 0.2, { to: 1200, gain: 0.05 })
  }
}
