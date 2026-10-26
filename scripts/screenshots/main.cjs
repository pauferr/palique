// The README screenshots (docs/images), from the built app with mock friends (preload.cjs)
// and no server: npm run screenshots. Off-screen, at double density.
// Plain CommonJS that Electron runs as is: require, and no place for return types.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { app, BrowserWindow } = require('electron')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/images')

// The transcript, scrolled to the end once everything (emoji included) has its size.
const BOTTOM =
  "document.querySelectorAll('ol').forEach((list) => (list.scrollTop = list.scrollHeight))"

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
  nombre: { hash: 'nick', w: 480, h: 640, args: ['--nick=1'] },
  'tema-claro': { hash: '', w: 360, h: 640, theme: 'light' },
  'tema-calido': { hash: '', w: 360, h: 640, theme: 'warm' },
  'tema-oscuro': { hash: '', w: 360, h: 640, theme: 'dark' },
  'opciones-general': { hash: 'options', w: 600, h: 500, section: 'General' },
  'opciones-sonidos': { hash: 'options', w: 600, h: 500, section: 'Alertas' }
}

app.commandLine.appendSwitch('force-device-scale-factor', '2')

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
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('saved', `docs/images/${name}.png`)
}

app.whenReady().then(async () => {
  if (process.env.SHOT) {
    await shoot(process.env.SHOT)
    return app.exit(0)
  }
  // One process per screenshot: a second off-screen window in the same process fails to load.
  for (const name of Object.keys(SHOTS)) {
    spawnSync(process.execPath, [__filename], {
      env: { ...process.env, SHOT: name },
      stdio: 'inherit'
    })
  }
  app.exit(0)
})
