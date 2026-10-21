// The emote face shared by the expression winks: a round yellow smiley of radius 80
// around (0, 0), with eyes, brows and mouth picked by name so each wink can act.
import { heart, INK, lerp, type Ctx } from './kit'

export type Eye = 'open' | 'happy' | 'closed' | 'heart' | 'wide' | 'sad'
export type Mouth =
  'smile' | 'grin' | 'laugh' | 'o' | 'kiss' | 'frown' | 'wail' | 'smirk' | 'flat' | 'pout'

export type FaceOptions = {
  eyes?: Eye | [Eye, Eye]
  blink?: number // 1 open, 0 shut (open and sad eyes only)
  look?: [number, number] // pupils' direction, -1..1
  eyeScale?: number
  mouth?: Mouth
  open?: number // how open laugh/wail/o mouths are, 0..1
  quiver?: number // lip tremble amount (0..1)
  brows?: number // >0 angry, <0 worried, 0 none
  browLift?: [number, number] // extra lift per brow, px (a raised eyebrow)
  blush?: number
  red?: number // anger rising from the chin, 0..1
  t?: number // time, for small wobbles
}

const TAU = Math.PI * 2

export function face(c: Ctx, o: FaceOptions = {}): void {
  const {
    eyes = 'open',
    blink = 1,
    look = [0, 0],
    eyeScale = 1,
    mouth = 'smile',
    open = 0.5,
    quiver = 0,
    brows = 0,
    browLift = [0, 0],
    blush = 0,
    red = 0,
    t = 0
  } = o
  c.save()
  // Skin with a soft light from the top left.
  const g = c.createRadialGradient(-26, -32, 10, 0, 0, 86)
  g.addColorStop(0, '#fff6a8')
  g.addColorStop(0.45, '#ffd84a')
  g.addColorStop(1, '#f2a516')
  c.beginPath()
  c.arc(0, 0, 80, 0, TAU)
  c.fillStyle = g
  c.fill()
  if (red > 0) {
    // Anger fills the face from the chin up.
    c.save()
    c.clip()
    const level = lerp(95, -95, red)
    const rg = c.createLinearGradient(0, level - 34, 0, 90)
    rg.addColorStop(0, 'rgb(232 52 40 / 0)')
    rg.addColorStop(0.35, 'rgb(232 52 40 / 0.9)')
    rg.addColorStop(0.6, 'rgb(200 36 26 / 0.95)')
    rg.addColorStop(1, 'rgb(180 26 18 / 1)')
    c.fillStyle = rg
    c.fillRect(-90, level - 34, 180, 260)
    c.restore()
  }
  c.lineWidth = 3
  c.strokeStyle = red > 0.5 ? 'rgb(140 20 10 / 0.55)' : 'rgb(160 90 10 / 0.55)'
  c.stroke()
  c.fillStyle = 'rgb(255 255 255 / 0.55)'
  c.beginPath()
  c.ellipse(-30, -44, 22, 11, -0.5, 0, TAU)
  c.fill()
  if (blush > 0) {
    c.fillStyle = `rgb(255 110 120 / ${0.6 * Math.min(1, blush)})`
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(s * 46, 18, 15, 9, 0, 0, TAU)
      c.fill()
    }
  }

  c.fillStyle = INK
  c.strokeStyle = INK
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = 7
  const [lx, ly] = look
  const eye = (x: number, kind: Eye): void => {
    c.save()
    c.translate(x, -14)
    c.scale(eyeScale, eyeScale)
    if (kind === 'open' || kind === 'sad') {
      const h = kind === 'open' ? 14 : 11
      if (blink < 0.25) {
        c.beginPath()
        c.moveTo(-9, 2)
        c.quadraticCurveTo(0, 6, 9, 2)
        c.stroke()
      } else {
        c.save()
        c.scale(1, blink)
        c.beginPath()
        c.ellipse(lx * 3, ly * 3 + (kind === 'sad' ? 3 : 0), 9, h, 0, 0, TAU)
        c.fill()
        c.fillStyle = '#fff'
        c.beginPath()
        c.arc(-3 + lx * 3, -5 + ly * 3, 3.5, 0, TAU)
        c.fill()
        if (kind === 'sad') {
          // Watery shine along the bottom of a sad eye.
          c.fillStyle = 'rgb(140 210 255 / 0.85)'
          c.beginPath()
          c.ellipse(lx * 3, 11, 8, 3, 0, 0, TAU)
          c.fill()
        }
        c.restore()
      }
    } else if (kind === 'happy') {
      c.beginPath()
      c.arc(0, 6, 12, Math.PI * 1.1, Math.PI * 1.9)
      c.stroke()
    } else if (kind === 'closed') {
      c.beginPath()
      c.arc(0, -4, 12, Math.PI * 0.15, Math.PI * 0.85)
      c.stroke()
    } else if (kind === 'heart') {
      heart(c, 0, 2, 1.55)
    } else if (kind === 'wide') {
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(0, 0, 17, 0, TAU)
      c.fill()
      c.lineWidth = 3
      c.stroke()
      c.fillStyle = INK
      c.beginPath()
      c.arc(lx * 6, 2 + ly * 6, 6, 0, TAU)
      c.fill()
    }
    c.restore()
  }
  const [l, r] = Array.isArray(eyes) ? eyes : [eyes, eyes]
  eye(-28, l)
  eye(28, r)

  if (brows !== 0 || browLift[0] || browLift[1]) {
    c.lineWidth = 7
    for (const s of [-1, 1]) {
      const lift = s < 0 ? browLift[0] : browLift[1]
      // Inner end low for anger, high for worry; a lifted brow rises as a whole.
      const inner = -40 + brows * 8 - lift
      const outer = -44 - brows * 6 - lift
      c.beginPath()
      c.moveTo(s * 46, outer)
      c.quadraticCurveTo(s * 30, Math.min(inner, outer) - 4, s * 13, inner)
      c.stroke()
    }
  }

  // Mouth
  c.lineWidth = 7
  c.save()
  c.translate(0, 30)
  const shake = quiver * Math.sin(t * 60) * 2.5
  if (mouth === 'smile') {
    c.beginPath()
    c.arc(0, -16, 34, Math.PI * 0.2, Math.PI * 0.8)
    c.stroke()
  } else if (mouth === 'flat') {
    c.beginPath()
    c.moveTo(-22, 4)
    c.lineTo(22, 4)
    c.stroke()
  } else if (mouth === 'grin' || mouth === 'laugh') {
    const depth = mouth === 'laugh' ? 18 + open * 26 : 18
    c.beginPath()
    c.moveTo(-36, -6)
    c.quadraticCurveTo(0, -12, 36, -6)
    c.quadraticCurveTo(0, depth + 10, -36, -6)
    c.closePath()
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
    c.save()
    c.clip()
    c.fillStyle = '#ff7b8a'
    c.beginPath()
    c.ellipse(0, depth + 2, 18, 12, 0, 0, TAU)
    c.fill()
    c.fillStyle = '#fff'
    c.fillRect(-30, -12, 60, 8)
    c.restore()
  } else if (mouth === 'o') {
    c.beginPath()
    c.ellipse(0, 4, 9 + open * 5, 10 + open * 9, 0, 0, TAU)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  } else if (mouth === 'kiss' || mouth === 'pout') {
    const k = mouth === 'kiss' ? 1 : 0.7
    c.save()
    c.scale(k, k)
    c.fillStyle = '#e8344e'
    c.beginPath()
    c.ellipse(-6, 0, 10, 8, 0.4, 0, TAU)
    c.ellipse(6, 0, 10, 8, -0.4, 0, TAU)
    c.fill()
    c.lineWidth = 3
    c.strokeStyle = '#9b1b2c'
    c.beginPath()
    c.moveTo(-14, 1)
    c.lineTo(14, 1)
    c.stroke()
    c.restore()
  } else if (mouth === 'frown') {
    c.beginPath()
    c.moveTo(-28, 14 + shake)
    c.quadraticCurveTo(-10, -6 - shake, 0, -4 + shake)
    c.quadraticCurveTo(10, -6 + shake, 28, 14 - shake)
    c.stroke()
  } else if (mouth === 'wail') {
    const w = Math.sin(t * 18)
    const top = -10 - open * 14
    c.beginPath()
    c.moveTo(-30, 14)
    c.quadraticCurveTo(-10, top - w * 4, 0, top + 4)
    c.quadraticCurveTo(10, top + w * 4, 30, 14)
    c.quadraticCurveTo(0, 24 + open * 6, -30, 14)
    c.fillStyle = '#7a1d1d'
    c.fill()
    c.stroke()
  } else if (mouth === 'smirk') {
    c.beginPath()
    c.moveTo(-26, -2)
    c.quadraticCurveTo(6, 10, 32, -10)
    c.stroke()
  }
  c.restore()
  c.restore()
}
