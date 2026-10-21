# Desplegar el servidor de Palique

Guía para montar el servidor en una máquina Linux propia con Docker, un dominio que apunte a ella y una cuenta de correo SMTP para los correos de Palique. Al terminar, la app (compilada apuntando a tu servidor) funciona desde cualquier ordenador.

Qué corre en el servidor (todo con Docker, archivos en `deploy/`):

- **Prosody**: el servidor de mensajería (puerto 5222).
- **Servicio de cuentas**: qué correo es de qué cuenta, invitaciones, cambios de correo y recuperación de contraseña.
- **Caddy**: HTTPS para las páginas del servicio de cuentas. Consigue y renueva solo el certificado de Let's Encrypt, que también se pasa a Prosody.

Tiempo aproximado: una hora la primera vez.

---

## 1. La máquina

Cualquier servidor Linux con IP pública fija (por ejemplo Ubuntu 24.04) y acceso por SSH con tu clave. Con 1 CPU y 1 GB de memoria basta para empezar.

## 2. Abrir los puertos

Abre estos puertos TCP de entrada, en el cortafuegos de la máquina y, si el proveedor tiene otro propio (en su panel), también en ese. Es el fallo más típico.

| Puerto | Para qué |
|---|---|
| 80 | Let's Encrypt (obtener el certificado) |
| 443 | HTTPS del servicio de cuentas |
| 5222 | La app (XMPP) |

## 3. Instalar Docker

En la máquina:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Sal (`exit`) y vuelve a entrar por SSH para que el cambio de grupo se aplique. Comprueba con `docker ps` (no debe pedir `sudo`).

## 4. Dominio

Crea un registro **A** de tu dominio (o de un subdominio) que apunte a la IP de la máquina. Comprueba desde tu ordenador (puede tardar unos minutos):

```bash
dig +short tu-dominio.com
```

Debe devolver la IP de tu máquina. Ese nombre será el dominio de las cuentas: `tere@tu-dominio.com`.

## 5. Correo

Necesitas una cuenta SMTP: servidor, puerto, usuario y contraseña. El remitente (`MAIL_FROM`) debe ser una dirección desde la que ese servidor pueda enviar, en un dominio con SPF y DKIM configurados.

> No uses como remitente una dirección gratuita (Gmail, Outlook…) a través de otro servidor: sus proveedores no la reconocen y los correos acaban en spam o no llegan.

## 6. Descargar Palique en el servidor

En la máquina:

```bash
git clone https://github.com/pauferr/palique.git
```

## 7. Configurar y arrancar

```bash
cd ~/palique/deploy
cp .env.example .env
nano .env
```

Rellena `PALIQUE_DOMAIN` (tu dominio), `ACME_EMAIL` (tu correo), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. `ACCOUNTS_SECRET` se genera solo.

Arranca:

```bash
./setup.sh
```

El script construye y arranca todo, espera al certificado de Let's Encrypt, se lo pasa a Prosody, programa su renovación semanal y al final te muestra el comando para enviar las **primeras invitaciones** (la tuya también), cada una a un correo:

```bash
docker compose exec accounts node src/invite.ts tu@correo.com
```

Comprobación rápida: abre `https://tu-dominio.com` en el navegador. Debe salir una página de Palique que dice "Página no encontrada": significa que HTTPS y el servicio de cuentas funcionan.

## 8. Compilar la app apuntando a tu servidor

1. En GitHub: repositorio → *Settings → Secrets and variables → Actions → Variables → New repository variable*:
   - `XMPP_DOMAIN` = `tu-dominio.com`
   - `ACCOUNTS_URL` = `https://tu-dominio.com`
2. Publica una versión: *Actions → Release → Run workflow* con **publish** activado. El número de versión sale solo de los commits.
3. Cuando termine, publica el borrador en *Releases*, instala la app y crea tu cuenta con la invitación que te llegó en el paso 7. A partir de ahí, cada usuario puede invitar a 3 personas desde la propia app.

---

## Mantenimiento

**Actualizar el servidor** (después de cambios en el repositorio):

```bash
cd ~/palique && git pull && deploy/setup.sh
```

**Ver qué pasa:**

```bash
cd ~/palique/deploy && docker compose logs -f
```

(o solo uno: `docker compose logs -f prosody`, `accounts` o `caddy`).

**Copia de seguridad.** Las cuentas y listas de contactos están en el volumen `palique_prosody-data`; los correos y preferencias, en `palique_accounts-data`:

```bash
docker run --rm -v palique_prosody-data:/v -v ~/copias:/c alpine tar czf /c/prosody-$(date +%F).tgz -C /v .
docker run --rm -v palique_accounts-data:/v -v ~/copias:/c alpine tar czf /c/accounts-$(date +%F).tgz -C /v .
```

## Actualizar a los nombres en inglés (servidor de la 0.4)

A partir de la versión siguiente a la 0.4, el servicio de cuentas se llama `accounts` (servicio de Docker, volumen, base de datos y secreto). Un servidor instalado antes necesita estos pasos **una sola vez**, en `deploy/`:

```bash
git pull
docker compose down
# Copiar los datos al volumen nuevo y renombrar la base de datos (con sus archivos -wal/-shm si los hay).
docker volume create palique_accounts-data
docker run --rm -v palique_cuentas-data:/from -v palique_accounts-data:/to alpine \
  sh -c 'cp -a /from/. /to/ && cd /to && for f in cuentas.sqlite*; do mv "$f" "accounts${f#cuentas}"; done'
sed -i 's/^CUENTAS_SECRET=/ACCOUNTS_SECRET=/' .env
docker compose up -d --build --remove-orphans
docker compose logs accounts
```

Comprueba que alguien puede iniciar sesión con la app nueva. Después ya puedes borrar el volumen viejo: `docker volume rm palique_cuentas-data`.

Avisa a los usuarios: las apps 0.4 no podrán entrar hasta actualizarse. Los enlaces de las invitaciones enviadas antes ya no abren la app, pero el código del correo se puede pegar a mano mientras no caduque (una semana).

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| `setup.sh` no consigue el certificado | El dominio apunta a la IP correcta (`dig`), y los puertos 80 y 443 están abiertos en todos los cortafuegos. Log: `docker compose logs caddy`. |
| La app dice "No se puede conectar con el servidor" | Puerto 5222 abierto en todos los cortafuegos; la app se compiló con `XMPP_DOMAIN`. |
| No llegan los correos | `MAIL_FROM` debe ser una dirección que tu servidor SMTP pueda usar, con SPF y DKIM en su dominio (`dig TXT`); mira la carpeta de spam. Log: `docker compose logs accounts`. |
| Los enlaces de los correos no abren nada | `ACCOUNTS_URL` debe ser `https://` + tu dominio. |
