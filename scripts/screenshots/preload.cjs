// window.api for the README screenshots: mock friends (@palique.com), no server. See main.cjs.
// Plain CommonJS that Electron runs as is: require, and no place for return types.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { contextBridge } = require('electron')

const arg = (name) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const theme = arg('theme') || 'light'
// The app's language (--app-lang=en; --lang is Chromium's own), and the friends' names and messages in it too.
const lang = arg('app-lang') || 'es'
const say = (es, en) => (lang === 'en' ? en : es)
const account = 'andrea@localhost'

// A picture avatar: an emoji on a gradient, as an SVG data URL.
const picture = (emoji, from, to) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="66" font-size="52" text-anchor="middle">${emoji}</text></svg>`
  )

const friend = (jid, name, show, status, avatar = '') => ({
  jid: `${jid}@localhost`,
  name,
  show,
  status,
  subscription: 'both',
  pending: false,
  avatar,
  email: `${jid}@palique.com`
})

const contacts = [
  friend(
    'iker',
    '[b][c=#00a2ff]Iker[/c=#00c060][/b] (H)',
    'online',
    say(
      '¿Partidita al Counter a las 10? ¡¡que no falte nadie!!',
      'Counter-Strike at 10? everybody in!!'
    ),
    picture('🎮', '#4c7fe8', '#00c2a8')
  ),
  friend(
    'nerea',
    '[a=#fff3a0][c=#e8344e]Nerea[/c][/a] (F)',
    'online',
    say('Pasando las fotos de la cámara nueva :D', 'Uploading the pics from my new camera :D'),
    picture('📸', '#ff8fb8', '#ffd27a')
  ),
  friend(
    'ruben',
    '[c=#ffb300]Rubén[/c=#ff0040] (8)',
    'away',
    say('Escuchando: mi lista del verano', 'Listening to: my summer playlist')
  ),
  friend(
    'lucia',
    '[i][c=#c02cc0]Lucía[/c=#1d2fb8][/i] (L)',
    'dnd',
    say('De exámenes… no molestar (que me conozco) :P', 'Exams… do not disturb (I know myself) :P')
  ),
  friend(
    'marta',
    '[c=#7ed400]Marta[/c=#00a8a8] (*)',
    'online',
    say(
      'El sábado, fiesta en mi casa (^) ¡traed patatas!',
      'Party at mine on Saturday (^) bring crisps!'
    ),
    picture('🌻', '#7ed400', '#00a8a8')
  ),
  friend(
    'dani',
    '[b]Dani[/b] (Y)',
    'online',
    say('Mañana en el parque a las 6', 'Park tomorrow at 6')
  ),
  friend('abuela', say('Abuela Carmen (K)', 'Grandma Carmen (K)'), 'offline', ''),
  friend('pablo', say('[s]El de mates[/s] Pablo :S', '[s]Maths guy[/s] Pablo :S'), 'offline', '')
]

// Two groups like the approved design: one where Andrea is an admin, with two people who
// aren't her contacts (Sara, Hugo), and one with unread messages.
const member = (jid, name, owner, since) => ({
  jid: `${jid}@localhost`,
  name,
  owner,
  contact: contacts.some((c) => c.jid === `${jid}@localhost`),
  since
})
const groups = [
  {
    jid: 'insti@groups.localhost',
    name: say('Los del insti', 'The school gang'),
    photo: '',
    owner: true,
    members: [
      member('iker', 'Iker', true, 1),
      member('andrea', 'Andrea', true, 2),
      member('nerea', 'Nerea', false, 3),
      member('dani', 'Dani', false, 4),
      member('sara', '[c=#ff4fa3]Sara[/c=#ffb300] (F)', false, 5),
      member('hugo', 'Hugo', false, 6)
    ]
  },
  {
    jid: 'viaje@groups.localhost',
    name: say('Viaje fin de curso', 'End-of-year trip'),
    photo: '',
    owner: false,
    members: [
      member('marta', 'Marta', true, 1),
      member('andrea', 'Andrea', false, 2),
      member('lucia', 'Lucía', false, 3)
    ]
  }
]

const snapshot = {
  connected: true,
  jid: account,
  name: '[b][c=#ff4fa3]Andrea[/c=#7a5cff][/b] (L)',
  avatar: picture('🎧', '#ff4fa3', '#7a5cff'),
  show: 'online',
  status: say(
    "~*~ Contando los días pa' el viaje de fin de curso ~*~",
    '~*~ Counting the days till the school trip ~*~'
  ),
  requests: [{ jid: 'sara@localhost', name: '[c=#ff4fa3]Sara[/c=#ffb300] (F)' }],
  contacts,
  gifs: true,
  groups
}

// The name being edited in the name window: bold, gradients, a background, italics.
const nick =
  '[b][c=#ff4fa3]Andrea[/c=#7a5cff][/b] (L) [a=#fff3a0][c=#e8344e]¡finde![/c][/a] [i][c=#00a2ff]~ fiestaaa ~[/c=#00c060][/i]'

const at = (h, m) => new Date(2026, 9, 26, h, m).getTime()
const msg = (id, mine, body, time, extra = {}) => ({
  id,
  with: 'iker@localhost',
  mine,
  body,
  buzz: false,
  wink: '',
  encrypted: true,
  at: time,
  ...extra
})
const history = [
  msg('1', false, '¡¡Andreaaa!! ¿estás? :D', at(17, 2)),
  msg('2', true, 'siii, acabo de llegar del insti (H)', at(17, 3)),
  msg('3', false, '¿te has enterado de lo de Rubén y Lucía? :O', at(17, 3)),
  msg('4', true, '¡¿QUÉ?! cuenta, cuenta', at(17, 4)),
  msg('5', false, 'jajaja mañana en el recreo te lo cuento todo ;)', at(17, 4)),
  msg('6', false, '', at(17, 5), { wink: 'pig' }),
  msg('7', true, '', at(17, 5), { buzz: true }),
  msg('8', true, 'no me dejes así (L)', at(17, 6))
]

// The first group's conversation: the room's notices, then who says what.
const said = (id, from, name, body, time, extra = {}) =>
  msg(id, from === 'andrea', body, time, {
    with: 'insti@groups.localhost',
    sender: `${from}@localhost`,
    senderName: name,
    ...extra
  })
const notice = (id, kind, actor, actorName, jid, name, time) =>
  msg(id, false, '', time, {
    with: 'insti@groups.localhost',
    encrypted: false,
    event: { kind, actor: `${actor}@localhost`, actorName, jid: `${jid}@localhost`, name }
  })
const groupHistory = [
  notice('g1', 'created', 'iker', 'Iker', 'iker', '', at(16, 50)),
  notice('g2', 'added', 'iker', 'Iker', 'sara', 'Sara', at(16, 51)),
  notice('g3', 'added', 'iker', 'Iker', 'hugo', 'Hugo', at(16, 51)),
  said(
    'g4',
    'iker',
    'Iker',
    say('¿quedamos el sábado para ver la peli?', 'movie on Saturday?'),
    at(17, 0)
  ),
  said('g5', 'sara', 'Sara', say('yo me apunto (F)', "I'm in (F)"), at(17, 1)),
  said('g6', 'sara', 'Sara', say('¿a qué hora?', 'what time?'), at(17, 1)),
  said('g7', 'andrea', 'Andrea', say('yo después de comer puedo', 'I can after lunch'), at(17, 2)),
  said('g8', 'hugo', 'Hugo', say('llevo palomitas :D', "I'll bring popcorn :D"), at(17, 3)),
  said('g9', 'hugo', 'Hugo', '', at(17, 3), { wink: 'pig' }),
  said(
    'g10',
    'nerea',
    'Nerea',
    say('jajaja vale, a las 5 en casa de Dani', 'haha ok, 5 at Dani’s'),
    at(17, 4)
  )
]

// GIFs: our own little drawings (gifs/), never Klipy's. Their links pass isGifUrl, and
// main.cjs serves palique-gif://static.klipy.com/shots/<n>.webp from that folder.
const gifSizes = [150, 260, 200, 120, 230, 170, 210, 140, 250]
const gif = (n) => `https://static.klipy.com/shots/${n}.webp`
const gifs = gifSizes.map((height, i) => ({
  id: String(i + 1),
  title: 'Smiley',
  preview: gif(i + 1),
  url: gif(i + 1),
  width: 200,
  height
}))
const gifChat = [
  ...history,
  msg('9', false, gif(2), at(17, 7)),
  msg('10', true, 'JAJAJAJA (H)', at(17, 7)),
  msg('11', true, gif(6), at(17, 8))
]

