// What every wink is made of: a drawing function over time and a little synthesized
// sound. Winks draw in a 480×360 space on a transparent canvas; the player scales it to
// fit whatever size it plays at (thumbnail, conversation window or the whole screen), so
// they stay sharp everywhere.

export const W = 480
export const H = 360

export type Ctx = CanvasRenderingContext2D

export type Wink = {
  id: string
  dur: number // seconds; the overlay closes when it ends
  still: number // moment shown as the picker's thumbnail
  draw(c: Ctx, t: number): void
  sound(s: Sound): void
}

// ---------- Timing ----------

export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v))
// 0 before `a`, 1 after `b`, linear in between: "how far into this beat are we".
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a))
export const lerp = (a: number, b: number, x: number): number => a + (b - a) * x
export const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
export const easeOut = (x: number): number => 1 - (1 - x) ** 3
export const easeIn = (x: number): number => x ** 3
// Overshoots and settles back: pops, landings.
export const back = (x: number, k = 1.9): number => 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2
// A spring that wobbles to rest: jelly, bounces.
export const elastic = (x: number): number =>
  x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-9 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
// Squash and stretch keeping the volume: s > 1 stretches up, s < 1 squashes.
export const squash = (c: Ctx, s: number): void => c.scale(1 / Math.sqrt(s), s)
// Cheap deterministic noise for shakes and jitter (same t, same value).
export const jitter = (t: number, seed = 0): number =>
  Math.sin(t * 91.7 + seed * 12.9) * 0.6 + Math.sin(t * 57.3 + seed * 7.1) * 0.4
// Blinks every few seconds: 1 = open, 0 = closed, for a short moment.
export const blink = (t: number, every = 2.4, offset = 0.6): number => {
  const p = (t + offset) % every
  return p < 0.12 ? Math.abs(p / 0.06 - 1) : 1
}
// Shared fade at the end so nothing pops out of existence.
export const fadeOut = (t: number, dur: number, length = 0.35): number =>
  1 - seg(t, dur - length, dur)

// ---------- Shared pieces ----------

export const INK = '#4a2a12'
export const SKIN = '#ffd2a6'
export const SKIN_DARK = '#e9a877'

