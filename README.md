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
docker compose up -d    # XMPP on localhost:5222, domain "localhost"
docker compose logs -f  # follow server logs
docker compose down     # stop (accounts persist in the prosody-data volume)
```

TLS uses a dev-only self-signed certificate in [server/certs](server/certs); the app trusts it only when connecting to `localhost`.

```bash
npm run check:auth      # registration/login check against the local server
npm run check:roster    # contacts + presence check (uses a second test client)
npm run check:chat      # messages, buzz, carbons and stranger filtering
npm run check:avatar    # publish and fetch avatars
npm run check:history   # local sqlite history (no server needed)
npm run check:export    # history export formats and html escaping
npm run check:settings  # app preferences file
npm run check:presence  # "came online" detection
```

## Platforms

- Linux and macOS
- Windows may come later

## Documentation

- [Project plan](docs/palique.md) (Spanish)
- [Contributing](CONTRIBUTING.md)
