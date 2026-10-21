// Chulo: it struts in to the beat, stops, and a pair of shades spins down from above,
// lands with a bounce; an eyebrow goes up, a glint crosses the lenses, a little nod. (H)
import {
  back,
  blink,
  ease,
  easeIn,
  easeOut,
  fadeOut,
  H,
  lerp,
  seg,
  shadow,
  sparkle,
  squash,
  W,
  type Ctx,
  type Wink
} from './kit'
import { face } from './face'

const DUR = 4
const CX = W / 2
const FLOOR = H / 2 + 104
const LAND = 1.65

function lens(c: Ctx, s: number): void {
  c.moveTo(s * 6, -10)
  c.lineTo(s * 50, -12)
  c.quadraticCurveTo(s * 52, 18, s * 30, 20)
  c.quadraticCurveTo(s * 8, 18, s * 6, -10)
}

function shades(c: Ctx, glint: number): void {
  c.fillStyle = '#16161c'
  c.beginPath()
  lens(c, -1)
  lens(c, 1)
  c.fill()
  c.fillRect(-10, -12, 20, 7)
  c.lineWidth = 5
  c.strokeStyle = '#16161c'
  c.beginPath()
  c.moveTo(-50, -10)
  c.lineTo(-76, -18)
  c.moveTo(50, -10)
  c.lineTo(76, -18)
  c.stroke()
  // A soft sheen always, a sharp glint sweeping across once.
  c.save()
  c.beginPath()
  lens(c, -1)
  lens(c, 1)
  c.clip()
  c.fillStyle = 'rgb(255 255 255 / 0.12)'
  c.fillRect(-60, -14, 120, 12)
  if (glint > 0 && glint < 1) {
    c.globalAlpha *= 0.9
    c.fillStyle = '#fff'
    const x = lerp(-80, 80, glint)
    c.beginPath()
    c.moveTo(x - 6, -14)
    c.lineTo(x + 6, -14)
    c.lineTo(x - 8, 24)
    c.lineTo(x - 20, 24)
    c.fill()
  }
  c.restore()
}

export const wink: Wink = {
  id: 'cool',
  dur: DUR,
  still: 2.5,
  draw(c, t) {
    c.globalAlpha = fadeOut(t, DUR)

    // Strut in from the left: a bob and a rock on every step, then a stop that overshoots.
    const walk = seg(t, 0, 0.95)
    const step = Math.abs(Math.sin(walk * Math.PI * 4))
    const walking = walk < 1
    const x = lerp(-110, CX, back(walk, 1.2))
    const land = t > LAND ? Math.sin(seg(t, LAND, LAND + 0.22) * Math.PI) : 0
    const nod = Math.sin(seg(t, 2.45, 2.9) * Math.PI * 2) * 0.5 * (1 - seg(t, 2.7, 2.9))
    const groove = t > 3 ? Math.sin((t - 3) * 6) * 0.04 : 0
    const y = FLOOR - 94 - (walking ? step * 14 : 0) + land * 6 + nod * 8
    shadow(c, x, FLOOR, 70 * (1 - step * 0.12))

    c.save()
    c.translate(x, y)
    c.rotate(
      (walking ? Math.sin(walk * Math.PI * 4) * 0.12 : 0) +
        groove -
        seg(t, 1.9, 2.2) * 0.08 +
        seg(t, 2.9, 3.1) * 0.08
    )
    squash(c, walking ? 1 + (step - 0.5) * 0.08 : 1 - land * 0.1)
    const hidden = t > LAND
    face(c, {
      eyes: 'open',
      blink: blink(t, 1.6, 0.3),
      look: t > 0.95 && t < 1.25 ? [0, -1] : [0, 0], // glances up at the shades coming
      mouth: t > 1.9 ? 'smirk' : walking ? 'grin' : 'smile',
      // One eyebrow goes up over the shades.
      browLift: [0, hidden ? back(seg(t, 1.9, 2.15)) * 12 * (1 - seg(t, 3.2, 3.4)) : 0],
      brows: hidden ? 0.001 : 0,
      t
    })

    // The shades: thrown in from above, spinning, landing on the eyes with a bounce.
    const fall = seg(t, 0.95, LAND)
    if (fall > 0) {
      c.save()
      const bounce =
        t > LAND
          ? -Math.abs(Math.sin(seg(t, LAND, LAND + 0.35) * Math.PI)) *
            12 *
            (1 - seg(t, LAND, LAND + 0.35))
          : 0
      c.translate(lerp(60, 0, easeOut(fall)), lerp(-300, -17, easeIn(fall)) + bounce)
      c.rotate((1 - ease(fall)) * Math.PI * 3)
      shades(c, seg(t, 2.05, 2.45))
      c.restore()
    }
    c.restore()

    // Ping! on the glint, then a few stars around.
    const ping = seg(t, 2.35, 2.75)
    if (ping > 0 && ping < 1)
      sparkle(c, x + 60, y - 30, 0.6 + Math.sin(ping * Math.PI) * 1.4, Math.sin(ping * Math.PI))
    ;[
      [CX - 130, 90],
      [CX + 140, 110],
      [CX + 120, 250]
    ].forEach(([sx, sy], i) => {
      const p = seg(t, 2.8 + i * 0.2, 3.5 + i * 0.2)
      if (p > 0 && p < 1) sparkle(c, sx, sy, 0.8 + Math.sin(p * Math.PI), Math.sin(p * Math.PI))
    })
  },
  sound({ tone, noise }) {
    // Strut: a bass step on each footfall.
    for (let i = 0; i < 4; i++) {
      tone(i % 2 ? 98 : 82, i * 0.24, 0.16, { type: 'triangle', gain: 0.35 })
      noise(i * 0.24, 0.05, { type: 'highpass', from: 5000, gain: 0.06 })
    }
    noise(0.95, 0.7, { from: 400, to: 2400, q: 2, gain: 0.12, attack: 0.5 }) // spinning shades
    tone(1700, 0.95, 0.65, { to: 700, gain: 0.05 })
    noise(LAND, 0.05, { type: 'highpass', from: 3000, gain: 0.45 }) // click into place
    tone(220, LAND, 0.12, { to: 160, type: 'triangle', gain: 0.2 })
    tone(2637, 2.35, 0.6, { type: 'triangle', gain: 0.1 }) // ting
    tone(3520, 2.42, 0.5, { type: 'triangle', gain: 0.06 })
    // A smug little bass riff.
    ;[110, 131, 147, 165, 147].forEach((f, i) =>
      tone(f, 2.85 + i * 0.16, 0.18, { type: 'sawtooth', gain: 0.12, lp: 700 })
    )
  }
}
