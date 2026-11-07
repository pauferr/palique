# Cifrado de extremo a extremo (OMEMO) y fin del historial local

Fecha: 2026-11-07. Estado: pendiente de revisión.
Primera de dos partes; la segunda son los grupos ([2026-11-07-grupos-design.md](2026-11-07-grupos-design.md)). Salen juntas en la misma versión.

## Objetivo

Que el servidor reparta y guarde mensajes que no puede leer, en las conversaciones de dos y en los grupos, y que nada de lo hablado quede guardado en el ordenador.

Decidido con el usuario:

- Se cifra todo: conversaciones de dos y grupos.
- Protocolo **OMEMO** (XEP-0384, versión 0.3, espacio `eu.siacs.conversations.axolotl`), el de Conversations, Gajim o Monal.
- Librería `@privacyresearch/libsignal-protocol-typescript` (GPL-3.0-only), con versión exacta fijada. Se amplía la regla de licencias de AGENTS.md para admitir GPL-3.0 y AGPL-3.0; mientras se use, la app en conjunto queda en AGPL-3.0 (sin «o posterior»).
- Confianza: **se acepta la primera vez y se avisa de los cambios**; verificación opcional comparando códigos.
- Transición: se exige la versión nueva (`MIN_APP_VERSION`) y Palique solo envía cifrado. Lo que llegue sin cifrar se muestra marcado.
- **Sin historial en el ordenador.**

## Qué queda protegido

| | ¿Lo puede leer el servidor? |
|---|---|
| Texto de los mensajes (de dos y de grupo) | No |
| Mensajes guardados para quien está desconectado, archivo de 7 días de los grupos | No, se guardan cifrados |
| Quién habla con quién, cuándo, quién está en cada grupo | Sí (inevitable en XMPP; las direcciones internas son aleatorias, no correos) |
| Nombre y foto de cada usuario y de cada grupo | Sí |
| Qué guiño se envía, zumbidos, «está escribiendo» | Sí (señales, no texto; cifrarlas rompería la compatibilidad OMEMO) |

- Un dispositivo nuevo no puede leer mensajes anteriores a él.
- Un mensaje se descifra una sola vez por dispositivo: la copia del servidor sirve para entregarlo, no para volver a leerlo.

## Comportamiento

### Enviar y recibir

- Cada mensaje se cifra para todos los dispositivos del destinatario y para los demás dispositivos propios (copias de carbons).
- Lleva un `<body>` de reserva, «Mensaje cifrado con OMEMO» (traducido), y la pista de guardado (`<store xmlns='urn:xmpp:hints'/>`) para que el servidor lo guarde si el destinatario está desconectado.
- Al recibirlo se descifra y se muestra como siempre.
- Si no se puede descifrar, la conversación muestra «No se ha podido descifrar este mensaje». El fallo va a `palique.log` sin contenido.
- Si el contacto no tiene ningún dispositivo con OMEMO, no se envía. La conversación avisa: «{name} tiene que actualizar Palique para recibir mensajes cifrados».
- Un mensaje que llega sin `<encrypted>` se muestra con la marca «Este mensaje no está cifrado».
- Guiños, zumbidos y «está escribiendo» siguen como ahora.

### Dispositivos y claves

- Cada instalación de Palique es un dispositivo: un número aleatorio de 31 bits y un par de claves de identidad.
- Al iniciar sesión, la app asegura en el servidor (PEP, acceso **abierto**):
  - su lista de dispositivos (`eu.siacs.conversations.axolotl.devicelist`), con su número dentro;
  - su paquete de claves públicas (`eu.siacs.conversations.axolotl.bundles:<id>`): identidad, clave firmada y 100 claves de un solo uso.

  Acceso abierto, porque los miembros de un grupo que no son contactos tienen que poder cifrar para ti.
- Por debajo de 25 claves de un solo uso, se generan y publican más. La clave firmada se renueva cada 30 días; la anterior se conserva otros 30 para mensajes en camino.
- Las listas de dispositivos de los demás se piden al necesitarlas, se guardan en memoria y se actualizan con las notificaciones de PEP (`+notify`).

### Confianza

- El primer dispositivo visto de cada contacto se acepta solo, y se guarda su clave de identidad.
- Un dispositivo nuevo de un contacto ya conocido deja en la conversación el aviso «{name} ha empezado a usar Palique en otro dispositivo».
- Si un dispositivo conocido aparece con otra clave de identidad: «La clave de cifrado de {name} ha cambiado».
- «Verificar cifrado…», en el menú de la conversación, abre una ventana con tu código y los de los dispositivos del contacto, en grupos de cifras, para compararlos en persona o por teléfono. «Marcar como verificado» pone un sello en la cabecera.
- Si cambia la clave de un dispositivo verificado, no se le envía nada hasta pulsar «Aceptar la clave nueva» en la barra de la conversación. Es el único caso que bloquea.

### Sin historial en el ordenador

