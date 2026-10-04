-- "Invite a friend" for Palique users, with a limit enforced here (not in the app).
-- iq set <invite xmlns='urn:palique:invite:0'/>  -> creates one, replies with its token
-- iq get <invite xmlns='urn:palique:invite:0'/>  -> lists the user's active invites
-- Invites are mod_invites contact invites that also allow registering: the new account
-- and the inviter become mutual contacts. Admins have no limit.

local st = require "prosody.util.stanza";
local datetime = require "prosody.util.datetime";
local jid_split = require "prosody.util.jid".split;

local invites = module:depends("invites");

local xmlns = "urn:palique:invite:0";
local max_active = module:get_option_integer("palique_invites_per_user", 5);

module:default_permission("prosody:admin", ":unlimited-invites");

local function active_invites(username)
	local jid = username .. "@" .. module.host;
	local list = {};
	for _, invite in invites.pending_account_invites() do
		if invite.type == "roster" and invite.jid == jid then
			list[#list + 1] = invite;
		end
	end
	table.sort(list, function (a, b) return a.expires < b.expires; end);
	return list;
end

local function invite_tag(invite)
	return st.stanza("invite", {
		xmlns = xmlns;
		token = invite.token;
		expires = datetime.datetime(invite.expires);
	});
end

module:hook("iq-get/self/" .. xmlns .. ":invite", function (event)
	local origin, stanza = event.origin, event.stanza;
	local reply = st.reply(stanza):tag("invites", { xmlns = xmlns, max = tostring(max_active) });
	for _, invite in ipairs(active_invites(origin.username)) do
		reply:add_child(invite_tag(invite));
	end
	origin.send(reply);
	return true;
end);

module:hook("iq-set/self/" .. xmlns .. ":invite", function (event)
	local origin, stanza = event.origin, event.stanza;
	local username, host = jid_split(origin.full_jid);
	if host ~= module.host then return; end

	if #active_invites(username) >= max_active and not module:may(":unlimited-invites", event) then
		origin.send(st.error_reply(stanza, "wait", "resource-constraint",
			"You already have " .. max_active .. " active invites"));
		return true;
	end

	local invite = invites.create_contact(username, true, { source = origin.full_jid });
	if not invite then
		origin.send(st.error_reply(stanza, "wait", "internal-server-error"));
		return true;
	end
	origin.send(st.reply(stanza):add_child(invite_tag(invite)));
	return true;
end);
