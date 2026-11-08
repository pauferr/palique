# GIFs con Klipy

Fecha: 2026-11-08. Estado: pendiente de revisión.

## Objetivo

Buscar y enviar GIFs de Klipy desde la conversación, en las de dos y en los grupos. El diseño es la maqueta aprobada: <https://claude.ai/artifact/Ec5xXrUy9eFYrEFe2PwmTF>.

Decidido con el usuario:

- Botón «GIF» en la barra de la conversación y buscador encima de la caja de escribir. Un clic envía.
- La clave de Klipy solo está en el servidor (`.env`); la búsqueda pasa por el servicio de cuentas.
- **Las imágenes se descargan directamente de Klipy** (`static.klipy.com`), sin pasar por nuestro servidor: Klipy ve la IP de quien mira un GIF.

## Comportamiento

### Elegir y enviar

- Botón «GIF» (marca de texto «GIF» dentro de la píldora) entre «Guiño» y «Zumbido». Se ve solo si el servidor tiene GIFs activados.
- Se abre un buscador encima de la caja de escribir, del ancho de la barra y unos 420 px de alto:
  - campo «Buscar en KLIPY», que busca mientras escribes (con 300 ms de espera tras la última tecla);
  - categorías como atajos de búsqueda, con estos textos y búsquedas: Tendencias (las tendencias de Klipy), Jaja, Hola, Te quiero, Felicidades, Gracias, Sí, No, Fiesta;
  - una cuadrícula de tres columnas que respeta la forma de cada GIF; al bajar hasta el final, carga la página siguiente;
  - abajo, lo que se está viendo («Tendencias» o «Resultados para «{q}»») y «Powered by KLIPY», la atribución que pide Klipy;
  - sin resultados: «No hay GIFs para esa búsqueda. Prueba con otra palabra.»;
  - si Klipy no responde: «No se han podido cargar los GIFs. Vuelve a intentarlo en un momento.»
- Un clic en un GIF lo envía y cierra el buscador. Escape o un clic fuera lo cierran sin enviar.
- Las búsquedas van en el idioma de la app (`locale`).

### En la conversación

- El GIF es su propia burbuja: la imagen, con el marco y el radio de la burbuja, sin relleno, hasta 220 px de ancho, y una marca «GIF» pequeña abajo a la izquierda. En los grupos, con el «X dice:» de siempre.
- Se mueve solo. Con «reducir movimiento» del sistema se muestra quieto (primer fotograma) y se anima al pasar el ratón.
- Mientras carga, un hueco del tamaño del GIF; si no carga, «No se ha podido cargar el GIF».
- La notificación dice «Te ha enviado un GIF», en vez del enlace.

### Cómo viaja

- Un GIF es un mensaje de texto normal cuyo cuerpo es solo el enlace al webp «md» de Klipy, en `https://static.klipy.com/`. Va cifrado con OMEMO como cualquier mensaje: el servidor no sabe qué GIF se ha enviado.
- Al recibir, un cuerpo que es exactamente un enlace de `https://static.klipy.com/…` (sin nada más) se muestra como GIF. Cualquier otro texto, también uno que contenga ese enlace con más cosas, se muestra como texto.
- Quien use otro programa XMPP ve el enlace.
- Las dimensiones no viajan; la burbuja se ajusta al cargar.

## Montaje

### Servicio de cuentas (`server/accounts`)

- `KLIPY_API_KEY` en el entorno (`deploy/.env`, `.env.example`, `compose.yaml` de desarrollo). Sin clave, los GIFs están desactivados.
- Iq `get` `<gifs xmlns='urn:palique:accounts:0' q='' page='1' locale='es'/>`:
  - `q` vacío → tendencias; si no, búsqueda (`q` hasta 100 caracteres);
  - responde `<gifs more='true|false'>` con hasta 24 `<gif id title preview url width height/>`:
    - `preview` = webp «sm» y `url` = webp «md», ambos en `https://static.klipy.com/`;
    - `width` y `height` = los del «sm»;
  - `customer_id` hacia Klipy = HMAC-SHA256 del JID con `ACCOUNTS_SECRET`, en hexadecimal: estable por usuario y anónimo;
  - sin clave → `feature-not-implemented`; Klipy falla o tarda más de 8 s → `service-unavailable`;
  - límite: 60 peticiones por usuario y minuto (en memoria, como el resto).
