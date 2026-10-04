#!/usr/bin/env bash
# Copies Caddy's Let's Encrypt certificate to Prosody and makes it reload. setup.sh runs it
# and schedules it weekly (Caddy renews certificates on its own; Prosody needs the copy).
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a

src="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$PALIQUE_DOMAIN"
mkdir -p certs
docker compose cp "caddy:$src/$PALIQUE_DOMAIN.crt" "certs/$PALIQUE_DOMAIN.crt"
docker compose cp "caddy:$src/$PALIQUE_DOMAIN.key" "certs/$PALIQUE_DOMAIN.key"
# Prosody runs as uid 100 inside its container; only it may read the key.
sudo chown 100:102 "certs/$PALIQUE_DOMAIN.key" "certs/$PALIQUE_DOMAIN.crt"
sudo chmod 600 "certs/$PALIQUE_DOMAIN.key"
sudo chmod 644 "certs/$PALIQUE_DOMAIN.crt"
docker compose exec -T prosody prosodyctl reload
echo "Certificate for $PALIQUE_DOMAIN handed to Prosody."
