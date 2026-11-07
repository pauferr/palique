# Grupos

Fecha: 2026-11-07. Estado: pendiente de revisión.
Segunda de dos partes; depende del cifrado ([2026-11-07-cifrado-design.md](2026-11-07-cifrado-design.md)). Salen juntas en la misma versión.

## Objetivo

Conversaciones con varios amigos. Cada miembro puede añadir a cualquiera de sus contactos, y en un grupo puede haber gente que no se tiene como contacto. Hay administradores, que cambian el nombre y la foto del grupo. Todo cifrado de extremo a extremo.

La interfaz es la de la maqueta aprobada: <https://claude.ai/artifact/CF8QkuxpnKLmf73sRhoHTU>.

## Comportamiento

### Crear y añadir

- «Contactos → Nuevo grupo…» o «+ Nuevo» en la lista abre la ventana «Nuevo grupo»:
  - nombre (hasta 40 caracteres);
  - tus contactos para marcar, con los elegidos como etiquetas con ×;
  - el mosaico se va formando con sus caras;
  - «Crear grupo», activo con nombre y al menos un amigo.
- Quien lo crea es su administrador. Los elegidos entran como miembros.
- Cualquier miembro puede añadir a sus contactos que aún no estén: «Añadir amigos» en Miembros.

### La lista

- Sección «Grupos (n)», con «+ Nuevo», encima de «En línea».
- Cada grupo muestra su foto (o el mosaico de hasta cuatro caras, en marco de cielo, sin color de estado), el nombre y quién está («Iker, Nerea y 3 más»).
- Con mensajes sin leer, naranja y contador, como un contacto.
- La búsqueda encuentra contactos y grupos.

### La conversación

- Funciona igual en ventana suelta y en la ventana integrada.
- **Cabecera:** foto o mosaico, nombre, caras de los miembros, «{n} personas» y el botón «Miembros». Para los administradores, la foto lleva un lápiz y abre «Nombre y foto del grupo».
- **Mensajes:** cada «dice:» lleva la mini foto y el nombre con sus colores de quien escribe. Los seguidos de la misma persona se agrupan.
- **Guiños sí, zumbido no.**
- **Avisos del grupo** como líneas de sistema:
  - creación;
  - quién añade a quién;
  - quién sale y a quién quitan;
  - cambios de nombre y de foto;
  - nombramientos de administrador.
- «Está escribiendo» con el nombre de quien escribe.

### Miembros

- Panel a la derecha:
  - cada miembro con su foto (la inicial si no es contacto tuyo), su nombre, la etiqueta «Admin» si lo es, y «Tu contacto» o «No es tu contacto»;
  - para los segundos, «Añadir como contacto»;
  - abajo, «Añadir amigos», «Cambiar nombre y foto» (solo administradores) y «Salir del grupo».
- Para los administradores, «⋯» en cada miembro: «Hacer administrador» / «Quitar como administrador» y «Quitar del grupo».
- Quien no es administrador ve quién puede cambiar el nombre y la foto.
- Nunca se muestran correos ni direcciones internas.

### Administradores

- Cambian el nombre y la foto (subir imagen o volver al mosaico), quitan a alguien y nombran o quitan administradores. Pueden quitar a otro administrador.
- Si el último administrador se va o lo quitan, pasa a serlo el miembro más antiguo.

### Salir y que te quiten

- «Salir del grupo» lo quita de tu lista en todos tus dispositivos.
- Si te quitan, el grupo desaparece de tu lista con un aviso.

### Archivo

- La sala guarda los mensajes cifrados 7 días, para que quien estaba desconectado los reciba al volver.
- Como no hay historial local, lo que ves es lo de esta sesión más lo recibido del archivo.

## Montaje

### Prosody (`server/prosody.cfg.lua` y `deploy/prosody.cfg.lua`)

