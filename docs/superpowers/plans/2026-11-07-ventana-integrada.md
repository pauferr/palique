# Ventana integrada: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** una opción en Opciones para ver la conversación elegida dentro de la ventana de contactos, a la derecha de la lista, en vez de en ventanas sueltas.

**Arquitectura:** `Chat.svelte` se monta dentro de `Roster.svelte` con una propiedad `embedded`. En `src/main/index.ts`, una variable `shown` (el contacto que se ve en el panel) y una función `hostOf(contact)` deciden a qué ventana va cada mensaje, guiño y «escribiendo». `openChat()` en modo integrado no crea ventana: cambia `shown` y avisa a la ventana principal (`chat:show`).

**Tecnología:** Electron 39, Svelte 5 (runes), TypeScript. Sin dependencias nuevas.

**Especificación:** [docs/superpowers/specs/2026-11-07-ventana-integrada-design.md](../specs/2026-11-07-ventana-integrada-design.md)

## Restricciones globales

- Ajuste `chats: 'windows' | 'together'`, por defecto `'windows'`.
- Ventana principal en modo integrado con sesión iniciada: 900 × 620, mínimo 720 de ancho; lista en una columna de 300 px. Fuera de ese modo: 360 de ancho, sin mínimo.
- Textos de la interfaz en español dentro de `_()`; después, `npm run check:i18n -- --write` y traducir `en.json` siguiendo `agents/skills/translate/SKILL.md`.
- Textos fijados: «Conversaciones», «En ventanas separadas», «En la ventana de contactos», «Elige un contacto para hablar».
- Componentes solo con variables del tema; revisar Claro, Cálido y Oscuro.
- IPC solo en `index.ts` y el preload; validar en main todo lo que llega del renderer (`String(contact)`).
- Commits en Conventional Commits, en inglés, sin atribución de IA. **No hacer commit ni push sin que el usuario lo pida**: los pasos «Commit» de este plan se ejecutan solo con su permiso.
- Antes de cada commit: `npm run typecheck`, `npm run lint` y los checks afectados. Formatear solo código: `npx prettier --write src scripts`.

## Puntos a vigilar en la revisión

Situaciones que la especificación implica y que ningún check automático cubre. Cada una tiene su prueba manual en la tarea que la resuelve:

1. **Cambio de idioma con una conversación en el panel:** se recargan las ventanas y el panel debe volver con el mismo contacto (`chat:shown`, Tarea 3).
2. **Cambiar de contacto mientras escribes:** el contacto anterior debe recibir «ha dejado de escribir» (`stopTyping` al desmontar, Tarea 2).
3. **Un mensaje del contacto recién elegido antes de que su conversación se monte:** debe esperar en `pending` y aparecer, no perderse (Tarea 3).
4. **Volver a ventanas sueltas con el panel abierto:** el siguiente mensaje de ese contacto debe ir a no leídos, no a un panel que ya no existe (Tarea 3).
5. **Cerrar la ventana principal (se esconde en la bandeja) con una conversación en el panel:** los mensajes nuevos de ese contacto deben contar como no leídos y no perderse en una ventana oculta (Tarea 3).

---

### Tarea 1: el ajuste «Conversaciones»

**Archivos:**
- Modificar: `src/main/settings.ts` (tipo `Settings`, `DEFAULTS`, `validPatch`, nueva constante `CHAT_LAYOUTS`)
- Modificar: `scripts/check-settings.ts`
- Modificar: `src/renderer/src/prefs.svelte.ts` (añadir `chats`)
- Modificar: `src/renderer/src/Options.svelte` (sección General)
- Modificar: `src/renderer/src/locales/en.json`
- Modificar: `scripts/screenshots/preload.cjs` (`getSettings` lee `--chats=`)

**Interfaces:**
- Produce: `export const CHAT_LAYOUTS = ['windows', 'together'] as const`, `export type ChatLayout = (typeof CHAT_LAYOUTS)[number]`, `Settings.chats: ChatLayout`; `prefs.chats` en el renderer.

- [ ] **Paso 1: el check, que debe fallar.** En `scripts/check-settings.ts`:
  - añadir `chats: 'windows'` a `defaults`;
  - en el primer `validPatch` válido, añadir `chats: 'together'` a la entrada y a lo esperado;
  - en el `validPatch` que debe devolver `{}`, añadir `chats: 'tabs'`.

