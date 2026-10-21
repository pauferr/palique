import {
  type Ctx,
  type Wink,
  H,
  INK,
  W,
  back,
  blink,
  ease,
  easeIn,
  fadeOut,
  lerp,
  seg,
  shadow,
  sparkle,
  text
} from './kit'

const DUR = 4.4
const GROUND = H - 40
const COW_X = W / 2 + 10

// The saucer. `gulp` squashes it when it swallows the cow.
function saucer(c: Ctx, t: number, gulp: number): void {
  c.save()
  c.scale(1 + gulp * 0.18, 1 - gulp * 0.22)
  // Glass dome with a little green pilot who leans to look down
  c.fillStyle = 'rgb(170 230 255 / 0.75)'
  c.beginPath()
  c.ellipse(0, -10, 30, 26, 0, Math.PI, 0)
  c.fill()
  c.fillStyle = '#7ee05a'
  c.beginPath()
  c.arc(Math.sin(t * 1.3) * 4, -14, 10, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#7ee05a'
  c.lineWidth = 2
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 5, -22)
    c.lineTo(s * 9, -32)
    c.stroke()
    c.fillStyle = '#c6ff9e'
    c.beginPath()
    c.arc(s * 9, -33, 2.5, 0, Math.PI * 2)
    c.fill()
  }
  c.fillStyle = INK
  const open = blink(t, 1.7)
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(Math.sin(t * 1.3) * 4 + s * 4, -15, 2.4, 3.6 * open, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Saucer body
  const g = c.createLinearGradient(0, -12, 0, 16)
  g.addColorStop(0, '#eef2f7')
  g.addColorStop(1, '#7d8a99')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, 2, 70, 16, 0, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#5b6675'
  c.lineWidth = 2
  c.stroke()
  c.fillStyle = 'rgb(255 255 255 / 0.5)'
  c.beginPath()
  c.ellipse(-24, -4, 26, 4, 0, 0, Math.PI * 2)
  c.fill()
  // Lights chasing around the rim
  for (let i = 0; i < 7; i++) {
    const on = Math.floor(t * 10 + i) % 3 === 0
    c.fillStyle = on ? '#ffeb3b' : '#c9a227'
    c.beginPath()
    c.arc(-54 + i * 18, 6, on ? 4.5 : 3.5, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

type CowPose = {
  chew: number // jaw going round while it grazes
  look: number // 0 head down at the grass, 1 looking up at the light
  kick: number // legs flailing in the air
  alarm: number // eyes wide open
}

// Standing cow, feet at y≈40, facing left.
function cow(c: Ctx, t: number, pose: CowPose): void {
  const { chew, look, kick, alarm } = pose
  const legs: [number, number][] = [
    [-34, 1],
    [-18, -1],
    [18, 1],
    [34, -1]
  ]
  c.strokeStyle = '#f5f5f5'
  c.lineCap = 'round'
  c.lineWidth = 9
  for (const [x, side] of legs) {
    const k = Math.sin(t * 16 + x) * 0.6 * kick * side
    c.beginPath()
    c.moveTo(x, 10)
    c.lineTo(x + Math.sin(k) * 16, 38 - Math.abs(k) * 6)
    c.stroke()
  }
  c.fillStyle = '#424242'
  for (const [x, side] of legs) {
    const k = Math.sin(t * 16 + x) * 0.6 * kick * side
    c.beginPath()
    c.arc(x + Math.sin(k) * 16, 40 - Math.abs(k) * 6, 5, 0, Math.PI * 2)
    c.fill()
  }
  // Body with spots, breathing
  const breath = 1 + Math.sin(t * 3) * 0.015
  c.save()
  c.scale(breath, breath)
  c.fillStyle = '#fafafa'
  c.beginPath()
  c.ellipse(0, 0, 48, 26, 0, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#bdbdbd'
  c.lineWidth = 2
  c.stroke()
  c.fillStyle = '#212121'
  const spots: [number, number, number, number][] = [
    [-18, -8, 12, 9],
    [14, 6, 10, 8],
    [30, -10, 7, 6]
  ]
  for (const [x, y, rx, ry] of spots) {
    c.beginPath()
    c.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2)
    c.fill()
  }
  // Udder
  c.fillStyle = '#ffb3c1'
  c.beginPath()
  c.ellipse(16, 24, 9, 6, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
  // Tail swishing lazily, then whipping around in panic
  c.strokeStyle = '#424242'
  c.lineWidth = 3
  const swish = Math.sin(t * (3 + kick * 9)) * (6 + kick * 10)
  c.beginPath()
  c.moveTo(47, -4)
  c.quadraticCurveTo(62, 4 + swish, 58 + swish * 0.4, 20)
  c.stroke()
  c.fillStyle = '#424242'
  c.beginPath()
  c.arc(58 + swish * 0.4, 22, 4, 0, Math.PI * 2)
  c.fill()
  // Head: down at the grass, then up at the light
  c.save()
  c.translate(-50, lerp(4, -16, look))
  c.rotate(lerp(0.45, -0.25, look))
  c.fillStyle = '#fafafa'
  c.beginPath()
  c.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#bdbdbd'
  c.lineWidth = 2
  c.stroke()
  // Ears twitch
  c.fillStyle = '#f5f5f5'
  for (const s of [-1, 1]) {
    c.save()
    c.translate(s * 16, -8)
    c.rotate(s * (0.6 + Math.sin(t * 5 + s) * 0.15 + alarm * 0.4))
    c.beginPath()
    c.ellipse(s * 6, 0, 8, 4, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
  // Muzzle, chewing round and round
  const jaw = Math.sin(chew * Math.PI * 2) * 2
  c.fillStyle = '#ffb3c1'
  c.beginPath()
  c.ellipse(-6 + jaw * 0.5, 9 + Math.abs(jaw) * 0.5, 13, 9, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#c2577a'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(-6 + s * 5 + jaw * 0.5, 8, 2, 0, Math.PI * 2)
    c.fill()
  }
  // Horns
  c.fillStyle = '#e0c068'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 8, -14)
    c.lineTo(s * 14, -26)
    c.lineTo(s * 4, -16)
    c.fill()
  }
  // Eyes: sleepy and content while chewing, wide when it sees the light
  const open = blink(t, 2.2, 0.9)
  for (const s of [-1, 1]) {
    if (alarm > 0.3) {
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(s * 7, -4, 5.5, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = INK
      c.beginPath()
      c.arc(s * 7, -6, 2.5, 0, Math.PI * 2)
      c.fill()
    } else {
      c.strokeStyle = INK
      c.lineWidth = 2.5
      c.beginPath()
      c.ellipse(s * 7, -3, 3.5, 2.6 * open, 0, 0, Math.PI)
      c.stroke()
    }
  }
  c.restore()
}

export const wink: Wink = {
  id: 'ufo',
  dur: DUR,
  still: 2.2,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    // Ship: drifts in from top left, overshoots its spot and settles; leaves fast up right.
    const arrive = back(seg(t, 0.2, 1.1), 1.4)
    const leave = seg(t, 3.25, 3.75)
    const hover = Math.sin(t * 4) * 5 * (1 - leave)
    const ux = lerp(-90, COW_X - 10, arrive) + easeIn(leave) * 460
    const uy = lerp(30, 92, arrive) - easeIn(leave) * 280 + hover
    // Beam: switches on in pulses, steady while lifting, off after the gulp.
    const on = seg(t, 1.15, 1.25) + seg(t, 1.35, 1.4) + seg(t, 1.5, 1.6)
    const pulse = t < 1.6 ? (on % 1 > 0.5 || on >= 2 ? 1 : 0.35) * Math.min(1, on) : 1
    const beam = pulse * (1 - seg(t, 3.0, 3.15))
    if (beam > 0 && t > 1.15) {
      c.save()
      c.globalAlpha = (0.45 + Math.sin(t * 20) * 0.05) * beam * fade
      const g = c.createLinearGradient(0, uy, 0, GROUND)
      g.addColorStop(0, 'rgb(190 255 140 / 0.95)')
      g.addColorStop(1, 'rgb(190 255 140 / 0.2)')
      c.fillStyle = g
      c.beginPath()
      c.moveTo(ux - 26, uy + 14)
      c.lineTo(ux + 26, uy + 14)
      c.lineTo(ux + 95, GROUND + 12)
      c.lineTo(ux - 95, GROUND + 12)
      c.closePath()
      c.fill()
      // Specks of grass and dust floating up the beam
      for (let i = 0; i < 10; i++) {
        const p = (t * 0.9 + i / 10) % 1
        c.fillStyle = i % 3 ? 'rgb(255 255 255 / 0.8)' : 'rgb(120 200 90 / 0.9)'
        c.beginPath()
        c.arc(
          ux + Math.sin(i * 2.1 + t * 3) * 60 * (1 - p),
          lerp(GROUND, uy + 20, p),
          2 + (i % 2),
          0,
          Math.PI * 2
        )
        c.fill()
      }
      c.restore()
    }
    // Cow: grazes, looks up, freezes, then floats up kicking and shrinks into the ship.
    const look = ease(seg(t, 1.45, 1.6))
    const lift = ease(seg(t, 1.85, 3.0))
    // Grass tuft it's eating
    c.save()
    c.globalAlpha = fade
    c.strokeStyle = '#5aa846'
    c.lineWidth = 3
    c.lineCap = 'round'
    for (let i = -2; i <= 2; i++) {
      c.beginPath()
      c.moveTo(COW_X - 62 + i * 5, GROUND + 6)
      c.quadraticCurveTo(
        COW_X - 62 + i * 7,
        GROUND - 6,
        COW_X - 62 + i * 9 + Math.sin(t * 2 + i) * 2,
        GROUND - 14
      )
      c.stroke()
    }
    c.restore()
    if (lift < 0.98) {
      shadow(c, COW_X, GROUND + 6, 52 * (1 - lift * 0.8), 0.22 * fade)
      c.save()
      c.globalAlpha = fade
      const startY = GROUND - 34
      c.translate(
        lerp(COW_X, ux, lift),
        lerp(startY, uy + 18, lift) - Math.sin(seg(t, 1.55, 1.85) * Math.PI) * 10
      )
      c.rotate(Math.sin(t * 4) * 0.45 * lift)
      const shrink = 1 - lift * 0.8
      // A little stretch while it's pulled up
      c.scale(
        shrink * (1 - Math.sin(lift * Math.PI) * 0.1),
        shrink * (1 + Math.sin(lift * Math.PI) * 0.12)
      )
      cow(c, t, {
        chew: t * 1.6 * (1 - look),
        look,
        kick: seg(t, 1.9, 2.1) * (1 - seg(t, 2.85, 3.0)),
        alarm: seg(t, 1.45, 1.55)
      })
      c.restore()
    }
    // "!" when it notices, "¡MUUU!" while it's carried off
    const notice = seg(t, 1.5, 1.6) * (1 - seg(t, 1.85, 1.95))
    if (notice > 0)
      text(c, '!', COW_X - 52, GROUND - 100, 36 * back(seg(t, 1.5, 1.7)), '#e53935', notice * fade)
    if (t > 2.0 && t < 3.0)
      text(
        c,
        '¡MUUU!',
        COW_X + 110,
        GROUND - 110 - lift * 40,
        28 + Math.sin(t * 30) * 1.5,
        '#5d4037',
        fade * seg(t, 2.0, 2.1) * (1 - seg(t, 2.75, 3.0)),
        0.12
      )
    // The ship gulps (squash and back) and a flash when it fires off.
    const gulp = Math.sin(seg(t, 2.95, 3.25) * Math.PI)
    const flash = seg(t, 3.22, 3.3) * (1 - seg(t, 3.3, 3.5))
    if (leave > 0 && leave < 1) {
      // Speed lines behind it
      c.save()
      c.globalAlpha = (1 - leave) * fade
      c.strokeStyle = 'rgb(255 255 255 / 0.8)'
      c.lineWidth = 3
      for (let i = 0; i < 4; i++) {
        c.beginPath()
        c.moveTo(ux - 40 - i * 18, uy + 10 + i * 12)
        c.lineTo(ux - 110 - i * 30, uy + 50 + i * 26)
        c.stroke()
      }
      c.restore()
    }
    c.save()
    c.globalAlpha = fade
    c.translate(ux, uy)
    c.rotate(Math.sin(t * 2) * 0.06 - easeIn(leave) * 0.4)
    saucer(c, t, gulp)
    c.restore()
    if (flash > 0) sparkle(c, ux, uy, 2.5 + flash * 2, flash * fade, '#fffde0')
    // A twinkle where it vanished
    const tw = seg(t, 3.7, 4.2)
    if (tw > 0 && tw < 1)
      sparkle(c, W - 40, 30, 0.6 + Math.sin(tw * Math.PI) * 0.6, Math.sin(tw * Math.PI) * fade)
  },
  sound({ tone, noise }) {
    // Theremin wobble as it arrives, pulses as the beam stutters on, the hum, a surprised
    // moo, a gulp and the zip away.
    tone(700, 0.15, 1.0, { gain: 0.08, to: 480, attack: 0.25, vibrato: 40 })
    for (const s of [1.15, 1.35, 1.5]) tone(220, s, 0.08, { type: 'square', gain: 0.06, lp: 900 })
    tone(110, 1.5, 1.55, { type: 'sawtooth', gain: 0.07, lp: 500, attack: 0.1 })
    tone(900, 1.5, 0.12, { to: 1300, gain: 0.06 })
    tone(150, 2.0, 0.85, { type: 'sawtooth', gain: 0.18, lp: 700, to: 105, attack: 0.08 })
    tone(90, 2.97, 0.22, { to: 300, gain: 0.25 })
    noise(3.22, 0.5, { from: 600, to: 4000, q: 1.5, gain: 0.12 })
    tone(300, 3.25, 0.45, { to: 2400, gain: 0.1 })
  }
}
