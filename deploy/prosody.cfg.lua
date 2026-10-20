-- Prosody config for PRODUCTION (deploy/). Development uses server/prosody.cfg.lua.
-- The domain and secrets come from deploy/.env through the environment (ENV_*).

admins = { }

plugin_paths = { "/etc/prosody/palique-modules" }

modules_enabled = {
	-- Core
	"roster";
	"saslauth";
	"tls";
	"disco";
	"ping";
	"time";
	"version";
	"limits";        -- bandwidth limits per connection (below)

	-- Palique features (same as development; see server/prosody.cfg.lua for notes)
	"register";
	"invites";
	"invites_register";
	"palique_invites";
	"admin_shell";
	"carbons";
	"pep";
	"vcard4";
	"vcard_legacy";
	"offline";
	"blocklist";
	"palique_invisible";
	-- No "smacks" (see server/prosody.cfg.lua). No "mam": no server-side chat archive.
}

-- No federation with other XMPP servers for now (would need port 5269 open).
modules_disabled = { "s2s" }

allow_registration = true
registration_invite_only = true
invite_expiry = "1 week"
palique_invites_trusted = { "accounts." .. ENV_PALIQUE_DOMAIN }

c2s_require_encryption = true
-- Let's Encrypt certificate copied here from Caddy by deploy/certs.sh.
certificates = "certs"

-- Keeps a single misbehaving client from hogging the server.
limits = {
	c2s = { rate = "10kb/s"; burst = "2s" };
}

authentication = "internal_hashed"
storage = "internal"

log = { info = "*console" }

pidfile = "/var/run/prosody/prosody.pid"

-- Account service, connected as an XMPP component (not exposed outside Docker).
component_ports = { 5347 }
component_interfaces = { "*" }

VirtualHost (ENV_PALIQUE_DOMAIN)

Component ("accounts." .. ENV_PALIQUE_DOMAIN)
	component_secret = ENV_ACCOUNTS_SECRET
