# Desplegar el servidor de Palique (pruebas, gratis)

Guía para montar el servidor en **Oracle Cloud (Always Free)** con un subdominio gratuito de **DuckDNS** y correo por **Brevo**. Coste: 0 €. Al terminar, la app (compilada apuntando a tu servidor) funciona desde cualquier ordenador.

Qué corre en el servidor (todo con Docker, archivos en `deploy/`):

- **Prosody**: el servidor de mensajería (puerto 5222).
- **Servicio de cuentas**: qué correo es de qué cuenta, invitaciones, cambios de correo y recuperación de contraseña.
- **Caddy**: HTTPS para las páginas del servicio de cuentas. Consigue y renueva solo el certificado de Let's Encrypt, que también se pasa a Prosody.

Tiempo aproximado: una hora la primera vez.

---

## 1. Crear la máquina en Oracle Cloud

1. En la consola de Oracle: **Compute → Instances → Create instance**.
2. **Image**: *Canonical Ubuntu 24.04* (si te deja elegir, la variante *aarch64*).
3. **Shape**: *Change shape → Ampere → VM.Standard.A1.Flex*, con **1 OCPU y 6 GB** de memoria. Debe aparecer la etiqueta *Always Free eligible*. (Máximo gratuito: 2 OCPU y 12 GB).
   - Si dice que no hay capacidad, prueba otro *Availability domain* o vuelve a intentarlo más tarde.
4. **Networking**: deja que cree una red nueva (*VCN*) con subred pública y marca **Assign a public IPv4 address**.
5. **SSH keys**: *Paste public keys* y pega tu clave pública (en tu Mac: `cat ~/.ssh/id_ed25519.pub`; si no tienes, créala con `ssh-keygen -t ed25519`).
6. **Create**. Cuando esté *Running*, apunta la **Public IP address**.

> La IP pública se mantiene aunque reinicies la máquina; solo se pierde si la eliminas. Si quieres asegurarla, en *Networking → IP Management* puedes convertirla en reservada (también gratis).

## 2. Abrir los puertos (dos cortafuegos)

Oracle tiene **dos cortafuegos** y hay que abrir los puertos en ambos. Es el fallo más típico.

**a) El de la red (en la consola):** *Networking → Virtual cloud networks →* tu VCN *→ Subnets →* la subred pública *→ Security Lists → Default Security List → Add Ingress Rules*. Añade tres reglas, todas con *Source CIDR* `0.0.0.0/0` e *IP Protocol* TCP:

| Destination port | Para qué |
|---|---|
| 80 | Let's Encrypt (obtener el certificado) |
| 443 | HTTPS del servicio de cuentas |
| 5222 | La app (XMPP) |

**b) El de la propia máquina.** Entra por SSH y abre los mismos puertos:

```bash
ssh ubuntu@TU_IP
```

```bash
for port in 80 443 5222; do sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport $port -j ACCEPT; done
sudo netfilter-persistent save
```

## 3. Instalar Docker

En la máquina:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Sal (`exit`) y vuelve a entrar por SSH para que el cambio de grupo se aplique. Comprueba con `docker ps` (no debe pedir `sudo`).

## 4. Subdominio en DuckDNS