Componente `groups.<dominio>` de tipo `muc`, con:
- `restrict_room_creation = "local"`;
- `muc_room_default_public = false`;
- `muc_room_default_members_only = true`;
- `muc_room_default_persistent = true`;
- `muc_room_default_whois = "anyone"` (OMEMO necesita las direcciones reales; la app nunca las muestra);
- `muc_room_default_allow_member_invites = true`;
- `muc_room_default_changesubject = false`;
- `muc_mam` con caducidad de 7 días (`muc_log_expires_after = "1w"`, `muc_log_by_default = true`).

**`mod_palique_groups`** (nuevo módulo propio, Lua):
- relevo del último administrador al miembro más antiguo;
- la foto del grupo, si Prosody 13 no trae foto de sala (XEP-0486). **Primer paso del plan: comprobarlo.**

### Roles

Afiliaciones XMPP:
- propietario (quien crea);
- administrador;
- miembro.

En la interfaz, propietario y administrador son «Admin».

### Mis grupos

- Marcadores de salas en PEP (XEP-0402, `urn:xmpp:bookmarks:1`), con entrada automática.
- Al iniciar sesión, la app entra en cada sala y pide al archivo lo que no tiene.
- La dirección de cada sala es aleatoria, como la de las cuentas.

### Nombres dentro de la sala

- Apodo de sala = localparte de la dirección interna: único y nunca mostrado.
- El nombre visible va en `<nick xmlns='http://jabber.org/protocol/nick'>` en cada mensaje y presencia de sala.
- Las fotos de no-contactos no se piden: la inicial.

### `src/main/xmpp.ts`

- Crear la sala, configurarla, invitar (invitación mediada), entrar y salir, afiliaciones, nombre y foto.
- Mensajes `groupchat` cifrados con OMEMO para todos los dispositivos de todos los miembros, con `omemo.ts`.
- Las salas y los miembros van en el `Snapshot`, junto a los contactos.
- Los mensajes de sala no pasan por el filtro de desconocidos de las conversaciones de dos: solo los miembros pueden escribir.

### `src/main/index.ts`

- Los grupos usan la misma maquinaria que las conversaciones: `openChat` / `hostOf`, los no leídos y la memoria de la sesión, con la dirección de la sala como clave.
- IPC nuevo para crear, añadir, quitar, administradores, nombre y foto, y salir.

### Interfaz

- `GroupAvatar.svelte`: mosaico o foto.
- `NewGroup.svelte`: ventana `#newgroup`.
- `GroupMembers.svelte`: panel de miembros y hoja «Añadir amigos».
- Modo grupo en `Chat.svelte`: cabecera, «dice:» con foto, sin zumbido, avisos y botón «Miembros».
- Sección «Grupos» en `Roster.svelte` y «Nuevo grupo…» en el menú Contactos.

### Documentación

- AGENTS.md: grupos, componente, módulo y protocolos (XEP-0045, XEP-0313 en salas, XEP-0402, XEP-0249).
- `docs/deployment.md`: el componente nuevo.

## Pruebas

**`check:groups`** (nuevo, con servidor):
- crear un grupo con dos amigos;
- un miembro invita a un contacto suyo que no lo es de los demás;
- todos ven el nombre visible de todos y ninguna respuesta lleva correos;
- solo un administrador cambia el nombre y la foto, quita a alguien y nombra administradores;
- salir;
- relevo cuando se va el último administrador;
- un miembro desconectado recibe del archivo al volver;
- el servidor solo ve mensajes cifrados;
- un no-miembro no puede escribir ni leer.

**A mano**, con tres instancias:
- la lista con grupos;
- «Nuevo grupo»;
- la conversación en ventana suelta y en la integrada;
- el panel de miembros y el menú «⋯»;
- nombre y foto;
- salir y que te quiten;
- capturas para el README.

## Fuera de alcance

- Fotos de perfil visibles para quien no es contacto.
- Grupos de más de 50 personas.
- Zumbido en grupos.
- Silenciar un grupo.
- Grupos públicos o con enlace de invitación.
