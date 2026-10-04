-- Prosody config for LOCAL DEVELOPMENT only.
-- Production needs: real domain, Let's Encrypt certs, s2s enabled and registration throttling (see docs/palique.md, section 3).

admins = { }

modules_enabled = {
	-- Core
	"roster";        -- contact list
	"saslauth";      -- authentication
	"tls";
	"disco";         -- service discovery
	"ping";
	"time";
	"version";

	-- Palique features
	"register";      -- in-band registration (XEP-0077)
	"carbons";       -- same account on several machines (XEP-0280)
	"pep";           -- avatars (XEP-0084) and future user tune (XEP-0118)
	"vcard4";
	"vcard_legacy";
	"offline";       -- store messages until delivered
	"blocklist";
	"smacks";        -- stream management: survive flaky connections

	-- Optional; the Electron client connects over TCP 5222
	"websocket";
	"http";

	-- mod_mam intentionally NOT enabled: no server-side chat archive (privacy decision).
}

-- No federation locally.
modules_disabled = { "s2s" }

allow_registration = true

-- TLS required here too, with the dev-only cert in server/certs.
c2s_require_encryption = true

authentication = "internal_hashed"
storage = "internal"

log = { info = "*console" }

http_ports = { 5280 }
http_interfaces = { "*" }

pidfile = "/var/run/prosody/prosody.pid"

VirtualHost "localhost"
