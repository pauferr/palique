# Palique

Cliente de mensajería de escritorio inspirado en MSN Messenger y AOL Instant Messenger (AIM). El objetivo es recuperar la emoción de recibir un mensaje a principios de los 2000: sonidos, zumbidos, animaciones y una estética que despierte nostalgia de los 90 y los 00, con un diseño minimalista pero entrañable.

> Estado: fase de ideas y planificación. Este documento se trasladará a skills / agent cuando el proyecto esté definido.

---

## 1. Plataformas

| Prioridad | Plataforma | Notas |
|-----------|------------|-------|
| Alta | Linux | Objetivo inicial. Contemplar X11 y Wayland. |
| Baja | Windows | Futuro, no prioritario. |
| Baja | macOS | Futuro, no prioritario. |

### Entorno de desarrollo

- Desarrollo principal en **macOS** (por comodidad). Linux sigue siendo la plataforma objetivo del MVP.
- macOS (WKWebView) y Linux (WebKitGTK) comparten motor WebKit: la mayor parte de la UI y la lógica se comportará igual.
- Requiere validación específica en Linux: funciones de ventana (transparencia, siempre encima, pantalla completa, clics pasantes), bandeja del sistema (GNOME no la tiene por defecto), rendimiento de animaciones en WebKitGTK, audio (GStreamer) y notificaciones.
- Pruebas en Linux: en el equipo Linux propio cuando esté disponible; mientras tanto, opcionalmente, VM con UTM (Ubuntu/Fedora con Wayland). La VM sirve para funcionalidad, no para medir rendimiento.
- Compilación de binarios Linux: GitHub Actions (no es práctico compilar para Linux desde macOS).
- La distribución (en cualquier plataforma) queda fuera de alcance por ahora; el foco es solo el desarrollo. Nota para cuando toque: distribuir en macOS requiere firma y notarización (cuenta de Apple Developer de pago).

## 2. Stack

**Decidido: Tauri 2**

- Backend: Rust.
- Frontend: **Svelte** con TypeScript. Poco código, buen rendimiento y transiciones/animaciones integradas, adecuado para una UI muy personalizada. Si se usa SvelteKit, configurarlo como SPA estática (`adapter-static`, SSR desactivado), que es lo que requiere Tauri. Descartados: React (más verboso), Solid (comunidad más pequeña), JS/TS sin framework (no escala con la UI).
- En Linux usa WebKitGTK como motor de renderizado.

**Motivos de la elección**

- La estética retro (biseles, sprites, fuentes pixeladas, emoticonos animados) se resuelve mejor con CSS y canvas que con widgets nativos.
- Binarios ligeros (pocos MB frente a 100+ de Electron).
- Multiplataforma con el mismo código cuando toque dar el salto a Windows/macOS.

**Alternativas descartadas**

- Electron: más sencillo y predecible, pero pesado en disco y RAM.
- Flutter: UI personalizable, ecosistema de escritorio menos maduro.
- Qt/QML: rendimiento nativo, curva de aprendizaje mayor.
- GTK4/libadwaita: estética opuesta a la buscada y atado a Linux.

### Protocolo de mensajería

**Decidido: XMPP**

- Servidor: **Prosody** (libre, en Lua, ligero, configuración en un único archivo, WebSocket mediante `mod_websocket`). Sin desarrollo propio de backend, solo configuración. Descartado ejabberd: pensado para millones de usuarios, más pesado y complejo de administrar. Si algún día Prosody se queda corto, se puede migrar sin tocar el cliente.
- Cubre de serie: cuentas, lista de contactos (roster), presencia, mensajes offline, historial.
- Zumbido: XEP-0224 *Attention*.
- Animaciones a pantalla completa y demás funciones exclusivas: extensiones propias de Palique, que solo interpretarán clientes Palique.
- Interoperabilidad: los usuarios pueden hablar con otros clientes XMPP (sin funciones exclusivas).
- Lógica XMPP: **en el frontend (JS) para el MVP**, con xmpp.js o StanzaJS (más maduras que tokio-xmpp en Rust).
  - Encapsulada en un módulo propio con interfaz clara; el resto de la app no conoce la librería subyacente.
  - Plan de migración: si la conexión en la webview da problemas, mover ese módulo al backend Rust sin tocar la UI.
  - Requisito: desde la webview no hay sockets TCP, así que la conexión va por WebSocket (RFC 7395). El servidor debe tener WebSocket habilitado.

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
- Requisito en Linux: plugins de GStreamer para el audio en WebKitGTK.

### Zumbidos
- Sonido + sacudida del contenido **dentro** de la ventana (funciona en cualquier entorno).
- Refuerzo con `request_user_attention` de Tauri (resalta la app en la barra de tareas/dock; compatible con Wayland).
- Opcional a futuro: en X11, mover la ventana real como en el MSN original.
- Decisión: no se considera un problema que en Wayland la ventana no se desplace.