1. Entra en [duckdns.org](https://www.duckdns.org) (con tu cuenta de GitHub o Google).
2. Crea un subdominio, por ejemplo `palique-pruebas` → `palique-pruebas.duckdns.org`.
3. En *current ip* pon la **IP pública** de tu máquina y pulsa *update ip*.
4. Comprueba desde tu Mac (puede tardar un minuto):

```bash
dig +short palique-pruebas.duckdns.org
```

Debe devolver la IP de tu máquina. Ese nombre será el dominio de las cuentas: `tere@palique-pruebas.duckdns.org`.

> La IP de la máquina no cambia, así que no hace falta el programa de actualización automática de DuckDNS.

## 5. Correo con Brevo

1. Crea una cuenta en [brevo.com](https://www.brevo.com) (plan gratuito: 300 correos al día).
2. **Remitente**: *Senders, domains & IPs → Senders → Add a sender* con tu correo, y confírmalo con el enlace que te llega. Será el remitente de los correos de Palique.
3. **Credenciales SMTP**: *SMTP & API → SMTP*. Apunta el *Login* (será `SMTP_USER`) y genera una *SMTP key* (será `SMTP_PASS`).
4. (Opcional, boletín) *Contacts → Lists*: crea una lista y apunta su número (ID). *SMTP & API → API keys*: crea una clave.

> Con un remitente de correo gratuito (Gmail, Outlook…) algunos correos pueden ir a spam. Para pruebas vale; con dominio propio se configura bien (SPF/DKIM) y se arregla.

## 6. Descargar Palique en el servidor

El repositorio es privado, así que la máquina necesita permiso de lectura. Lo más seguro es una **deploy key** (solo lectura, solo este repositorio). En la máquina:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_palique -N ""
cat ~/.ssh/github_palique.pub
```

En GitHub: repositorio → *Settings → Deploy keys → Add deploy key*, pega esa clave (sin marcar *Allow write access*). Luego, en la máquina:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/github_palique" git clone git@github.com:pauferr/palique.git
cd palique && git config core.sshCommand "ssh -i ~/.ssh/github_palique"
```

## 7. Configurar y arrancar

```bash
cd ~/palique/deploy
cp .env.example .env
nano .env
```

Rellena `PALIQUE_DOMAIN` (tu subdominio), `ACME_EMAIL` (tu correo), `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (el remitente verificado en Brevo). Las claves de Brevo para el boletín son opcionales. `CUENTAS_SECRET` y `BREVO_WEBHOOK_TOKEN` se generan solos.

Arranca:

```bash
./setup.sh
```

El script construye y arranca todo, espera al certificado de Let's Encrypt, se lo pasa a Prosody, programa su renovación semanal y al final te muestra el comando para enviar las **primeras invitaciones** (la tuya también), cada una a un correo:

```bash
docker compose exec cuentas node src/invitar.ts tu@correo.com
```

Comprobación rápida: abre `https://palique-pruebas.duckdns.org` en el navegador. Debe salir una página de Palique que dice "Página no encontrada": significa que HTTPS y el servicio de cuentas funcionan.

## 8. Compilar la app apuntando a tu servidor

1. En GitHub: repositorio → *Settings → Secrets and variables → Actions → Variables → New repository variable*:
   - `XMPP_DOMAIN` = `palique-pruebas.duckdns.org`
   - `ACCOUNTS_URL` = `https://palique-pruebas.duckdns.org`
2. Publica una versión (en tu Mac):

```bash
npm version patch
```

```bash
git push --follow-tags
```

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

(o solo uno: `docker compose logs -f prosody`, `cuentas` o `caddy`).

**Copia de seguridad.** Las cuentas y listas de contactos están en el volumen `palique_prosody-data`; los correos y preferencias, en `palique_cuentas-data`:

```bash
docker run --rm -v palique_prosody-data:/v -v ~/copias:/c alpine tar czf /c/prosody-$(date +%F).tgz -C /v .
docker run --rm -v palique_cuentas-data:/v -v ~/copias:/c alpine tar czf /c/cuentas-$(date +%F).tgz -C /v .
```

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| `setup.sh` no consigue el certificado | DuckDNS apunta a la IP correcta (`dig`), y los puertos 80 y 443 están abiertos en **los dos** cortafuegos. Log: `docker compose logs caddy`. |
| La app dice "No se puede conectar con el servidor" | Puerto 5222 abierto en los dos cortafuegos; la app se compiló con `XMPP_DOMAIN`. |
| No llegan los correos | Remitente verificado en Brevo y `MAIL_FROM` igual a ese remitente; mira la carpeta de spam. Log: `docker compose logs cuentas`. |
| Los enlaces de los correos no abren nada | `ACCOUNTS_URL` debe ser `https://` + tu dominio. |
