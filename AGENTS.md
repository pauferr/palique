# AGENTS.md

Technical guide to Palique for anyone working on the code, people and coding agents alike. For what the product is and why, see [README.md](README.md). For decisions and their reasons, see [docs/palique.md](docs/palique.md) (Spanish).

## What it is

A desktop instant messenger in the spirit of MSN Messenger and AIM: Electron + Svelte app, XMPP over a Prosody server, plus a small account service. Solo project, early development (`0.x`, anything may change).

- **App:** Electron 39, Svelte 5 (runes), TypeScript, built with electron-vite. Node 22+ to develop; CI uses Node 24.
- **Messaging:** XMPP with `@xmpp/client`. Server: Prosody 13 (Docker image `prosodyim/prosody:13.0`).
- **Account service** (`server/accounts`): TypeScript run directly by Node 24 (`node:sqlite`, no framework, no build step), `@xmpp/component`, nodemailer.
- **Email:** Mailpit in development, any SMTP server in production.
- **Platforms:** macOS and Linux first; unsigned Windows installer exists.

## Repository layout

```
src/main/          Electron main process
  index.ts         windows, tray, notifications, IPC handlers, palique:// links, anti-spam
  xmpp.ts          the only module that touches XMPP; one connection; account service calls
  history.ts       local chat history (node:sqlite, history.sqlite in userData)
  settings.ts      app preferences (settings.json in userData)
  export.ts        history export: html / txt / json
  presence.ts      "came online" detection
  cooldown.ts      per-contact rate limits (buzz, winks, toasts, arrivals)
  log.ts           error log (palique.log), with nothing personal in it
src/preload/       contextBridge API (window.api); the renderer's only door to main
src/renderer/src/  Svelte UI. One renderer for every window, the URL hash picks the view:
                   '' → App (Login / Roster), #chat=<jid>, #options, #nick, #about, #wink=<id>
  themes/          light, warm, dark: «Claro», «Cálido», «Oscuro» (CSS variables; light.css defines them all)
server/
  prosody.cfg.lua  development Prosody config
  modules/         our Prosody modules (Lua): mod_palique_invites, mod_palique_invisible, mod_palique_passwords
  accounts/        account service (own package.json, Dockerfile)
  certs/           dev-only self-signed cert for localhost
deploy/            production: compose, Prosody config, Caddyfile, setup.sh, certs.sh
build/             packaging: icon.svg and tray.svg are the icon sources; build/icons.sh makes the PNG/ICNS files
scripts/           check-*.ts: runnable checks (see Checks), invite.ts, mailpit.ts helpers
docs/              palique.md (plan and decisions), deployment.md (deployment guide)
agents/skills/     step-by-step guides for agents, referenced from the section they apply to
compose.yaml       local server stack
```

## Architecture

### App

