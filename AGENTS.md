# AGENTS.md

Technical guide to Palique for anyone working on the code, people and coding agents alike. For what the product is and why, see [README.md](README.md). For decisions and their reasons, see [docs/palique.md](docs/palique.md) (Spanish).

## What it is

A desktop instant messenger in the spirit of MSN Messenger and AIM: Electron + Svelte app, XMPP over a Prosody server, plus a small account service. Solo project, early development (`0.x`, anything may change).

- **App:** Electron 39, Svelte 5 (runes), TypeScript, built with electron-vite. Node 22+ to develop; CI uses Node 24.
- **Messaging:** XMPP with `@xmpp/client`. Server: Prosody 13 (Docker image `prosodyim/prosody:13.0`).
- **Account service** (`server/cuentas`): TypeScript run directly by Node 24 (`node:sqlite`, no framework, no build step), `@xmpp/component`, nodemailer.
- **Email:** Mailpit in development, Brevo (SMTP + newsletter list) in production.
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
src/preload/       contextBridge API (window.api); the renderer's only door to main
src/renderer/src/  Svelte UI. One renderer for every window, the URL hash picks the view:
                   '' → App (Login / Roster), #chat=<jid>, #options, #wink=<id>
  themes/          xp, win98, aero (CSS variables)
server/
  prosody.cfg.lua  development Prosody config
  modules/         our Prosody modules (Lua): mod_palique_invites, mod_palique_invisible
  cuentas/         account service (own package.json, Dockerfile)
  certs/           dev-only self-signed cert for localhost
deploy/            production: compose, Prosody config, Caddyfile, setup.sh, certs.sh
scripts/           check-*.ts: runnable checks (see Checks), invite.ts, mailpit.ts helpers
  winks/           wink sources (canvas drawing + synthesized sound) and record.ts (see Winks)
docs/              palique.md (plan and decisions), despliegue.md (deployment guide)
compose.yaml       local server stack
```

## Architecture

### App

- **One XMPP connection** for the whole app, owned by `src/main/xmpp.ts`. It keeps the roster, presences, avatars and display names in memory and emits a `Snapshot` on every change. `index.ts` broadcasts it to every window (`roster:changed`).
- **Windows:** contact list (main), one window per conversation (like MSN), Options, and a transparent click-through overlay for winks (on Wayland, where a window can't force itself on top everywhere, winks play inside the conversation window instead). Closing the contact list hides it (tray keeps the app running).
- **IPC:** `ipcMain.handle('area:action')` in `index.ts`, wrapped one-to-one in `src/preload/index.ts`. Validate everything that comes from the renderer in main (types, sizes, ids).
- **Single instance** per data folder (`app.requestSingleInstanceLock`). To run a second copy for testing, give it its own folder (see Development).
- **Local data:** chat history is only on the computer (server archive is off). `history.sqlite` and `settings.json` live in Electron's `userData`, plus `password.bin` when "Iniciar sesión automáticamente" is on (encrypted with `safeStorage`; never offered without system encryption).
- **Messages:** contacts only; strangers can't message you. Carbons (XEP-0280) for other devices. Offline messages arrive with `delay` and play no effects. With no conversation open, incoming messages and winks don't open it: the contact blinks orange in the list with an unread count (total on the dock icon) until it's opened. Only a buzz opens the window. Clicking a wink in a conversation replays it.
- **Anti-spam:** buzz and wink limits per contact in both directions, notification cooldowns (`cooldown.ts`).

### Accounts and identity

- **The email is the account.** Each account has a random, permanent JID localpart (10 chars, `[a-z2-7]`, e.g. `k3f9x2ab7q@domain`). Only the account service knows which email goes with which JID. Changing the email touches nothing else, and contacts never see it.
- **Display name:** XEP-0172 nick, published in PEP and sent in every presence and subscription request. The UI never shows JIDs; unknown names show as "Sin nombre".
- **Sign-in:** the app asks the account service `POST /cuenta {email}` → `{username}` and does normal SASL with it. Unknown addresses get a made-up, stable localpart (HMAC of the email), so a wrong address fails exactly like a wrong password.
- **Registration is invite-only, by email:**
  1. Someone invites an address (the admin, without limit, or a user, 3 each; expired unused invites stop counting).
  2. The account service picks the new account's JID and asks Prosody (`mod_palique_invites`) for an invite that can only create that account. The email carries `palique://registro?t=TOKEN` and the code.
  3. The app gets `POST /registro {token}` → `{email, username}`, registers with XEP-0401 preauth + XEP-0077, and publishes the nick.
  4. Prosody announces the new account to the service and makes inviter and invitee mutual contacts.
