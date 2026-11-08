// The README screenshots (docs/images), from the built app with mock friends (preload.cjs)
// and no server: npm run screenshots. Off-screen, at double density.
// Plain CommonJS that Electron runs as is: require, and no place for return types.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { app, BrowserWindow, protocol } = require('electron')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '../..')
// The website's (palique-web/public) with OUT=… ONLY=web; the README's otherwise.
const OUT = process.env.OUT || path.join(ROOT, 'docs/images')

// The transcript, scrolled to the end once everything (emoji included) has its size.
const BOTTOM =
  "document.querySelectorAll('ol').forEach((list) => (list.scrollTop = list.scrollHeight))"

const NEW_GROUP = `{
  const name = document.querySelector('.field input')
  name.value = 'Cumple de Dani'
  name.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelectorAll('.friends input').forEach((box, i) => i === 1 || i === 3 ? box.click() : null)
}`

// Each one: the view (hash), window size, theme, and what to do before the capture.
const SHOTS = {
  contactos: { hash: '', w: 360, h: 820 },
  conversacion: { hash: 'chat=iker@localhost', w: 460, h: 820, run: BOTTOM },
  guinos: {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 760,
    run: "document.querySelectorAll('details.picker')[1].open = true"
  },
  verificar: { hash: 'verify=iker@localhost', w: 420, h: 480 },
  'conversacion-cifrada': {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 820,
    args: ['--verified=1', '--notes=1'],
    run: BOTTOM
  },
  nombre: { hash: 'nick', w: 480, h: 640, args: ['--nick=1'] },
  // Groups: the list, a new one, and a conversation with its members.
  'grupos-lista': { hash: '', w: 360, h: 820 },
  'grupos-lista-oscuro': { hash: '', w: 360, h: 820, theme: 'dark' },
  'grupos-nuevo': { hash: 'newgroup', w: 400, h: 640, run: NEW_GROUP },
  'grupos-nuevo-oscuro': { hash: 'newgroup', w: 400, h: 640, theme: 'dark', run: NEW_GROUP },
  'grupos-conversacion': { hash: 'chat=insti@groups.localhost', w: 760, h: 640, run: BOTTOM },
  'grupos-conversacion-oscuro': {
    hash: 'chat=insti@groups.localhost',
    w: 760,
    h: 640,
    theme: 'dark',
    run: BOTTOM
  },
  integrada: { hash: '', w: 900, h: 620, args: ['--chats=together'], run: BOTTOM },
  'tema-claro': { hash: '', w: 360, h: 640, theme: 'light' },
  'tema-calido': { hash: '', w: 360, h: 640, theme: 'warm' },
  'tema-oscuro': { hash: '', w: 360, h: 640, theme: 'dark' },
  // GIFs: the picker open (trending), and a conversation with one received and one sent.
  'gifs-buscador': {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 760,
    run: "document.querySelector('.gif-button').click()"
  },
  'gifs-buscador-oscuro': {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 760,
    theme: 'dark',
    run: "document.querySelector('.gif-button').click()"
  },
  'gifs-conversacion': {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 820,
    args: ['--gifs=1'],
    run: BOTTOM
  },
  'gifs-conversacion-oscuro': {
    hash: 'chat=iker@localhost',
    w: 460,
    h: 820,
    theme: 'dark',
    args: ['--gifs=1'],
    run: BOTTOM
  },
  'opciones-general': { hash: 'options', w: 600, h: 500, section: 'General' },
  'opciones-sonidos': { hash: 'options', w: 600, h: 500, section: 'Alertas' },
  // palique.io's contact list, in each language and theme (saved without the web- prefix).
  // The website draws a macOS window around them.
  'web-contacts': { hash: '', w: 360, h: 820 },
  'web-contacts-dark': { hash: '', w: 360, h: 820, theme: 'dark' },
  'web-contacts-en': { hash: '', w: 360, h: 820, args: ['--app-lang=en'] },
  'web-contacts-en-dark': {
    hash: '',
    w: 360,
    h: 820,
    theme: 'dark',
    args: ['--app-lang=en']
  }
}
// ONLY=web takes just the website's; by default, everything but those.
const wanted = (name) =>
  process.env.ONLY ? name.startsWith(`${process.env.ONLY}-`) : !name.startsWith('web-')

app.commandLine.appendSwitch('force-device-scale-factor', '2')
// GIF bubbles and the picker load palique-gif://static.klipy.com/…: here, the mock's own
// drawings (gifs/) instead of the app's handler, which fetches from Klipy.
protocol.registerSchemesAsPrivileged([
  { scheme: 'palique-gif', privileges: { standard: true, secure: true } }
])

async function shoot(name) {
  const shot = SHOTS[name]
  const win = new BrowserWindow({
    width: shot.w,
    height: shot.h,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      offscreen: true,
      additionalArguments: [`--theme=${shot.theme ?? 'light'}`, ...(shot.args ?? [])]
    }
  })
  // The page may change its own hash while loading; that only aborts the load promise.
  await win
    .loadFile(path.join(ROOT, 'out/renderer/index.html'), shot.hash ? { hash: shot.hash } : {})
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 1200))
  if (shot.section) {
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('nav button')].find((b) => b.textContent.trim() === ${JSON.stringify(shot.section)})?.click()`
    )
  }
  if (shot.run) await win.webContents.executeJavaScript(shot.run)
  // The unread contact blinks three times before it stays lit.
  await new Promise((r) => setTimeout(r, 3500))
  if (shot.run === BOTTOM) await win.webContents.executeJavaScript(shot.run)
  const image = await win.webContents.capturePage()
  const file = path.join(OUT, `${name.replace(/^web-/, '')}.png`)
  fs.writeFileSync(file, image.toPNG())
  console.log('saved', path.relative(process.cwd(), file))
}

app.whenReady().then(async () => {
  protocol.handle('palique-gif', (request) => {
    const file = path.join(__dirname, 'gifs', path.basename(new URL(request.url).pathname))
    return new Response(fs.readFileSync(file), { headers: { 'content-type': 'image/webp' } })
  })
  if (process.env.SHOT) {
    await shoot(process.env.SHOT)
    return app.exit(0)
  }
  // One process per screenshot: a second off-screen window in the same process fails to load.
  for (const name of Object.keys(SHOTS).filter(wanted)) {
    spawnSync(process.execPath, [__filename], {
      env: { ...process.env, SHOT: name },
      stdio: 'inherit'
    })
  }
  app.exit(0)
})
