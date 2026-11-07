// Our own emoticons: little looping animations drawn like the winks, reusing their face and
// shapes. Each draws in a 200×200 box around (0, 0); EmoticonCanvas scales it to the text.
// They're seen at text size, so shapes are bold and moves small. t is in seconds.
import { face, type FaceOptions } from '../winks/face.ts'
import { blink, elastic, heart, INK, sparkle, tear, text, type Ctx } from '../winks/kit.ts'

export const BOX = 200

const TAU = Math.PI * 2
const wave = (t: number, period: number, phase = 0): number =>
  Math.sin(((t + phase) / period) * TAU)
// 0..1 through each period.
const cycle = (t: number, period: number): number => (t % period) / period

// The yellow face, a bit bigger than the winks' so it fills the box. sx/sy squash it to
// fake the head tipping (nod) or turning (shake); alpha for motion trails.
function emote(
  c: Ctx,
  o: FaceOptions,
  dy = 0,
  rot = 0,
  { dx = 0, sx = 1, sy = 1, alpha = 1 } = {}
): void {
  c.save()
  c.globalAlpha *= alpha
  c.translate(dx, dy)
  c.rotate(rot)
  c.scale(1.12 * sx, 1.12 * sy)
  face(c, o)
  c.restore()
}

function star(c: Ctx, r: number): void {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const d = i % 2 ? r * 0.45 : r
    c.lineTo(Math.cos(a) * d, Math.sin(a) * d)
  }
  c.closePath()
}

// One eighth note: head at (0, 0), stem up.
function note(c: Ctx, x: number, y: number): void {
  c.save()
  c.translate(x, y)
  c.fillStyle = '#7a4be0'
  c.strokeStyle = '#7a4be0'
  c.lineWidth = 9
  c.lineCap = 'round'
  c.beginPath()
  c.ellipse(0, 0, 20, 15, -0.4, 0, TAU)
  c.fill()
  c.beginPath()
  c.moveTo(17, -5)
  c.lineTo(17, -95)
  c.quadraticCurveTo(48, -70, 40, -40)
  c.stroke()
  c.restore()
}

