import type { Group, GroupEvent } from '../../main/groups'
import type { Contact, Snapshot } from '../../main/xmpp'
import { _, _n, lang } from './i18n'
import { stripPlus } from './plus'

// Group rooms live on groups.<domain> (main's GROUPS_DOMAIN); contacts never do.
export const isRoom = (jid: string): boolean => /^[^@/]+@groups\./.test(jid)

// What the group views show of a person: a contact's own name, picture and status; anyone
// else, the name the group keeps for them and an initial (never their address).
export type Face = { jid: string; name: string; url: string; show: Contact['show'] }

export function face(roster: Snapshot, jid: string, name = ''): Face {
  if (jid === roster.jid) {
    const show = roster.show === 'invisible' ? 'offline' : roster.show
    return { jid, name: roster.name, url: roster.avatar, show }
  }
  const contact = roster.contacts.find((c) => c.jid === jid)
  return contact
    ? { jid, name: contact.name, url: contact.avatar, show: contact.show }
    : // Never anything from their address: no name, «Sin nombre» (and its initial).
      { jid, name: stripPlus(name).trim() ? name : _('Sin nombre'), url: '', show: 'offline' }
}

// Everyone but us, longest in the group first.
export const others = (roster: Snapshot, group: Group): Face[] =>
  group.members
    .filter((m) => m.jid !== roster.jid)
    .sort((a, b) => a.since - b.since)
    .map((m) => face(roster, m.jid, m.name))

// A name inside a plain sentence: without its formatting codes.
export const plainName = (name: string): string => stripPlus(name).trim() || _('Sin nombre')

export const list = (names: string[]): string =>
  new Intl.ListFormat(lang, { type: 'conjunction' }).format(names)

// «Iker, Nerea y 3 más», under the group's name in the list.
export function who(roster: Snapshot, group: Group): string {
  const names = others(roster, group).map((f) => plainName(f.name))
  if (!names.length) return _('Solo tú')
  if (names.length <= 2) return list(names)
  return _n('{a}, {b} y 1 más', '{a}, {b} y {n} más', names.length - 2, {
    a: names[0],
    b: names[1]
  })
}

// A change announced by the group, as a line of the conversation.
export function eventText(roster: Snapshot, group: Group | undefined, e: GroupEvent): string {
  const mine = e.actor === roster.jid
  const actor = plainName(face(roster, e.actor, e.actorName).name)
  const member = group?.members.find((m) => m.jid === e.jid)?.name ?? ''
  const name = plainName(face(roster, e.jid, e.name || member).name)
  switch (e.kind) {
    case 'created':
      return mine ? _('Has creado el grupo') : _('{name} ha creado el grupo', { name: actor })
    case 'added':
      return mine
        ? _('Has añadido a {name}', { name })
        : _('{actor} ha añadido a {name}', { actor, name })
    case 'left':
      return _('{name} ha salido del grupo', { name: plainName(e.name || member) })
    case 'removed':
      return mine
        ? _('Has quitado a {name} del grupo', { name })
        : _('{actor} ha quitado a {name} del grupo', { actor, name })
    case 'name':
      return mine
        ? _('Has cambiado el nombre a «{name}»', { name: e.name })
        : _('{actor} ha cambiado el nombre a «{name}»', { actor, name: e.name })
    case 'photo':
      return mine
        ? _('Has cambiado la foto del grupo')
        : _('{actor} ha cambiado la foto del grupo', { actor })
    case 'owner':
      // Succession (the last admin left): nobody did it.
      if (!e.actor) return _('{name} es ahora administrador', { name })
      return mine
        ? _('Has hecho administrador a {name}', { name })
        : _('{actor} ha hecho administrador a {name}', { actor, name })
    case 'unowner':
      return mine
        ? _('Has quitado a {name} como administrador', { name })
        : _('{actor} ha quitado a {name} como administrador', { actor, name })
    case 'kicked':
      return _('Te han quitado de «{name}»', { name: e.name })
  }
}
