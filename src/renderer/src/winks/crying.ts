// Llorando: sad eyes and a trembling lip; a first tear rolls down, then it bursts into
// sobs with tears gushing out, a puddle with ripples grows below, and it ends with a sniff.
import {
  back,
  blink,
  easeOut,
  fadeOut,
  H,
  lerp,
  seg,
  shadow,
  squash,
  tear,
  W,
  type Wink
} from './kit'
import { face } from './face'

const DUR = 4.4
const CX = W / 2
const FLOOR = H / 2 + 104
const BURST = 1.65
const SNIFF = 3.55

export const wink: Wink = {
  id: 'crying',
  dur: DUR,
  still: 2.4,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    c.globalAlpha = fade
    const pop = back(seg(t, 0, 0.45))
    const sobbing = t > BURST && t < SNIFF
    // Sobs: hiccupping jolts up, about three a second.
    const sob = sobbing ? Math.max(0, Math.sin((t - BURST) * Math.PI * 3.2)) ** 3 : 0
    const sniff = Math.sin(seg(t, SNIFF, SNIFF + 0.25) * Math.PI)
    const y = FLOOR - 92 - sob * 10 - sniff * 8
    const sag = 1 - seg(t, 0.5, 1.2) * 0.04 // slumps a little with sadness

    // The puddle: grows while it sobs, with rings rippling out from the drops.
    const pud = easeOut(seg(t, BURST + 0.3, SNIFF))
    if (pud > 0) {
      c.save()
      c.globalAlpha = fade * 0.8
      c.fillStyle = '#5fc1ff'
      c.beginPath()
      c.ellipse(CX, FLOOR + 6, 70 + pud * 150, 10 + pud * 14, 0, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = 'rgb(255 255 255 / 0.7)'
      c.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        const r = ((t * 0.9 + i / 4) % 1) * (60 + pud * 120)
        c.globalAlpha = fade * 0.7 * (1 - r / (60 + pud * 120))
        c.beginPath()
        c.ellipse(CX + (i % 2 ? 50 : -50) * pud, FLOOR + 6, r, r * 0.16, 0, 0, Math.PI * 2)
        c.stroke()
      }
      c.restore()
    } else {
      shadow(c, CX, FLOOR, 70 * pop)
    }

    c.save()
    c.translate(CX, y)
    c.scale(pop, pop)
    squash(c, sag * (1 + sob * 0.06) * (1 - sniff * 0.03))
    face(c, {
      eyes: sobbing ? 'closed' : 'sad',
      blink: blink(t, 2, 0.5),
      look: t < BURST ? [0, 0.4] : [0, 0],
      brows: t > 0.4 ? -1 : 0,
      mouth: sobbing ? 'wail' : 'frown',
      open: 0.4 + sob * 0.6,
      quiver: t > 0.6 && t < BURST ? 1 : t > SNIFF ? 0.3 : 0,
      blush: 0.35,
      t
    })
    // The first tear: wells up, then rolls down the cheek.
    const first = seg(t, 0.9, BURST)
    if (first > 0 && first < 1) {
      const grow = Math.min(1, first * 3)
      tear(c, -30 - first * 6, lerp(-2, 52, Math.max(0, first - 0.3) / 0.7), 1.3 * grow)
    }
    // After the sniff: one last tear hangs on.
    if (t > SNIFF) tear(c, 32, 4 + seg(t, SNIFF + 0.2, DUR) * 20, 1.1)
    c.restore()

    // Gushing tears: two fountains arcing out and falling into the puddle.
    if (sobbing) {
      for (let i = 0; i < 24; i++) {
        const age = (t - BURST + i * 0.06) % 0.8
        if (t - BURST < i * 0.03) continue
        const side = i % 2 ? 1 : -1
        const v = 170 + (i % 4) * 35
        const x = CX + side * (30 + v * age)
        const yy = y - 18 - 190 * age + 520 * age * age
        if (yy < FLOOR + 6) tear(c, x, yy, 1.6, 1 - seg(age, 0.6, 0.8)) // gone into the puddle
      }
    }
  },
  sound({ tone, noise }) {
    tone(520, 0.05, 0.12, { to: 880, gain: 0.07 })
    tone(520, 0.7, 0.8, { to: 420, gain: 0.05, vibrato: 18, attack: 0.2 }) // whimper
    // Sobs: wailing glides that wobble.
    for (const [s, d] of [
      [BURST, 0.9],
      [BURST + 1.0, 0.85]
    ]) {
      tone(700, s, d, { to: 430, gain: 0.11, vibrato: 30, attack: 0.08 })
      tone(350, s, d, { to: 215, gain: 0.05, vibrato: 15, type: 'triangle', attack: 0.08 })
    }
    for (let i = 0; i < 7; i++)
      tone(950 + (i % 3) * 120, BURST + 0.4 + i * 0.25, 0.09, { to: 1700, gain: 0.07 }) // drips
    noise(SNIFF, 0.22, { type: 'highpass', from: 1500, to: 4000, gain: 0.18, attack: 0.15 }) // sniff
  }
}
