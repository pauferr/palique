// Messenger Plus!-style codes in display names: [b] [i] [u] [s],
// [c=#e8344e]color[/c], [c=#ff0000]gradient[/c=#0000ff] and [a=#fff3a0]background[/a]. Parsed here
// into styled runs and drawn by Emoticons.svelte; never HTML. Colors are checked and end
// up as CSS values only. Other XMPP clients see the codes as typed.

export type Run = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string // a CSS color
  gradient?: [string, string] // CSS colors at the run's start and end
  background?: string
}

const MAX_CODES = 40 // more than this and the rest shows as typed
export const tag = /\[(\/?)(b|i|u|s|c|a)(?:=(#[0-9a-f]{6}|#[0-9a-f]{3}))?\]/gi

// Colors are only ever #hex: the pattern lets nothing else through.
const toColor = (value: string | undefined): string | undefined => value?.toLowerCase()

// The color a fraction t of the way from a to b: where a run of a gradient starts or ends.
const mix = (a: string, b: string, t: number): string =>
  t <= 0 ? a : t >= 1 ? b : `color-mix(in oklab, ${b} ${Math.round(t * 100)}%, ${a})`

export function parsePlus(input: string): Run[] {
  const runs: Run[] = []
  const on = { b: 0, i: 0, u: 0, s: 0 }
  const colors: { color: string; from: number; at: number }[] = [] // open [c=…]: run index, text offset
  const backgrounds: string[] = []
  let length = 0
  let last = 0
  let codes = 0

  const push = (text: string): void => {
    if (!text) return
    const color = colors.at(-1)?.color
    runs.push({
      text,
      bold: on.b > 0,
      italic: on.i > 0,
      underline: on.u > 0,
      strike: on.s > 0,
      color,
      background: backgrounds.at(-1)
    })
    length += text.length
  }

  for (const match of input.matchAll(tag)) {
    if (++codes > MAX_CODES) break
    const [code, closing, name, value] = match
    const key = name.toLowerCase() as 'b' | 'i' | 'u' | 's' | 'c' | 'a'
    const color = toColor(value)
    if (key === 'c' && !closing && !color) continue // not a color: leave it as text
    push(input.slice(last, match.index))
    last = match.index + code.length
    if (key === 'c') {
      if (!closing) colors.push({ color: color!, from: runs.length, at: length })
      else {
        const open = colors.pop()
        // [c=A]…[/c=B]: a gradient from A to B over everything in between.
        if (open && color) {
          const span = length - open.at || 1
          let offset = open.at
          for (const run of runs.slice(open.from)) {
            if (run.color !== open.color) continue
            run.gradient = [
              mix(open.color, color, (offset - open.at) / span),
              mix(open.color, color, (offset + run.text.length - open.at) / span)
            ]
            offset += run.text.length
          }
        }
      }
    } else if (key === 'a') {
      if (!closing && color) backgrounds.push(color)
      else if (closing) backgrounds.pop()
    } else on[key] = Math.max(0, on[key] + (closing ? -1 : 1))
  }
  push(input.slice(last))
  return runs
}

// Drops closing codes that close nothing (left behind when part of a name is restyled).
export function tidyPlus(text: string): string {
  const open: Record<string, number> = {}
  return text.replace(tag, (code, closing: string, name: string) => {
    const key = name.toLowerCase()
    if (!closing) open[key] = (open[key] ?? 0) + 1
    else if (open[key]) open[key]--
    else return ''
    return code
  })
}

// For plain-text places (window titles, notifications, dialogs).
export const stripPlus = (text: string): string =>
  parsePlus(text)
    .map((r) => r.text)
    .join('')
