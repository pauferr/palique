# Palique

Cliente de mensajería de escritorio inspirado en MSN Messenger y AOL Instant Messenger (AIM). El objetivo es recuperar la emoción de recibir un mensaje a principios de los 2000: sonidos, zumbidos, animaciones y una estética que despierte nostalgia de los 90 y los 00, con un diseño minimalista pero entrañable.

> Estado: fase de ideas y planificación. Este documento se trasladará a skills / agent cuando el proyecto esté definido.

---

## 1. Plataformas

| Prioridad | Plataforma | Notas |
|-----------|------------|-------|
| Alta | Linux | Contemplar X11 y Wayland. |
| Alta | macOS | Entorno de desarrollo principal. |
| Baja | Windows | Futuro, no prioritario. |

### Entorno de desarrollo

- Desarrollo principal en **macOS**.
- Electron lleva Chromium en ambos sistemas: la UI y la lógica se comportan igual en macOS y Linux.
- Requiere validación específica en Linux: funciones de ventana (transparencia, siempre encima, clics pasantes), bandeja del sistema (GNOME no la tiene por defecto) y notificaciones.
- Pruebas en Linux: en el equipo Linux propio cuando esté disponible; mientras tanto, opcionalmente, VM con UTM (Ubuntu/Fedora con Wayland). La VM sirve para funcionalidad, no para medir rendimiento.
- Compilación de binarios Linux: GitHub Actions (más fiable que compilar para Linux desde macOS).
- La distribución (en cualquier plataforma) queda fuera de alcance por ahora; el foco es solo el desarrollo. Nota para cuando toque: distribuir en macOS requiere firma y notarización (cuenta de Apple Developer de pago).

## 2. Stack

**Decidido: Electron**

- Proceso principal: Node con TypeScript (ventanas, bandeja, conexión XMPP, SQLite).
- Frontend: **Svelte** con TypeScript, compilado con Vite (plantilla electron-vite). Poco código, buen rendimiento y transiciones/animaciones integradas, adecuado para una UI muy personalizada. Sin SvelteKit: no hace falta enrutado de servidor. Descartados: React (más verboso), Solid (comunidad más pequeña), JS/TS sin framework (no escala con la UI).
- Comunicación entre ventanas y proceso principal: IPC mediante preload + `contextBridge` (con `contextIsolation` activado).
- Empaquetado: electron-builder (AppImage en Linux, dmg en macOS, exe en Windows).

**Motivos de la elección**

- Todo el proyecto en TypeScript: perfil de desarrollo web, sin necesidad de aprender Rust.
- Mismo motor (Chromium) en Linux y macOS: lo que funciona en el Mac funciona igual en Linux. Sin dependencias como GStreamer para el audio.
- La estética retro (biseles, sprites, fuentes pixeladas, emoticonos animados) se resuelve mejor con CSS y canvas que con widgets nativos.
- APIs maduras para lo que pide Palique: ventanas transparentes, siempre encima y con clics pasantes, bandeja, notificaciones, `flashFrame`.
- Coste asumido: binarios de ~100 MB y más RAM. Aceptable para una app de chat.

**Alternativas descartadas**

- Tauri 2: binarios ligeros, pero todo lo que sale de la webview se hace en Rust, y el motor cambia según el sistema (WebKitGTK en Linux, WKWebView en macOS) justo en las funciones más delicadas (transparencia, superposición, audio).
- Flutter: UI personalizable, ecosistema de escritorio menos maduro.
- Qt/QML: rendimiento nativo, curva de aprendizaje mayor.
- GTK4/libadwaita: estética opuesta a la buscada y atado a Linux.

### Protocolo de mensajería

**Decidido: XMPP**

