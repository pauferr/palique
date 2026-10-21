// A wave rolls in with the kid paddling on his board. He pops up, rides the crest
// throwing spray, and raises the rock horns: ¡YEAH!
import { arm, kidHead } from './kid'
import {
  H,
  W,
  back,
  blink,
  ease,
  fadeOut,
  lerp,
  seg,
  squash,
  text,
  type Ctx,
  type Wink
} from './kit'

const DUR = 4.4
const POP = 1.05 // he pops up from lying to standing
const HORNS = 1.95 // and raises the horns
const SUIT = '#263238'
const SCALE = 0.62
const MID = H / 2 + 40

const swell = (t: number): number => Math.sin(seg(t, 0, DUR) * Math.PI)
const amp = (t: number): number => 20 + swell(t) * 26
const waveY = (x: number, t: number): number =>
  MID + Math.sin(x / 48 - t * 4) * amp(t) + Math.sin(x / 23 + t * 2.5) * 6
// Paddles in slowly, then rides fast across and out.
const rideX = (t: number): number =>
  t < POP
    ? lerp(-70, 120, ease(seg(t, 0.15, POP)))
    : lerp(120, W + 80, seg(t, POP, DUR - 0.2) * 0.45 + ease(seg(t, POP, DUR - 0.2)) * 0.55)