const values = {
  remembered: { available: true, saved: false },
  lastEmail: 'andrea@palique.com',
  getEmail: { address: 'andrea@palique.com', pending: '', newsletter: true, language: '' },
  inviteStatus: { max: 3, used: 1 },
  getRoster: arg('nick') ? { ...snapshot, name: nick } : snapshot,
  currentAccount: account,
  getUnread: { 'nerea@localhost': 2, 'viaje@groups.localhost': 3 },
  getShownChat: arg('chats') === 'together' ? 'iker@localhost' : '',
  getChatHistory: (jid) =>
    jid === 'insti@groups.localhost'
      ? groupHistory
      : arg('gifs')
        ? gifChat
        : arg('notes')
          ? [
              ...history,
              msg('9', false, 'te escribo desde otro programa :P', at(17, 7), { encrypted: false })
            ]
          : history,
  getVerify: {
    mine: 'a1b2c3d4 e5f60718 293a4b5c 6d7e8f90 0a1b2c3d 4e5f6071 8293a4b5 c6d7e8f9',
    devices: [
      {
        deviceId: 1234,
        fingerprint: '5f3e9a01 c27d84b6 0e1f2a3b 4c5d6e7f 8091a2b3 c4d5e6f7 08192a3b 4c5d6e7f',
        verified: arg('verified') === '1',
        blocked: false
      }
    ]
  },
  getTrustNotes: arg('notes')
    ? [{ jid: 'iker@localhost', deviceId: 99, kind: 'new-device', at: at(17, 5) }]
    : [],
  version: 'v0.15.0 (beta)',
  language: lang,
  getSettings: {
    language: 'auto',
    theme,
    font: 'theme',
    winks: true,
    show: 'online',
    status: '',
    email: 'andrea@palique.com',
    away: 10,
    startup: true,
    autoLogin: true,
    alertOnline: true,
    alertMessages: true,
    sounds: true,
    soundPack: 'classic',
    emoticons: true,
    shake: true,
    typing: true,
    chats: arg('chats') || 'windows'
  },
  update: null,
  searchGifs: { gifs, more: false }
}

// Every method of the real preload (read from its source, so this never falls behind):
// calls answer the mock values (a function gets the call's arguments), subscriptions answer
// nothing, except Iker typing.
const source = require('node:fs').readFileSync(
  require('node:path').join(__dirname, '../../src/preload/index.ts'),
  'utf8'
)
const names = [...source.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1])
const api = { platform: 'darwin' }
for (const name of names) {
  api[name] = /^on[A-Z]/.test(name)
    ? () => () => {}
    : (...args) =>
        Promise.resolve(typeof values[name] === 'function' ? values[name](...args) : values[name])
}
api.onTyping = (callback) => {
  setTimeout(() => callback('iker@localhost', true), 300)
  return () => {}
}
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('electron', {})
