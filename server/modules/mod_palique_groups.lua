-- Palique groups: what the stock MUC component (groups.<domain>) doesn't do for us.
-- Loaded on that component. Palique's "admin" is the XMPP owner (there may be several);
-- the room photo is the room's vCard (muc/vcard.lib, owners only).
--   iq set <leave xmlns='urn:palique:groups:0'/> to the room  -> drops your affiliation,
--     which Prosody doesn't let members do. The last owner hands over to the oldest member
--     first; the last member destroys the room.
--   iq get <members xmlns='urn:palique:groups:0'/> to the room  -> <members> with
--     <member jid affiliation name since/>, for members only, so the app can name people who
--     aren't its contacts even while they're offline.
--   Every change is announced in the room as a groupchat message with a Spanish <body> for
--     other clients and <event kind actor actor-name jid name/> (no actor when the server
--     did it), so it's archived (MAM) and members who
--     were offline get it too: created, added, left, removed, name, photo, owner, unowner.
--   Groups hold up to palique_groups_max people (50).
-- Each member's display name (<nick> in its join presence) and the time it joined are kept
-- in its affiliation data (`name`, `since`).
-- Room nicks must be the member's own localpart, and room registration is off.
-- Invisible members (mod_palique_invisible) stay in their rooms and get everything, but the
-- others see them as gone (writing doesn't change that) until they turn visible.
-- Real JIDs are always shown to members (whois = anyone): owners can't change it.

local st = require "prosody.util.stanza";
local jid = require "prosody.util.jid";
local datetime = require "prosody.util.datetime";
local new_id = require "prosody.util.id".medium;

local muc = module:depends("muc");
local get_room_from_jid = muc.get_room_from_jid;

local xmlns = "urn:palique:groups:0";
local NICK = "http://jabber.org/protocol/nick";
local MAX = module:get_option_integer("palique_groups_max", 50, 1);
local NAME_MAX = 40;
local NICK_MAX = 100; -- characters of a member's display name we keep

local is_member = { owner = true, admin = true, member = true };

-- Set around our own set_affiliation calls (they run synchronously), so the
-- muc-set-affiliation hook can tell who did it.
local leaving; -- bare JID leaving through <leave/>
local inviter = {}; -- [room jid] = member whose mediated invite Prosody turns into an affiliation

local function count(room)
	local n = 0;
	for _, affiliation in room:each_affiliation() do
		if is_member[affiliation] then n = n + 1; end
	end
	return n;
end

local function name_of(room, who)
	return who and room:get_affiliation_data(who, "name") or "Sin nombre";
end

-- A display name cut to NICK_MAX characters, never mid-character; nil if it isn't UTF-8
-- (util.stanza would throw on it in every reply naming that member).
local function clean_name(name)
	if not name or name == "" or not utf8.len(name) then return nil; end
	local cut = utf8.offset(name, NICK_MAX + 1);
	return cut and name:sub(1, cut - 1) or name;
end

-- Fallback text for clients without Palique.
local texts = {
	created = "{actor} ha creado el grupo";
	added = "{actor} ha añadido a {name}";
	left = "{name} ha salido del grupo";
	removed = "{actor} ha quitado a {name} del grupo";
	name = "{actor} ha cambiado el nombre a «{name}»";
	photo = "{actor} ha cambiado la foto del grupo";
	owner = "{actor} ha hecho administrador a {name}";
	unowner = "{actor} ha quitado a {name} como administrador";
};

local function announce(room, kind, actor, target, name)
	local actor_name = actor and room:get_affiliation_data(actor, "name");
	local words = { actor = actor and (actor_name or "Sin nombre") or "Palique", name = name or "Sin nombre" };
	local body = texts[kind]:gsub("{(%w+)}", words);
	room:broadcast_message(st.message({ from = room.jid, type = "groupchat", id = new_id() })
		:text_tag("body", body)
		:tag("event", {
			xmlns = xmlns, kind = kind, actor = actor, ["actor-name"] = actor_name;
			jid = target, name = name;
		}));
end

local function find_room(stanza)
	local room = get_room_from_jid(jid.bare(stanza.attr.to));
	if room and not room._data.destroyed then return room; end
end

-- The creator's own owner affiliation (set in muc-room-pre-create) isn't an "added".
module:hook("muc-room-pre-create", function (event)
	event.room.palique_creating = true;
end, 10);

module:hook("muc-room-created", function (event)
	local room = event.room;
	room.palique_creating = nil;
	local creator = event.creator and event.creator.bare_jid;
	if creator then announce(room, "created", creator, creator, name_of(room, creator)); end
end);

module:hook("muc-occupant-joined", function (event)
	local room, who = event.room, event.occupant.bare_jid;
	local name = clean_name(event.stanza and event.stanza:get_child_text("nick", NICK));
	if name and is_member[room:get_affiliation(who)] then
		room:set_affiliation_data(who, "name", name);
	end
end);

-- A member's room nick is its own JID localpart, so the app can always tell who wrote
-- (also in the archive) and nobody can take someone else's.
local function own_nick(event, occupant)
	local node = jid.split(occupant.bare_jid);
	if jid.resource(occupant.nick) ~= node then
		event.origin.send(st.error_reply(event.stanza, "modify", "not-acceptable", "Your nickname is your username", event.room.jid));
		return true;
	end
end
module:hook("muc-occupant-pre-join", function (event) return own_nick(event, event.occupant); end, 5);
module:hook("muc-occupant-pre-change", function (event) return own_nick(event, event.dest_occupant); end, 5);

-- Room registration (register.lib) would let members rewrite their affiliation data (name,
-- since: jumping the succession), reserve others' nicks or unregister: names come from
-- presence here. Runs before mod_muc's handler (-2).
module:hook("iq/bare/jabber:iq:register:query", function (event)
	event.origin.send(st.error_reply(event.stanza, "cancel", "not-allowed"));
	return true;
end);

-- Joining a group: the size limit, and when it happened (for the succession).
module:hook("muc-pre-set-affiliation", function (event)
	if is_member[event.previous_affiliation] or not is_member[event.affiliation] then return; end
	if count(event.room) >= MAX then
		event.allowed = false;
		event.error = { type = "cancel", condition = "not-allowed" };
		return;
	end
	event.data = event.data or {};
	event.data.since = os.time();
end);

-- members_only.lib grants membership to a member's invitee without saying who invited:
-- refuse when full (it would ignore the failure and send the invite anyway), and remember
-- the inviter for the announcement.
module:hook("muc-pre-invite", function (event)
	local room, stanza = event.room, event.stanza;
	local invite = stanza:get_child("x", "http://jabber.org/protocol/muc#user"):get_child("invite");
	if not is_member[room:get_affiliation(invite.attr.to)] and count(room) >= MAX then
		event.origin.send(st.error_reply(stanza, "cancel", "not-allowed", nil, room.jid));
		return true;
	end
end);
module:hook("muc-invite", function (event)
	inviter[event.room.jid] = jid.bare(event.incoming.attr.from);
end, 10);
module:hook("muc-invite", function (event)
	inviter[event.room.jid] = nil;
end, -10);

module:hook("muc-set-affiliation", function (event)
	local room = event.room;
	if room.palique_creating then return; end
	local before, after, who = event.previous_affiliation, event.affiliation, event.jid;
	if before == after then return; end
	local kind;
	if not is_member[before] then
		if is_member[after] then kind = "added"; end
	elseif not is_member[after] then
		kind = who == leaving and "left" or "removed";
	elseif after == "owner" then
		kind = "owner";
	elseif before == "owner" then
		kind = "unowner";
	end
	if not kind then return; end
	local actor = event.actor and jid.bare(event.actor) or inviter[room.jid];
	inviter[room.jid] = nil;
	if kind == "left" then actor = who; end
	local data = room:get_affiliation_data(who) or event.previous_data;
	announce(room, kind, actor, who, data and data.name or nil);
end);

-- Fires after name.lib has stored the new name; the first name, at creation, isn't a change.
module:hook("muc-config-submitted/muc#roomconfig_roomname", function (event)
	event.palique_old_name = event.room:get_name();
end, 10);
module:hook("muc-config-submitted/muc#roomconfig_roomname", function (event)
	local room = event.room;
	local old, new = event.palique_old_name, room:get_name();
	if old and new and old ~= new then
		announce(room, "name", jid.bare(event.actor), nil, new);
	end
end, -10);

-- Group names are 1 to 40 characters. Checked before mod_muc handles the form (-2),
-- because config handlers can't refuse a submission.
module:hook("iq-set/bare/http://jabber.org/protocol/muc#owner:query", function (event)
	local form = event.stanza.tags[1]:get_child("x", "jabber:x:data");
	if not form then return; end
	for field in form:childtags("field") do
		if field.attr.var == "muc#roomconfig_roomname" then
			local name = field:get_child_text("value") or "";
			local length = utf8.len(name);
			if not length or length < 1 or length > NAME_MAX then
				event.origin.send(st.error_reply(event.stanza, "modify", "not-acceptable", "Group names are 1 to 40 characters"));
				return true;
			end
		elseif field.attr.var == "muc#roomconfig_whois" and field:get_child_text("value") ~= "anyone" then
			-- The leave sent for members turning invisible always carries real JIDs, and the
			-- app needs them.
			event.origin.send(st.error_reply(event.stanza, "modify", "not-acceptable", "Members always see each other's addresses"));
			return true;
		end
	end
end);

module:hook("vcard-updated", function (event)
	local room = find_room(event.stanza);
	if room then announce(room, "photo", jid.bare(event.stanza.attr.from)); end
end);

module:hook("iq-get/bare/" .. xmlns .. ":members", function (event)
	local origin, stanza = event.origin, event.stanza;
	local room = find_room(stanza);
	if not room then
		origin.send(st.error_reply(stanza, "cancel", "item-not-found"));
		return true;
	end
	if not is_member[room:get_affiliation(stanza.attr.from)] then
		origin.send(st.error_reply(stanza, "auth", "forbidden"));
		return true;
	end
	local reply = st.reply(stanza):tag("members", { xmlns = xmlns });
	for who, affiliation, data in room:each_affiliation() do
		if is_member[affiliation] then
			reply:tag("member", {
				jid = who;
				affiliation = affiliation;
				name = data and data.name;
				since = data and data.since and datetime.datetime(data.since);
			}):up();
		end
	end
	origin.send(reply);
	return true;
end);

module:hook("iq-set/bare/" .. xmlns .. ":leave", function (event)
	local origin, stanza = event.origin, event.stanza;
	local room = find_room(stanza);
	if not room then
		origin.send(st.error_reply(stanza, "cancel", "item-not-found"));
		return true;
	end
	local who = jid.bare(stanza.attr.from);
	local mine = room:get_affiliation(who);
	if not is_member[mine] then
		origin.send(st.error_reply(stanza, "auth", "forbidden"));
		return true;
	end

	local others, owners, heir, heir_since = 0, 0, nil, nil;
	for other, affiliation, data in room:each_affiliation() do
		if other ~= who and is_member[affiliation] then
			others = others + 1;
			if affiliation == "owner" then owners = owners + 1; end
			local since = data and data.since or 0;
			if not heir or since < heir_since then heir, heir_since = other, since; end
		end
	end

	if others == 0 then
		room:destroy(nil, "The last member left");
		origin.send(st.reply(stanza));
		return true;
	end
	if mine == "owner" and owners == 0 then
		room:set_affiliation(true, heir, "owner");
	end
	leaving = who;
	local called, ok, err_type, err = pcall(room.set_affiliation, room, true, who, "none");
	leaving = nil;
	if not called then error(ok); end
	if not ok then
		origin.send(st.error_reply(stanza, err_type, err));
		return true;
	end
	origin.send(st.reply(stanza));
	return true;
end);

-- Invisible: every session still in the room is (one visible device makes it present).
-- A leaving session is still listed, with its unavailable presence, while the room tells
-- the others, so only available, still connected sessions count.
local function invisible(occupant)
	local any = false;
	for real_jid, pr in occupant:each_session() do
		local session = prosody.full_sessions[real_jid];
		if pr.attr.type == nil and session then
			if not session.invisible then return false; end
			any = true;
		end
	end
	return any;
end

-- To the other members an invisible occupant is exactly like an absent one: none of its
-- presences reach them (joining, the list a joiner gets, answers to probes, leaving), the
-- occupant count leaves it out, and messages and iqs to its nick get the absent answer.
-- Presences are marked here with whose they are, and mod_palique_invisible drops them on
-- the user's host for anyone else (stanzas the room sends skip the pre-presence events).
local seen = {}; -- [occupant nick] = true: the others think it's here
local HIDE = "palique-hidden";

-- What the others get when someone leaves, as mod_muc builds it.
local function leave(room, occupant)
	local x = st.stanza("x", { xmlns = "http://jabber.org/protocol/muc#user" });
	local affiliation = room:get_affiliation(occupant.bare_jid) or "none";
	for real_jid in occupant:each_session() do
		x:tag("item", { affiliation = affiliation, role = "none", jid = real_jid }):up();
	end
	local stored = occupant:get_presence();
	local pr = st.presence({
		from = occupant.nick, type = "unavailable", ["xml:lang"] = stored and stored.attr["xml:lang"];
	});
	-- Other libraries add their bits (occupant-id), as for any presence of the room.
	local event = { room = room, occupant = occupant, stanza = pr, x = x };
	module:fire_event("muc-build-occupant-presence", event);
	module:fire_event("muc-broadcast-presence", event);
	pr:add_child(x);
	for nick, other in room:each_occupant() do
		if nick ~= occupant.nick then room:route_to_occupant(other, pr); end
	end
end

module:hook("muc-build-occupant-presence", function (event)
	local occupant, stanza = event.occupant, event.stanza;
	-- Stored presences are the client's own: a forged mark would hide it from all but one.
	stanza.attr[HIDE] = nil;
	if not occupant then return; end
	local to = stanza.attr.to;
	-- Broadcasts and probe answers (built with an `x`), or the list a joiner gets. Its own
	-- sessions' self-presence (no `x`, addressed to itself) goes as usual.
	if not (event.x or (to and jid.bare(to) ~= occupant.bare_jid)) then return; end
	local nick = occupant.nick;
	if stanza.attr.type == "unavailable" then
		-- Leaving while hidden: they never saw it come in.
		if not seen[nick] then stanza.attr[HIDE] = occupant.bare_jid; end
		if event.x then seen[nick] = nil; end
	elseif stanza.attr.type == nil then
		if invisible(occupant) then
			stanza.attr[HIDE] = occupant.bare_jid;
			-- Its last visible device left the room: to the others, it leaves.
			if event.x and seen[nick] then leave(event.room, occupant); end
		elseif event.x then
			seen[nick] = true;
		end
	end
end);

module:hook("muc-disco#info", function (event)
	if not event.formdata["muc#roominfo_occupants"] then return; end
	local n = 0;
	for _, occupant in event.room:each_occupant() do
		if not invisible(occupant) then n = n + 1; end
	end
	event.formdata["muc#roominfo_occupants"] = tostring(n);
end, -1); -- after mod_muc's own count

-- No private messages or iqs between members (Palique doesn't use them): every one gets
-- Prosody's answer for a nick that isn't in the room, so nobody can tell. Self-pings and
-- senders outside the room are left to mod_muc, which answers those the same either way.
local function as_absent(event)
	local origin, stanza = event.origin, event.stanza;
	local room = find_room(stanza);
	if not room then return; end
	local own = room:get_occupant_jid(stanza.attr.from);
	if not own or own == stanza.attr.to then return; end
	local t = stanza.attr.type;
	if stanza.name == "iq" and t ~= "get" and t ~= "set" then return; end
	if stanza.name == "message" and (t == "groupchat" or t == "error") then return; end
	origin.send(st.error_reply(stanza, "cancel", "item-not-found", "Recipient not in room", room.jid));
	return true;
end
module:hook("message/full", as_absent, 10);
module:hook("iq/full", as_absent, 10);

-- Turning invisible or visible while in rooms: to the others it leaves, or comes back.
-- ponytail: walks every live room; index occupants by user if there are many rooms.
module:hook_global("palique-invisible-changed", function (event)
	local full_jid = event.session.full_jid;
	if not full_jid then return; end
	for room in muc.live_rooms() do
		local occupant = room:get_occupant_by_real_jid(full_jid);
		if occupant then
			if not invisible(occupant) then
				room:publicise_occupant_status(occupant, st.stanza("x", { xmlns = "http://jabber.org/protocol/muc#user" }));
			elseif seen[occupant.nick] then
				leave(room, occupant);
			end
		end
	end
end);
