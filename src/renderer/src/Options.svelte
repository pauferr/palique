<script lang="ts">
  import { onMount } from 'svelte'
  import type { ExportFormat } from '../../main/export'
  import type { Theme } from '../../main/settings'
  import type { EmailStatus } from '../../main/xmpp'

  const results = {
    saved: 'Historial exportado.',
    canceled: '',
    empty: 'Todavía no hay conversaciones que exportar.'
  }

  let format: ExportFormat = $state('html')
  let busy = $state(false)
  let message = $state('')
  let winks = $state(true)
  let theme: Theme = $state('xp')
  let version = $state('')

  // The email is how you sign in. Changing it needs a link from the new inbox; until then
  // the old one still works.
  let email: EmailStatus | undefined = $state()
  let newEmail = $state('')
  let emailNote = $state('')

  async function changeEmail(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    emailNote = ''
    try {
      email = await window.api.changeEmail(newEmail.trim())
      newEmail = ''
    } catch {
      emailNote = 'Esa dirección no parece válida.'
    }
  }

  async function resend(): Promise<void> {
    try {
      await window.api.resendVerification()
      emailNote = 'Enlace reenviado.'
    } catch {
      emailNote = 'Espera un minuto antes de pedir otro enlace.'
    }
  }

  // Newsletter: stored with the account service, synced to Brevo.
  let newsletterNote = $state('')

  async function toggleNewsletter(event: Event): Promise<void> {
    const box = event.currentTarget as HTMLInputElement
    newsletterNote = ''
    try {
      email = await window.api.setNewsletter(box.checked)
    } catch {
      box.checked = !box.checked
      newsletterNote = 'No se ha podido guardar. Inténtalo de nuevo.'
    }
  }

  onMount(() => {
    window.api.version().then((value) => (version = value))
    window.api.getSettings().then((s) => {
      winks = s.winks
      theme = s.theme
    })
    window.api
      .getEmail()
      .then((value) => (email = value))
      .catch(() => {})
    return window.api.onEmail((value) => {
      email = value
      emailNote = ''
    })
  })

  async function exportHistory(): Promise<void> {
    busy = true
    message = ''
    try {
      message = results[await window.api.exportHistory(format)]
    } catch {
      message = 'No se ha podido guardar el archivo.'
    }
    busy = false
  }
</script>

<svelte:head><title>Opciones</title></svelte:head>

<header>
  <h1>Opciones</h1>
</header>

<main>
  <fieldset class="group">
    <legend>Cuenta</legend>
    <p>Entras en Palique con <strong>{email?.address}</strong>. Tus contactos no lo ven.</p>
    {#if email?.pending}
      <p class="hint" role="status">
        Te hemos enviado un enlace a {email.pending} para confirmarlo. Hasta entonces sigues entrando
        con el correo de siempre.
        <button class="link" onclick={resend}>Reenviar</button>
      </p>
    {/if}
    <form class="change" onsubmit={changeEmail}>
      <input
        type="email"
        bind:value={newEmail}
        required
        maxlength="254"
        placeholder="Nuevo correo"
        aria-label="Nuevo correo"
      />
      <button type="submit">Cambiar</button>
    </form>
    {#if emailNote}<p class="hint" role="alert">{emailNote}</p>{/if}
  </fieldset>

  <fieldset class="group">
    <legend>Tema</legend>
    <div class="formats" role="radiogroup" aria-label="Tema">
      <label>
        <input
          type="radio"
          bind:group={theme}
          value="xp"
          onchange={() => window.api.setSettings({ theme })}
        /> Caramelo (azul y brillante)
      </label>
      <label>
        <input
          type="radio"
          bind:group={theme}
          value="win98"
          onchange={() => window.api.setSettings({ theme })}
        /> Clásico (gris y biselado)
      </label>
      <label>
        <input
          type="radio"
          bind:group={theme}
          value="aero"
          onchange={() => window.api.setSettings({ theme })}
        /> Cristal (verde agua y translúcido)
      </label>
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Guiños</legend>
    <label>
      <input
        type="checkbox"
        bind:checked={winks}
        onchange={() => window.api.setSettings({ winks })}
      />
      Mostrar los guiños a pantalla completa
    </label>
    <p class="hint">Desactivados, los guiños solo aparecen como texto en la conversación.</p>
  </fieldset>

  <fieldset class="group">
    <legend>Boletín</legend>
    <label>
      <input
        type="checkbox"
        checked={email?.newsletter ?? false}
        disabled={!email}
        onchange={toggleNewsletter}
      />
      Recibir el boletín con las novedades de Palique
    </label>
    <p class="hint">
      Se envía a {email?.address} cuando hay versión nueva o alguna noticia. Puedes darte de baja aquí
      o desde el enlace de cada boletín.
    </p>
    {#if newsletterNote}<p class="hint" role="alert">{newsletterNote}</p>{/if}
  </fieldset>

  <fieldset class="group">
    <legend>Historial</legend>
    <p>
      Tus conversaciones solo se guardan en este equipo: el servidor no las archiva. Si formateas o
      cambias de ordenador, se pierden. Expórtalas para guardar una copia.
    </p>

    <div class="formats" role="radiogroup" aria-label="Formato">
      <label><input type="radio" bind:group={format} value="html" /> HTML (para leer)</label>
      <label><input type="radio" bind:group={format} value="txt" /> Texto plano</label>
      <label><input type="radio" bind:group={format} value="json" /> JSON (para importar)</label>
    </div>

    <button onclick={exportHistory} disabled={busy}>Exportar historial…</button>
    {#if message}<p class="hint" role="status">{message}</p>{/if}
  </fieldset>

  <p class="hint version">Palique {version}</p>
</main>

<style>
  header {
    padding: 12px 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: 18px;
  }

  main {
    display: grid;
    gap: 14px;
    padding: 14px 16px;
  }

  /* XP-style group box: soft rounded border, blue title on the line. */
  .group {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 6px 12px 12px;
    border: var(--group-border);
    border-radius: var(--group-radius);
    background: var(--group-bg);
  }

  legend {
    padding: 0 4px;
    color: var(--text-strong);
    font-weight: bold;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
  }

  label {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .version {
    text-align: center;
  }

  .formats {
    display: grid;
    gap: 2px;
  }

  button {
    justify-self: start;
  }

  .change {
    display: flex;
    gap: 6px;
  }

  .change input {
    flex: 1;
    min-width: 0;
  }

  .link {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-strong);
    text-decoration: underline;
  }

  .link:hover:not(:disabled) {
    background: none;
  }
</style>
