-- Invisible status (XEP-0186 Invisible Command), minimal version for Palique.
-- While a session is invisible it stays available to the server (it gets messages and its
-- contacts' presence), but no "available" presence of it reaches anyone else: neither
-- broadcasts nor answers to probes. Directed presence is swallowed too (simplification).

local st = require "prosody.util.stanza";
local jid_bare = require "prosody.util.jid".bare;
local core_post_stanza = prosody.core_post_stanza;

local xmlns = "urn:xmpp:invisible:0";
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
	origin.send(st.reply(stanza));
	return true;
end);

-- The client re-sends its presence afterwards, which is broadcast as usual.
module:hook("iq-set/self/" .. xmlns .. ":visible", function(event)
	event.origin.invisible = nil;
	event.origin.send(st.reply(event.stanza));
	return true;
end);

local function swallow_presence(event)
	local origin, stanza = event.origin, event.stanza;
	if not origin.invisible or stanza.attr.type ~= nil then return; end
	local to = stanza.attr.to;
	if not to then return; end -- the client's own broadcast: mod_presence fans it out (through here)
	if jid_bare(to) == jid_bare(origin.full_jid) then return; end -- our other devices may know
	return true;
end

-- Before mod_presence routes anything.
module:hook("pre-presence/bare", swallow_presence, 1000);
module:hook("pre-presence/full", swallow_presence, 1000);