function board(c: Ctx): void {
  c.fillStyle = '#ff7043'
  c.beginPath()
  c.ellipse(0, 0, 80, 10, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#fff'
  c.fillRect(-62, -2, 124, 4)
  c.fillStyle = '#bf360c'
  c.beginPath()
  c.moveTo(-60, 6)
  c.lineTo(-74, 22)
  c.lineTo(-52, 8)
  c.fill()
}

// Lying on the board, arms windmilling.
function paddling(c: Ctx, t: number): void {
  board(c)
  c.strokeStyle = SUIT
  c.lineCap = 'round'
  c.lineWidth = 15
  c.beginPath()
  c.moveTo(-70, -16)
  c.lineTo(-30, -18)
  c.stroke()
  c.fillStyle = SUIT
  c.beginPath()
  c.roundRect(-36, -34, 66, 26, 12)
  c.fill()
  c.fillStyle = '#26c6da'
  c.fillRect(-10, -34, 6, 26)
  for (const [off, front] of [
    [0, false],
    [Math.PI, true]
  ] as const) {
    const a = t * 9 + off
    if (Math.sin(a) > 0 === front) arm(c, 18, -22, a, 0.3, SUIT, 'open', 22)
  }
  c.save()
  c.translate(46, -40)
  c.scale(0.44, 0.44)
  kidHead(c, { backwards: true, cap: '#ff9800', mouth: 'grin', look: 1, lid: blink(t, 1.7) })
  c.restore()
  for (const [off, front] of [
    [0, true],
    [Math.PI, false]
  ] as const) {
    const a = t * 9 + off
    if (Math.sin(a) > 0 === front) arm(c, 18, -22, a, 0.3, SUIT, 'open', 22)
  }
}

// Standing: `crouch` bends the knees (1 = deep, ready to spring), `rock` raises the horns.
function standing(c: Ctx, t: number, crouch: number, rock: number): void {
  board(c)
  const hip = -60 + crouch * 30
  c.strokeStyle = SUIT
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = 15
  c.beginPath()
  c.moveTo(-26, -6)
  c.lineTo(-26 + crouch * 10, (hip - 6) / 2 + crouch * 6)
  c.lineTo(-12, hip)
  c.moveTo(24, -6)
  c.lineTo(16 + crouch * 12, (hip - 6) / 2 + crouch * 6)
  c.lineTo(10, hip)
  c.stroke()
  c.fillStyle = SUIT
  c.beginPath()
  c.roundRect(-20, hip - 62, 40, 68, 14)
  c.fill()
  c.fillStyle = '#26c6da'
  c.fillRect(-20, hip - 40, 40, 6)
  const sh = hip - 52
  // The back arm keeps balance, swaying with the ride.
  arm(c, -16, sh, 1.85 + Math.sin(t * 5) * 0.18, 0.35, SUIT, 'open', 24)
  c.save()
  c.translate(0, sh - 50)
  c.rotate(Math.sin(t * 4) * 0.05)
  c.scale(0.5, 0.5)
  kidHead(c, {
    backwards: true,
    cap: '#ff9800',
    capTilt: Math.sin(t * 4 - 0.5) * 0.08,
    eyes: rock > 0.5 ? 'happy' : 'open',
    mouth: rock > 0.5 ? 'laugh' : crouch > 0.5 ? 'o' : 'grin',
    laugh: 0.7 + Math.abs(Math.sin(t * 10)) * 0.3,
    lid: blink(t, 2.1, 0.3),
    look: 0.6
  })
  c.restore()
  // The horns arm swings up with an overshoot, then pumps to the beat.
  const pump = rock >= 1 ? Math.sin(t * 12) * 0.12 : 0
  const up = lerp(-0.7, -2.25, back(rock, 2.4)) + pump
  arm(c, 16, sh, up, -0.25 * rock, SUIT, rock > 0.3 ? 'horns' : 'fist', 24)
}

export const wink: Wink = {
  id: 'wave',
  dur: DUR,
  still: 2.5,
  draw(c, t) {
    const fade = fadeOut(t, DUR, 0.45)
    const reveal = ease(seg(t, 0, 0.9))
    const right = W * reveal
    c.save()
    c.globalAlpha = fade
    // The water: a deeper back, the face of the wave, the crest line with foam.
    const back2 = c.createLinearGradient(0, MID - 40, 0, H)
    back2.addColorStop(0, 'rgb(40 150 220 / 0.55)')
    back2.addColorStop(1, 'rgb(20 90 200 / 0)')
    c.fillStyle = back2
    c.beginPath()
    c.moveTo(0, waveY(0, t - 0.4) - 18)
    for (let x = 0; x <= right; x += 6) c.lineTo(x, waveY(x + 30, t - 0.4) - 18)
    c.lineTo(right, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()
    const g = c.createLinearGradient(0, MID - amp(t), 0, MID + 110)
    g.addColorStop(0, 'rgb(90 225 245 / 0.95)')
    g.addColorStop(1, 'rgb(30 110 225 / 0)')
    c.fillStyle = g
    c.beginPath()
    c.moveTo(0, waveY(0, t))
    for (let x = 0; x <= right; x += 6) c.lineTo(x, waveY(x, t))
    c.lineTo(right, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()
    c.lineWidth = 5
    c.strokeStyle = 'rgb(255 255 255 / 0.9)'
    c.beginPath()
    for (let x = 0; x <= right; x += 6) {
      if (x) c.lineTo(x, waveY(x, t))
      else c.moveTo(x, waveY(x, t))
    }
    c.stroke()
    c.fillStyle = '#fff'
    for (let i = 0; i < 16; i++) {
      const fx = ((i * 37 + t * 90) % (W + 40)) - 20
      if (fx < right) {
        c.beginPath()
        c.arc(fx, waveY(fx, t) - 8 - (i % 3) * 5, 3 + (i % 2) * 2, 0, Math.PI * 2)
        c.fill()
      }
    }
    // Spray thrown off the board's tail while he rides standing, falling with gravity.
    for (let i = 0; i < 26; i++) {
      const age = (i / 26) * 0.55
      const born = t - age
      if (born < POP + 0.1) continue
      const bx = rideX(born) - 40
      const by = waveY(bx, born) - 2
      const vx = -60 - (i % 4) * 25
      const vy = -150 - (i % 5) * 30
      const x = bx + vx * age
      const y = by + vy * age + 0.5 * 900 * age * age
      c.fillStyle = `rgb(255 255 255 / ${0.85 * (1 - age / 0.55)})`
      c.beginPath()
      c.arc(x, y, 2.5 + (i % 3), 0, Math.PI * 2)
      c.fill()
    }
    // The surfer, tilting with the slope he rides.
    const sx = rideX(t)
    const slope = Math.atan2(waveY(sx + 6, t) - waveY(sx - 6, t), 12)
    c.save()
    c.translate(sx, waveY(sx, t) - 4)
    c.rotate(slope * 0.5)
    c.scale(SCALE, SCALE)
    if (t < POP) {
      c.rotate(Math.sin(t * 9) * 0.03)
      paddling(c, t)
    } else {
      // Pop-up: crouched low, springs up with a stretch, then knees soak up the wave.
      const spring = seg(t, POP, POP + 0.3)
      const ride = Math.sin(t * 5.5) * 0.18 + 0.2
      const crouch = spring < 1 ? lerp(1, 0, back(spring, 2.5)) : ride
      squash(c, 1 + (spring > 0 && spring < 0.6 ? Math.sin(spring * Math.PI * 1.6) * 0.07 : 0))
      standing(c, t, crouch, seg(t, HORNS, HORNS + 0.3))
    }
    c.restore()
    if (t > HORNS + 0.05) {
      const p = seg(t, HORNS + 0.05, HORNS + 0.3)
      text(
        c,
        '¡YEAH!',
        Math.min(W - 70, sx + 50),
        Math.max(40, waveY(sx, t) - 150),
        34 * back(p),
        '#ff6d00',
        1 - seg(t, 3.2, 3.5),
        -0.15 + Math.sin(t * 8) * 0.04
      )
    }
    c.restore()
  },
  sound({ tone, noise }) {
    // Sea rumble, paddle splashes, a swoosh for the pop-up, surf guitar for the horns.
    noise(0, 4.2, { type: 'lowpass', from: 500, to: 1400, gain: 0.35, attack: 1.2 })
    noise(0.6, 3.4, { from: 2500, q: 0.7, gain: 0.08, attack: 1 })
    tone(90, 0.2, 4, { gain: 0.08, attack: 1.2 })
    for (let s = 0.3; s < POP; s += 0.35) noise(s, 0.12, { from: 1500, q: 2, gain: 0.12 })
    noise(POP, 0.3, { from: 600, to: 3000, q: 1.2, gain: 0.25 })
    const riff: [number, number][] = [
      [196, 0],
      [262, 0.15],
      [294, 0.3],
      [392, 0.45],
      [392, 0.75],
      [370, 0.9],
      [392, 1.05]
    ]
    for (const [f, s] of riff) {
      tone(f, HORNS + s, 0.32, { type: 'sawtooth', gain: 0.07, lp: 1800, to: f * 0.97, vibrato: 4 })
    }
  }
}
