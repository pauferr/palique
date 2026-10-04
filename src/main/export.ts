// History export formats: readable HTML, plain text, and JSON for a future import.
import type { ChatMessage } from './xmpp'

export const FORMATS = ['html', 'txt', 'json'] as const
export type ExportFormat = (typeof FORMATS)[number]
export type ExportResult = 'saved' | 'canceled' | 'empty'

const name = (jid: string): string => jid.split('@')[0]

function stamp(at: number): string {
  return new Date(at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

// Messages arrive sorted by contact, then time.
function byContact(messages: ChatMessage[]): Map<string, ChatMessage[]> {
  const groups = new Map<string, ChatMessage[]>()
  for (const m of messages) groups.set(m.with, [...(groups.get(m.with) ?? []), m])
  return groups
}

function toText(account: string, messages: ChatMessage[]): string {
  const sections = [...byContact(messages)].map(([contact, list]) => {
    const lines = list.map((m) => {
      const who = m.mine ? name(account) : name(contact)
      const what = m.buzz
        ? '*zumbido*'
        : m.wink
          ? `*guiño: ${m.wink}*`
          : m.body.replaceAll('\n', '\n    ')
      return `[${stamp(m.at)}] ${who}: ${what}`
    })
    return `=== Conversación con ${contact} ===\n${lines.join('\n')}`
  })
  return `Historial de Palique de ${account}\n\n${sections.join('\n\n')}\n`
}

const escape = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

function toHtml(account: string, messages: ChatMessage[]): string {
  const sections = [...byContact(messages)].map(([contact, list]) => {
    const items = list.map((m) => {
      const who = escape(m.mine ? name(account) : name(contact))
      const time = `<time>${escape(stamp(m.at))}</time>`
      if (m.wink) {
        return `<li class="buzz">${time} ¡${who} ha enviado un guiño: ${escape(m.wink)}!</li>`
      }
      return m.buzz
        ? `<li class="buzz">${time} ¡${who} ha enviado un zumbido!</li>`
        : `<li${m.mine ? ' class="mine"' : ''}>${time} <b>${who} dice:</b><p>${escape(m.body)}</p></li>`
    })
    return `<section><h2>${escape(name(contact))} <small>${escape(contact)}</small></h2><ol>${items.join('')}</ol></section>`
  })
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Historial de Palique de ${escape(account)}</title>
<style>
  body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; }
  ol { padding: 0; list-style: none; }
  li { margin-bottom: 0.5rem; }
  time, small { color: #888; font-size: 0.85em; }
  b { font-weight: normal; color: #555; }
  .mine b { color: #2c6fbb; }
  p { margin: 0.1rem 0 0 1rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  .buzz { color: #b03a2e; font-style: italic; }
</style>
<h1>Historial de Palique de ${escape(account)}</h1>
${sections.join('\n')}
</html>
`
}

function toJson(account: string, messages: ChatMessage[]): string {
  return JSON.stringify(
    {
      format: 'palique-history',
      version: 1,
      account,
      exportedAt: new Date().toISOString(),
      messages: messages.map(({ with: contact, ...m }) => ({ contact, ...m }))
    },
    null,
    2
  )
}

export function exportHistory(
  format: ExportFormat,
  account: string,
  messages: ChatMessage[]
): string {
  if (format === 'html') return toHtml(account, messages)
  if (format === 'txt') return toText(account, messages)
  return toJson(account, messages)
}