export function shadow(c: Ctx, x: number, y: number, rx: number, alpha = 0.18): void {
  c.save()
  const g = c.createRadialGradient(x, y, 0, x, y, rx)
  g.addColorStop(0, `rgb(0 0 0 / ${alpha})`)
  g.addColorStop(1, 'rgb(0 0 0 / 0)')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

export function heart(c: Ctx, x: number, y: number, s: number, color = '#e8344e'): void {
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.beginPath()
  c.moveTo(0, 6)
  c.bezierCurveTo(-14, -4, -8, -16, 0, -8)
  c.bezierCurveTo(8, -16, 14, -4, 0, 6)
  c.fillStyle = color
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 45%)'
  c.beginPath()
  c.ellipse(-5, -7, 2.5, 1.6, -0.6, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

export function tear(c: Ctx, x: number, y: number, s: number, alpha = 1): void {
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  c.scale(s, s)
  c.beginPath()
  c.moveTo(0, -8)
  c.quadraticCurveTo(7, 2, 0, 6)
  c.quadraticCurveTo(-7, 2, 0, -8)
  c.fillStyle = '#5fc1ff'
  c.fill()
  c.fillStyle = 'rgb(255 255 255 / 0.6)'
  c.beginPath()
  c.arc(-1.5, 0, 1.6, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

// Cartoon lettering: chunky, with a white outline so it reads on any desktop.
export function text(
  c: Ctx,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha = 1,
  rot = 0
): void {
  if (alpha <= 0) return
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  c.rotate(rot)
  c.font = `900 ${size}px "Comic Relief", system-ui, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineJoin = 'round'
  c.lineWidth = size / 5
  c.strokeStyle = '#fff'
  c.strokeText(str, 0, 0)
  c.fillStyle = color
  c.fillText(str, 0, 0)
  c.restore()
}

export function sparkle(
  c: Ctx,
  x: number,
  y: number,
  s: number,
  alpha: number,
  color = '#fff'
): void {
  if (alpha <= 0) return
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  c.scale(s, s)
  c.fillStyle = color
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 3 : 12
    const a = (i * Math.PI) / 4
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  c.fill()
  c.restore()
}

// An iridescent soap bubble.
export function bubble(c: Ctx, x: number, y: number, r: number, t: number, alpha = 1): void {
  if (r <= 0 || alpha <= 0) return
  c.save()
  c.globalAlpha *= alpha
  c.translate(x, y)
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
  g.addColorStop(0, 'rgb(255 255 255 / 0.15)')
  g.addColorStop(0.7, 'rgb(255 170 230 / 0.25)')
  g.addColorStop(0.88, 'rgb(150 210 255 / 0.55)')
  g.addColorStop(1, 'rgb(255 120 200 / 0.8)')
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, r, 0, Math.PI * 2)
  c.fill()
  c.lineWidth = Math.max(1.5, r / 14)
  c.strokeStyle = `hsl(${(t * 140 + x) % 360} 90% 70% / 0.9)`
  c.stroke()
  c.fillStyle = 'rgb(255 255 255 / 0.85)'
  c.beginPath()
  c.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

// ---------- Sound ----------

type ToneOptions = {
  type?: OscillatorType
  gain?: number
  to?: number // glide to this frequency by the end
  attack?: number
  lp?: number // low-pass cutoff
  vibrato?: number // depth in Hz (6 Hz rate)
}
type NoiseOptions = {
  type?: BiquadFilterType
  from?: number
  to?: number
  q?: number
  gain?: number
  attack?: number
}

export type Sound = {
  tone(freq: number, start: number, dur: number, options?: ToneOptions): void
  noise(start: number, dur: number, options?: NoiseOptions): void
}

// Schedules everything relative to now on an AudioContext, into `out`.
export function makeSound(ac: BaseAudioContext, out: AudioNode): Sound {
  const at = (s: number): number => ac.currentTime + s
  const env = (g: GainNode, start: number, dur: number, peak: number, attack = 0.01): void => {
    g.gain.setValueAtTime(0.0001, at(start))
    g.gain.exponentialRampToValueAtTime(peak, at(start + attack))
    g.gain.exponentialRampToValueAtTime(0.0001, at(start + dur))
  }
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  return {
    tone(freq, start, dur, { type = 'sine', gain = 0.2, to, attack, lp, vibrato } = {}) {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, at(start))
      if (to) o.frequency.exponentialRampToValueAtTime(to, at(start + dur))
      if (vibrato) {
        const lfo = ac.createOscillator()
        const depth = ac.createGain()
        lfo.frequency.value = 6
        depth.gain.value = vibrato
        lfo.connect(depth)
        depth.connect(o.frequency)
        lfo.start(at(start))
        lfo.stop(at(start + dur + 0.05))
      }
      let node: AudioNode = o
      if (lp) {
        const f = ac.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = lp
        o.connect(f)
        node = f
      }
      node.connect(g)
      g.connect(out)
      env(g, start, dur, gain, attack)
      o.start(at(start))
      o.stop(at(start + dur + 0.05))
    },
    noise(start, dur, { type = 'bandpass', from = 1000, to, q = 1, gain = 0.3, attack } = {}) {
      const s = ac.createBufferSource()
      s.buffer = buf
      s.loop = true
      const f = ac.createBiquadFilter()
      f.type = type
      f.Q.value = q
      f.frequency.setValueAtTime(from, at(start))
      if (to) f.frequency.exponentialRampToValueAtTime(to, at(start + dur))
      const g = ac.createGain()
      s.connect(f)
      f.connect(g)
      g.connect(out)
      env(g, start, dur, gain, attack)
      s.start(at(start))
      s.stop(at(start + dur + 0.05))
    }
  }
}
