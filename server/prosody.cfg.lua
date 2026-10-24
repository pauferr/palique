-- Prosody config for LOCAL DEVELOPMENT only.
-- Production needs: real domain, Let's Encrypt certs, s2s enabled and registration throttling (see docs/palique.md, section 3).

admins = { }

plugin_paths = { "/etc/prosody/palique-modules" }

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
	"invites";       -- invitation tokens (XEP-0401)
	"invites_register"; -- registering needs a valid invite; inviter and invitee become contacts
	"palique_invites"; -- our own: invites and resets for the account service (server/modules)
	"admin_shell";   -- prosodyctl shell (e.g. creating the first invite)
	"carbons";       -- same account on several machines (XEP-0280)
	"pep";           -- avatars (XEP-0084) and future user tune (XEP-0118)
	"vcard4";
	"vcard_legacy";
	"offline";       -- store messages until delivered
	"blocklist";
	"palique_invisible"; -- our own: invisible status (server/modules)
	"palique_passwords"; -- our own: strong passwords only (server/modules)
	-- No "smacks" (stream management): @xmpp/client 0.14 emits "online" before enabling it,
	-- miscounts acks on stanzas sent meanwhile and Prosody drops the session.
	-- Plain reconnects already reload roster + presence; revisit if the library fixes it.

	-- Optional; the Electron client connects over TCP 5222
	"websocket";
	"http";

	-- mod_mam intentionally NOT enabled: no server-side chat archive (privacy decision).
}

-- No federation locally.
modules_disabled = { "s2s" }

allow_registration = true
registration_invite_only = true
invite_expiry = "1 week"
palique_invites_trusted = { "accounts.localhost" } -- the account service (server/accounts)

-- TLS required here too, with the dev-only cert in server/certs.
c2s_require_encryption = true

authentication = "internal_hashed"
storage = "internal"

log = { info = "*console" }

http_ports = { 5280 }
http_interfaces = { "*" }

pidfile = "/var/run/prosody/prosody.pid"

-- Account service (server/accounts) connects as an XMPP component (XEP-0114).
component_ports = { 5347 }
component_interfaces = { "*" }

VirtualHost "localhost"

-- Account service (server/accounts).
Component "accounts.localhost"
	component_secret = "dev-only-accounts-secret" -- dev only; same as in compose.yaml
