import {
  type Ctx,
  type Wink,
  H,
  INK,
  W,
  back,
  blink,
  clamp,
  ease,
  easeIn,
  easeOut,
  elastic,
  fadeOut,
  heart,
  lerp,
  seg,
  shadow,
  sparkle,
  text
} from './kit'

const DUR = 4.4
const BEAT = 0.5 // seconds per beat: hips, steps and the kick drum all follow it
const LIGHTS = ['255 70 160', '80 200 255', '255 220 60', '140 255 120']
const PINK = '#f48fb1'
const PINK_DARK = '#d86a93'

type Pose = {
  dance: number // 0..1 how much it's dancing
  wink: number // 0..1 right eye closing at the camera
  kiss: number // 0..1 the arm bringing a kiss to the snout and throwing it
  light: string // the disco colour washing over it
}

// The pig, feet at y≈136, body centred at (0, 30). Hips sway offbeat, the head and ears
// lag behind them, the free arm waves overhead and the other rests on the hip.
function pig(c: Ctx, t: number, pose: Pose): void {
  const { dance, wink, kiss, light } = pose
  const beat = (t / BEAT) * Math.PI
  const sway = Math.sin(beat) * dance
  const bob = Math.abs(Math.sin(beat)) * dance
  c.save()
  // Legs step on the beat: one lifts while the other carries the weight.
  c.strokeStyle = PINK
  c.lineCap = 'round'
  c.lineWidth = 20
  for (const s of [-1, 1]) {
    const lift = Math.max(0, Math.sin(beat * s)) * 14 * dance
    c.beginPath()
    c.moveTo(s * 24, 72)
    c.lineTo(s * (30 + lift * 0.4), 130 - lift)
    c.stroke()
    c.fillStyle = '#7a3b52'
    c.beginPath()
    c.ellipse(s * (30 + lift * 0.4), 136 - lift, 13, 7, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Body bobs down on every beat (a little squash), hips swing.
  c.translate(0, bob * 6)
  c.rotate(sway * 0.2)
  c.scale(1 + bob * 0.04, 1 - bob * 0.04)
  // Curly tail, wiggling with a lag
  c.strokeStyle = PINK_DARK
  c.lineWidth = 5
  c.beginPath()
  const tw = Math.sin(beat * 2 - 0.8) * 0.6
  c.arc(68, 34, 9, tw, tw + Math.PI * 1.6)
  c.stroke()
  const g = c.createRadialGradient(-20, -10, 10, 0, 20, 90)
  g.addColorStop(0, '#ffd1e0')
  g.addColorStop(1, PINK)
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, 30, 66, 58, 0, 0, Math.PI * 2)
  c.fill()
  // Disco light washing over the belly
  c.save()
  c.clip()
  c.fillStyle = `rgb(${light} / ${0.13 * dance})`
  c.fillRect(-70, -30, 140, 120)
  c.restore()
  // Hand on the hip
  c.strokeStyle = PINK
  c.lineWidth = 16
  c.beginPath()
  c.moveTo(50, 14)
  c.quadraticCurveTo(84, 40, 56, 58)
  c.stroke()
  // Free arm: waves overhead while dancing, then brings a kiss to the snout and throws it.
  const wave = Math.sin(beat * 2) * 14 * dance
  const throwOut = seg(kiss, 0.55, 1)
  const toMouth = seg(kiss, 0, 0.45)
  const hx = lerp(lerp(-72 + wave, -18, easeOut(toMouth)), -110, easeOut(throwOut))
  const hy = lerp(lerp(-92, -72, easeOut(toMouth)), -60, easeOut(throwOut))
  c.beginPath()
  c.moveTo(-50, 8)
  c.quadraticCurveTo(lerp(-92, -50, toMouth), lerp(-30, -40, toMouth), hx, hy)
  c.stroke()
  c.fillStyle = PINK_DARK
  c.beginPath()
  c.arc(hx, hy, 9, 0, Math.PI * 2)
  c.fill()
  // Head, counter-swaying (it follows the hips a beat late)
  c.translate(0, -50)
  c.rotate(-Math.sin(beat - 0.6) * dance * 0.3)
  // Ears flop behind the head's movement
  const flop = Math.sin(beat - 1.2) * 0.35 * dance
  c.fillStyle = PINK
  for (const s of [-1, 1]) {
    c.save()
    c.translate(s * 30, -38)
    c.rotate(s * 0.15 + flop)
    c.beginPath()
    c.moveTo(-10, 0)
    c.lineTo(s * 14, -26)
    c.lineTo(10, 4)
    c.fill()
    c.restore()
  }
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, -6, 52, 46, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = `rgb(${light} / ${0.1 * dance})`
  c.fill()
  // Snout, puckered while kissing
  const pucker = Math.sin(toMouth * Math.PI) * (1 - throwOut)
  c.fillStyle = '#ff9ec0'
  c.beginPath()
  c.ellipse(0, 10, 22 - pucker * 6, 15 + pucker * 3, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#c2577a'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * (8 - pucker * 2), 10, 4, 6, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Blush grows with the flirting
  c.fillStyle = `rgb(255 90 130 / ${0.25 + wink * 0.3})`
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 34, 12, 10, 6, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Half-closed flirty eyes: a heavy lid over the pupil (lashes read as angry brows at this
  // size). The right one winks at the camera.
  c.strokeStyle = INK
  c.lineWidth = 3.5
  c.lineCap = 'round'
  const open = blink(t, 1.9, 0.3)
  for (const s of [-1, 1]) {
    c.save()
    c.translate(s * 20, -14)
    if (s === 1 && wink > 0.5) {
      c.beginPath()
      c.arc(0, -4, 8, Math.PI * 0.15, Math.PI * 0.85)
      c.stroke()
    } else {
      c.fillStyle = '#fff'
      c.beginPath()
      c.ellipse(0, 0, 11, 10, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = INK
      c.beginPath()
      c.ellipse(s * 2, 2, 5.5, 6.5 * open, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(s * 2 - 2, 0, 1.8, 0, Math.PI * 2)
      c.fill()
      // Heavy lid over the top third (lower while blinking)
      const lid = -10 + 10 * (1.4 - open)
      c.fillStyle = '#f7a3c2'
      c.beginPath()
      c.ellipse(0, lid - 2, 12, 9, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
  }
  // Raised left brow during the wink
  c.save()
  c.lineWidth = 3.5
  c.globalAlpha *= wink
  c.beginPath()
  c.moveTo(-30, -34 - wink * 6)
  c.quadraticCurveTo(-20, -40 - wink * 8, -10, -34 - wink * 4)
  c.stroke()
  c.restore()
  // Lipstick smile
  c.fillStyle = '#e8344e'
  c.beginPath()
  c.ellipse(0, 32, 9 - pucker * 3, 5 + pucker, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

function discoBall(c: Ctx, x: number, y: number, t: number, alpha: number): void {
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  c.strokeStyle = '#ccc'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(0, -200)
  c.lineTo(0, -26)
  c.stroke()
  c.beginPath()
  c.arc(0, 0, 26, 0, Math.PI * 2)
  c.clip()
  for (let i = -4; i < 5; i++)
    for (let j = -4; j < 5; j++) {
      const v = (Math.sin(i * 1.7 + j * 2.3 + t * 8) + 1) / 2
      c.fillStyle = `hsl(${200 + v * 60} 20% ${55 + v * 40}%)`
      c.fillRect(i * 7, j * 7, 6, 6)
    }
  c.restore()
}

export const wink: Wink = {
  id: 'pig',
  dur: DUR,
  still: 2.55,
  draw(c, t) {
    const fade = fadeOut(t, DUR, 0.4)
    // Lights flicker on like an old club: two false starts, then on.
    const flicker = t < 0.35 ? (Math.floor(t * 20) % 3 === 0 ? 0.6 : 0) : 1
    const lights = flicker * fade
    const beams = Math.floor(t / BEAT)
    LIGHTS.forEach((col, i) => {
      const a = Math.sin(t * 2.2 + i * 1.6) * 0.6
      c.save()
      c.globalAlpha = 0.3 * lights
      c.translate(W / 2 + (i - 1.5) * 70, -10)
      c.rotate(a)
      const g = c.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, `rgb(${col} / 1)`)
      g.addColorStop(1, `rgb(${col} / 0)`)
      c.fillStyle = g
      c.beginPath()
      c.moveTo(-8, 0)
      c.lineTo(8, 0)
      c.lineTo(70, H + 20)
      c.lineTo(-70, H + 20)
      c.fill()
      c.restore()
    })
    // The mirror ball drops in on its cable and bounces to rest.
    discoBall(c, W / 2, lerp(-40, 52, elastic(seg(t, 0.1, 1.1))), t, fade)
    // Floor spots change colour on every beat
    for (let i = 0; i < 5; i++) {
      c.save()
      c.globalAlpha = 0.35 * lights
      c.fillStyle = `rgb(${LIGHTS[(i + beams) % 4]})`
      c.beginPath()
      c.ellipse(80 + i * 80, H - 22, 34, 9, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
    // The pig jumps in from below: stretched on the way up, squashed on landing.
    const jump = seg(t, 0.45, 0.95)
    const land = seg(t, 0.95, 1.25)
    const dance = seg(t, 1.15, 1.45) * (1 - seg(t, 3.0, 3.25))
    // Rises from below the frame, peaks above its spot, then drops onto it.
    const air = jump < 1 ? (1 - jump) * 300 - Math.sin(jump * Math.PI) * 170 : 0
    const squashY =
      jump < 1 ? 1 + Math.sin(jump * Math.PI) * 0.12 : 1 - Math.sin(land * Math.PI) * 0.14
    const px = W / 2
    const py = H - 150
    if (t > 0.45) {
      shadow(c, px, H - 40, 70 * clamp(1 - Math.abs(air) / 260, 0.4, 1), 0.25 * fade)
      c.save()
      c.globalAlpha = fade
      c.translate(px, py + air + 110)
      c.scale(0.8 / Math.sqrt(squashY), 0.8 * squashY)
      c.translate(0, -137)
      pig(c, t, {
        dance,
        wink: seg(t, 2.35, 2.45) * (1 - seg(t, 2.85, 2.95)),
        kiss: seg(t, 3.0, 3.55),
        light: LIGHTS[beams % 4]
      })
      c.restore()
    }
    // A sparkle on the wink
    const sp = seg(t, 2.4, 2.9)
    if (sp > 0 && sp < 1)
      sparkle(c, px + 30, py - 70, 0.7 + Math.sin(sp * Math.PI) * 0.6, Math.sin(sp * Math.PI))
    // The blown kiss flies at the screen, growing, with a heartbeat.
    const k = seg(t, 3.3, 4.1)
    if (k > 0 && k < 1) {
      const beat = 1 + Math.max(0, Math.sin(k * 30)) * 0.12
      c.save()
      c.globalAlpha = fade * (1 - seg(k, 0.85, 1))
      heart(
        c,
        lerp(px - 80, px - 150, ease(k)),
        lerp(py - 50, H / 2 - 60, ease(k)),
        lerp(1, 7, easeIn(k)) * beat
      )
      c.restore()
    }
    // Music notes drift up while it dances
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.7 + i / 4) % 1
      if (t > 1.2)
        text(
          c,
          i % 2 ? '♪' : '♫',
          70 + i * 110 + Math.sin(p * 6) * 10,
          lerp(H - 60, 60, p),
          30,
          `rgb(${LIGHTS[i]})`,
          Math.sin(p * Math.PI) * fade * dance
        )
    }
    if (t > 3.35 && t < 4.1)
      text(
        c,
        '¡Muak!',
        px + 110,
        py - 40,
        30 + back(seg(t, 3.35, 3.6)) * 4,
        '#e8344e',
        fade * seg(t, 3.35, 3.5),
        0.15
      )
  },
  sound({ tone, noise }) {
    // Lights buzz on, a disco groove while it dances, oinks, a wink "ting" and a smack.
    noise(0.05, 0.3, { type: 'highpass', from: 3000, gain: 0.06 })
    for (let b = 1.0; b < 3.1; b += BEAT) tone(150, b, 0.25, { to: 45, gain: 0.55 })
    for (let h = 1.25; h < 3.1; h += BEAT)
      noise(h, 0.06, { type: 'highpass', from: 7000, gain: 0.18 })
    ;[55, 55, 73.4, 65.4, 55, 55, 82.4, 73.4].forEach((f, i) =>
      tone(f, 1.0 + i * 0.25, 0.22, { type: 'sawtooth', gain: 0.18, lp: 400 })
    )
    tone(180, 0.95, 0.12, { to: 70, gain: 0.4 }) // landing thump
    for (const s of [1.6, 1.8, 2.1])
      tone(320, s, 0.16, { to: 190, type: 'sawtooth', gain: 0.14, lp: 1200 })
    tone(2637, 2.4, 0.4, { type: 'triangle', gain: 0.1 })
    noise(3.4, 0.09, { from: 1300, q: 3, gain: 0.45 })
    tone(380, 3.4, 0.18, { to: 900, gain: 0.16 })
  }
}