export const drawings: Record<string, (c: Ctx, t: number) => void> = {
  smile(c, t) {
    emote(c, { mouth: 'smile', blink: blink(t) }, wave(t, 2.4) * 3)
  },
  grin(c, t) {
    const hop = Math.abs(wave(t, 0.9))
    emote(c, { eyes: 'happy', mouth: 'laugh', open: hop, t }, -hop * 8)
  },
  wink(c, t) {
    const shut = cycle(t, 2.2) > 0.6 && cycle(t, 2.2) < 0.85
    emote(c, {
      eyes: ['open', shut ? 'closed' : 'open'],
      mouth: shut ? 'smirk' : 'smile',
      browLift: [0, shut ? 0 : 6]
    })
  },
  tongue(c, t) {
    emote(c, { eyes: ['open', 'closed'], mouth: 'smile', blink: blink(t) })
    // The tongue sticks out under the smile and waggles.
    c.save()
    c.translate(wave(t, 0.5) * 6, 60)
    c.rotate(wave(t, 0.5) * 0.12)
    c.fillStyle = '#ff6f86'
    c.strokeStyle = INK
    c.lineWidth = 6
    c.beginPath()
    c.roundRect(-18, -12, 36, 42, [4, 4, 18, 18])
    c.fill()
    c.stroke()
    c.beginPath()
    c.moveTo(0, -6)
    c.lineTo(0, 14)
    c.strokeStyle = '#c93a55'
    c.stroke()
    c.restore()
  },
  surprise(c, t) {
    const p = cycle(t, 2)
    emote(c, { eyes: 'wide', mouth: 'o', open: 0.4 + 0.6 * elastic(Math.min(1, p * 3)) })
  },
  sad(c, t) {
    emote(c, { eyes: 'sad', mouth: 'frown', brows: -1, blink: blink(t, 3) }, 4 + wave(t, 3) * 3)
  },
  crying(c, t) {
    emote(c, { eyes: 'closed', mouth: 'wail', open: 0.5 + wave(t, 0.4) * 0.2, brows: -1, t })
    // Tears roll down from both eyes, out of step.
    for (const [x, phase] of [
      [-34, 0],
      [34, 0.45]
    ]) {
      const p = cycle(t + phase, 0.9)
      tear(c, x, -4 + p * 70, 2.2, 1 - p * p)
    }
  },
  confused(c, t) {
    // Question marks circle the head: the ones behind it first, then the face, then the
    // ones in front.
    const marks = (front: boolean): void => {
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * TAU) / 3
        if (Math.sin(a) > 0 !== front) continue
        const x = Math.cos(a) * 70
        const y = -66 + Math.sin(a) * 12
        text(c, '?', x, y, front ? 36 : 26, '#1f6fc4', front ? 1 : 0.55)
      }
    }
    marks(false)
    const look = wave(t, 2)
    const o: FaceOptions = { mouth: 'wavy', look: [look, -0.2], browLift: [0, 12], brows: -0.4, t }
    emote(c, o, 18, 0, { sx: 0.85, sy: 0.85 })
    const p = cycle(t, 1.8)
    tear(c, 54, -10 + p * 30, 2, 1 - p)
    marks(true)
  },
  neutral(c, t) {
    const p = cycle(t, 3)
    // Looks left, then right, then ahead, deadpan.
    const look: [number, number] = p < 0.3 ? [-1, 0] : p < 0.6 ? [1, 0] : [0, 0]
    emote(c, { mouth: 'flat', look, blink: blink(t, 3) })
  },
  angry(c, t) {
    const fume = 0.45 + wave(t, 1.2) * 0.3
    c.translate(Math.sin(t * 50) * 2.5 * fume, 0)
    emote(c, { mouth: 'frown', brows: 1, red: fume, look: [0, 0.3] })
  },
  cool(c, t) {
    emote(c, { mouth: 'smirk' }, wave(t, 2) * 2)
    // Sunglasses, with a glint sweeping across.
    c.save()
    c.translate(0, -16 + wave(t, 2) * 2)
    c.fillStyle = '#1d1d26'
    c.strokeStyle = '#1d1d26'
    c.lineWidth = 8
    c.beginPath()
    c.moveTo(-90, -6)
    c.lineTo(90, -6)
    c.stroke()
    c.beginPath()
    c.roundRect(-74, -18, 62, 40, [6, 6, 22, 22])
    c.roundRect(12, -18, 62, 40, [6, 6, 22, 22])
    c.fill()
    c.clip()
    const x = -120 + cycle(t, 2.4) * 300
    c.strokeStyle = 'rgb(255 255 255 / 0.7)'
    c.lineWidth = 10
    c.beginPath()
    c.moveTo(x, -24)
    c.lineTo(x - 22, 26)
    c.stroke()
    c.restore()
  },
  heart(c, t) {
    // Two quick beats, then a rest.
    const p = cycle(t, 1.2)
    const beat = 1 + 0.12 * Math.max(0, Math.sin(p * TAU * 2.5)) * (p < 0.4 ? 1 : 0)
    heart(c, 0, 30, 7.5 * beat)
  },
  broken(c, t) {
    const open = Math.max(0, wave(t, 2.4))
    // Each half on its own side of a zigzag crack, coming apart and back.
    const crack = [
      [0, -60],
      [-12, -30],
      [10, -6],
      [-8, 18],
      [0, 70]
    ]
    for (const side of [-1, 1]) {
      c.save()
      c.translate(side * open * 12, open * 6)
      c.rotate(side * open * 0.18)
      c.beginPath()
      c.moveTo(side * 120, -120)
      for (const [x, y] of crack) c.lineTo(x, y)
      c.lineTo(side * 120, 120)
      c.closePath()
      c.clip()
      heart(c, 0, 30, 7.5, '#c8203a')
      c.restore()
    }
  },
  kiss(c, t) {
    emote(c, { eyes: 'closed', mouth: 'kiss', blush: 0.8 }, -10)
    // A little heart floats up from the lips.
    const p = cycle(t, 1.6)
    c.save()
    c.globalAlpha = 1 - p
    heart(c, 54 + wave(t, 0.8) * 6, 44 - p * 80, 1.8 + p * 1.2)
    c.restore()
  },
  yes(c, t) {
    // Convinced nods: quick down, slower up, a flash at each one.
    const p = cycle(t, 0.6)
    const down = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7
    const o: FaceOptions = { eyes: 'closed', mouth: 'smirk', brows: 0.5, blush: 0.4 }
    emote(c, o, -6 + down * 14, 0, { sy: 1 - down * 0.08 })
    const flash = p < 0.35 ? Math.sin((p / 0.35) * Math.PI) : 0
    sparkle(c, -80, 70, 1.3, flash, '#ffd84a')
    sparkle(c, 80, 70, 1.3, flash, '#ffd84a')
  },
  no(c, t) {
    // Shakes so fast it leaves a trail.
    const o: FaceOptions = { eyes: 'closed', mouth: 'pout', brows: 0.4 }
    const at = (lag: number, alpha: number): void => {
      const s = wave(t - lag, 0.4)
      emote(c, o, 0, s * 0.1, { dx: s * 14, sx: 0.92, sy: 0.92, alpha })
    }
    at(0.07, 0.18)
    at(0.035, 0.3)
    at(0, 1)
  },
  rose(c, t) {
    c.rotate(wave(t, 2.8) * 0.08)
    // Stem and leaves.
    c.strokeStyle = '#2f8a3a'
    c.fillStyle = '#3fae4c'
    c.lineWidth = 9
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(0, -20)
    c.quadraticCurveTo(10, 40, -4, 96)
    c.stroke()
    for (const [x, y, a] of [
      [4, 30, -0.6],
      [2, 60, 0.7]
    ]) {
      c.save()
      c.translate(x, y)
      c.rotate(a)
      c.beginPath()
      c.ellipse(a < 0 ? -24 : 24, 0, 24, 11, 0, 0, TAU)
      c.fill()
      c.restore()
    }
    // Bloom: layered petals, the inner ones darker.
    for (const [r, color] of [
      [52, '#e8344e'],
      [36, '#c8203a'],
      [20, '#a01229']
    ] as const) {
      c.fillStyle = color
      c.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + r * 0.05
        c.ellipse(Math.cos(a) * r * 0.45, -44 + Math.sin(a) * r * 0.4, r * 0.62, r * 0.5, a, 0, TAU)
      }
      c.fill()
    }
  },
  star(c, t) {
    c.save()
    c.rotate(wave(t, 2.4) * 0.2)
    const g = c.createRadialGradient(-20, -24, 6, 0, 0, 92)
    g.addColorStop(0, '#fff6a8')
    g.addColorStop(0.5, '#ffd84a')
    g.addColorStop(1, '#f2a516')
    star(c, 88)
    c.fillStyle = g
    c.fill()
    c.lineWidth = 6
    c.lineJoin = 'round'
    c.strokeStyle = 'rgb(160 90 10 / 0.6)'
    c.stroke()
    c.restore()
    for (const [x, y, phase] of [
      [70, -70, 0],
      [-76, 40, 0.5]
    ]) {
      sparkle(c, x, y, 1.6, Math.max(0, wave(t, 1.2, phase)), '#ffd84a')
    }
  },
  music(c, t) {
    note(c, -42, 54 - Math.max(0, wave(t, 0.8)) * 14)
    note(c, 34, 38 - Math.max(0, wave(t, 0.8, 0.4)) * 14)
  },
  cake(c, t) {
    // Layers.
    c.lineWidth = 6
    c.strokeStyle = INK
    c.fillStyle = '#f7b6c8'
    c.beginPath()
    c.roundRect(-78, 6, 156, 76, 14)
    c.fill()
    c.stroke()
    c.fillStyle = '#fff'
    c.beginPath()
    c.moveTo(-78, 26)
    for (let x = -78; x < 78; x += 26) c.quadraticCurveTo(x + 13, 48, x + 26, 26)
    c.lineTo(78, 6)
    c.lineTo(-78, 6)
    c.closePath()
    c.fill()
    c.stroke()
    // Candle and its flickering flame.
    c.fillStyle = '#6fb6ff'
    c.beginPath()
    c.roundRect(-9, -46, 18, 52, 4)
    c.fill()
    c.stroke()
    const f = 1 + wave(t, 0.25) * 0.12
    c.save()
    c.translate(wave(t, 0.37) * 3, -56)
    c.scale(1 / f, f)
    c.fillStyle = '#ffb21e'
    c.beginPath()
    c.moveTo(0, -30)
    c.quadraticCurveTo(18, 0, 0, 10)
    c.quadraticCurveTo(-18, 0, 0, -30)
    c.fill()
    c.fillStyle = '#fff3a0'
    c.beginPath()
    c.ellipse(0, 0, 5, 8, 0, 0, TAU)
    c.fill()
    c.restore()
  },
  coffee(c, t) {
    // Steam curling up.
    c.lineWidth = 7
    c.lineCap = 'round'
    for (const [x, phase] of [
      [-22, 0],
      [18, 0.6]
    ]) {
      const p = cycle(t + phase, 1.4)
      c.strokeStyle = `rgb(160 160 170 / ${0.7 * Math.sin(p * Math.PI)})`
      c.beginPath()
      for (let i = 0; i <= 8; i++) {
        const y = -20 - p * 30 - i * 7
        c.lineTo(x + Math.sin(i * 0.9 + t * 4) * 8, y)
      }
      c.stroke()
    }
    // Cup, handle and coffee.
    c.lineWidth = 7
    c.strokeStyle = INK
    c.beginPath()
    c.ellipse(70, 30, 20, 24, 0, 0, TAU)
    c.stroke()
    c.fillStyle = '#fff'
    c.beginPath()
    c.moveTo(-72, -6)
    c.lineTo(72, -6)
    c.quadraticCurveTo(66, 84, 0, 86)
    c.quadraticCurveTo(-66, 84, -72, -6)
    c.fill()
    c.stroke()
    c.fillStyle = '#7a4a24'
    c.beginPath()
    c.ellipse(0, -6, 72, 14, 0, 0, TAU)
    c.fill()
    c.stroke()
  }
}
