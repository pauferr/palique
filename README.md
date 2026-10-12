# Palique

A desktop instant messenger inspired by MSN Messenger and AIM. Sounds, buzzes, full-screen winks and a cast of cartoon characters: the excitement of getting a message, the way it used to feel.

> **Status:** early development. Not ready for use.

## Stack

- **App:** [Electron](https://www.electronjs.org) + [Svelte](https://svelte.dev) (TypeScript)
- **Messaging:** XMPP
- **Server:** [Prosody](https://prosody.im)

## Development

Requires Node 22+.

```bash
npm install
npm run dev          # app with hot reload
npm run build        # typecheck + build
npm run build:mac    # package .dmg
npm run build:linux  # package AppImage + .deb (use CI from macOS)
```

### Local XMPP server

Prosody runs in Docker (any engine works; OrbStack on macOS). Config lives in [server/prosody.cfg.lua](server/prosody.cfg.lua).

```bash
docker compose up -d --build # XMPP on localhost:5222, account service and Mailpit
docker compose logs -f       # follow server logs
docker compose down          # stop (accounts persist in the volumes)
docker compose down -v       # stop and delete every account
```

Accounts are email addresses, and registration takes an invite sent by email. Invite the first accounts as the admin (no limit; after that each user can invite 3 people from the app):

```bash
docker compose exec cuentas node src/invitar.ts tere@correo.test
```

Open the invite in Mailpit (below) and paste its code into the app's "¿Tienes una invitación? Crea tu cuenta". Any address works: nothing really gets sent.

Services in development:

- Prosody (XMPP): `localhost:5222`, domain `localhost`.
- Account service ([server/cuentas](server/cuentas)): maps each email to its account, sends invites, email changes and password recovery; its pages at http://localhost:8080. It runs from a built image: after changing its code, `docker compose up -d --build cuentas`.
- Mailpit: every email the account service sends lands in a fake inbox at http://localhost:8025 (nothing is really sent).

Invite and password recovery emails open the app through `palique://` links. In development on macOS those links don't reach the dev app (macOS ties them to the generic Electron binary); paste the code from the email instead, or test with a packaged build (`npm run build:unpack`). On Linux and Windows the dev app receives them.

The account service limits recovery requests (one per email every 5 minutes, ten per IP every 15 minutes) and sign-in lookups (30 per IP a minute; 1000 in development, `SIGNIN_LIMIT`), in memory. If repeated testing hits the limit, restart it with `docker compose restart cuentas`.

TLS uses a dev-only self-signed certificate in [server/certs](server/certs); the app trusts it only when connecting to `localhost`.

```bash
npm run check:auth      # sign-up with an invite, sign-in by email
npm run check:roster    # contacts + presence check (uses a second test client)
npm run check:chat      # messages, buzz, carbons and stranger filtering
npm run check:avatar    # publish and fetch avatars
npm run check:invites   # invites by email, per-user limit, inviter becomes a contact
npm run check:email     # changing the account's email (confirmed from the new inbox)
npm run check:reset     # password recovery by email (request, email, new password)
npm run check:newsletter # newsletter choice, Brevo client and unsubscribe webhook
npm run check:invisible # invisible status (needs the server module)
npm run check:history   # local sqlite history (no server needed)
npm run check:export    # history export formats and html escaping
npm run check:settings  # app preferences file
npm run check:presence  # "came online" detection
npm run check:emoticons # emoticon shortcuts
npm run check:cooldown  # anti-spam rate limiter
```

### Newsletter (Brevo)

Newsletter choices are stored by the account service; only verified addresses are synced to a Brevo contact list. Without Brevo settings it runs fine and just doesn't sync. To connect it:

1. In Brevo, create a contact list (note its ID) and an API key (*SMTP & API → API keys*).
2. Create a `.env` file next to `compose.yaml` (it's git-ignored):

   ```bash
   BREVO_API_KEY=xkeysib-…
   BREVO_LIST_ID=3
   BREVO_WEBHOOK_TOKEN=a-long-random-string
   ```

3. Recreate the service and sync everyone who already opted in:

   ```bash
   docker compose up -d cuentas
   docker compose exec cuentas node --disable-warning=ExperimentalWarning src/sync-brevo.ts
   ```

4. Once the service has a public URL (production), add a Brevo webhook for *unsubscribed*, *hard bounce* and *spam* events pointing to `https://<service>/brevo?token=<BREVO_WEBHOOK_TOKEN>`, so unsubscribing from a newsletter's own link also unticks it in Palique.

In production the service also sends its emails through Brevo's SMTP relay (`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS` from *SMTP & API → SMTP*).

## Releases

Versions follow [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`; while in `0.x` anything may change). Installers are built by GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)), each OS on its own machine:

| OS | Files |
|---|---|
| macOS | `.dmg` (Apple Silicon and Intel), plus `.zip` for future auto-updates |
| Linux | `.AppImage` and `.deb` (x64) |
| Windows | `.exe` installer (x64) |

To publish a version:

```bash
npm version minor   # or patch / major: updates package.json, commits and tags (v0.2.0)
```

```bash
git push --follow-tags
```

GitHub builds everything and creates a **draft** release with the installers. Review it on the repository's *Releases* page and publish it.

To try a build without releasing: *Actions → Release → Run workflow*; the installers appear as downloadable artifacts of that run (kept 7 days).

Which server the released app talks to is set at build time from repository variables (*Settings → Secrets and variables → Actions → Variables*): `XMPP_DOMAIN` (e.g. `palique.es`) and `ACCOUNTS_URL` (e.g. `https://cuentas.palique.es`). Unset, the app uses `localhost` like in development.

Not signed (builds are for testing with people close by, not for distribution): macOS shows an "unidentified developer" warning (open it with right click → Open) and Windows a SmartScreen warning (*More info → Run anyway*). Signing would need an Apple Developer account (which also enables auto-updates on macOS) and a Windows code signing certificate. Linux needs no signing.

## Production server

The server side (Prosody, account service, Caddy for HTTPS) runs with Docker from [deploy/](deploy/). Step-by-step guide for a free test server on Oracle Cloud with DuckDNS and Brevo: [docs/despliegue.md](docs/despliegue.md) (Spanish).

## Platforms

- Linux and macOS
- Windows may come later

## Documentation

- [Project plan](docs/palique.md) (Spanish)
- [Contributing](CONTRIBUTING.md)