- [ ] **Paso 2:** `npm run check:settings`. Esperado: FALLA en «defaults on first run».

- [ ] **Paso 3: el ajuste.** En `settings.ts`:
  - `CHAT_LAYOUTS` y `ChatLayout` junto a `SOUND_PACKS`;
  - `chats: ChatLayout // conversations in their own windows, or beside the contact list` en `Settings`;
  - `chats: 'windows'` en `DEFAULTS`;
  - en `validPatch`, `chats` solo si está en `CHAT_LAYOUTS`, como `soundPack`.

- [ ] **Paso 4:** `npm run check:settings`. Esperado: `settings check passed`.

- [ ] **Paso 5: renderer.**
  - `prefs.svelte.ts`: añadir `chats` al `Pick`, al estado inicial (`'windows'`) y a `update`.
  - `Options.svelte`: en `section === 'general'`, una `<section>` nueva con `<h2>{_('Conversaciones')}</h2>` y un `<select>` como el de `soundPack`, con `value={settings?.chats}`, `onchange={(e) => set({ chats: e.currentTarget.value as ChatLayout })}` y dos opciones: `windows` → `_('En ventanas separadas')`, `together` → `_('En la ventana de contactos')`.
  - `scripts/screenshots/preload.cjs`: `chats: arg('chats') || 'windows'` en `getSettings`, siguiendo el `arg()` que ya hay.

- [ ] **Paso 6: traducciones.** `npm run check:i18n -- --write`; traducir en `en.json` los textos nuevos siguiendo el skill de traducción; `npm run check:i18n`. Esperado: `i18n check passed`.

- [ ] **Paso 7: comprobar.** `npm run typecheck && npm run lint`. Esperado: sin errores.

- [ ] **Paso 8: commit** (solo con permiso del usuario).

```bash
git add src/main/settings.ts scripts/check-settings.ts src/renderer/src/prefs.svelte.ts src/renderer/src/Options.svelte src/renderer/src/locales/en.json scripts/screenshots/preload.cjs
git commit -m "feat(options): choose between conversation windows and conversations beside the contact list"
```

### Tarea 2: `Chat.svelte` dentro de otra ventana

**Archivos:**
- Modificar: `src/renderer/src/Chat.svelte`

**Interfaces:**
- Produce: `Chat` acepta `embedded?: boolean` (por defecto `false`): `<Chat jid={…} embedded />`.

- [ ] **Paso 1: la propiedad.** `let { jid, embedded = false }: { jid: string; embedded?: boolean } = $props()`. Con `embedded`:
  - el `$effect` del título no toca `document.title`;
  - la raíz lleva `class:embedded`, con `.chat.embedded { height: 100%; position: relative; }`;
  - la capa de guiños del panel, `.embedded .wink-layer { position: absolute; }`, para que cubra el panel y no la lista.

- [ ] **Paso 2: al desmontarse, deja de «escribir»** (punto a vigilar 2). En la función de limpieza de `onMount`, llamar a `stopTyping()` y quitar el listener de `beforeunload`. Hoy solo se avisa al cerrar la ventana; en el panel, el componente se desmonta al cambiar de contacto.

- [ ] **Paso 3: comprobar.** `npm run typecheck && npm run lint`. Las ventanas sueltas no cambian: abrir una conversación con `npm run dev` y comprobar el título y la altura.

- [ ] **Paso 4: commit** (solo con permiso).

```bash
git add src/renderer/src/Chat.svelte
git commit -m "feat(chat): a conversation can live inside another window"
```

### Tarea 3: el panel en la ventana de contactos y el reparto de mensajes

**Archivos:**
- Modificar: `src/main/index.ts`
- Modificar: `src/preload/index.ts` (y su `index.d.ts` si los tipos viven ahí)
- Modificar: `src/renderer/src/Roster.svelte`
- Modificar: `src/renderer/src/locales/en.json` («Elige un contacto para hablar»)

