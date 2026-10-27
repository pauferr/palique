-- Account invites and password resets, for the account service only (server/accounts).
-- Users never ask Prosody directly: invites go by email, and the account service keeps
-- the per-user limit and the email <-> account mapping.
-- Only components listed in palique_invites_trusted may use it, sending iqs to the host:
--   iq set <account username='k3f9…' inviter='a7x2…'?/>  -> an invite to create exactly
--     that account (valid 1 week, single use). The inviter, if any, and the new account
--     become mutual contacts.
--   iq set <reset for='username'/>  -> a password reset code (valid 1 hour, single use).
--   iq set <redeem token='…'><password>…</password><nick>…</nick>?</redeem>  -> uses an
--     invite or a reset code on the website: creates its account (publishing `nick` as its
--     display name) or sets the new password. Errors: item-not-found (no such code, or
--     expired), not-acceptable (weak password; the code still works), conflict.
--   iq get <contacts username='…'/>  -> its mutual contacts (subscription both), so the
--     account service only shows emails to them.
-- New accounts are announced to them: <message><registered username='…'/></message>.

local st = require "prosody.util.stanza";
local datetime = require "prosody.util.datetime";
local usermanager = require "prosody.core.usermanager";
local rostermanager = require "prosody.core.rostermanager";
local jid = require "prosody.util.jid";

local invites = module:depends("invites");
local invites_register = module:depends("invites_register");
local pep = module:depends("pep");

local xmlns = "urn:palique:invite:0";
local NICK = "http://jabber.org/protocol/nick";
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

module:hook("iq-get/host/" .. xmlns .. ":contacts", function (event)
	if not is_trusted(event) then return; end
	local origin, stanza = event.origin, event.stanza;
	local username = stanza.tags[1].attr.username;
	if not username or not usermanager.user_exists(username, module.host) then
		origin.send(st.error_reply(stanza, "cancel", "item-not-found"));
		return true;
	end
	local reply = st.reply(stanza):tag("contacts", { xmlns = xmlns });
	for contact, item in pairs(rostermanager.load_roster(username, module.host) or {}) do
		-- The roster's `false` key holds metadata, not a contact.
		if contact and item.subscription == "both" then
			local node, host = jid.split(contact);
			if node and host == module.host then
				reply:tag("contact", { username = node }):up();
			end
		end
	end
	origin.send(reply);
	return true;
end);

-- The same events in-band registration fires (mod_register_ibr), so everything that
-- watches sign-ups still applies: strong passwords (mod_palique_passwords), the invite's
-- username (above), using the code up and the inviter's contact (mod_invites_register),
-- and the announcement to the account service.
module:hook("iq-set/host/" .. xmlns .. ":redeem", function (event)
	if not is_trusted(event) then return; end
	local origin, stanza = event.origin, event.stanza;
	local request = stanza.tags[1];
	local invite = invites.get(request.attr.token);
	local data = invite and invite.additional_data or {};
	local username = data.allow_reset or data.palique_username;
	if not username then
		origin.send(st.error_reply(stanza, "cancel", "item-not-found"));
		return true;
	end
	local password = request:get_child_text("password");
	local user = {
		username = username, password = password, host = module.host;
		validated_invite = invite, source = module.name;
		allowed = true;
	};
	module:fire_event("user-registering", user);
	if not user.allowed then
		local condition = user.error_condition or (user.error and user.error.condition) or "not-acceptable";
		origin.send(st.error_reply(stanza, "modify", condition, user.reason));
		return true;
	end

	if data.allow_reset then
		local ok, err = usermanager.set_password(username, password, module.host);
		if not ok then
			module:log("error", "Password reset for %s failed: %s", username, err);
			origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
			return true;
		end
		module:fire_event("user-password-reset", user);
		origin.send(st.reply(stanza));
		return true;
	end

	if usermanager.user_exists(username, module.host) then
		origin.send(st.error_reply(stanza, "cancel", "conflict"));
		return true;
	end
	local ok, err = usermanager.create_user_with_role(username, password, module.host, "prosody:registered");
	if not ok then
		module:log("error", "Creating %s failed: %s", username, err);
		origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
		return true;
	end
	module:log("info", "User account created on the website: %s@%s", username, module.host);
	module:fire_event("user-registered", user);
	-- Its display name, as the app would publish it (XEP-0172), so contacts see it at once.
	local nick = request:get_child_text("nick");
	if nick and nick ~= "" then
		local item = st.stanza("item", { xmlns = "http://jabber.org/protocol/pubsub", id = "current" })
			:tag("nick", { xmlns = NICK }):text(nick:sub(1, 200));
		local published, perr = pep.get_pep_service(username):publish(NICK, true, "current", item);
		if not published then module:log("warn", "Could not publish %s's nick: %s", username, perr); end
	end
	origin.send(st.reply(stanza));
	return true;
end);
