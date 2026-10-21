// Enfadado: it tries to hold it in (brows down, trembling, going red from the chin up),
// a tense pause… and it blows up: a jump, steam out of its head, the screen shakes, GRRR!
import {
  back,
  blink,
  clamp,
  easeOut,
  fadeOut,
  H,
  jitter,
  lerp,
  seg,
  shadow,
  squash,
  text,
  W,
  type Ctx,
  type Wink
} from './kit'
import { face } from './face'

const DUR = 4.2
const CX = W / 2
const FLOOR = H / 2 + 104
const BOOM = 1.85

function puff(c: Ctx, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0) return
  c.save()
  c.globalAlpha *= alpha
  c.fillStyle = '#ffffff'
  for (const [dx, dy, k] of [
    [0, 0, 1],
    [-0.6, 0.25, 0.7],
    [0.6, 0.3, 0.75]
  ]) {
    c.beginPath()
    c.arc(x + dx * r, y + dy * r, r * k, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

export const wink: Wink = {
  id: 'angry',
  dur: DUR,
  still: 2.25,
  draw(c, t) {
    c.globalAlpha = fadeOut(t, DUR)
    const pop = back(seg(t, 0, 0.4))
    const holding = seg(t, 0.5, BOOM)
    const after = t - BOOM

    // Camera shake on the explosion, dying off.
    if (after > 0) {
      const k = Math.max(0, 1 - after / 0.7) * 10
      c.translate(jitter(t, 1) * k, jitter(t, 2) * k)
    }

    // Holding it in: compressing and trembling more and more. Exploding: a jump.
    const tremble = (holding * holding * 4 + (after > 0 ? 2.5 : 0)) * (1 - seg(t, 3.6, 3.9))
    const jump = after > 0 ? Math.sin(seg(after, 0, 0.45) * Math.PI) * 46 : 0
    const land = after > 0.45 ? Math.sin(seg(after, 0.45, 0.65) * Math.PI) : 0
    const sq = after > 0 && after < 0.45 ? 1.14 : 1 - holding * 0.08 - land * 0.12
    const x = CX + jitter(t * 2, 3) * tremble
    const y = FLOOR - 94 + (1 - sq) * 40 - jump + jitter(t * 2, 4) * tremble * 0.5
    shadow(c, CX, FLOOR, 70 * pop * (1 - jump / 140))

    // Steam: two jets from the top of the head, puffing out after the boom.
    for (let i = 0; i < 14; i++) {
      const born = BOOM + i * 0.12
      const age = t - born
      if (age < 0 || age > 0.9 || born > DUR - 0.5) continue
      const side = i % 2 ? 1 : -1
      const q = easeOut(age / 0.9)
      puff(c, x + side * (52 + q * 70), y - 74 - q * 90, 8 + q * 22, (1 - q) * 0.9)
    }

    c.save()
    c.translate(x, y)
    c.scale(pop, pop)
    squash(c, sq)
    const shouting = after > 0 && after < 1.1
    face(c, {
      eyes: 'open',
      eyeScale: shouting ? 1.25 : 1,
      blink: after > 0 ? 1 : blink(t, 1.7, 0.1),
      look: [0, 0],
      brows: t > 0.45 ? clamp(0.4 + holding) : 0,
      mouth: shouting ? 'o' : t > 0.9 ? 'frown' : 'flat',
      open: 1,
      quiver: t > 1.1 && t < BOOM ? 1 : 0,
      red: clamp(lerp(0, 0.65, holding) + seg(after, 0, 0.15) * 0.4 - seg(t, 3.4, 3.9) * 0.3),
      t
    })
    c.restore()

    // A tiny warning puff while holding it in.
    const warn = seg(t, 1.35, 1.75)
    if (warn > 0 && warn < 1) puff(c, x + 58, y - 72 - warn * 20, 7, 1 - warn)

    // GRRR! slams in big and shakes.
    const g = seg(t, BOOM + 0.05, BOOM + 0.3)
    if (g > 0) {
      const out = 1 - seg(t, 3.3, 3.7)
      text(
        c,
        'GRRR!',
        CX + jitter(t, 5) * 3,
        50,
        30 + back(g, 3) * 16,
        '#d8261b',
        out,
        -0.06 + jitter(t, 6) * 0.03
      )
    }
    // Lines of fury sticking out of the head.
    if (after > 0.1 && t < 3.6) {
      c.save()
      c.strokeStyle = '#d8261b'
      c.lineWidth = 5
      c.lineCap = 'round'
      for (const a of [-2.4, -1.9, -1.25, -0.7]) {
        const r0 = 98 + Math.sin(t * 20 + a) * 4
        c.beginPath()
        c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        c.lineTo(x + Math.cos(a) * (r0 + 18), y + Math.sin(a) * (r0 + 18))
        c.stroke()
      }
      c.restore()
    }
  },
  sound({ tone, noise }) {
    tone(520, 0.05, 0.12, { to: 880, gain: 0.07 })
    tone(60, 0.5, BOOM - 0.4, { type: 'sawtooth', gain: 0.18, lp: 420, to: 95, attack: 0.9 }) // a rising growl
    tone(900, 1.2, BOOM - 1.2, { to: 2600, gain: 0.05, attack: 0.5 }) // kettle about to whistle
    tone(120, BOOM, 0.5, { to: 40, gain: 0.7 }) // boom
    noise(BOOM, 0.35, { type: 'lowpass', from: 2000, to: 200, gain: 0.5 })
    noise(BOOM + 0.05, 1.6, { type: 'highpass', from: 3500, gain: 0.14, attack: 0.05 }) // steam
    for (let i = 0; i < 8; i++)
      tone(105, BOOM + 0.1 + i * 0.07, 0.07, { type: 'sawtooth', gain: 0.18, lp: 900 })
  }
}
