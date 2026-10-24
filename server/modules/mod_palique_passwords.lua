-- Strong passwords only: at least 8 characters, with a lowercase and an uppercase letter,
-- a digit and a symbol (src/renderer/src/password.ts has the same rule for the app).
-- Checked whenever one is chosen: signing up, resetting it with a code (both through
-- in-band registration) and changing it while signed in (other clients; the app can't).

local st = require "prosody.util.stanza";

local function strong(password)
	return type(password) == "string" and (utf8.len(password) or 0) >= 8
		and password:find("%l") and password:find("%u") and password:find("%d")
		and password:find("[^%w]") and true or false;
end

-- Sign-up and reset. The invite or reset code is only used up on success, so the user can
-- try again with a better one.
module:hook("user-registering", function (event)
	if not strong(event.password) then
		event.allowed = false;
		event.error_condition = "not-acceptable";
		event.reason = "weak-password";
	end
end);

-- Changing it while signed in, before mod_user_account_management handles it (it listens
-- on both: to the account, and to the server for older clients).
local function check_change(event)
	local stanza = event.stanza;
	local password = stanza.attr.type == "set" and stanza.tags[1]:get_child_text("password");
	if password and not strong(password) then
		event.origin.send(st.error_reply(stanza, "modify", "not-acceptable", "weak-password"));
		return true;
	end
end
module:hook("iq/self/jabber:iq:register:query", check_change, 10);
module:hook("iq/host/jabber:iq:register:query", check_change, 10);
