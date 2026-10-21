import {
  type Ctx,
  type Wink,
  H,
  INK,
  SKIN,
  SKIN_DARK,
  W,
  back,
  blink,
  bubble,
  ease,
  easeOut,
  fadeOut,
  lerp,
  seg,
  shadow,
  sparkle
} from './kit'

const DUR = 4.4
const MX = 130 // where she sits
const HAIR = '#e8473f'

type Pose = {
  raise: number // 0 wand down, 1 wand at her lips
  inhale: number // 0..1 breathing in before blowing (chest up, eyes closed)
  blow: number // 0..1 blowing (cheeks puffed, "o" mouth)
  giggle: number // 0..1 laughing at the pop
}

// Wand ring position in her local space, for a given `raise`.
const wandAt = (raise: number): [number, number] => [lerp(40, 62, raise), lerp(-70, -128, raise)]

// Sitting on a rock, tail curled to the side, local origin at the rock's top.
function mermaid(c: Ctx, t: number, pose: Pose): void {
  const { raise, inhale, blow, giggle } = pose
  // Rock with a little shine and a starfish
  c.fillStyle = '#8d8f99'
  c.beginPath()
  c.ellipse(0, 18, 86, 30, 0, Math.PI, 0)
  c.lineTo(86, 26)
  c.lineTo(-86, 26)
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.18)'
  c.beginPath()
  c.ellipse(-26, 0, 30, 9, -0.2, 0, Math.PI * 2)
  c.fill()
  // Body sways gently; jiggles while she giggles
  const sway = Math.sin(t * 2.2) * 0.05 + Math.sin(t * 22) * 0.02 * giggle
  c.rotate(sway)
  // Tail curling down the rock, scales catching the light
  const tg = c.createLinearGradient(-40, -40, 80, 30)
  tg.addColorStop(0, '#1fb5a8')
  tg.addColorStop(1, '#1a8fc4')
  c.fillStyle = tg
  // As wide as her waist, then narrowing along the rock to the fin.
  c.beginPath()
  c.moveTo(-22, -44)
  c.lineTo(22, -44)
  c.quadraticCurveTo(26, -8, 40, 2)
  c.quadraticCurveTo(60, 8, 78, 12)
  c.lineTo(72, 26)
  c.quadraticCurveTo(30, 26, -6, 22)
  c.quadraticCurveTo(-34, 16, -30, -10)
  c.quadraticCurveTo(-26, -30, -22, -44)
  c.fill()
  c.strokeStyle = 'rgb(255 255 255 / 0.35)'
  c.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    c.beginPath()
    c.arc(-30 + i * 16, 10 + (i % 2) * 6, 6, 0.2, Math.PI - 0.2)
    c.stroke()
  }
  // Fin flaps lazily, faster when she's happy
  c.save()
  c.translate(76, 20)
  c.rotate(Math.sin(t * (4 + giggle * 6)) * 0.4)
  c.fillStyle = '#4dd0c4'
  c.beginPath()
  c.moveTo(0, 0)
  c.quadraticCurveTo(28, -30, 38, -8)
  c.quadraticCurveTo(24, 0, 38, 10)
  c.quadraticCurveTo(28, 30, 0, 0)
  c.fill()
  c.restore()
  // Long hair behind her: waves travel down it, a beat behind the head
  c.fillStyle = HAIR
  c.beginPath()
  c.moveTo(-36, -165)
  for (let y = -165; y <= -36; y += 8)
    c.lineTo(-42 + Math.sin(y / 14 + t * 3) * 7 * ((y + 170) / 130), y)
  for (let y = -36; y >= -165; y -= 8)
    c.lineTo(34 + Math.sin(y / 14 + t * 3 + 1) * 7 * ((y + 170) / 130), y)
  c.fill()
  // Torso with a shell top; the chest rises as she breathes in
  const chest = 1 + inhale * 0.06 + Math.sin(t * 3) * 0.015
  c.save()
  c.translate(0, -36)
  c.scale(chest, chest)
  c.fillStyle = SKIN
  c.beginPath()
  c.roundRect(-22, -76, 44, 76, 16)
  c.fill()
  c.fillStyle = '#9c6ade'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 10, -50, 11, Math.PI, 0)
    c.fill()
  }
  c.fillStyle = 'rgb(255 255 255 / 0.35)'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(s * 10 - 3, -53, 3, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
  // Other arm resting on the rock
  c.strokeStyle = SKIN
  c.lineCap = 'round'
  c.lineWidth = 12
  c.beginPath()
  c.moveTo(-18, -100)
  c.quadraticCurveTo(-40, -70, -46, -40)
  c.stroke()
  // Head, tilted back a touch on the inhale and nodding while she giggles
  c.save()
  c.translate(0, -146 - inhale * 4)
  c.rotate(-inhale * 0.08 + Math.sin(t * 20) * 0.04 * giggle)
  c.fillStyle = SKIN
  c.beginPath()
  c.arc(0, 0, 30, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = SKIN_DARK
  c.lineWidth = 2
  c.stroke()
  // Bangs and a starfish clip
  c.fillStyle = HAIR
  c.beginPath()
  c.arc(0, -6, 31, Math.PI * 1.05, Math.PI * 1.95)
  c.quadraticCurveTo(10, -16, -2, -10)
  c.quadraticCurveTo(-14, -14, -30, -12)
  c.fill()
  c.fillStyle = '#ffb74d'
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4 : 9
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + Math.sin(t * 2) * 0.1
    c.lineTo(-20 + Math.cos(a) * r, -24 + Math.sin(a) * r)
  }
  c.fill()
  // Eyes: open with a blink, closed in concentration while blowing, happy arcs giggling
  const focused = inhale > 0.3 || blow > 0
  c.strokeStyle = INK
  c.fillStyle = INK
  c.lineWidth = 2.5
  c.lineCap = 'round'
  const open = blink(t, 2.3, 0.2)
  for (const s of [-1, 1]) {
    c.beginPath()
    if (giggle > 0.3) c.arc(s * 11, 3, 5, Math.PI * 1.15, Math.PI * 1.85)
    else if (focused) c.arc(s * 11, 0, 5, Math.PI * 0.1, Math.PI * 0.9)
    else {
      c.ellipse(s * 11, 0, 3.5, 5 * open, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.stroke()
    // A lash at the outer corner
    c.beginPath()
    c.moveTo(s * 15, 1)
    c.lineTo(s * 20, -1)
    c.stroke()
  }
  // Cheeks puff in pulses while blowing
  const puff = blow > 0 && blow < 1 ? (Math.sin(t * 7) + 1) / 2 : 0
  c.fillStyle = `rgb(255 120 140 / ${0.4 + puff * 0.35 + giggle * 0.2})`
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(s * 17, 10, 6 + puff * 3, 4 + puff * 2, 0, 0, Math.PI * 2)
    c.fill()
  }
  c.fillStyle = '#c2185b'
  c.strokeStyle = '#c2185b'
  if (blow > 0 && blow < 1) {
    c.beginPath()
    c.ellipse(5, 14, 3.5 + puff, 4.5 + puff, 0, 0, Math.PI * 2)
    c.fill()
  } else if (giggle > 0.3) {
    c.beginPath()
    c.moveTo(-9, 10)
    c.quadraticCurveTo(0, 22 + Math.sin(t * 24) * 2, 9, 10)
    c.closePath()
    c.fill()
  } else {
    c.beginPath()
    c.arc(0, 8, 10, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  }
  c.restore()
  // Arm bringing the wand up to her lips (drawn over the hair and torso)
  const [wx, wy] = wandAt(raise)
  c.strokeStyle = SKIN
  c.lineWidth = 12
  c.beginPath()
  c.moveTo(18, -100)
  c.quadraticCurveTo(44, lerp(-70, -90, raise), wx - 10, wy + 10)
  c.stroke()
  c.strokeStyle = '#ffca28'
  c.lineWidth = 4
  c.beginPath()
  c.moveTo(wx - 10, wy + 10)
  c.lineTo(wx - 2, wy + 2)
  c.stroke()
  c.beginPath()
  c.arc(wx, wy, 9, 0, Math.PI * 2)
  c.stroke()
}

// Small bubbles in a stream: born at the wand, rising up and right with a sway.
const STREAM = Array.from({ length: 10 }, (_, i) => ({
  born: 2.15 + i * 0.11,
  life: 1.2 + (i % 3) * 0.35,
  dx: 120 + (i % 4) * 55,
  dy: 110 + (i % 3) * 45,
  r: 7 + (i % 4) * 4
}))

export const wink: Wink = {
  id: 'bubble',
  dur: DUR,
  still: 2.05,
  draw(c, t) {
    const fade = fadeOut(t, DUR)
    // She pops up onto the rock from below, overshooting a little.
    const enter = back(seg(t, 0, 0.6))
    const my = H - 56 + (1 - enter) * 230
    const raise = ease(seg(t, 0.75, 1.1))
    const inhale = Math.sin(seg(t, 1.05, 1.45) * Math.PI * 0.5) * (1 - seg(t, 1.45, 1.6))
    const blow = seg(t, 1.45, 1.5) * (1 - seg(t, 3.15, 3.2))
    const giggle = seg(t, 3.45, 3.55) * (1 - seg(t, 4.1, 4.3))
    const [lwx, lwy] = wandAt(raise)
    const rot = Math.sin(t * 2.2) * 0.05
    // Wand position in screen space (it follows the body sway)
    const wx = MX + lwx * Math.cos(rot) - lwy * Math.sin(rot)
    const wy = my + lwx * Math.sin(rot) + lwy * Math.cos(rot)
    shadow(c, MX, H - 30, 90, 0.2 * fade)
    // The big bubble: swells on the wand, stretching, wobbles free and drifts up; pops later.
    const grow = ease(seg(t, 1.5, 2.1))
    const free = seg(t, 2.1, 3.4)
    const popAt = 3.4
    const bigR = 14 + grow * 44
    let bx = wx + bigR * 0.9
    let by = wy - bigR * 0.2
    if (free > 0) {
      bx = lerp(bx, W - 150, easeOut(free)) + Math.sin(t * 2.5) * 10 * free
      by = lerp(by, 95, easeOut(free))
    }
    if (t > 1.5 && t < popAt) {
      // Stretch while attached, jelly wobble once free
      const wob = free > 0 ? Math.sin(t * 9) * 0.08 * (1 - free) : 0
      const stretch = free > 0 ? 1 + wob : 1 + grow * 0.18
      c.save()
      c.translate(bx, by)
      c.scale(stretch, 1 / stretch)
      bubble(c, 0, 0, bigR, t, fade)
      // Her tiny reflection in it
      c.globalAlpha = 0.35 * fade * grow
      c.fillStyle = HAIR
      c.beginPath()
      c.ellipse(bigR * 0.25, bigR * 0.15, bigR * 0.16, bigR * 0.22, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#1fb5a8'
      c.beginPath()
      c.ellipse(bigR * 0.3, bigR * 0.42, bigR * 0.12, bigR * 0.08, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
    // Pop: ring, sparkles and droplets falling with gravity
    const pop = seg(t, popAt, popAt + 0.6)
    if (pop > 0 && pop < 1) {
      c.save()
      c.globalAlpha = (1 - pop) * fade
      c.strokeStyle = 'rgb(255 160 220 / 0.9)'
      c.lineWidth = 3
      c.beginPath()
      c.arc(bx, by, bigR + pop * 40, 0, Math.PI * 2)
      c.stroke()
      c.fillStyle = 'rgb(200 235 255 / 0.9)'
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const d = bigR + pop * 70
        c.beginPath()
        c.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8 + pop * pop * 90, 3, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4
        sparkle(
          c,
          bx + Math.cos(a) * (bigR + pop * 50),
          by + Math.sin(a) * (bigR + pop * 50),
          0.7,
          (1 - pop) * fade
        )
      }
    }
    // The stream of little bubbles after the big one
    for (const b of STREAM) {
      const p = seg(t, b.born, b.born + b.life)
      if (p <= 0 || p >= 1) continue
      bubble(
        c,
        wx + p * b.dx + Math.sin(t * 3 + b.dx) * 10,
        wy - p * b.dy,
        b.r * Math.min(1, p * 5),
        t,
        fade
      )
    }
    // Splash droplets as she lands on the rock
    const sp = seg(t, 0.35, 0.95)
    if (sp > 0 && sp < 1) {
      c.save()
      c.globalAlpha = (1 - sp) * fade
      c.fillStyle = '#7fd3ff'
      for (let i = 0; i < 9; i++) {
        const vx = (i - 4) * 26
        const vy = 150 + (i % 3) * 60 // each drop thrown at its own height
        c.beginPath()
        c.arc(MX + vx * sp, H - 50 - vy * sp + 260 * sp * sp, 3 + (i % 3), 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }
    c.save()
    c.globalAlpha = fade
    c.translate(MX, my)
    mermaid(c, t, { raise, inhale, blow, giggle })
    c.restore()
  },
  sound({ tone }) {
    // Harp glissando as she appears, a deep breath in, the big bubble swelling, a stream of
    // bloops, the pop and a giggle.
    ;[523, 587, 659, 784, 880, 1047, 1175, 1319].forEach((f, i) =>
      tone(f, 0.05 + i * 0.06, 0.8, { type: 'triangle', gain: 0.06 })
    )
    tone(200, 1.05, 0.4, { to: 320, gain: 0.04, attack: 0.3 })
    tone(180, 1.5, 0.6, { to: 420, gain: 0.08, attack: 0.2, vibrato: 12 })
    for (let i = 0; i < 10; i++)
      tone(320 + (i % 4) * 70, 2.15 + i * 0.11, 0.12, { to: 800, gain: 0.07 })
    tone(1400, 3.4, 0.06, { to: 400, type: 'triangle', gain: 0.18 })
    ;[1760, 2349, 2637].forEach((f, i) =>
      tone(f, 3.42 + i * 0.05, 0.35, { type: 'triangle', gain: 0.06 })
    )
    for (let i = 0; i < 5; i++)
      tone(880 - i * 30, 3.5 + i * 0.1, 0.08, { type: 'square', gain: 0.03, lp: 2000 })
  }
}
