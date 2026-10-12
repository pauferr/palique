-- Account invites and password resets, for the account service only (server/cuentas).
-- Users never ask Prosody directly: invites go by email, and the account service keeps
-- the per-user limit and the email <-> account mapping.
-- Only components listed in palique_invites_trusted may use it, sending iqs to the host:
--   iq set <account username='k3f9…' inviter='a7x2…'?/>  -> an invite to create exactly
--     that account (valid 1 week, single use). The inviter, if any, and the new account
--     become mutual contacts.
--   iq set <reset for='username'/>  -> a password reset code (valid 1 hour, single use;
--     the app re-registers the same username with it, see mod_invites).
-- New accounts are announced to them: <message><registered username='…'/></message>.

local st = require "prosody.util.stanza";
local datetime = require "prosody.util.datetime";
local usermanager = require "prosody.core.usermanager";
local rostermanager = require "prosody.core.rostermanager";

local invites = module:depends("invites");
local invites_register = module:depends("invites_register");

local xmlns = "urn:palique:invite:0";
local trusted = module:get_option_set("palique_invites_trusted", {});
local WEEK = 7 * 24 * 60 * 60;

local function is_trusted(event)
	return trusted:contains(event.stanza.attr.from);
end

module:hook("iq-set/host/" .. xmlns .. ":account", function (event)
	if not is_trusted(event) then return; end
	local origin, stanza = event.origin, event.stanza;
	local request = stanza.tags[1];
	local username, inviter = request.attr.username, request.attr.inviter;
	if not username or usermanager.user_exists(username, module.host)
	or (inviter and not usermanager.user_exists(inviter, module.host)) then
		origin.send(st.error_reply(stanza, "cancel", "bad-request"));
		return true;
	end
	local invite = invites.create_account(username, {
		palique_username = username;
		palique_inviter = inviter;
	}, WEEK);
	if not invite then
		origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
		return true;
	end
	origin.send(st.reply(stanza):tag("account", {
		xmlns = xmlns;
		token = invite.token;
		expires = datetime.datetime(invite.expires);
	}));
	return true;
end);

-- mod_invites_register doesn't check the username of account invites: do it here.
module:hook("user-registering", function (event)
	local invite = event.validated_invite or (event.session and event.session.validated_invite);
	local wanted = invite and invite.additional_data and invite.additional_data.palique_username;
	if wanted and wanted ~= event.username then
		event.allowed = false;
		event.reason = "The chosen username is not valid with this invitation";
	end
end);

module:hook("user-registered", function (event)
	for component in trusted do
		module:send(st.message({ to = component, from = module.host })
			:tag("registered", { xmlns = xmlns, username = event.username }));
	end
	local invite = event.validated_invite or (event.session and event.session.validated_invite);
	local inviter = invite and invite.additional_data and invite.additional_data.palique_inviter;
	if not inviter or not usermanager.user_exists(inviter, module.host) then return; end
	invites_register.subscribe_both(module.host, inviter, event.username);
	rostermanager.roster_push(inviter, module.host, event.username .. "@" .. module.host);
end);

module:hook("iq-set/host/" .. xmlns .. ":reset", function (event)
	if not is_trusted(event) then return; end
	local origin, stanza = event.origin, event.stanza;
	local username = stanza.tags[1].attr["for"];
	if not username or not usermanager.user_exists(username, module.host) then
		origin.send(st.error_reply(stanza, "cancel", "item-not-found"));
		return true;
	end
	local invite = invites.create_account_reset(username, 3600);
	if not invite then
		origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
		return true;
	end
	origin.send(st.reply(stanza):tag("reset", {
		xmlns = xmlns;
		token = invite.token;
		expires = datetime.datetime(invite.expires);
	}));
	return true;
end);
