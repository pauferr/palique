import messageOgg from './assets/sounds/message.ogg'
import type { SoundPack } from '../../main/settings'
import { makeSound, type Sound } from './winks/kit'
import { N_ } from './i18n.ts'

// The sound collections, chosen in Options (all of them side by side at #sounds). They're
// synthesized live with the winks' synthesizer, so each weighs nothing; only the classic
// message is a recording, cut shorter.

export type SoundEvent = 'message' | 'online' | 'buzz'
// A recording (cut to `length` seconds, with a short fade), or a synthesized sound.
export type Clip = { src: string; length: number }
type Effect = Clip | ((s: Sound) => void)
export type Pack = { id: SoundPack; name: string; note: string } & Record<SoundEvent, Effect>

export const events: { id: SoundEvent; label: string }[] = [
  { id: 'message', label: N_('Mensaje nuevo') },
  { id: 'online', label: N_('Un contacto se conecta') },
  { id: 'buzz', label: N_('Zumbido') }
]

// Semitones from A4 (440 Hz): 3 = C5, 7 = E5, 10 = G5, 15 = C6.
const hz = (semi: number): number => 440 * 2 ** (semi / 12)

// A struck bell: the fundamental plus two inharmonic partials that die out sooner.
function bell(s: Sound, f: number, t: number, dur: number, gain: number): void {
  s.tone(f, t, dur, { gain, attack: 0.004 })
  s.tone(f * 2.76, t, dur * 0.5, { gain: gain * 0.35, attack: 0.003 })
  s.tone(f * 5.4, t, dur * 0.25, { gain: gain * 0.15, attack: 0.002 })
}

// A water-drop "bloop": a quick upward glide.
const pop = (s: Sound, f: number, t: number, gain: number): void =>
  s.tone(f, t, 0.13, { to: f * 2.2, gain, attack: 0.005 })

// A mallet note: bright attack (a short partial two octaves up) and a quick decay.
function marimba(s: Sound, f: number, t: number, dur: number, gain: number): void {
  s.tone(f, t, dur, { gain, attack: 0.003 })
  s.tone(f * 4, t, dur * 0.2, { gain: gain * 0.25, attack: 0.002 })
}

export const packs: Pack[] = [
  {
    id: 'classic',
    name: N_('Clásico'),
    note: N_('El mensaje de siempre, con conectado y zumbido de marimba.'),
    message: { src: messageOgg, length: 0.25 },
    online(s) {
      ;[3, 7, 10].forEach((n, i) => marimba(s, hz(n), i * 0.07, i === 2 ? 0.3 : 0.12, 0.18))
    },
    buzz(s) {
      // A quick trill between two notes that lands lower, like Messenger's nudge.
      for (let i = 0; i < 10; i++) marimba(s, hz(i % 2 ? 3 : 7), i * 0.045, 0.12, 0.18)
      marimba(s, hz(-2), 0.47, 0.4, 0.2)
    }
  },
  {
    id: 'velvet',
    name: N_('Terciopelo'),
    note: N_('Senos suaves con un poco de cuerpo. Lo más discreto.'),
    message(s) {
      s.tone(hz(7), 0, 0.45, { gain: 0.16, attack: 0.015 })
      s.tone(hz(12), 0.11, 0.75, { gain: 0.16, attack: 0.015 })
      s.tone(hz(0), 0.11, 0.75, { type: 'triangle', lp: 900, gain: 0.05, attack: 0.02 })
    },
    online(s) {
      ;[3, 7, 10, 15].forEach((n, i) => s.tone(hz(n), i * 0.09, 0.9, { gain: 0.1, attack: 0.02 }))
    },
    buzz(s) {
      for (let i = 0; i < 4; i++)
        s.tone(110, i * 0.16, 0.2, { type: 'sawtooth', lp: 320, gain: 0.3, attack: 0.02 })
      s.tone(55, 0, 0.7, { type: 'triangle', vibrato: 6, gain: 0.25, attack: 0.03 })
    }
  },
  {
    id: 'crystal',
    name: N_('Cristal'),
    note: N_('Campanitas limpias con cola larga. Muy de los 2000.'),
    message(s) {
      bell(s, hz(15), 0, 1.2, 0.12)
      bell(s, hz(10), 0.12, 1.4, 0.1)
    },
    online(s) {
      bell(s, hz(10), 0, 1.4, 0.09)
      bell(s, hz(15), 0.1, 1.4, 0.09)
      bell(s, hz(22), 0.2, 1.8, 0.07)
    },
    buzz(s) {
      for (let i = 0; i < 7; i++) bell(s, hz(i % 2 ? 3 : 7), i * 0.07, 0.4, 0.09)
      s.tone(110, 0, 0.55, { type: 'triangle', vibrato: 20, gain: 0.2, attack: 0.02 })
    }
  },
  {
    id: 'bubble',
    name: N_('Burbuja'),
    note: N_('Gotas que hacen «blop». Juguetón pero blando.'),
    message(s) {
      pop(s, 500, 0, 0.25)
      pop(s, 700, 0.09, 0.22)
    },
    online(s) {
      ;[400, 550, 750, 1000].forEach((f, i) => pop(s, f, i * 0.08, 0.2))
    },
    buzz(s) {
      for (let i = 0; i < 8; i++) pop(s, i % 2 ? 240 : 180, i * 0.06, 0.3)
      s.noise(0, 0.5, { type: 'lowpass', from: 300, to: 150, q: 6, gain: 0.12 })
    }
  }
]

let ac: AudioContext | undefined
let master: GainNode | undefined

const decoded = new Map<string, Promise<AudioBuffer>>()

export async function playEffect(effect: Effect, volume = 1): Promise<void> {
  ac ??= new AudioContext()
  if (!master) {
    master = ac.createGain()
    master.connect(ac.destination)
  }
  master.gain.value = volume
  if (typeof effect === 'function') return effect(makeSound(ac, master))

  const { src, length } = effect
  if (!decoded.has(src))
    decoded.set(
      src,
      fetch(src)
        .then((r) => r.arrayBuffer())
        .then((b) => ac!.decodeAudioData(b))
    )
  const source = ac.createBufferSource()
  source.buffer = await decoded.get(src)!
  const g = ac.createGain()
  const end = ac.currentTime + length
  g.gain.setValueAtTime(1, end - 0.08)
  g.gain.linearRampToValueAtTime(0, end)
  source.connect(g)
  g.connect(master)
  source.start()
  source.stop(end)
}

export const soundPack = (id: SoundPack): Pack => packs.find((p) => p.id === id) ?? packs[0]

export const playSound = (pack: SoundPack, event: SoundEvent): Promise<void> =>
  playEffect(soundPack(pack)[event]).catch(() => {})
