#!/usr/bin/env bash
# First start (and safe to re-run, e.g. after git pull) of the Palique server.
# Needs deploy/.env filled in (see .env.example) and the domain's DNS pointing here.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing deploy/.env: copy .env.example to .env and fill it in." >&2
  exit 1
fi

# Secrets nobody has to type: generated once and kept in .env.
for name in CUENTAS_SECRET BREVO_WEBHOOK_TOKEN; do
  if ! grep -q "^$name=." .env; then
    value=$(openssl rand -hex 24)
    if grep -q "^$name=" .env; then
      sed -i "s|^$name=.*|$name=$value|" .env
    else
      echo "$name=$value" >> .env
    fi
    echo "Generated $name."
  fi
done
chmod 600 .env
set -a; source .env; set +a

mkdir -p certs
docker compose up -d --build

echo "Waiting for the Let's Encrypt certificate for $PALIQUE_DOMAIN…"
src="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$PALIQUE_DOMAIN/$PALIQUE_DOMAIN.crt"
for _ in $(seq 1 60); do
  if docker compose exec -T caddy test -f "$src"; then break; fi
  sleep 5
done
if ! docker compose exec -T caddy test -f "$src"; then
  echo "No certificate after 5 minutes. Check DNS and ports 80/443 (docs/despliegue.md)," >&2
  echo "and Caddy's log: docker compose logs caddy" >&2
  exit 1
fi
./certs.sh

# Weekly certificate hand-over to Prosody (idempotent).
job="0 4 * * 1 $(pwd)/certs.sh >> $(pwd)/certs.log 2>&1"
# No crontab yet, or no old job: grep finds nothing, which must not stop the script.
( crontab -l 2>/dev/null | grep -v "/certs.sh" || true; echo "$job" ) | crontab -

cat <<EOF

Palique is running on $PALIQUE_DOMAIN.
Invite the first accounts (yours too) by email with:
  docker compose exec cuentas node src/invitar.ts you@example.com

Brevo webhook URL (optional, newsletter unsubscribes):
  https://$PALIQUE_DOMAIN/brevo?token=$BREVO_WEBHOOK_TOKEN
EOF