**Interfaces:**
- Consume: `Settings.chats` (Tarea 1); `<Chat jid embedded />` (Tarea 2).
- Produce, en el preload:
  - `onChatShow(callback: (contact: string) => void): () => void`, que escucha `chat:show`;
  - `getShownChat(): Promise<string>`, que llama a `chat:shown`.

- [ ] **Paso 1: estado y helpers en `index.ts`**, junto a `chats` y `pending`:
  - `let shown = ''`: el contacto que se ve en el panel de la ventana principal.
  - `const together = (): boolean => settings.get().chats === 'together'`.
  - `function hostOf(contact: string): BrowserWindow | undefined`:
    - devuelve `chats.get(contact)`;
    - si no hay, y el modo es integrado, `shown === contact` y `mainWindow` es visible, devuelve `mainWindow`;
    - si no, `undefined`.
  - `function showInMain(contact: string): void`: pone `shown`, crea `pending` para el contacto nuevo (y borra el del anterior) y envía `chat:show` con el contacto a `mainWindow`.
  - `function fitMainWindow(): void`:
    - modo integrado con `account`: mínimo 720 × 0; si es más estrecha de 720, `setSize(900, max(alto, 620))`;
    - si no: mínimo 0 × 0; si es más ancha de 360, `setSize(360, alto)`.

- [ ] **Paso 2: `openChat(contact, focus)`** devuelve `BrowserWindow | null`. En modo integrado:
  - `setUnread(contact, 0)`;
  - `showInMain(contact)` si `shown !== contact`;
  - con `focus`, muestra la ventana principal, la restaura si estaba minimizada y la enfoca;
  - devuelve `mainWindow`.

  Si no, el comportamiento de ahora. Los cuatro llamantes (notificación de mensaje, notificación de conexión, `chat:open`, `deliver`) siguen valiendo; `deliver` cambia en el paso 3.

- [ ] **Paso 3: el reparto, a través de `hostOf`.**
  - `deliver()`:
    - `if (!chats.has(message.with))` pasa a `const win = hostOf(message.with); if (!win) { …no leído, como ahora… }`;
    - después usa ese `win` en lugar de `openChat(message.with, false)`. `deliver` nunca cambia `shown`.
  - `playWink()`: `hostOf(message.with)` en lugar de `chats.get(...)`.
  - `chat:ready`: la ventana es `hostOf(String(contact))`.
  - `onTyping`: `hostOf(contact)?.webContents.send('chat:typing', …)`.
  - `chat:shown`: `ipcMain.handle('chat:shown', () => (together() ? shown : ''))`.

- [ ] **Paso 4: los cambios de estado.**
  - En `signedIn`, tras poner `account`: `fitMainWindow()`.
  - En `auth:logout`, tras `account = ''`: `shown = ''` y `fitMainWindow()`.
  - En `settings:set`, si `valid.chats` cambia el valor:
    - cerrar todas las ventanas de `chats`;
    - `shown = ''` y enviar `chat:show` con `''` a `mainWindow`;
    - `fitMainWindow()`.

    Esto cubre el punto a vigilar 4.
  - En `createWindow`:
    - `mainWindow.on('hide', …)`: si hay `shown`, ponerlo a `''` y enviar `chat:show` con `''`, para que los mensajes vayan a no leídos con la ventana en la bandeja (punto 5);
    - `mainWindow.on('focus', () => mainWindow?.flashFrame(false))`.

- [ ] **Paso 5: preload.** `onChatShow` y `getShownChat`, con el mismo estilo que `onChatMessage` y `getUnread`.

- [ ] **Paso 6: `Roster.svelte`.**
  - Estado: `let shown = $state('')`. Al montarse, `window.api.getShownChat().then((c) => (shown = c))` y `onChatShow((c) => (shown = c))`, con su limpieza. Así el panel vuelve tras recargar por idioma (punto 1).
  - Con `prefs.chats === 'together'`, la raíz `.roster` pasa a dos columnas (`grid-template-columns: 300px minmax(0, 1fr)`): todo lo que tiene ahora (menú, cabecera, avisos, lista) en la primera; en la segunda, `{#key shown}<Chat jid={shown} embedded />{/key}` si hay `shown`, o un panel vacío con `_('Elige un contacto para hablar')`.
  - Entre las dos columnas, `border-left: 1px solid var(--line)`.
  - La fila del contacto `shown` lleva una clase `open`, marcada con `--row-hover-bg` y borde `--line`. Las no leídas siguen ganando.

