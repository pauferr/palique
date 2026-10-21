# Palique

**El messenger de escritorio de toda la vida, hecho de nuevo.** Tu lista de contactos con quién está conectado, tu mensaje personal, zumbidos que hacen temblar la ventana, guiños a pantalla completa y el sonido de alguien que se conecta. La emoción de recibir un mensaje, como antes.

> **Estado:** en desarrollo (alpha). De momento solo se entra por invitación, mientras lo probamos con gente cercana.

<p align="center">
  <img src="docs/images/contactos.png" width="300" alt="La lista de contactos de Palique: Lucía con su nombre en degradado y sus amigos conectados, ausentes u ocupados, cada uno con su mensaje personal">
  &nbsp;&nbsp;
  <img src="docs/images/conversacion.png" width="380" alt="Una conversación con Marcos: mensajes agrupados, emoticonos, un guiño y un zumbido">
</p>

## ¿Por qué Palique?

Cuando estás en el ordenador, el móvil no tiene por qué estar en tu mano.

Palique es un messenger para el rato que ya pasas delante de la pantalla. Deja el móvil boca abajo y chatea como lo hacíamos antes: una lista de contactos que te dice quién anda por ahí, un mensaje personal, el sonido de alguien que se conecta, un zumbido para llamar la atención de un amigo. Sin feeds y sin notificaciones infinitas. Solo tú y tus amigos, hablando.

Recupera la parte social del messenger de escritorio que tenían MSN y AIM. Estar «conectado» significaba que estabas ahí, en tu ordenador, con ganas de hablar. Tu estado lo decía.

## Lo que trae

### Tu lista de contactos, de un vistazo

Quién está **conectado**, **ausente** u **ocupado**, con el marco del avatar del color de su estado y su mensaje personal debajo del nombre. Un **buscador** encuentra a cualquiera mientras escribes (sin importar mayúsculas ni tildes). Tu nombre y tu mensaje personal se cambian con un clic sobre ellos. Y si alguien te escribe con la conversación cerrada, su fila parpadea en naranja hasta que la abres, como en el MSN.

### Conversaciones con chispa

<p align="center">
  <img src="docs/images/guinos.png" width="380" alt="El selector de guiños: Beso, Burbuja, Carcajada, Cerdo bailón, Chulo, Crío burlón y más">
</p>

- **Zumbidos** que hacen temblar la ventana de tu amigo.
- **Guiños** a pantalla completa: animaciones dibujadas en directo, nítidas a cualquier tamaño, con su sonido. Doce para empezar, del «Cerdo bailón» al «Globo de agua».
- **Emoticonos** de siempre: escribe `:)`, `(H)` o `(L)` y salen solos.
- Los mensajes seguidos van juntos bajo un solo «Marcos dice:», con separadores de **Hoy** y **Ayer**, y la caja de texto crece contigo.
- Ves cuándo tu amigo **está escribiendo…**

### Tu nombre, con colores y degradados

<p align="center">
  <img src="docs/images/nombre.png" width="400" alt="La ventana Cambiar tu nombre: vista previa grande, barra de formato, colores, degradados y estilos rápidos">
</p>

¿Te acuerdas de los nombres de colores de Messenger Plus!? Aquí vienen de serie. Negrita, cursiva, cualquier color, fondos y **degradados**, con una ventana que lo pone fácil: eliges el color, seleccionas una parte del nombre y listo. O un clic en un estilo rápido (Chicle, Fuego, Océano…). Ves cómo quedará antes de aplicarlo, y tus amigos no ven nada hasta que pulsas «Aplicar».

### Tres temas: Clásico, Retro y Cristal

<p align="center">
  <img src="docs/images/contactos.png" width="240" alt="Tema Clásico">
  <img src="docs/images/tema-retro.png" width="240" alt="Tema Retro">
  <img src="docs/images/tema-cristal.png" width="240" alt="Tema Cristal">
</p>

- **Clásico**: los azules del messenger de los 2000, con el acabado limpio de hoy.
- **Retro**: grises, azul marino y biseles en relieve, como un escritorio de finales de los 90.
- **Cristal**: cielo, hierba y cristal escarchado, como los escritorios de finales de los 2000.

<p align="center">
  <img src="docs/images/conversacion-retro.png" width="360" alt="Una conversación con el tema Retro">
  <img src="docs/images/conversacion-cristal.png" width="360" alt="Una conversación con el tema Cristal">
</p>

### A tu manera

<p align="center">
  <img src="docs/images/opciones-general.png" width="400" alt="Opciones, General: tema y fuente">
  <img src="docs/images/opciones-sonidos.png" width="400" alt="Opciones, Alertas: colecciones de sonidos">
</p>

- **Fuentes**: la del tema, o Comic Relief, Nunito, Fira Sans, Patrick Hand, Atkinson Hyperlegible, Gelasio o Courier Prime. Todas se ven del mismo tamaño.
- **Colecciones de sonidos** para los mensajes, las conexiones y los zumbidos: Clásico, Terciopelo, Cristal y Burbuja.
- Estados **Conectado, Ausente, Ocupado e Invisible**; el ausente se pone solo cuando dejas el ordenador.

### Tu privacidad, en serio

- Tus conversaciones se guardan **solo en tu ordenador**: el servidor no se queda con nada.
- Tus contactos ven tu nombre, **nunca tu correo**.
- Nadie que no esté en tu lista puede escribirte.
- Puedes cambiar tu correo cuando quieras desde *Opciones*.

## Cómo empezar

1. **Consigue una invitación.** De momento solo se entra si alguien te invita. La invitación llega por correo.
2. **Instala la aplicación** desde [Releases](https://github.com/pauferr/palique/releases) (macOS, Linux y Windows). Todavía no está firmada:
   - En macOS, la primera vez no se abrirá: ve a *Ajustes del Sistema → Privacidad y seguridad* y pulsa *Abrir igualmente*.
   - En Windows, elige *Más información → Ejecutar de todas formas*.
3. **Crea tu cuenta.** Pulsa el botón del correo de invitación, o abre Palique, elige *¿Tienes una invitación? Crea tu cuenta* y pega el código. Elige el nombre que verán tus contactos y una contraseña. Entrarás con el correo al que te llegó la invitación.
4. **Añade a tus amigos** con su correo. Si alguien aún no está en Palique, puedes invitarle (tienes 3 invitaciones). Quien entre con tu invitación ya estará en tus contactos.
5. **¡A chatear!**

## Contribuir

La documentación técnica (arquitectura, cómo desarrollar, comprobaciones, versiones, despliegue) está en [AGENTS.md](AGENTS.md). Las convenciones de commits, en [CONTRIBUTING.md](CONTRIBUTING.md). El plan del proyecto y las decisiones de diseño, en [docs/palique.md](docs/palique.md).
