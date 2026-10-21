// Beso: it looks at you, blushes, shuts its eyes and puckers up; a heart flies to the
// screen, "sticks" there beating twice and bursts into little hearts that fall.
import {
  back,
  blink,
  ease,
  easeIn,
  easeOut,
  fadeOut,
  H,
  heart,
  lerp,
  seg,
  shadow,
  sparkle,
  squash,
  W,
  type Wink
} from './kit'
import { face, type Eye } from './face'

const DUR = 4
const CX = W / 2
const CY = H / 2 + 14

// The burst: fixed directions and sizes so it looks the same every time.
const BITS = Array.from({ length: 16 }, (_, i) => ({
  a: (i / 16) * Math.PI * 2 + (i % 3) * 0.2,
  v: 260 + ((i * 53) % 7) * 30,
  s: 1.1 + (i % 4) * 0.35,
  color: i % 3 ? '#e8344e' : '#ff7aa2'
}))

export const wink: Wink = {
  id: 'kiss',
  dur: DUR,
  still: 1.75,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    c.globalAlpha = fade

    // Face: pops in, then leans back (anticipation) and forward into the kiss.
    const pop = back(seg(t, 0, 0.5))
    const lean = -Math.sin(seg(t, 1.35, 1.55) * Math.PI) * 0.06 + ease(seg(t, 1.55, 1.8)) * 0.08
    const relax = ease(seg(t, 2.1, 2.5))
    const breathe = 1 + Math.sin(t * 3.2) * 0.012
    const shy = seg(t, 0.95, 1.3) * (1 - relax)
    shadow(c, CX, CY + 92, 70 * pop)
    c.save()
    c.translate(CX, CY - shy * 4)
    c.scale(pop * (1 + lean * (1 - relax)), pop * (1 + lean * (1 - relax)))
    c.rotate(-shy * 0.12 + relax * 0.04 * Math.sin(t * 2))
    squash(c, breathe * (t < 0.6 ? 1 + Math.sin(seg(t, 0.35, 0.6) * Math.PI) * -0.08 : 1))

    let eyes: Eye | [Eye, Eye] = 'open'
    if (t > 1.3 && t < 2.3) eyes = 'closed'
    else if (t >= 3.15 && t < 3.6) eyes = ['open', 'closed'] // a wink to finish
    face(c, {
      eyes,
      blink: t > 3.1 ? 1 : blink(t, 2.2, 0.9), // keep the final wink clean
      look: t < 0.95 ? [0, 0] : [0.3, 0.7 * shy],
      mouth: t > 1.35 && t < 2.3 ? 'kiss' : t > 1.0 && t < 1.35 ? 'pout' : 'smile',
      blush: seg(t, 0.9, 1.3) * 1.1 - seg(t, 3.2, 3.8) * 0.4,
      t
    })
    c.restore()

    // The heart: leaves the lips, beats as it flies at you and grows to fill the glass.
    const fly = seg(t, 1.8, 2.75)
    const stuck = seg(t, 2.75, 3.2)
    if (fly > 0 && stuck < 1) {
      const k = easeIn(fly)
      const beat = 1 + Math.max(0, Math.sin(t * 16)) * 0.1 * (1 - fly)
      const x = lerp(CX, CX + 10, k)
      const y = lerp(CY + 30, CY - 20, easeOut(fly))
      // Two thumps while stuck to the screen.
      const thump = Math.max(0, Math.sin(stuck * Math.PI * 2 * 2)) * 0.12
      const size = lerp(0.6, 11, k) * beat * (1 + thump)
      c.save()
      c.translate(x, y)
      c.rotate(Math.sin(fly * 6) * 0.15 * (1 - fly))
      heart(c, 0, 0, size)
      c.restore()
    }

    // Burst: little hearts fly out and fall with gravity.
    const age = t - 3.2
    if (age > 0) {
      for (const b of BITS) {
        const x = CX + 10 + Math.cos(b.a) * b.v * age
        const y = CY - 20 + Math.sin(b.a) * b.v * age * 0.8 + 520 * age * age
        c.save()
        c.globalAlpha = fade * (1 - seg(age, 0.4, 0.8))
        c.translate(x, y)
        c.rotate(age * (b.a - 3))
        heart(c, 0, 0, b.s, b.color)
        c.restore()
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3
        sparkle(
          c,
          CX + 10 + Math.cos(a) * 150,
          CY - 20 + Math.sin(a) * 110,
          0.9,
          Math.sin(seg(age, 0, 0.5) * Math.PI)
        )
      }
    }
  },
  sound({ tone, noise }) {
    tone(520, 0.05, 0.12, { to: 880, gain: 0.07 }) // pop in
    tone(380, 1.0, 0.35, { to: 460, gain: 0.05, vibrato: 12 }) // a shy "mm"
    noise(1.8, 0.09, { from: 1500, q: 3, gain: 0.5 }) // the smooch
    tone(400, 1.8, 0.2, { to: 980, gain: 0.16 })
    tone(300, 1.9, 0.85, { to: 700, gain: 0.04, attack: 0.5 }) // flight
    for (const s of [2.78, 2.98]) tone(80, s, 0.18, { to: 50, gain: 0.55 }) // thump-thump
    ;[1319, 1760, 2093, 2637].forEach((f, i) =>
      tone(f, 3.2 + i * 0.06, 0.6, { type: 'triangle', gain: 0.1 })
    )
  }
}