- [ ] **Paso 7: traducción** del texto nuevo (`check:i18n -- --write`, `en.json`, `check:i18n`).

- [ ] **Paso 8: comprobar.** `npm run typecheck && npm run lint && npm run check:settings && npm run check:i18n`.

- [ ] **Paso 9: prueba manual con dos instancias.** Con `docker compose up -d`, `npm run dev`, y una segunda con `ELECTRON_RENDERER_URL=http://localhost:5173 npx electron . --user-data-dir="$HOME/.palique-ana"`. En A, Opciones → «En la ventana de contactos». Comprobar cada caso:
  1. La ventana se ensancha a 900 de ancho. Pulsar a B abre su conversación en el panel, y B queda marcado.
  2. B escribe: aparece en el panel. Con A en otra app, la ventana parpadea y sale la notificación.
  3. Con otro contacto abierto, B escribe: B en naranja con contador y sonido.
  4. Zumbido de B con su conversación abierta: se sacude la ventana principal.
  5. Guiño de B: a pantalla completa. Con «Mostrar los guiños a pantalla completa» desactivado, se ve sobre el panel y no sobre la lista.
  6. «Está escribiendo» de B solo con B abierto. A escribe y cambia de contacto: B deja de ver «escribiendo» (punto 2).
  7. Pulsar la notificación de un mensaje trae la ventana con esa conversación.
  8. Pulsar a B y que B escriba al instante: el mensaje aparece (punto 3).
  9. Cambiar el idioma con B abierto: el panel vuelve con B (punto 1).
  10. Volver a «En ventanas separadas» con B abierto: el panel desaparece y la ventana vuelve a 360. Un mensaje de B va a no leídos (punto 4).
  11. En integrado, abrir B y cerrar la ventana principal: un mensaje de B suma no leídos. Reabrir y pulsar B: el mensaje está (punto 5).
  12. Cerrar sesión: la pantalla de inicio de sesión vuelve a 360 de ancho.

- [ ] **Paso 10: commit** (solo con permiso).

```bash
git add src/main/index.ts src/preload src/renderer/src/Roster.svelte src/renderer/src/locales/en.json
git commit -m "feat(chat): conversations beside the contact list, as an option"
```

### Tarea 4: capturas y documentación

**Archivos:**
- Modificar: `scripts/screenshots/main.cjs` (una captura nueva)
- Modificar: `scripts/screenshots/preload.cjs` (`getShownChat` devuelve `'iker@localhost'` con `--chats=together`)
- Modificar: `AGENTS.md` (Architecture → App: «Windows»)
- Crear: `docs/images/integrada.png`

- [ ] **Paso 1: la captura.** En `SHOTS`, añadir `integrada: { hash: '', w: 900, h: 620, args: ['--chats=together'], run: BOTTOM }`. En la maqueta, `getShownChat` responde `'iker@localhost'` cuando `arg('chats') === 'together'`, y `''` si no.

- [ ] **Paso 2: generarla y mirarla.**
  - `SHOT=integrada npm run screenshots`.
  - Abrir `docs/images/integrada.png`: lista a la izquierda, conversación con Iker a la derecha y la fila de Iker marcada.
  - Repetir con `theme: 'warm'` y `'dark'` en una prueba local para revisar los tres temas; solo se guarda la de Claro.

- [ ] **Paso 3: AGENTS.md.** En «Windows», una frase: con «Conversaciones: en la ventana de contactos» (`chats: 'together'`), la conversación elegida se muestra a la derecha de la lista (`<Chat embedded>`). `shown` y `hostOf()` en `index.ts` deciden a qué ventana va cada mensaje.

- [ ] **Paso 4: comprobación final.** `npm run typecheck && npm run lint && npm run check:settings && npm run check:i18n && npm run check:emoticons`. Esperado: todo pasa.

- [ ] **Paso 5: commit** (solo con permiso).

```bash
git add scripts/screenshots AGENTS.md docs/images/integrada.png
git commit -m "docs: the conversations-beside-the-list option, with its screenshot"
```
