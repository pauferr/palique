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
    say('Escuchando: Estopa – Como Camarón', 'Listening to: Oasis – Wonderwall')
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
  contacts
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

const values = {
  remembered: { available: true, saved: false },
  lastEmail: 'andrea@palique.com',
  getEmail: { address: 'andrea@palique.com', pending: '', newsletter: true, language: '' },
  inviteStatus: { max: 3, used: 1 },
  getRoster: arg('nick') ? { ...snapshot, name: nick } : snapshot,
  currentAccount: account,
  getUnread: { 'nerea@localhost': 2 },
  getChatHistory: history,
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
    typing: true
  },
  update: null
}

// Every method of the real preload (read from its source, so this never falls behind):
// calls answer the mock values, subscriptions answer nothing, except Iker typing.
const source = require('node:fs').readFileSync(
  require('node:path').join(__dirname, '../../src/preload/index.ts'),
  'utf8'
)
const names = [...source.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1])
const api = { platform: 'darwin' }
for (const name of names) {
  api[name] = /^on[A-Z]/.test(name)
    ? () => () => {}
    : () => Promise.resolve(name in values ? values[name] : undefined)
}
api.onTyping = (callback) => {
  setTimeout(() => callback('iker@localhost', true), 300)
  return () => {}
}
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('electron', {})