- **Adding contacts:** by email. Iq `lookup` to the account service → JID or nothing. If nothing, the user may explicitly invite them.
- **Changing the email:** a link goes to the new address. Until it's opened, the old one still signs in. If the new one is taken, the app gets the same answer and that inbox is told instead.
- **Password recovery:** `POST /recuperar {email}` (always the same answer). The service gets a one-hour reset token from Prosody and emails `palique://recuperar?e=EMAIL&t=TOKEN` plus the code. The app re-registers the same account with it.

### Account service (`server/cuentas`)

- **XMPP:** connects to Prosody as a component (XEP-0114) at `cuentas.<domain>`. Signed-in users talk to it over XMPP, so Prosody vouches for who's asking. Namespace `urn:palique:cuentas:0`:
  - `email` get/set: status, or change the address
  - `resend`, `newsletter`
  - `lookup`
  - `invites` get, `invite-email` set
- **HTTP**, for the signed-out app and email links:
  - `POST /cuenta`, `/registro`, `/recuperar`
  - `GET /verificar`, `/no-invitaciones`
  - `POST /brevo` (webhook)
  - `POST /admin/invitar`, only from loopback, used by `src/invitar.ts`
- **Storage:** SQLite at `$DATA_DIR/cuentas.sqlite`, with tables `accounts` (email unique), `invites` and `invite_optout`.
- **Rate limits** are in memory, so a restart clears them:
  - recovery: one per email every 5 minutes, and 10 per IP every 15 minutes
  - sign-in lookups: 30 per IP a minute (`SIGNIN_LIMIT`; 1000 in development)
  - contact lookups: 30 per user an hour
  - resends: one a minute
- It runs from a **built image** (code is copied, not mounted): after changing it, `docker compose up -d --build cuentas`.

### Prosody

- Invite-only registration (`invites`, `invites_register`, `registration_invite_only`), MAM off, no federation (s2s off).
- `mod_palique_invites` is for trusted components only (`palique_invites_trusted`), via iqs to the host in `urn:palique:invite:0`:
  - `<account username inviter?>`: an invite tied to a localpart; the module enforces it, because stock `mod_invites_register` doesn't
  - `<reset for>`: password reset token
  - On `user-registered`, it messages the component `<registered username/>` and subscribes inviter ↔ invitee.
- `mod_palique_invisible`: XEP-0186-style invisibility.

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
| `urn:palique:cuentas:0` | account service |
| `urn:palique:invite:0` | account service ↔ Prosody |

## Development

```bash
npm install
docker compose up -d --build   # Prosody (localhost:5222), account service (:8080), Mailpit (:8025)
npm run dev                    # app with hot reload (renderer only; restart for src/main changes)
```