- **One XMPP connection** for the whole app, owned by `src/main/xmpp.ts`. It keeps the roster, presences, avatars and display names in memory and emits a `Snapshot` on every change. `index.ts` broadcasts it to every window (`roster:changed`).
- **Windows:** contact list (main), one window per conversation (like MSN), Options, and a transparent click-through overlay for winks (on Wayland, where a window can't force itself on top everywhere, or with «Mostrar los guiños a pantalla completa» off, winks play inside the conversation window instead). Closing the contact list hides it (tray keeps the app running).
- **IPC:** `ipcMain.handle('area:action')` in `index.ts`, wrapped one-to-one in `src/preload/index.ts`. Validate everything that comes from the renderer in main (types, sizes, ids).
- **Single instance** per data folder (`app.requestSingleInstanceLock`). To run a second copy for testing, give it its own folder (see Development).
- **Local data:** chat history is only on the computer (server archive is off). `history.sqlite` and `settings.json` live in Electron's `userData`, plus `password.bin` when "Iniciar sesión automáticamente" is on (encrypted with `safeStorage`; never offered without system encryption).
- **Error log:** `console.error`/`console.warn` in main, uncaught errors and the renderer's console errors go to `palique.log` in the OS's logs folder (one older copy, ~1 MB each). Nothing is sent: Ayuda → «Registro de errores…» in the contact list opens its folder for the user to send it. `log.ts` writes errors as name, message and stack only and masks addresses, JIDs, link codes and the home folder; never log passwords or message bodies. Where xmpp.ts can only tell the UI 'unknown', `unexpected()` logs the real cause first.
- **Icons:** [Lucide](https://lucide.dev) through `@lucide/svelte`, imported one by one (`import { Bell } from '@lucide/svelte'`, `size={16}`), so only those end up in the app. Line icons in `currentColor`, so they follow every theme.
- **Design "Cielo":** the 2005 messenger made today: sky headers (`--sky`, `--header-bg`), glossy pill buttons, rounded fields, Nunito. A window's main action is `<button class="primary">`. Components use theme variables only, never colors of their own, so every theme works.
- **Theme and font:** chosen in Options, applied as `data-theme` / `data-font` on every window's root. A font overrides the theme's `--font` (`themes/fonts.css`) and is scaled to the theme font's x-height (`--x-height`, `font-size-adjust` in `base.css`), so every font looks the same size. All bundled fonts are free (OFL): Comic Relief stands in for Comic Sans.
- **Messages:** contacts only; strangers can't message you. Carbons (XEP-0280) for other devices. Offline messages arrive with `delay` and play no effects. With no conversation open, incoming messages, buzzes and winks don't open it: the contact blinks orange in the list with an unread count (total on the dock icon) until it's opened, and winks that came meanwhile play then. Clicking a wink in a conversation replays it.
- **Anti-spam:** buzz and wink limits per contact in both directions, notification cooldowns (`cooldown.ts`).

### Accounts and identity

- **The email is the account.** Each account has a random, permanent JID localpart (10 chars, `[a-z2-7]`, e.g. `k3f9x2ab7q@domain`). Only the account service knows which email goes with which JID, and it tells only mutual contacts (subscription `both`, asked to Prosody each time). Changing the email touches nothing else. Mutual contacts see it in the conversation header, as the contact list tooltip and in «Copiar correo».
- **Display name:** XEP-0172 nick, published in PEP and sent in every presence and subscription request. The UI never shows JIDs; unknown names show as "Sin nombre". It may carry Messenger Plus!-style codes (`[b]`, `[c=#hex]…[/c]`, gradients `[c=A]…[/c=B]`, `[a=…]` backgrounds), parsed in `src/renderer/src/plus.ts` into styled text (never HTML) and stripped for plain-text places (titles, notifications). It's edited in its own window (`#nick`), opened by clicking the name in the contact list.
- **Sign-in:** the app asks the account service `POST /cuenta {email}` → `{username}` and does normal SASL with it. Unknown addresses get a made-up, stable localpart (HMAC of the email), so a wrong address fails exactly like a wrong password.
- **Registration is invite-only, by email:**
  1. Someone invites an address (the admin, without limit, or a user, 3 each; expired unused invites stop counting).
  2. The account service picks the new account's JID and asks Prosody (`mod_palique_invites`) for an invite that can only create that account. The email carries `palique://signup?t=TOKEN` and the code.
  3. The app gets `POST /signup {token}` → `{email, username}`, registers with XEP-0401 preauth + XEP-0077, and publishes the nick.
  4. Prosody announces the new account to the service and makes inviter and invitee mutual contacts.
- **Adding contacts:** by email. Iq `lookup` to the account service → JID or nothing. If nothing, the user may explicitly invite them.
- **Changing the email:** a link goes to the new address. Until it's opened, the old one still signs in. If the new one is taken, the app gets the same answer and that inbox is told instead.
- **Password recovery:** `POST /recover {email}` (always the same answer). The service gets a one-hour reset token from Prosody and emails `palique://reset?e=EMAIL&t=TOKEN` plus the code. The app re-registers the same account with it.
- **Passwords:** at least 8 characters, with a lowercase and an uppercase letter, a digit and a symbol (ASCII classes, so ñ counts as a symbol). The app checks it as you type (`src/renderer/src/password.ts`); Prosody enforces it (`mod_palique_passwords`). Existing passwords keep working.

### Account service (`server/accounts`)

- **XMPP:** connects to Prosody as a component (XEP-0114) at `accounts.<domain>`. Signed-in users talk to it over XMPP, so Prosody vouches for who's asking. Namespace `urn:palique:accounts:0`:
  - `email` get/set: status, or change the address
  - `resend`, `newsletter`, `language` (the app's language, '' = the computer's)
  - `lookup`
  - `contacts`: the emails of your mutual contacts
  - `invites` get, `invite-email` set
- **HTTP**, for the signed-out app and email links:
  - `POST /account`, `/signup`, `/recover`
  - `GET /verify`, `/no-invites`
  - `POST /admin/invite`, only from loopback, used by `src/invite.ts`
- **Storage:** SQLite at `$DATA_DIR/accounts.sqlite`, with tables `accounts` (email unique), `invites` and `invite_optout`.
- **Rate limits** are in memory, so a restart clears them:
  - recovery: one per email every 5 minutes, and 10 per IP every 15 minutes
  - sign-in lookups: 30 per IP a minute (`SIGNIN_LIMIT`; 1000 in development)
  - contact lookups: 30 per user an hour
  - resends: one a minute
- It runs from a **built image** (code is copied, not mounted): after changing it, `docker compose up -d --build accounts`.

### Prosody

- Invite-only registration (`invites`, `invites_register`, `registration_invite_only`), MAM off, no federation (s2s off).
- `mod_palique_invites` is for trusted components only (`palique_invites_trusted`), via iqs to the host in `urn:palique:invite:0`:
  - `<account username inviter?>`: an invite tied to a localpart; the module enforces it, because stock `mod_invites_register` doesn't
  - `<reset for>`: password reset token
  - `<contacts username>` (get): the user's mutual contacts, so emails go only to them
  - On `user-registered`, it messages the component `<registered username/>` and subscribes inviter ↔ invitee.
- `mod_palique_invisible`: XEP-0186-style invisibility.
- `mod_palique_passwords`: strong passwords only, on sign-up, reset and signed-in changes (`not-acceptable` otherwise). The invite or reset code survives a refused attempt.

### Protocols in use

| XEP / namespace | Use |
|---|---|
| XEP-0077, XEP-0401 | registration with invite (preauth) |
| XEP-0280 | carbons |
| XEP-0085 | typing |
| XEP-0224 | buzz (attention) |
| XEP-0084 + presence hash | avatars in PEP |
| XEP-0172 | display name (nick) in PEP and presence |
| XEP-0186 | invisible |
| `urn:palique:wink:0` | winks (Palique only; body is a text fallback) |
| `urn:palique:accounts:0` | account service |
| `urn:palique:invite:0` | account service ↔ Prosody |

## Development

```bash
npm install
docker compose up -d --build   # Prosody (localhost:5222), account service (:8080), Mailpit (:8025)
npm run dev                    # app with hot reload (renderer only; restart for src/main changes)
```

- Docker: any engine works (OrbStack on macOS).
- **Logs and reset:** `docker compose logs -f` follows the server logs. `docker compose down -v` deletes every account.
- **First accounts:** `docker compose exec accounts node src/invite.ts tere@correo.test` (add `en` for the email in English). Open the email in Mailpit (http://localhost:8025) and paste its code into "¿Tienes una invitación? Crea tu cuenta". Any address works; nothing is really sent.
- **Second instance** to chat with yourself (the dev server must be running):

  ```bash
  ELECTRON_RENDERER_URL=http://localhost:5173 npx electron . --user-data-dir="$HOME/.palique-ana"
  ```

- **`palique://` links in development on macOS** don't reach the dev app, because macOS ties them to the generic Electron binary. Paste the code instead, or use a packaged build (`npm run build:unpack`). On Linux and Windows the dev app receives them.
- **TLS:** a dev-only self-signed certificate (`server/certs`). The app trusts it only when the domain is `localhost`.
- **Rate limits:** if repeated testing hits one, `docker compose restart accounts`.

```bash
npm run typecheck    # tsc (main/preload) + svelte-check
npm run lint         # eslint
npm run format       # prettier (code only, see Conventions)
npm run build        # typecheck + build
npm run build:mac    # package .dmg
npm run build:linux  # AppImage (use CI from macOS)
```

## Translations

Gettext style, no library: the Spanish text is the key (`src/renderer/src/i18n.ts`, shared by main and renderer).

- Write UI text in Spanish inside `_()`: `_('Opciones')`, `_('{name} se ha conectado', { name })`. Plurals: `_n('Un contacto', '{n} contactos', n)`. Whole sentences in one call, never glued pieces.
- Same Spanish with another meaning, or a lone word a translator can't place: `_p('tema', 'Cristal')` (stored as `"tema::Cristal"`; the context is never shown).
- Text in module-level lists or constants is marked with `N_()` and translated where it's shown (`_(pack.name)`): the language is set after modules load, so `_()` never runs at module top level.
- Catalogs: `src/renderer/src/locales/<lang>.json`, flat `{ "Spanish": "Translation" }`, plurals as `"one|other"`. A missing or empty translation shows the Spanish.
- After adding or changing texts: `npm run check:i18n -- --write` adds them to every catalog as `""`, drops unused ones and lists each string left with where it's used; translate them from there, never from the key alone. **Before translating, read and follow [agents/skills/translate/SKILL.md](agents/skills/translate/SKILL.md).**
- A new language: its JSON in `locales/`, imported in `i18n.ts` and added to `LANGUAGES`, plus its name in Options.
- The language is the «Idioma» setting (`auto` follows the computer; languages Palique doesn't have get English). It's kept with the account (account service, `language`), so it follows the user to any computer and is applied on sign-in; `settings.json` keeps the last one for the sign-in screen. Changing it reloads every window (signed-in windows stay signed in). Dates use `lang`.
- The account service's emails and the pages their links open are translated the same way, with their own `server/accounts/src/i18n.ts` (a copy: the service is built on its own) and catalog `server/accounts/src/locales/`; `check:i18n` covers both. A function makes the translator per email, `const _ = translator(lang)`, as each one has its own language.
- An email goes out in the language of the app that asked for it (`lang` in the iq or the `/recover` body; an invite, in the inviter's). Its links carry it (`&l=en`) for the page they open. The admin's invites take it as an argument (`src/invite.ts correo [es|en]`, Spanish by default).

## Winks

Winks are drawn live, not videos: canvas drawing and Web Audio sound in `src/renderer/src/winks/`, so they're sharp at any size (thumbnail, conversation, full screen) and weigh a few KB.

- `kit.ts`: the `Wink` type (`id`, `dur`, `still`, `draw(c, t)` in a 480×360 space, `sound(s)`), timing helpers, shared shapes and the synthesizer.
- One file per wink (`<id>.ts`), listed in `catalog.ts`; shared characters in `face.ts` (emotes) and `kid.ts`.
- `WinkPlayer.svelte` plays one, scaled to its box at the screen's pixel density. Sound follows "Reproducir sonidos".
- To see them all: `npm run dev`, then open the dev app at `#winks` (e.g. `ELECTRON_RENDERER_URL=http://localhost:5173 npx electron .` and change the hash, or load `http://localhost:5173/#winks` in its DevTools).
- A new wink: its file, an entry in `catalog.ts` and a label in `src/renderer/src/wink-labels.ts`. Ids travel over the network and live in histories: never rename or reuse one.

**Sounds** (message, contact online, buzz) come in collections chosen in Options (`soundPack` setting): `src/renderer/src/sounds.ts`, synthesized with the winks' `makeSound` except the classic message (a recording, cut shorter). `#sounds` shows them all side by side. A new collection: its entry in `packs` and its id in `SOUND_PACKS` (`src/main/settings.ts`).

## Checks

No test framework. Each `scripts/check-*.ts` is a plain Node script with `assert`, run directly with `npm run check:<name>`. Server checks need `docker compose up -d`. They create accounts the way people get them: an admin invite read from Mailpit (`scripts/invite.ts` → `register(name, password)`), so accounts are `name@correo.test`.

| Check | Covers |
|---|---|
| `auth` | sign-up with an invite, sign-in by email, unknown address = wrong password |
| `roster` | add by email, presence, names on requests, accept/reject, emails only for mutual contacts |
| `chat` | messages, buzz, carbons, stranger filtering |
| `avatar` | publish and fetch avatars |
| `invites` | invites by email, 3-per-user limit, inviter becomes a contact, opt-out |
| `email` | changing the email, uniqueness, old address works until confirmed |
| `reset` | password recovery by email, in the app's language |
| `newsletter` | newsletter choice, language kept with the account |
| `invisible` | invisible status (needs the server module) |
| `history`, `export`, `settings`, `presence`, `emoticons`, `plus`, `cooldown` | local logic, no server |
| `log` | error log: format, size limit, nothing personal written |
| `version` | next release version from the commits |
| `i18n` | every translated string is in the catalogs, none left over, placeholders match |

Add or update the matching check with any change to that logic. Before committing, run `npm run typecheck`, `npm run lint` and the affected checks.

CI ([.github/workflows/checks.yml](.github/workflows/checks.yml)) runs typecheck, lint and every check on each push to `main`, with the development stack up.

## Conventions

- **Language:** UI text and user-facing emails are written in **Spanish** (Spain) and translated (see Translations). Code, comments, commit messages and this file are in **English**. `docs/` is Spanish, and so is README.md while the app is Spanish-only. Its screenshots are in `docs/images/`, made by `npm run screenshots` (`scripts/screenshots/`: the built app, off-screen, with mock friends at `@palique.com` addresses and no server).
- **Commits:**
  - Conventional Commits in English, as in [CONTRIBUTING.md](CONTRIBUTING.md).
  - Small commits straight to `main`, pushed as you go; no PRs.
  - **No AI attribution:** no `Co-Authored-By` trailers or "generated with" lines.
- **Style:**
  - Prettier settings: single quotes, no semicolons, width 100, no trailing commas. The Svelte plugin is on.
  - Format only code: `npx prettier --write src scripts server/accounts/src`. Running it on `.` rewrites Markdown and YAML that aren't kept in Prettier style.
- **Comments:** short and about *why*, in the existing tone. Keep them current when the code changes.
- **License:** AGPL-3.0-or-later ([LICENSE](LICENSE)). Anything added (dependencies, fonts, sounds, images) must be compatible: permissive (MIT, BSD, ISC, Apache-2.0), OFL for fonts, or your own work.
- **Simplicity:**
  - Prefer the standard library and platform features. Avoid new dependencies.
  - One module owns each concern: XMPP only in `xmpp.ts`, IPC only in `index.ts` and the preload.
- **Security and privacy:**
  - Anything from the network is untrusted: validate ids, sizes and types (see the avatar and wink checks).
  - Never show JIDs to other users. Emails only to mutual contacts.
  - Responses must not reveal whether an address has an account, except the deliberate, rate-limited contact lookup.

## Releases

GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) builds each OS on its own machine:

- **macOS:** `.dmg` (arm64 and x64)
- **Linux:** `.AppImage`
- **Windows:** unsigned `.exe`

The installers go up with the update files the installed apps read (`latest*.yml`; no blockmaps, so updates are full downloads).

**Updates** ([src/main/updates.ts](src/main/updates.ts), `electron-updater`, packaged builds only): every few hours the app looks for a newer published release (drafts don't count; pre-releases do while the version has a stage).

- **Windows and Linux** download it in the background and install it on quit. The contact list and sign-in screen offer «Reiniciar ahora».
- **macOS** can't install it (ad-hoc signature, no Developer ID): the same places show a notice with a link to download it.

**Oldest app allowed** (`MIN_APP_VERSION` in the server's `.env`, empty by default): the app sends its version (`x-palique-version`) to `/account`, `/signup` and `/recover`; older apps get `outdated` and the sign-in screen asks them to download the new one. Raise it only when a change breaks older apps (major.minor.patch; the stage doesn't count). Checked in `check:version`.

**Versions are semver, worked out from the commits** since the last release by [scripts/next-version.ts](scripts/next-version.ts). That's one more reason to keep commit messages in Conventional Commits.

| Since the last version tag | Bump |
|---|---|
| `type!:` or `BREAKING CHANGE:` | major (minor while still `0.x`) |
| any `feat` | minor |
| anything else | patch |
| nothing | no release (the run fails) |

- The first release is `0.3.0`. The **stage** in `package.json` (`"stage": "alpha"`, then `"beta"`, then `""` when stable) goes on as a suffix (`v0.3.0-alpha`) and makes the release a pre-release.
- Versions are never committed: `package.json` keeps `"version": "0.0.0-dev"`, and the app shows it as `v0.3.0 (alpha)` (`v1.0.0` when stable), in development the next one (sign-in screen, Options and About). Don't use `npm version`.
- `node scripts/next-version.ts` prints what the next release would be. `npm run check:version` checks the rules.
- To force a version (e.g. `1.0.0`), fill the workflow's **version** input.

The workflow **never runs on push**: releasing is a manual decision.

- **Release:** *Actions → Release → Run workflow* with **publish** on. It works out the version, every OS builds, then the tag is pushed on the built commit and **one** release gets all the files.
  - **draft** on (the default): you publish it yourself from *Releases*. Off: it's published straight away.
- **Try a build without releasing:** same workflow with **publish** off. The installers are downloadable as artifacts (kept 7 days).
- **Server the build talks to:** set at build time from repository variables `XMPP_DOMAIN` and `ACCOUNTS_URL` (`MAIN_VITE_*`). Unset means `localhost`.
- **Unsigned builds:** the mac app is only ad-hoc signed (`build/after-pack.mjs`), so the first time macOS needs *System Settings → Privacy & Security → Open Anyway*. Windows shows a SmartScreen warning.

## Production

- **Stack:** Prosody, the account service and Caddy (HTTPS, Let's Encrypt) via Docker from `deploy/`.
- **Guide:** deploying to a server of your own, in [docs/deployment.md](docs/deployment.md).
- **First accounts:** `docker compose exec accounts node src/invite.ts you@example.com`.
- **Backups:** volumes `palique_prosody-data` (accounts, rosters) and `palique_accounts-data` (emails, invites, preferences).

### Newsletter

There's no newsletter yet. The account service only stores each user's choice and when it was made (proof of consent); the app changes it in Options. When there is one, its list comes from those choices, and every issue needs a working unsubscribe link.
