# Ventana integrada: conversaciones dentro de la ventana de contactos

Fecha: 2026-11-07. Estado: pendiente de revisión.

## Objetivo

Una opción para quien no quiera ventanas sueltas: la lista de contactos a la izquierda y la conversación elegida a la derecha, en la misma ventana. Las ventanas sueltas siguen siendo lo normal.

Decidido con el usuario:

- Una sola conversación cada vez en el panel; se cambia pulsando otro contacto (sin pestañas).
- Por defecto, ventanas sueltas. La ventana integrada se activa en Opciones.
- Montaje «A»: la vista de conversación que ya existe (`Chat.svelte`) se muestra dentro de la ventana principal, y `src/main/index.ts` decide a dónde va cada mensaje con una sola función. Descartado incrustar otra página (`WebContentsView`): habría que recolocarla a mano y taparía avisos de la lista.

## Comportamiento

### La opción

- Opciones → General: «Conversaciones», con «En ventanas separadas» (por defecto) y «En la ventana de contactos».
- Se aplica al momento, sin reiniciar:
  - A la ventana integrada: se cierran las ventanas de conversación abiertas. El historial no se pierde.
  - A ventanas sueltas: el panel desaparece.

### La ventana principal

- En modo integrado y con la sesión iniciada: unos 900 × 620, mínimo 720 de ancho. Lista a la izquierda (unos 300 px), conversación a la derecha.
- Al cerrar sesión o volver a ventanas sueltas: recupera su tamaño de ahora (360 de ancho, sin mínimo).
- La pantalla de inicio de sesión no cambia.

### Abrir conversaciones

- Pulsar un contacto, o «Enviar un mensaje» en su menú, muestra su conversación en el panel. El contacto abierto queda marcado en la lista.
- Pulsar una notificación trae la ventana principal al frente con esa conversación.
- Sin conversación elegida, el panel invita a elegir un contacto.

### Mensajes y avisos

| Qué llega | Del contacto abierto | De otro contacto |
|---|---|---|
| Mensaje | En el panel; si la ventana no está activa, parpadea y notificación | Naranja con contador, sonido y notificación (como hoy sin su ventana) |
| Zumbido | Sacude la ventana principal | Como un mensaje, sin sacudir |
| Guiño | Pantalla completa; dentro del panel si están puestos dentro de la conversación o en Wayland | Espera y se ve al abrir la conversación |
| «Está escribiendo» | Se ve | No se ve |

Al cambiar de contacto, el anterior deja de estar abierto: sus mensajes nuevos van a no leídos.

## Montaje

### Ajuste (`src/main/settings.ts`)

- `chats: 'windows' | 'together'`, por defecto `'windows'`, validado como los demás ajustes de lista (`validPatch`).
- Options lo muestra con sus textos dentro de `_()`.

### Dónde está abierta cada conversación (`src/main/index.ts`)

- `shown`: el contacto que se ve en el panel de la ventana principal ('' si ninguno).
- `hostOf(contact)`: la ventana que muestra esa conversación: su ventana suelta (`chats`), la principal si es `shown` en modo integrado, o ninguna.
- Pasan de `chats.get(...)` a `hostOf(...)`:
  - `deliver()`: con ventana, entrega a ella; sin ella, no leído en la lista. `deliver()` nunca cambia lo que se ve en el panel.
  - `playWink()` y `chat:ready` (los guiños, y los que esperaban).
  - `onTyping` («está escribiendo»).
  - El zumbido no cambia: `chat:shake` ya sacude la ventana que lo pide.
- `openChat(contact, focus)` en modo integrado no crea ventana:
  1. pone `shown`;
  2. borra los no leídos de ese contacto;
  3. envía `chat:show` a la ventana principal;
  4. con `focus`, la muestra y la trae al frente.

  La cola `pending` sigue igual: la conversación del panel llama a `chatReady` al montarse y recibe lo que esperaba.
- Al cerrar sesión o cambiar de modo, `shown` vuelve a '' y se cierran las ventanas sueltas.
- `fitMainWindow()` pone el tamaño y el mínimo de la ventana principal. Se llama al iniciar sesión, al cerrarla y al cambiar el ajuste.

### Preload

- `onChatShow(callback)`: escucha `chat:show`.

### Ventana principal (`src/renderer/src/Roster.svelte`)

- En modo integrado, dos columnas:
  - la lista, en unos 300 px;
  - `{#key shown}<Chat jid={shown} embedded />{/key}`, o el panel vacío.
- El contacto abierto se marca en la lista. Los no leídos siguen igual.
- Escucha `onChatShow` para saber cuál mostrar. Pulsar un contacto sigue llamando a `openChat`, y main decide.

### Conversación (`src/renderer/src/Chat.svelte`)

Nueva propiedad `embedded`:

- No cambia `document.title`.
- Ocupa la altura de su hueco, no `100vh`.
- La capa de guiños dentro de la conversación se queda dentro del panel (`position: absolute` sobre la conversación, no `fixed`).

Lo demás ya filtra por contacto: mensajes, «escribiendo», historial, guiños.

## Pruebas

- `check:settings`: el ajuste nuevo, sus valores válidos y que se rechazan los demás.
- `check:i18n` con los textos nuevos traducidos.
- `npm run typecheck` y `npm run lint`.
- A mano, con dos instancias (la segunda con `--user-data-dir`):
  - mensaje con su conversación abierta y con otra abierta;
  - zumbido;
  - guiño a pantalla completa y dentro;
  - «está escribiendo»;
  - pulsar una notificación;
  - cambiar de modo con ventanas abiertas y con el panel abierto;
  - cerrar sesión y volver a entrar.
- Capturas de la ventana integrada en los temas Claro, Cálido y Oscuro con el arnés de `scripts/screenshots/`.

## Fuera de alcance

- Pestañas o varias conversaciones a la vez en el panel.
- Recordar el tamaño de la ventana integrada entre sesiones.
- Arrastrar una conversación del panel a una ventana suelta.
