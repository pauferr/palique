// Enamorado: it floats up dreamily, looks away and sighs; then its eyes pop into
// beating hearts, it blushes and drifts like a little cloud while hearts fall around.
import {
  back,
  blink,
  ease,
  easeOut,
  elastic,
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
import { face } from './face'

const DUR = 4.2
const CX = W / 2
const CY = H / 2 + 8
const POP = 1.25 // eyes become hearts

// Hearts drifting down, each with its own column, sway and size.
const FALLING = Array.from({ length: 11 }, (_, i) => ({
  x: 40 + ((i * 167) % 400),
  start: POP + 0.1 + i * 0.2,
  speed: 70 + (i % 4) * 22,
  size: 0.9 + (i % 3) * 0.45,
  color: ['#e8344e', '#ff5c8a', '#ff8fb1'][i % 3]
}))

// Lub-dub: two quick beats then a rest, like a real heartbeat.
const beat = (t: number): number => {
  const p = (t * 1.25) % 1
  return (
    Math.max(0, Math.sin(seg(p, 0, 0.12) * Math.PI)) +
    0.7 * Math.max(0, Math.sin(seg(p, 0.18, 0.3) * Math.PI))
  )
}

export const wink: Wink = {
  id: 'in-love',
  dur: DUR,
  still: 2.1,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    c.globalAlpha = fade

    for (const h of FALLING) {
      const age = t - h.start
      if (age < 0) continue
      const y = -20 + age * h.speed
      if (y > H + 20) continue
      c.save()
      c.globalAlpha = fade * Math.min(1, age * 3)
      c.translate(h.x + Math.sin(age * 2.6 + h.x) * 16, y)
      c.rotate(Math.sin(age * 2.6 + h.x) * 0.3)
      heart(c, 0, 0, h.size, h.color)
      c.restore()
    }

    // Floats in from below, then hovers like a cloud.
    const rise = easeOut(seg(t, 0, 0.7))
    const float = Math.sin(t * 2.2) * 7
    const sigh = Math.sin(seg(t, 0.75, 1.15) * Math.PI) // breathes in…
    const y = lerp(H + 100, CY, rise) + float - sigh * 6
    shadow(c, CX, CY + 104, 64 * rise * (1 - float / 60), 0.14)

    c.save()
    c.translate(CX, y)
    c.rotate(Math.sin(t * 1.7) * 0.07 + (t < POP ? -0.08 * seg(t, 0.5, 0.8) : 0))
    squash(c, 1 + sigh * 0.06 + Math.sin(t * 2.2) * 0.015)
    const love = seg(t, POP, POP + 0.05)
    const pop = elastic(seg(t, POP, POP + 0.6))
    face(c, {
      eyes: love > 0 ? 'heart' : t > 0.8 && t < 1.15 ? 'happy' : 'open',
      blink: blink(t, 2.5, 0.4),
      look: t > 0.45 && t < POP ? [0.7, -0.8] : [0, 0], // gazing up at someone
      eyeScale: love > 0 ? pop * (1.25 + beat(t) * 0.22) : 1,
      mouth: t > 0.8 && t < 1.15 ? 'o' : 'smile',
      open: 0.2,
      blush: ease(seg(t, POP, POP + 0.4)) * 1.1,
      t
    })
    c.restore()

    // A burst of sparkles when the eyes pop, then a slow twinkle around.
    const burst = seg(t, POP, POP + 0.45)
    if (burst > 0 && burst < 1) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const d = 70 + easeOut(burst) * 70
        sparkle(c, CX + Math.cos(a) * d, y - 14 + Math.sin(a) * d * 0.8, 0.8, 1 - burst, '#ffe3f0')
      }
    }
    for (let i = 0; i < 4; i++) {
      const tw = Math.sin((t - POP) * 3 + i * 1.7)
      if (t > POP + 0.4)
        sparkle(
          c,
          CX + [-130, 125, -110, 140][i],
          [70, 90, 240, 230][i],
          0.7 + tw * 0.2,
          Math.max(0, tw)
        )
    }
    // A small heart rising from it with every beat.
    const puff = (t * 1.25) % 1
    if (t > POP + 0.3)
      heart(
        c,
        CX + 70,
        y - 70 - puff * 40,
        1.1 * back(Math.min(1, puff * 4)),
        `rgb(232 52 78 / ${1 - puff})`
      )
  },
  sound({ tone, noise }) {
    ;[392, 523, 659].forEach((f, i) =>
      tone(f, 0.05 + i * 0.08, 0.6, { type: 'triangle', gain: 0.05 })
    )
    noise(0.75, 0.45, { type: 'lowpass', from: 700, to: 300, gain: 0.07, attack: 0.25 }) // sigh
    tone(500, POP, 0.3, { to: 1400, gain: 0.08 }) // eyes pop
    ;[1047, 1319, 1568, 2093].forEach((f, i) =>
      tone(f, POP + 0.05 + i * 0.05, 0.5, { type: 'triangle', gain: 0.06 })
    )
    // Lub-dub, as long as the hearts beat.
    for (let s = POP + 0.2; s < DUR - 0.4; s += 0.8) {
      tone(75, s, 0.14, { to: 48, gain: 0.5 })
      tone(70, s + 0.16, 0.14, { to: 46, gain: 0.35 })
    }
    ;[659, 784, 988, 784, 1175].forEach((f, i) =>
      tone(f, POP + 0.6 + i * 0.45, 0.8, { type: 'triangle', gain: 0.04 })
    )
  }
}