- Nada de lo hablado se escribe en disco.
- Mientras Palique esté abierto, cada conversación se recuerda en memoria: cerrarla y abrirla en la misma sesión la muestra igual. Al cerrar Palique o la sesión se borra.
- Los no leídos y los mensajes que llegan al iniciar sesión esperan en memoria hasta que se abre su conversación.
- La primera vez que arranca la versión nueva, se borra el `history.sqlite` que hubiera.
- Se quitan «Exportar conversaciones» (menú y `export.ts`) y el aviso «Esta conversación solo se guarda en este ordenador».

## Montaje

### `src/main/omemo.ts` (nuevo)

Solo criptografía y almacenamiento de claves; nada de XMPP.

- Implementa el almacén que pide la librería (identidad, claves de un solo uso, clave firmada, sesiones, identidades de los demás) sobre `omemo.sqlite` en `userData`, separado por cuenta.
- Las claves privadas y las sesiones se guardan cifradas con `safeStorage` cuando el sistema lo ofrece. Si no, sin cifrar, como se queda hoy el resto de datos locales, y lo anota en el registro.
- Expone:
  - `bundle()`: el paquete de claves públicas;
  - `encrypt(texto, destinatarios)`: devuelve la cabecera y la carga;
  - `decrypt(stanza)`: devuelve el texto, o un error tipado;
  - estado de confianza: dispositivos conocidos, nuevos y cambiados, y verificados;
  - `fingerprint()`.
- Cifrado de la carga como OMEMO 0.3: AES-128-GCM con clave e IV aleatorios. La clave y la etiqueta van cifradas para cada dispositivo con su sesión de Signal.

### `src/main/xmpp.ts`

- Publica y lee las listas de dispositivos y los paquetes.
- Envía con `<encrypted>` y descifra al recibir, llamando a `omemo.ts`.
- Al recibir: `ChatMessage` gana `encrypted: boolean` (falso, marca «no está cifrado») y `undecryptable: boolean`.
- Avisos de confianza: un evento nuevo, `onTrust(contact, change)`.

### `src/main/index.ts`

- `deliver()` ya no guarda en disco. Cada conversación tiene su lista en memoria, `Map<jid, ChatMessage[]>`, de la que lee `chat:history`.
- Fuera: `history.ts`, `export.ts`, el menú «Exportar conversaciones…», `exportTypes()`.
- Borrado único de `history.sqlite`.
- IPC nuevo:
  - `chat:verify`: códigos y estado;
  - `chat:verify-set`: marcar verificado;
  - `chat:accept-key`: aceptar una clave nueva.

  Se valida en main como el resto.

### Interfaz

- **Cabecera de la conversación:** un candado (y el sello si está verificado).
- **Menú de la conversación:** «Verificar cifrado…» abre una ventana pequeña `#verify=<jid>`.
- **Líneas de sistema** para los avisos de confianza y para «no está cifrado» / «no se ha podido descifrar».
- **Barra «Aceptar la clave nueva»** en el caso bloqueante.
- Sale el aviso de historial local.

### Servidor y despliegue

- `MIN_APP_VERSION` en `.env` a la versión que sale; nota en `docs/deployment.md`.
- Comprobar que PEP permite el acceso abierto (`pubsub#access_model = open`) a esos nodos con la configuración actual de Prosody.

### Documentación

AGENTS.md:
- licencias ampliadas;
- `omemo.ts`;
- protocolos (XEP-0384);
- «Local data» sin historial;
- quitar `history`/`export` de los checks.

## Pruebas

- **`check:omemo`** (nuevo, sin servidor). Dos dispositivos falsos en memoria:
  - establecen sesión con una clave de un solo uso y se escriben en los dos sentidos;
  - un mensaje no se descifra dos veces;
  - una clave de un solo uso usada no vuelve al paquete;
  - se reponen al bajar de 25;
  - se detectan un dispositivo nuevo y un cambio de clave;
  - lo verificado bloquea hasta aceptar;
  - una carga manipulada falla con el error tipado;
  - las claves privadas no quedan en claro en `omemo.sqlite` cuando hay `safeStorage`.
- **`check:chat`** (adaptado, con servidor). Dos cuentas reales:
  - el servidor solo ve el texto de reserva;
  - las copias de carbons llegan y se descifran;
  - un mensaje enviado con el destinatario desconectado se descifra al conectarse;
  - un mensaje en claro llega marcado;
  - sin dispositivos del otro lado no se envía.
- **`check:version`:** con la nueva versión mínima.
- **Se quitan** `check:history` y `check:export`.
- **A mano**, con dos instancias:
  - avisos de dispositivo nuevo y de clave cambiada;
  - verificar y el bloqueo;
  - no leídos en memoria;
  - cerrar y reabrir una conversación;
  - cerrar Palique y comprobar que no queda nada en disco.

## Fuera de alcance

- Cifrar guiños y «está escribiendo».
- OMEMO 2 (`urn:xmpp:omemo:2`).
- Leer mensajes antiguos en un dispositivo nuevo.
- Copia de seguridad de las claves.