- Docker: any engine works (OrbStack on macOS).
- **Logs and reset:** `docker compose logs -f` follows the server logs. `docker compose down -v` deletes every account.
- **First accounts:** `docker compose exec cuentas node src/invitar.ts tere@correo.test`. Open the email in Mailpit (http://localhost:8025) and paste its code into "¿Tienes una invitación? Crea tu cuenta". Any address works; nothing is really sent.
- **Second instance** to chat with yourself (the dev server must be running):

  ```bash
  ELECTRON_RENDERER_URL=http://localhost:5173 npx electron . --user-data-dir="$HOME/.palique-ana"
  ```

- **`palique://` links in development on macOS** don't reach the dev app, because macOS ties them to the generic Electron binary. Paste the code instead, or use a packaged build (`npm run build:unpack`). On Linux and Windows the dev app receives them.
- **TLS:** a dev-only self-signed certificate (`server/certs`). The app trusts it only when the domain is `localhost`.
- **Rate limits:** if repeated testing hits one, `docker compose restart cuentas`.

```bash
npm run typecheck    # tsc (main/preload) + svelte-check
npm run lint         # eslint
npm run format       # prettier (code only, see Conventions)
npm run build        # typecheck + build
npm run build:mac    # package .dmg
npm run build:linux  # AppImage + .deb (use CI from macOS)
```

## Winks

Each wink is `src/renderer/src/assets/winks/<id>.webm` (VP9 with alpha + Opus), with its label in `src/renderer/src/winks.ts`. They're generated from `scripts/winks/winks.js` (canvas drawing and Web Audio sound per wink):

- `scripts/winks/preview.html`: open it in a browser to watch them (no sound).
- `node scripts/winks/record.ts [id ...]`: records them with headless Chrome (`MediaRecorder`), no ffmpeg needed. All of them without ids. `CHROME=/path/to/chrome` outside macOS.

The first three (burbuja, rebote, ola) are older placeholders made elsewhere.

## Checks

No test framework. Each `scripts/check-*.ts` is a plain Node script with `assert`, run directly with `npm run check:<name>`. Server checks need `docker compose up -d`. They create accounts the way people get them: an admin invite read from Mailpit (`scripts/invite.ts` → `register(name, password)`), so accounts are `name@correo.test`.

| Check | Covers |
|---|---|
| `auth` | sign-up with an invite, sign-in by email, unknown address = wrong password |
| `roster` | add by email, presence, names on requests, accept/reject |
| `chat` | messages, buzz, carbons, stranger filtering |
| `avatar` | publish and fetch avatars |
| `invites` | invites by email, 3-per-user limit, inviter becomes a contact, opt-out |
| `email` | changing the email, uniqueness, old address works until confirmed |
| `reset` | password recovery by email |
| `newsletter` | newsletter choice, Brevo client, unsubscribe webhook |
| `invisible` | invisible status (needs the server module) |
| `history`, `export`, `settings`, `presence`, `emoticons`, `cooldown` | local logic, no server |
| `version` | next release version from the commits |

Add or update the matching check with any change to that logic. Before committing, run `npm run typecheck`, `npm run lint` and the affected checks.

## Conventions

- **Language:** UI text and user-facing emails are in **Spanish** (Spain). Code, comments, commit messages and this file are in **English**. `docs/` is Spanish.
- **Commits:**
  - Conventional Commits in English, as in [CONTRIBUTING.md](CONTRIBUTING.md).
  - Small commits straight to `main`, pushed as you go; no PRs.
  - **No AI attribution:** no `Co-Authored-By` trailers or "generated with" lines.
- **Style:**
  - Prettier settings: single quotes, no semicolons, width 100, no trailing commas. The Svelte plugin is on.
  - Format only code: `npx prettier --write src scripts server/cuentas/src`. Running it on `.` rewrites Markdown and YAML that aren't kept in Prettier style.
- **Comments:** short and about *why*, in the existing tone. Keep them current when the code changes.
- **Simplicity:**
  - Prefer the standard library and platform features. Avoid new dependencies.
  - One module owns each concern: XMPP only in `xmpp.ts`, IPC only in `index.ts` and the preload.
- **Security and privacy:**
  - Anything from the network is untrusted: validate ids, sizes and types (see the avatar and wink checks).
  - Never show JIDs or emails to other users.
  - Responses must not reveal whether an address has an account, except the deliberate, rate-limited contact lookup.

## Releases

GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) builds each OS on its own machine:

- **macOS:** `.dmg` (arm64 and x64) plus `.zip`
- **Linux:** `.AppImage` and `.deb`
- **Windows:** unsigned `.exe`

**Versions are semver, worked out from the commits** since the last release by [scripts/next-version.ts](scripts/next-version.ts). That's one more reason to keep commit messages in Conventional Commits.

| Since the last version tag | Bump |
|---|---|
| `type!:` or `BREAKING CHANGE:` | major (minor while still `0.x`) |
| any `feat` | minor |
| anything else | patch |
| nothing | no release (the run fails) |

- The first release is `0.3.0`. The **stage** in `package.json` (`"stage": "alpha"`, then `"beta"`, then `""` when stable) goes on as a suffix (`v0.3.0-alpha`) and makes the release a pre-release.
- Versions are never committed: `package.json` keeps `"version": "0.0.0-dev"`, and the app shows "desarrollo" in development and `v0.3.0-alpha` in releases (sign-in screen and Options). Don't use `npm version`.
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
- **Guide:** a free test server on Oracle Cloud + DuckDNS + Brevo, in [docs/despliegue.md](docs/despliegue.md).
- **First accounts:** `docker compose exec cuentas node src/invitar.ts you@example.com`.
- **Backups:** volumes `palique_prosody-data` (accounts, rosters) and `palique_cuentas-data` (emails, invites, preferences).

### Newsletter (Brevo)

Choices are stored by the account service and synced to a Brevo list. Without Brevo settings it still works; it just doesn't sync. To connect it:

1. In Brevo, create a contact list (note its ID) and an API key (*SMTP & API → API keys*).
2. Put `BREVO_API_KEY`, `BREVO_LIST_ID` and `BREVO_WEBHOOK_TOKEN` in a git-ignored `.env` next to the compose file.
3. Run `docker compose up -d cuentas`, then `docker compose exec cuentas node --disable-warning=ExperimentalWarning src/sync-brevo.ts`.
4. Add a Brevo webhook for *unsubscribed*, *hard bounce* and *spam* to `https://<domain>/brevo?token=<BREVO_WEBHOOK_TOKEN>`.

Production also sends mail through Brevo's SMTP relay (`smtp-relay.brevo.com:587`).