### Animaciones a pantalla completa
- Ventana transparente, siempre encima y que deje pasar los clics.
- X11: sin complicaciones.
- Wayland: depende del compositor. Funciona con layer-shell (KDE, Sway y similares), no en GNOME.
- Hay que validar transparencias en WebKitGTK.
- Nombre en la app: "guiños" (como en MSN).
- **Transmisión: catálogo predefinido.** Las animaciones vienen incluidas en la app; el mensaje solo lleva un identificador (p. ej. `tarta-cumple`). Mensaje ligero, reproducción instantánea y contenido controlado.
- Diseño extensible: el formato del mensaje debe permitir añadir packs descargables en el futuro sin cambios.
- Descartado (por ahora) contenido enviado por el usuario: riesgo de contenido desagradable o con destellos (epilepsia fotosensible), transferencia y validación de archivos, latencia.
- Protecciones obligatorias desde el MVP:
  - Opción para desactivar los guiños a pantalla completa.
  - Límite de frecuencia por contacto.

### Registro y autenticación

**Decidido: registro desde la propia app con usuario y contraseña.**

- Registro desde el cliente mediante XEP-0077 (*In-Band Registration*), soportado por Prosody sin desarrollo propio.
- El nombre de usuario es el identificador que los contactos usan para añadirse.
- Requisito de diseño: encapsular la autenticación en el cliente para poder añadir otros métodos sin rehacer el flujo.
- Pendiente de configurar en producción: medidas antiregistro masivo (límite de registros por IP, captcha o similar).

### Almacenamiento de datos

**Decidido: historial de chat solo en local.**

- En el servidor (lo que XMPP ya guarda por defecto): cuenta, lista de contactos, perfil (avatar, nombre, mensaje personal) y mensajes offline hasta que se entregan.
- En el servidor NO se archivan conversaciones: `mod_mam` desactivado en Prosody. Argumento de privacidad comunicable al usuario.
- En local: historial de chats (SQLite) y preferencias de la app (sonidos, tema, opciones de guiños).
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
- Soporte para Windows y macOS.

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
| Animaciones a pantalla completa en Wayland | Alto | Prototipo temprano en el entorno propio. Fallback: animación dentro de la ventana en compositores sin soporte. |
| Transparencias y audio en WebKitGTK | Medio | Validar en el mismo prototipo. Documentar dependencias (GStreamer). |
| Desarrollo en macOS sin equipo Linux disponible | Alto | Validar en Linux (equipo propio o VM) en cuanto sea posible, empezando por los guiños. No dar por buena ninguna función de ventana probada solo en macOS. |
| Zumbido sin mover ventana en Wayland | Bajo | Aceptado. Sacudida interna + aviso en barra de tareas. |

## 7. Decisiones

- [x] **Protocolo de mensajería** → XMPP (ver sección 2).
- [x] **Framework de frontend** → Svelte + TypeScript (ver sección 2).
- [x] **Ubicación de la lógica XMPP** → frontend JS para el MVP, encapsulada y migrable a Rust (ver sección 2).
- [x] **Servidor XMPP** → Prosody (ver sección 2).
- [x] **Transmisión de animaciones** → catálogo predefinido, extensible con packs (ver sección 3).
- [x] **Alcance del MVP** → ver sección 4.
- [x] **Historial de chat** → solo local, con aviso y exportación (ver sección 3).
- [x] **Registro y autenticación** → usuario y contraseña desde la app (XEP-0077); Google y otros proveedores en la hoja de ruta (ver sección 3).
- [~] **Nombre "Palique"** → búsqueda web (oct. 2026) sin coincidencias de apps o proyectos de mensajería con ese nombre. Pendiente: consulta formal en EUIPO y OEPM (clases 9 y 38) y disponibilidad de dominio/usuario en GitHub. Posible debilidad: "palique" significa "charla" en español, lo que podría considerarse descriptivo para una app de chat a efectos de registro de marca.

## 8. Diseño y sensaciones (por desarrollar)

- Referencias: MSN Messenger, AIM, interfaces de Windows 98/XP.
- Principio: minimalista pero entrañable. Nostalgia sin caer en copia literal.
- **Temas seleccionables por el usuario ("sabores").** Candidatos:
  - XP / MSN 7: glossy, azules intensos, botones tipo caramelo.
  - Win98 / AIM clásico: grises, biseles 3D, tipografía pixelada.
  - Frutiger Aero: translúcido, verdes agua, burbujas, cielos.
  - Moderno limpio con guiños retro.
- Arquitectura de temas desde el MVP: variables CSS (design tokens) + hoja de estilos por tema. Los temas pueden cambiar también forma (biseles, radios, sombras), no solo colores.
- Idea: cada tema con su propio pack de sonidos.
- Alcance: el MVP sale con 1 tema por defecto (máximo 2); el resto en la hoja de ruta.
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
- Pendiente: tema por defecto, paleta de colores, tipografías, iconografía, avatares, sonidos, tono de los textos de la interfaz.

## 9. Próximos pasos

1. Crear el repositorio privado en GitHub y subir este documento (`docs/palique.md`).
2. Configurar el proyecto Tauri + Svelte en macOS y GitHub Actions para compilar en Linux.
3. Montar Prosody en local (o Docker) con `mod_websocket` habilitado.
4. Prototipo de guiños: ventana transparente a pantalla completa + sonido.
5. Validar el prototipo en Linux (equipo propio o VM) en cuanto esté disponible.
6. Diseño: elegir tema por defecto, paleta y tipografías; encargar las ilustraciones del elenco.
