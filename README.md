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
docker compose up -d    # XMPP on localhost:5222, account service and Mailpit
docker compose logs -f  # follow server logs
docker compose down     # stop (accounts persist in the prosody-data volume)
```

Registration is invite-only. Create an invite for the first account (then invite others from the app):

```bash
docker compose exec prosody prosodyctl shell invite create_account localhost
```

Paste the code after `preauth=` (or the whole link) into the app's "Código de invitación" field.

Services in development:

- Prosody (XMPP): `localhost:5222`, domain `localhost`.
- Account service ([server/cuentas](server/cuentas)): email verification and invites by email; its pages at http://localhost:8080.
- Mailpit: every email the account service sends lands in a fake inbox at http://localhost:8025 (nothing is really sent).

TLS uses a dev-only self-signed certificate in [server/certs](server/certs); the app trusts it only when connecting to `localhost`.

```bash
npm run check:auth      # registration/login check against the local server
npm run check:roster    # contacts + presence check (uses a second test client)
npm run check:chat      # messages, buzz, carbons and stranger filtering
npm run check:avatar    # publish and fetch avatars
npm run check:invites   # invite-only registration and per-user limit
npm run check:email     # email verification through the account service and Mailpit
npm run check:invite-email # invites by email (no leaks about registered addresses)
npm run check:invisible # invisible status (needs the server module)
npm run check:history   # local sqlite history (no server needed)
npm run check:export    # history export formats and html escaping
npm run check:settings  # app preferences file
npm run check:presence  # "came online" detection
npm run check:emoticons # emoticon shortcuts
npm run check:cooldown  # anti-spam rate limiter
```

## Platforms

- Linux and macOS
- Windows may come later

## Documentation

- [Project plan](docs/palique.md) (Spanish)
- [Contributing](CONTRIBUTING.md)
