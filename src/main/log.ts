// Error log on this computer (palique.log in the OS's logs folder). Nothing is sent
// anywhere: Options opens its folder so the user can send it when something fails, so it
// must hold nothing personal: errors are written as name, message and stack only (an
// XMPP error also carries the stanza, with addresses), and addresses and link tokens are
// masked, like the home folder. Callers never pass passwords or message bodies.
import { appendFileSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { inspect } from 'node:util'

export type Log = { write(level: 'error' | 'warn' | 'info', ...parts: unknown[]): void }

// Emails and JIDs (anything@anything), the code in palique:// and email links, and the
// home folder in paths (it holds the user's name).
const HOME = homedir()
const redact = (text: string): string =>
  (HOME ? text.split(HOME).join('~') : text)
    .replace(/[^\s"'<>()[\]{},;:@]+@[^\s"'<>()[\]{},;]+/g, '<dirección>')
    .replace(/([?&](?:t|e|token)=)[^&\s"']+/g, '$1…')

function describe(part: unknown): string {
  if (part instanceof Error) {
    const condition = (part as { condition?: unknown }).condition
    const stack = part.stack ?? `${part.name}: ${part.message}`
    return typeof condition === 'string' ? `${stack} [${condition}]` : stack
  }
  return typeof part === 'string' ? part : inspect(part, { depth: 2, breakLength: Infinity })
}

// One older copy (`palique.old.log`), so the log never grows past twice `maxBytes`.
export function openLog(file: string, maxBytes = 1_000_000): Log {
  const old = file.replace(/\.log$/, '.old.log')
  return {
    write(level, ...parts) {
      try {
        if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > maxBytes) renameSync(file, old)
        const text = redact(parts.map(describe).join(' '))
        appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`)
      } catch {
        // A log that can't be written must never break the app.
      }
    }
  }
}