- Servidor: **Prosody** (libre, en Lua, ligero, configuración en un único archivo). Sin desarrollo propio de backend, solo configuración. Descartado ejabberd: pensado para millones de usuarios, más pesado y complejo de administrar. Si algún día Prosody se queda corto, se puede migrar sin tocar el cliente.
- Cubre de serie: cuentas, lista de contactos (roster), presencia, mensajes offline, historial.
- Zumbido: XEP-0224 *Attention*.
- Animaciones a pantalla completa y demás funciones exclusivas: extensiones propias de Palique, que solo interpretarán clientes Palique.
- Interoperabilidad: los usuarios pueden hablar con otros clientes XMPP (sin funciones exclusivas).
- Lógica XMPP: **en el proceso principal (Node)**, con xmpp.js.
  - Una única conexión para toda la app; las ventanas (lista de contactos, cada chat) no conectan por su cuenta: reciben eventos y envían acciones por IPC.
  - Encapsulada en un módulo propio con interfaz clara; el resto de la app no conoce la librería subyacente.
  - Desde Node hay sockets TCP, así que se usa la conexión XMPP estándar (puerto 5222 con STARTTLS). WebSocket en Prosody no es necesario, aunque puede quedar habilitado.
  - Mismo usuario en varios equipos: Message Carbons (XEP-0280) para que cada mensaje llegue a todos sus clientes conectados.

**Seguridad**

- TLS obligatorio cliente-servidor y servidor-servidor.
- Cifrado de extremo a extremo opcional mediante OMEMO (XEP-0384, basado en el Double Ratchet de Signal).
- Limitaciones: metadatos visibles para el servidor; las extensiones propias van sin cifrar salvo que se encapsulen en el contenido OMEMO.

**Costes**

- Desarrollo: 0 € (Prosody en local o en Docker).
- Producción: VPS pequeño (unos pocos €/mes) + dominio (~10 €/año). TLS gratis con Let's Encrypt.

**Alternativas descartadas**

- Servidor propio con WebSockets: mismo coste económico, mucho más trabajo (auth, presencia, cola offline, persistencia, cifrado).
- Matrix: más pesado de lo necesario.
- MTProto (Telegram): servidor cerrado, no se puede autoalojar; sin E2EE por defecto.

## 3. Funcionalidades clave

### Notificaciones con sonido
- Sonidos propios para mensaje entrante, contacto conectado, zumbido, etc.
- **Origen: provisionales libres para el prototipo y el MVP** (CC0 de Freesound o generados con sfxr/sintetizador). Los definitivos se encargan o se crean más adelante. Los sonidos originales de MSN/AIM no se pueden usar (son de Microsoft/AOL).

### Zumbidos
- Sonido + sacudida del contenido **dentro** de la ventana (funciona en cualquier entorno).
- Refuerzo con `flashFrame` de Electron: parpadeo en la barra de tareas (Linux) y rebote del icono en el dock (macOS).
- Límite por contacto (ver "Antispam"): un zumbido cada 10 segundos, al enviar y al recibir.
- Opcional a futuro: en X11, mover la ventana real como en el MSN original.
- Decisión: no se considera un problema que en Wayland la ventana no se desplace.