- `KLIPY_BASE_URL` (por defecto `https://api.klipy.com/api/v1`), para que el check use un Klipy falso.
- Disco del componente: anuncia `urn:palique:accounts:0#gifs` cuando hay clave, y la app lo usa para mostrar el botón.

### App

- `xmpp.ts`:
  - `searchGifs(q, page)` → `{ gifs, more }` (el iq de arriba), validando cada enlace con `isGifUrl`;
  - `gifsAvailable()` desde el disco del servicio.
- `src/renderer/src/gif.ts` (nuevo, compartido por main y renderer): `isGifUrl(text): boolean`. Exacto `https://static.klipy.com/` seguido de una ruta de `[A-Za-z0-9/_.-]`, hasta 300 caracteres, sin espacios, consulta ni fragmento.
- **Imágenes:** un protocolo propio `palique-gif://` registrado en main.
  - Pide a `https://static.klipy.com/<ruta>` solo si la ruta pasa `isGifUrl`, con hasta 5 MB y tipo `image/webp`, `image/gif` o `image/jpeg`.
  - Caché en memoria de hasta 50 MB, con política LRU.
  - El CSP del renderer añade `palique-gif:` a `img-src`; nada más se abre.
- **IPC:** `gifs:search(q, page)` y `gifs:available()`, validando `q` (texto, hasta 100) y `page` (entero de 1 a 50). Enviar un GIF es `chat:send` con el enlace, que pasa por el cifrado de siempre.
- **Notificación:** si el cuerpo es un GIF, «Te ha enviado un GIF».
- **Interfaz:**
  - `GifPicker.svelte`, el buscador;
  - en `Chat.svelte`, el botón (si `gifsAvailable`) y la burbuja de GIF, en las de dos y en los grupos, en ventana suelta o integrada.
  - Textos con `_()` y traducidos.

### Documentación

- **AGENTS.md:** el iq `gifs`, `KLIPY_API_KEY`, `palique-gif://` y `isGifUrl`.
- **docs/deployment.md:** cómo activar los GIFs (la clave en `.env` y `setup.sh`).

## Pruebas

- **`check:gif`** (sin servidor), sobre `isGifUrl`:
  - acepta enlaces reales de Klipy;
  - rechaza otro dominio, `http:`, consulta, fragmento, espacios, texto alrededor, rutas con `..` y más de 300 caracteres.
- **`check:gifs`** (con servidor): el servicio de cuentas apunta a un Klipy falso local (`KLIPY_BASE_URL`, levantado por el propio check). Comprueba que:
  - tendencias y búsqueda devuelven los campos;
  - `customer_id` llega como HMAC y nunca como el JID;
  - se aplica el límite por minuto;
  - sin clave da `feature-not-implemented`;
  - un Klipy caído da `service-unavailable`;
  - un enlace que no es de Klipy en la respuesta se descarta.
- **`check:chat`:** un GIF enviado llega cifrado y se reconoce como GIF.
- **A mano y con capturas:**
  - buscador en los tres temas;
  - GIF en una conversación de dos y en un grupo;
  - «reducir movimiento»;
  - un GIF que no carga.

## Fuera de alcance

- Pegatinas, clips y memes de Klipy.
- GIFs favoritos o recientes.
- Pasar las imágenes por nuestro servidor (decidido: directas).
- Avisar a Klipy de los GIFs compartidos (su endpoint de «share»).
