---
name: translate
description: Translate Palique's UI strings (src/renderer/src/locales/*.json) knowing where each one is shown. Use when asked to translate, fill or review en.json or any catalog, after adding or changing UI text, or when check:i18n reports missing or untranslated strings.
---

# Translating Palique

How translations work is in AGENTS.md («Translations»). The catalog key is the Spanish text,
so a key alone is often ambiguous: «Cerrar» (close a window? be near?), «Cristal» (the
glass theme? the crystal sound pack?), «Inicio» (home? startup?). Never translate from the
key alone.

## Steps

1. `npm run check:i18n -- --write`. It adds new strings as `""`, drops unused ones and prints
   every string left to translate with each place it's used (`file:line`).
2. For each one, open every place it's used and read the code around it. Work out:
   - **What it is:** button, menu item, window title, section heading, tooltip/aria-label,
     placeholder, error, notification, emoticon name, wink name, theme or sound pack name,
     file name, a letter on a format button…
   - **What it does or refers to:** for a wink or emoticon, the drawing (`winks/<id>.ts` top
     comment, the emoji in `emoticons.ts`); for a setting, what it switches.
   - **Its surroundings:** the text before and after it in the UI, and any `{placeholder}` or
     markup the component wraps around it (some sentences are split on a placeholder to put a
     bold name in the middle).
3. **Same key, different meanings.** If one key is used in places that need different
   translations, in English or in any plausible language, don't pick one: give each place a
   context in the source, `_p('tema', 'Cristal')` / `_p('sonidos', 'Cristal')` (contexts are
   short Spanish nouns), run step 1 again and translate each. Do the same for a lone word or
   letter whose meaning only the screen tells (`_p('botón de negrita', 'N')`). If you're unsure,
   ask the user instead of guessing.
4. Write the translation in the catalog, then `npm run check:i18n` (it fails on unused keys
   and on placeholders that differ).

## How it should read

- The tone of the Spanish: friendly, casual, a bit nostalgic (the desktop chat apps of the early 2000s).
  The Spanish uses «tú»; in English use plain everyday words ("Sign in", "Quit", "Buzz").
- Use the classic chat app terms where they exist: "wink", "buzz", "display picture", "personal
  message", "Do not disturb".
- Same Spanish term → same translation across the app, unless the context says otherwise.
- Keep `{placeholders}` exactly, formatting codes (`[b]`, `[c=#hex]`, `[/c=#hex]`) as
  they are (translate only the words inside), and emoji. Spanish quotes «» become the
  language's own (“” in English); keep the `…` character.
- Plurals (`"one|other"` keys): translate both forms, keeping the `|`.
- Short UI text stays short: buttons and menu items no longer than the Spanish if possible.
- Don't translate "Palique" or people's names.
