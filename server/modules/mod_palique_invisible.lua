-- Invisible status (XEP-0186 Invisible Command), minimal version for Palique.
-- While a session is invisible it stays available to the server (it gets messages and its
-- contacts' presence), but no "available" presence of it reaches anyone else: neither
-- broadcasts nor answers to probes. Directed presence is swallowed too (simplification),
-- except to the group rooms: an invisible user stays in its groups, and
-- mod_palique_groups hides it from the other members there.

local st = require "prosody.util.stanza";
local jid = require "prosody.util.jid";
local jid_bare = jid.bare;
local core_post_stanza = prosody.core_post_stanza;

local xmlns = "urn:xmpp:invisible:0";
local groups_host = module:get_option_string("palique_groups_host", "groups." .. module.host);

-- mod_palique_groups shows or hides the session in its rooms.
local function changed(session)
	prosody.events.fire_event("palique-invisible-changed", { session = session });
end
module:add_feature(xmlns);

module:hook("iq-set/self/" .. xmlns .. ":invisible", function(event)
	local origin, stanza = event.origin, event.stanza;
	-- Already visible: tell contacts we left.
	if origin.presence and not origin.invisible then
		for contact, item in pairs(origin.roster or {}) do
			if type(contact) == "string" and (item.subscription == "both" or item.subscription == "from") then
				core_post_stanza(origin, st.presence({ from = origin.full_jid, to = contact, type = "unavailable" }), true);
			end
		end
	end
	origin.invisible = true;
	changed(origin);
	origin.send(st.reply(stanza));
	return true;
end);

-- The client re-sends its presence afterwards, which is broadcast as usual.
module:hook("iq-set/self/" .. xmlns .. ":visible", function(event)
	event.origin.invisible = nil;
	changed(event.origin);
	event.origin.send(st.reply(event.stanza));
	return true;
end);

local function swallow_presence(event)
	local origin, stanza = event.origin, event.stanza;
	if not origin.invisible or stanza.attr.type ~= nil then return; end
	local to = stanza.attr.to;
	if not to then return; end -- the client's own broadcast: mod_presence fans it out (through here)
	if jid_bare(to) == jid_bare(origin.full_jid) then return; end -- our other devices may know
	if jid.host(to) == groups_host then return; end -- joining our groups
	return true;
end

-- Before mod_presence routes anything.
module:hook("pre-presence/bare", swallow_presence, 1000);
module:hook("pre-presence/full", swallow_presence, 1000);

-- Room presences of an invisible member, marked by mod_palique_groups with whose they are:
-- only that user's own sessions get them (unmarked).
module:hook("presence/full", function (event)
	local stanza = event.stanza;
	local owner = stanza.attr["palique-hidden"];
	if not owner then return; end
	if jid_bare(stanza.attr.to) ~= owner then return true; end
	stanza.attr["palique-hidden"] = nil;
end, 1000);
