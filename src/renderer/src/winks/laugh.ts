// Carcajada: a smile that becomes a chuckle, then a laugh it can't stop: it bounces,
// rolls half over, tears fly out and fall, «JA» pops to the rhythm. Then it calms down.
import {
  back,
  blink,
  clamp,
  ease,
  fadeOut,
  H,
  lerp,
  seg,
  shadow,
  squash,
  tear,
  text,
  W,
  type Wink
} from './kit'
import { face } from './face'

const DUR = 4.2
const CX = W / 2
const FLOOR = H / 2 + 100

// How hard it's laughing: 0 smiling, 1 chuckling, 2 roaring.
const level = (t: number): number => seg(t, 0.5, 0.8) + seg(t, 1.05, 1.35) - 2 * seg(t, 3.2, 3.6)

type Pose = { x: number; y: number; rot: number; sq: number }

// Where the face is at any moment, so tears can leave from where the eyes were.
function pose(t: number): Pose {
  const lv = level(t)
  const roar = clamp(lv - 1)
  const hop = Math.abs(Math.sin(t * Math.PI * 3.4)) // bounces to the "ja" rhythm
  const height = lerp(4, 26, roar) * clamp(lv)
  // Rolls half over to one side, then rocks back.
  const roll = Math.sin(seg(t, 1.4, 3.2) * Math.PI) * 0.75 * roar
  return {
    x: CX + roll * 60,
    y: FLOOR - 92 - hop * height,
    rot: roll + Math.sin(t * 10.7) * 0.06 * clamp(lv),
    sq: 1 + (hop - 0.5) * 0.14 * clamp(lv)
  }
}

const JA = [
  [100, 72, -0.3],
  [384, 86, 0.25],
  [76, 236, 0.2],
  [404, 250, -0.2],
  [236, 40, 0.05],
  [140, 150, -0.15],
  [350, 170, 0.18]
]

export const wink: Wink = {
  id: 'laugh',
  dur: DUR,
  still: 2.05,
  draw(c, t) {
    c.globalAlpha = fadeOut(t, DUR)
    const pop = back(seg(t, 0, 0.45))
    const lv = level(t)
    const p = pose(t)

    shadow(c, p.x, FLOOR, 70 * pop * (1 - (FLOOR - 92 - p.y) / 160))

    // Tears: launched from the eyes of an earlier pose, falling with gravity.
    for (let i = 0; i < 18; i++) {
      const born = 1.3 + i * 0.1
      const age = t - born
      if (age < 0 || age > 0.9 || born > 3.3) continue
      const q = pose(born)
      const side = i % 2 ? 1 : -1
      const ex = q.x + Math.cos(q.rot) * side * 40
      const ey = q.y + Math.sin(q.rot) * side * 40 - 14
      const x = ex + side * (90 + (i % 3) * 30) * age
      const y = ey - 160 * age + 560 * age * age
      tear(c, x, y, 1.8, 1 - seg(age, 0.6, 0.9))
    }

    c.save()
    c.translate(p.x, p.y)
    c.rotate(p.rot)
    c.scale(pop, pop)
    squash(c, p.sq)
    const roaring = lv > 1.2
    face(c, {
      eyes: lv > 0.5 ? 'happy' : 'open',
      blink: blink(t, 1.9, 0.2),
      mouth: roaring ? 'laugh' : lv > 0.4 ? 'grin' : 'smile',
      open: 0.5 + Math.sin(t * Math.PI * 6.8) * 0.5,
      blush: clamp(lv) * 0.9,
      t
    })
    // A last little tear wiped while calming down.
    if (t > 3.3) tear(c, -46, 8 + seg(t, 3.3, 3.9) * 30, 1.2, 1 - seg(t, 3.7, 3.95))
    c.restore()

    // «JA» to the rhythm, popping in and floating up.
    JA.forEach(([x, y, r], i) => {
      const start = 1.1 + i * 0.29
      const q = seg(t, start, start + 0.7)
      if (q <= 0 || q >= 1 || start > 3.2) return
      const size = 20 + back(Math.min(1, q * 3)) * 22
      text(
        c,
        i % 3 === 2 ? 'JAJA' : 'JA',
        x,
        y - q * 18,
        size,
        i % 2 ? '#ff6d00' : '#ff9e00',
        1 - seg(q, 0.7, 1),
        r
      )
    })
    // The first, timid «je».
    const je = seg(t, 0.55, 1.05)
    if (je > 0 && je < 1)
      text(c, 'je', CX + 92, 120 - je * 10, 18 + ease(je) * 6, '#ffb74d', 1 - seg(je, 0.6, 1), 0.2)
  },
  sound({ tone, noise }) {
    tone(520, 0.05, 0.12, { to: 880, gain: 0.07 }) // pop in
    tone(420, 0.6, 0.12, { type: 'triangle', gain: 0.06, lp: 1500 }) // a little «je»
    tone(400, 0.8, 0.12, { type: 'triangle', gain: 0.06, lp: 1500 })
    // «JA JA JA»: a voice-ish square bursts to the bounce, getting breathless.
    for (let i = 0; i < 14; i++) {
      const s = 1.1 + i * 0.147 * 2
      if (s > 3.3) break
      const f = 360 - i * 6 + (i % 2) * 30
      tone(f, s, 0.13, { type: 'square', gain: 0.08, lp: 1300, to: f * 0.85 })
      noise(s, 0.08, { from: 900, q: 2, gain: 0.05 })
    }
    noise(3.45, 0.5, { type: 'lowpass', from: 800, to: 300, gain: 0.08, attack: 0.2 }) // a sigh
  }
}