### Animaciones a pantalla completa
- Ventana transparente, siempre encima y que deje pasar los clics (`transparent`, `alwaysOnTop`, `setIgnoreMouseEvents`).
- macOS y X11: sin complicaciones.
- Wayland: los clientes Wayland nativos no pueden ponerse siempre encima en todos los compositores (GNOME no lo permite). Primero se forzó XWayland (`--ozone-platform=x11`), pero dejaba la app sin ventana donde no hay XWayland (niri) y tampoco se veía en KDE (issues #1 y #2). Decisión: Wayland nativo, y en Wayland el guiño se reproduce dentro de la ventana de la conversación en vez de a pantalla completa.
- Nombre en la app: "guiños" (como en MSN).
- **Transmisión: catálogo predefinido.** Las animaciones vienen incluidas en la app; el mensaje solo lleva un identificador (p. ej. `tarta-cumple`). Mensaje ligero, reproducción instantánea y contenido controlado.
- **Formato: dibujados en directo** (canvas y sonido sintetizado con Web Audio, `src/renderer/src/winks/`). Primero se usó vídeo WebM con canal alfa, pero a pantalla completa se veía borroso y pesaba megas; dibujados en el momento se ven nítidos a cualquier tamaño, pesan unos KB y el sonido respeta las opciones. Si algún día se trabaja con animadores, se puede volver a admitir vídeo junto a estos.
- Diseño extensible: el formato del mensaje debe permitir añadir packs descargables en el futuro sin cambios.
- Descartado (por ahora) contenido enviado por el usuario: riesgo de contenido desagradable o con destellos (epilepsia fotosensible), transferencia y validación de archivos, latencia.
- Protocolo: elemento propio `<wink xmlns="urn:palique:wink:0" id="…"/>` dentro de un mensaje de chat, con un texto alternativo en `<body>` para quien use otro cliente XMPP. El identificador se valida (`[a-z0-9-]`, máximo 64 caracteres); si no es válido, el mensaje se muestra como texto. Un identificador desconocido (p. ej. de un pack que no tienes) solo aparece en la conversación.
- Catálogo actual: doce guiños con personajes y emoticonos (ids en inglés, nombres en español: `bubble` es *Burbuja*). El primero de prueba, *Rebote* (`bounce`), está retirado.
- Protecciones obligatorias desde el MVP:
  - Opción para desactivar los guiños a pantalla completa (Opciones → Guiños). Desactivados, solo aparecen como texto en la conversación.
  - Límite por contacto (ver "Antispam"): un guiño cada 30 segundos, al enviar y al recibir.
  - Los guiños recibidos con retraso (mensajes offline) solo aparecen como texto.

### Antispam
Límites por contacto, aplicados en el proceso principal (no se saltan cerrando la ventana ni desde la consola), en `src/main/cooldown.ts`:

| Qué | Límite | Al pasarse |
|-----|--------|-----------|
| Guiños enviados y recibidos | 1 cada 30 s | Al enviar, el botón espera lo que falta. Al recibir, se descarta del todo (ni efecto ni texto). |
| Zumbidos enviados y recibidos | 1 cada 10 s | Igual que los guiños. |
| Notificaciones de mensajes | 1 cada 10 s | Los mensajes se ven todos; solo se ahorra la notificación. |
| Sonido de mensaje | 1 cada 1,5 s por conversación | Una ráfaga suena una vez. |
| "X se ha conectado" (notificación y sonido) | 1 cada 60 s | Conectarse y desconectarse en bucle se anuncia una vez. |

- El límite al recibir protege también de otros clientes XMPP, que no tienen ninguna espera.
- Zumbidos y guiños guardados por el servidor mientras estabas desconectado llegan sin efectos ni notificación, y con el mismo límite (una ráfaga se queda en uno).
- Todos los dispositivos de un contacto cuentan como uno. Los desconocidos no pueden escribir y las copias de mensajes propios (carbons) solo se aceptan de tu cuenta.
- Fuera del cliente: el spam de solicitudes desde muchas cuentas falsas se frena en el servidor (medidas contra el registro masivo, pendientes para producción).

### Bandeja y notificaciones
- Icono en la bandeja con menú (Abrir Palique / Salir). Cerrar la lista de contactos no cierra la app: sigue conectada y avisando.
- Una sola instancia por usuario: abrir Palique otra vez muestra la ventana existente. Es la forma de volver en escritorios sin bandeja (GNOME por defecto).
- Notificaciones de escritorio: mensaje, zumbido o guiño cuando la conversación no está en primer plano (al pulsarla se abre el chat) y "X se ha conectado" con su sonido. No se muestran en estado Ocupado, ni para los avisos que llegan en bloque al iniciar sesión o para mensajes offline.

### Estado Invisible
- Prosody no trae invisibilidad de serie (y `mod_privacy_lists` está obsoleto), así que Palique incluye un módulo propio: `server/modules/mod_palique_invisible.lua`, una versión mínima de XEP-0186 (Invisible Command).
- Invisible, la sesión sigue disponible para el servidor (recibes mensajes y ves a tus contactos), pero ninguna presencia "disponible" tuya llega a nadie: ni anuncios ni respuestas cuando alguien pregunta. Al pasar a invisible, tus contactos te ven desconectarte.
- La app recuerda tu último estado e inicia sesión con él, así que entrando invisible nunca apareces conectado ni un instante.
- Limitación: mientras eres invisible no se envía tampoco presencia dirigida. Y si escribes a alguien, sabrá que estás ahí (igual que en MSN).
- Un servidor XMPP sin este módulo rechaza el estado: la app avisa y no cambia de estado.

### Emoticonos
- Atajos clásicos de MSN (`:)`, `:D`, `;)`, `:P`, `:(`, `(L)`, `(Y)`, `(H)`, `(F)`…), sin distinguir mayúsculas, mostrados como emoji en mensajes y mensajes personales.
- Solo cambia cómo se pinta: el texto enviado no se modifica, así que otros clientes XMPP siguen viendo `:)`.
- Selector en la ventana de chat que inserta el atajo donde está el cursor.
- Provisional: emoji del sistema. Cada tema podrá sustituirlos por sus propias imágenes.

### Avatares
- XEP-0084: la imagen se publica en el PEP del usuario (solo la ven sus contactos). Al cambiarla se reenvía la presencia, y Prosody (`mod_vcard_legacy`) añade el hash para que los contactos la descarguen al momento.
- Se elige pulsando tu avatar en la lista de contactos; la app la recorta al centro y la reduce a 96×96 PNG.
- Solo se aceptan PNG, JPEG, GIF o WebP de hasta 100 KB (vienen de la red).
- El marco del avatar muestra el estado (verde, amarillo, rojo, gris), como en MSN.
- Avatar por defecto provisional: inicial sobre un color sacado del nombre. Los personajes del elenco lo sustituirán cuando estén ilustrados.

### Registro y autenticación

**Decidido: la cuenta es el correo electrónico. Registro solo con invitación por correo.**

- Se entra con **correo y contraseña**. Cada cuenta tiene un **nombre visible** (lo elige al registrarse y lo cambia cuando quiera) y es lo único que ven sus contactos: el correo nunca se les muestra.
- Por dentro, cada cuenta tiene un JID aleatorio y fijo (`k3f9x2ab7q@dominio`). Solo el servicio de cuentas sabe qué correo va con qué JID. Así el correo se puede cambiar sin tocar contactos, historial ni avatar, y no se filtra a nadie.
- El nombre visible es XEP-0172: se publica en PEP (lo leen los contactos, como el avatar) y viaja en cada presencia y en las solicitudes de amistad, para que se vea antes de aceptar.
- Iniciar sesión: la app pregunta al servicio de cuentas (HTTP) qué JID corresponde al correo y entra con él (SASL normal). A un correo sin cuenta le responde un JID inventado y siempre el mismo, así que falla igual que una contraseña mal escrita y no se sabe si la cuenta existe. Limitado por IP.
- Registro desde el cliente mediante XEP-0077 (*In-Band Registration*). Requisito de diseño: encapsular la autenticación en el cliente para poder añadir otros métodos sin rehacer el flujo.

**Invitaciones** (también es la principal medida contra el registro masivo):
- Solo por correo. Sin invitación no se puede crear cuenta (`registration_invite_only` en Prosody, XEP-0401).
- Al invitar, el servicio de cuentas elige el JID de la futura cuenta y pide a Prosody una invitación que solo puede crear esa cuenta (módulo propio en `server/modules/`). El correo trae un botón que abre Palique (`palique://signup?t=…`) y el código escrito. Caduca a la semana.
- Como la invitación llegó a ese correo, la cuenta nace con el correo verificado. Al registrarse se elige el nombre visible y la contraseña; el correo no se escribe.
- Los primeros usuarios los invita el administrador (`docker compose exec accounts node src/invite.ts correo`, sin límite). Cada usuario puede invitar a **3 personas**; las invitaciones que caducan sin usarse vuelven a contar. Más adelante se abrirá el registro.
- Quien entra con una invitación queda añadido automáticamente como contacto de quien le invitó, en los dos sentidos.
- Invitar es siempre una acción explícita, con confirmación. Contra el spam:
  - Una dirección recibe como mucho una invitación por semana, aunque la pidan personas distintas.
  - Cada correo de invitación lleva "No quiero recibir más invitaciones"; esas direcciones no vuelven a recibir ninguna.
  - Si la dirección ya tiene cuenta, la app lo dice y propone añadirla como contacto.

**Añadir contactos:** por correo. El servicio de cuentas dice qué JID tiene ese correo y la app envía la solicitud de amistad normal. Si nadie lo tiene, la app lo dice y ofrece enviar una invitación (no se envía sola). Quien conoce tu correo puede saber si estás en Palique, como en otras apps de mensajería; la búsqueda solo la hacen usuarios con sesión y está limitada. Las solicitudes siempre se aceptan o rechazan; la única excepción es la invitación usada (ambos han dado su consentimiento).

**Correo electrónico:**
- Usos: iniciar sesión, recuperar la contraseña y, si el usuario lo acepta, recibir el boletín de novedades.
- Es único: no puede haber dos cuentas con el mismo correo.
- Cambiarlo (en Opciones) envía un enlace a la dirección nueva; hasta que se abre, se sigue entrando con la antigua. Si la nueva ya es de otra cuenta, la app responde lo mismo y a ese buzón le llega un aviso.
- Lo gestiona un servicio propio, el **servicio de cuentas** (`server/accounts/`, TypeScript, en Docker junto a Prosody, con su propio SQLite):
  - Se conecta a Prosody como componente XMPP (XEP-0114). Con sesión, la app le habla por la conexión XMPP, así el servidor garantiza de qué cuenta viene (por HTTP cualquiera podría cambiar el correo de una cuenta ajena y robarla con la recuperación).
  - Envía los correos de invitación, de cambio de correo y de recuperación.
  - Recuperación de contraseña, sin páginas web (por ahora):
    - En la pantalla de inicio de sesión, "¿Olvidaste tu contraseña?" pide el correo. La app lo envía al servicio por HTTP (con la sesión cerrada no hay conexión XMPP autenticada). El servicio responde siempre lo mismo, para no revelar si la cuenta existe, y limita las peticiones.
    - Si el correo es de una cuenta, el servicio pide a Prosody un código de restablecimiento de un solo uso, que caduca en una hora (invitación de restablecimiento de `mod_invites`), y lo envía por correo.
    - El correo trae un botón que abre Palique (`palique://reset?…`, registrado como protocolo de la app) y también el código escrito, porque algunos programas de correo no dejan pulsar enlaces que no sean web.
    - La app usa el código igual que una invitación (XEP-0401) para poner la nueva contraseña. No hace falta una cuenta de administrador.
- Desarrollo: los correos se capturan con Mailpit (buzón falso en Docker con página web); no sale ningún correo real.

**Boletín de novedades:**
- Consentimiento explícito y separado al registrarse (casilla sin marcar por defecto), modificable en Opciones. Cada envío lleva enlace de baja.
- Plataforma: **Brevo** (empresa europea, pensada para el RGPD). Brevo envía también los correos de verificación y recuperación en producción (SMTP).
- El servicio de cuentas guarda la elección y la fecha del consentimiento, y la sincroniza con una lista de Brevo (todas las direcciones están verificadas: la invitación o el cambio de correo llegaron a ellas): al cambiar la preferencia en Opciones y al cambiar de dirección (la antigua sale de la lista).
- Cada boletín lleva el enlace de baja de Brevo. Un *webhook* de Brevo (bajas, rebotes graves, spam), protegido con un código secreto, desmarca el boletín en Palique y la app se entera al momento.
- Preparado sin cuenta de Brevo: sin clave, las elecciones se guardan sin sincronizar, y `src/sync-brevo.ts` pone la lista al día cuando se añade la clave. Pasos en AGENTS.md.

### Almacenamiento de datos

### Almacenamiento de datos

**Decidido: historial de chat solo en local.**

- En el servidor (lo que XMPP ya guarda por defecto): cuenta, lista de contactos, perfil (avatar, nombre, mensaje personal) y mensajes offline hasta que se entregan.
- En el servicio de cuentas: correo (y a qué JID corresponde), si acepta el boletín, e invitaciones enviadas.
- En el servidor NO se archivan conversaciones: `mod_mam` desactivado en Prosody. Argumento de privacidad comunicable al usuario.
- En local: historial de chats (SQLite con el módulo `node:sqlite` que trae Electron, sin módulos nativos que recompilar; archivo `history.sqlite` en la carpeta de datos de la app) y preferencias de la app (sonidos, tema, opciones de guiños).
- Cada conversación carga sus últimos 200 mensajes. Si varias personas usan Palique en el mismo equipo, cada cuenta tiene su propio historial.
- Asumido: si el usuario formatea o cambia de equipo, pierde el historial. Son conversaciones casuales.
- Aviso al usuario: en primer arranque o en la sección de historial de Opciones, indicar que el historial solo vive en este equipo.
  - Nota: en Linux, desinstalar un paquete normalmente no borra los datos de usuario (`~/.local/share`), así que el riesgo real es formatear o cambiar de equipo, no desinstalar.
- Exportación de chats desde Opciones. Formatos propuestos: HTML (legible, con estilo Palique), texto plano y JSON (para reimportar en el futuro).

## 4. Alcance del MVP

**Incluido**
- Registro e inicio de sesión con usuario y contraseña desde la app. Icono en la bandeja del sistema.
- Lista de contactos: añadir, aceptar y eliminar.
- Estados: Conectado, Ausente, Ocupado, Invisible. Mensaje personal bajo el nombre.
- Avatar de usuario (XEP-0084).
- Chat uno a uno, cada conversación en su propia ventana.
- Indicador de "está escribiendo..." (XEP-0085).
- Sonidos: mensaje entrante, contacto que se conecta, zumbido.
- Zumbidos (XEP-0224).
- Guiños: catálogo inicial de 3 a 5 animaciones.
- Emoticonos básicos.
- Notificaciones de escritorio.
- Historial local con exportación (HTML, texto, JSON).

**Excluido del MVP** → ver hoja de ruta (sección 5).

Criterio: el MVP debe transmitir la sensación buscada (sonidos, zumbidos, guiños, ventanas) sin abordar lo que más complejidad técnica añade.

## 5. Hoja de ruta (post-MVP)

Ideas aprobadas para versiones posteriores. El orden dentro de cada bloque no es definitivo.

**Siguientes versiones**
- Cifrado de extremo a extremo (OMEMO, XEP-0384).
- Conversaciones en grupo.
- Envío de archivos.
- Historial sincronizado entre dispositivos (XEP-0313).
- Packs de guiños descargables.
- Temas adicionales ("sabores") y sus packs de sonidos.
- Inicio de sesión con Google u otros proveedores (opcional, sin compromiso). Requiere un pequeño servicio de autenticación intermedio entre el proveedor y Prosody.
- Soporte para Windows.

**Más adelante**
- Voz y vídeo.

**Lo último de lo último: integraciones con otras apps**
- "Escuchando ahora": mostrar bajo el nombre la canción que suena (Spotify u otro reproductor).
  - Linux: MPRIS vía D-Bus. Funciona con Spotify de escritorio y con casi cualquier reproductor (VLC, Rhythmbox, navegadores) sin usar la API de Spotify.
  - Windows: System Media Transport Controls.
  - macOS: sin API pública equivalente; requiere investigación.
  - Difusión a contactos: XEP-0118 *User Tune*.
- Otras integraciones similares por definir.

## 6. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Efecto red: nadie con quien hablar | Alto | Definir los primeros usuarios (grupo de amigos). Interoperabilidad XMPP para hablar con quien ya use otro cliente. |
| Animaciones a pantalla completa en Wayland | Alto | Forzar XWayland rompía niri y KDE. Aplicado el fallback: en Wayland, animación dentro de la ventana de la conversación. |
| Desarrollo en macOS sin equipo Linux disponible | Alto | Validar en Linux (equipo propio o VM) en cuanto sea posible, empezando por los guiños. No dar por buena ninguna función de ventana probada solo en macOS. |
| Zumbido sin mover ventana en Wayland | Bajo | Aceptado. Sacudida interna + aviso en barra de tareas. |

## 7. Decisiones

- [x] **Protocolo de mensajería** → XMPP (ver sección 2).
- [x] **Framework de escritorio** → Electron; sustituye a Tauri por perfil web y paridad Linux/macOS (ver sección 2).
- [x] **Framework de frontend** → Svelte + TypeScript (ver sección 2).
- [x] **Ubicación de la lógica XMPP** → proceso principal de Electron, una conexión compartida por IPC (ver sección 2).
- [x] **Servidor XMPP** → Prosody (ver sección 2).
- [x] **Transmisión de animaciones** → catálogo predefinido, extensible con packs (ver sección 3).
- [x] **Formato de los guiños** → WebM VP9 con alfa y sonido incluido (ver sección 3).
- [x] **Sonidos** → provisionales libres (CC0 / generados) hasta tener los definitivos (ver sección 3).
- [x] **Alcance del MVP** → ver sección 4.
- [x] **Historial de chat** → solo local, con aviso y exportación (ver sección 3).
- [x] **Registro y autenticación** → usuario y contraseña desde la app (XEP-0077); Google y otros proveedores en la hoja de ruta (ver sección 3).
- [~] **Nombre "Palique"** → búsqueda web (oct. 2026) sin coincidencias de apps o proyectos de mensajería con ese nombre. Pendiente: consulta formal en EUIPO y OEPM (clases 9 y 38) y disponibilidad de dominio/usuario en GitHub. Posible debilidad: "palique" significa "charla" en español, lo que podría considerarse descriptivo para una app de chat a efectos de registro de marca.

## 8. Diseño y sensaciones (por desarrollar)

- Referencias: MSN Messenger, AIM, interfaces de Windows 98/XP.
- Principio: minimalista pero entrañable. Nostalgia sin caer en copia literal.
- **Temas seleccionables por el usuario ("sabores"):**
  - **XP / MSN 7, "Caramelo" (tema por defecto):** glossy, azules intensos, botones tipo caramelo. Tipografía Noto Sans. `src/renderer/src/themes/xp.css`.
  - **Win98 / AIM, "Clásico":** gris #c0c0c0, azul marino, biseles 3D (botones en relieve, campos y paneles hundidos, cuadros de grupo tallados), esquinas rectas. Tipografía IBM Plex Sans (se descartaron las pixeladas por legibilidad). `src/renderer/src/themes/win98.css`.
  - **Frutiger Aero, "Cristal":** fondo degradado de cielo a hierba, paneles de cristal translúcido redondeados, botones aguamarina brillantes y avatares circulares. Tipografía Hind (sin cursiva propia: se inclina de forma sintética). `src/renderer/src/themes/aero.css`.
  - Descartado: moderno limpio con guiños retro.
- Tipografías libres (OFL) incluidas en la app (alfabeto latino): Noto Sans (Caramelo), IBM Plex Sans (Clásico) y Hind (Cristal). Las fuentes de Windows (Tahoma, Segoe UI, MS Sans Serif) son de Microsoft y no se pueden distribuir.
- Estructura: `themes/base.css` define el aspecto común solo con variables; cada tema da valores a esas variables (`:root[data-theme="…"]`). El tema se elige en Opciones, se guarda en las preferencias y se aplica al momento en todas las ventanas.
- En la interfaz los temas tienen nombres propios ("Caramelo", "Clásico", "Cristal"), sin marcas reales.
- Avatares por defecto: inicial sobre una paleta fija de 8 colores vivos definida por el tema; cada usuario siempre tiene el mismo color. Un borde blanco separa la imagen del marco de estado.
- Las ventanas usan el marco del sistema operativo; imitar la barra de título de XP queda descartado por ahora (coste alto y distinto por sistema).
- Arquitectura de temas desde el MVP: variables CSS (design tokens) + hoja de estilos por tema. Los temas pueden cambiar también forma (biseles, radios, sombras), no solo colores.
- Idea: cada tema con su propio pack de sonidos.
- Alcance: los tres temas (Caramelo, Clásico y Cristal) están hechos y se eligen en Opciones.
- Limitación técnica: el desenfoque real de lo que hay detrás de la ventana (Frutiger Aero) no está disponible de forma general en Linux; se simula con translucidez sobre fondo propio.
- **Personajes: elenco de varios personajes propios, sin mascota única.**
  - Estilo de referencia: caricatura de finales de los 90 (línea gruesa y temblorosa, bocas enormes, proporciones exageradas, colores planos).
  - Usos: avatares predeterminados asignados al azar al registrarse, pantalla de login, sección de noticias y otras vistas.
  - Requisito legal: el estilo puede servir de inspiración, pero cada personaje debe ser original. El prototipo actual reproduce personajes reconocibles de una serie existente y **no puede usarse**; sirve solo como referencia de ambiente.
  - Producción: preferible ilustrador humano (coherencia entre personajes y titularidad clara de los derechos). Si se usa generación por IA, revisar cada resultado: tiende a reproducir personajes existentes cuando se le pide un estilo concreto, y la protección legal de lo generado es incierta.
  - Ambientación: barrio español de principios de los 2000 (refuerza la originalidad y encaja con el nombre).
  - Guía de estilo base: línea negra gruesa e irregular, cabezas grandes sobre cuerpos flacos, colores planos algo apagados, sin sombreados, fondos pastel. Cada personaje con un color firma (fondo de avatar / acento de interfaz).
  - Expresiones por estado: cada personaje con variantes para Conectado, Ausente, Ocupado, etc. El avatar reacciona al estado del usuario.
  - Norma: ninguna marca, logo o producto real (ni imitaciones parecidas). Solo marcas inventadas.

#### Elenco (propuesta v1)

| Personaje | Rollo | Rasgos visuales |
|-----------|-------|-----------------|
| Tere "la Radio" | Se entera de todo y lo cuenta todo. | Dos moños enormes, aparato de dientes con gomas de colores, auriculares de discman al cuello. |
| Nacho Pulgares | Pegado al móvil. | Rapado con cresta de gel, móvil-ladrillo genérico, pulgares enormes. |
| Lolo | Grandullón buenazo. | Chándal de táctel enorme, bocata de chocolate, mofletes colorados. |
| Abuela Fina | Recién llegada al chat, manda zumbidos sin parar. | Gafas de culo de vaso, rulos, bolso sin fondo. |
| Yeray | Se cae siempre, se levanta siempre. | Rizos en nube, tirita en la nariz, monopatín sin una rueda. |
| Iratxe | La inventora. | Gafotas, pelo verde teñido a medias, mochila llena de chapas, destornillador en la oreja. |
| Rubén | Eternamente "Ausente". | Ojeras enormes, pijama de dinosaurios, almohada bajo el brazo. |
| Chusa | La dramática; escribe "AsÍ dE rArO". | Flequillo que tapa medio rostro, raya de ojos negra. |
| Fermín | El nuevo, tímido. | Pelirrojo peinado con saliva, chaqueta de la comunión. |
| Yóni | El cani del barrio: chulito por fuera, buenazo por dentro. Escribe con "k" y "xD". | Pelo engominado hacia delante, pendiente de brillante, cadena dorada, chaqueta acolchada brillante de colores chillones con el logo de una marca de mercadillo inventada (p. ej. una cucaracha: "Kukaracha"). |
| Rulo | Gato callejero del barrio. Para guiños y pantallas vacías. | Cascabel roto, oreja mordida. |

  - Pendiente: validar el elenco, número de avatares iniciales y encargo de ilustraciones.
- Pendiente: iconografía, sonidos definitivos y tono de los textos de la interfaz.

## 9. Próximos pasos

1. Crear el repositorio privado en GitHub y subir este documento (`docs/palique.md`).
2. Configurar el proyecto Electron + Svelte (electron-vite) en macOS y GitHub Actions para compilar en Linux.
3. Montar Prosody en local (o Docker).
4. Prototipo de guiños: ventana transparente a pantalla completa + sonido.
5. Validar el prototipo en Linux (equipo propio o VM), incluido GNOME con XWayland.
6. Esqueleto andante: login, lista de contactos, chat uno a uno y zumbido, de punta a punta. El resto del MVP se añade encima.
7. Diseño: elegir tema por defecto, paleta y tipografías; encargar las ilustraciones del elenco (sin bloquear el desarrollo: avatares provisionales mientras tanto).
