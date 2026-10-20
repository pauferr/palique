<script lang="ts">
  import { onMount } from 'svelte'
  import type { Settings, Theme } from '../../main/settings'
  import type { EmailStatus, InviteStatus, Snapshot } from '../../main/xmpp'
  import buzzSound from './assets/sounds/buzz.ogg'
  import messageSound from './assets/sounds/message.ogg'
  import onlineSound from './assets/sounds/online.ogg'
  import Avatar from './Avatar.svelte'
  import { avatarPng } from './picture'

  // Laid out like Windows Live Messenger's Options: sections on the left, one at a time on
  // the right. Every change applies at once; there's only "Cerrar".
  const sections = [
    { id: 'personal', icon: '🙂', label: 'Personal' },
    { id: 'general', icon: '🖥️', label: 'General' },
    { id: 'messages', icon: '💬', label: 'Mensajes' },
    { id: 'alerts', icon: '🔔', label: 'Alertas' },
    { id: 'account', icon: '🔑', label: 'Cuenta' }
  ] as const
  let section: (typeof sections)[number]['id'] = $state('personal')

  const themes: { id: Theme; label: string }[] = [
    { id: 'xp', label: 'Caramelo' },
    { id: 'win98', label: 'Clásico' },
    { id: 'aero', label: 'Cristal' }
  ]

  let settings: Settings | undefined = $state()
  let me: Snapshot | undefined = $state()
  let email: EmailStatus | undefined = $state()
  let invites: InviteStatus | undefined = $state()
  let remembered = $state({ available: false, saved: false })
  let version = $state('')
  let note = $state('') // the last thing that went wrong, shown under the section
  const startupAvailable = window.api.platform !== 'linux'

  onMount(() => {
    window.api.getSettings().then((value) => (settings = value))
    window.api.getRoster().then((value) => (me = value))
    window.api.remembered().then((value) => (remembered = value))
    window.api.version().then((value) => (version = value))
    window.api
      .getEmail()
      .then((value) => (email = value))
      .catch(() => {})
    window.api
      .inviteStatus()
      .then((value) => (invites = value))
      .catch(() => {})
    const offSettings = window.api.onSettings((value) => (settings = value))
    const offRoster = window.api.onRoster((value) => (me = value))
    const offEmail = window.api.onEmail((value) => (email = value))
    return () => {
      offSettings()
      offRoster()
      offEmail()
    }
  })

  function set(patch: Partial<Settings>): void {
    window.api.setSettings(patch).then((value) => (settings = value))
  }

  function play(src: string): void {
    new Audio(src).play().catch(() => {})
  }

  // Personal

  async function rename(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    note = ''
    if (!input.value.trim()) {
      input.value = me?.name ?? ''
      return
    }
    try {
      await window.api.setNick(input.value)
    } catch {
      input.value = me?.name ?? ''
      note = 'No se ha podido cambiar tu nombre.'
    }
  }

  async function setStatus(event: Event): Promise<void> {
    note = ''
    try {
      await window.api.setPresence(
        me?.show ?? 'online',
        (event.currentTarget as HTMLInputElement).value
      )
    } catch {
      note = 'No se ha podido cambiar tu mensaje personal.'
    }
  }

  // Only exists while the Personal section shows.
  let picker: HTMLInputElement | undefined = $state()
  async function choosePicture(): Promise<void> {
    const file = picker?.files?.[0]
    if (picker) picker.value = ''
    if (!file) return
    note = ''
    try {
      await window.api.setAvatar(await avatarPng(file))
    } catch {
      note = 'No se ha podido usar esa imagen.'
    }
  }

  // Messages: a copy of the history, format picked in the save dialog.
  const exportResults = {
    saved: 'Copia guardada.',
    canceled: '',
    empty: 'Todavía no hay conversaciones que guardar.'
  }
  let exportNote = $state('')
  let exporting = $state(false)

  async function exportHistory(): Promise<void> {
    exporting = true
    exportNote = ''
    try {
      exportNote = exportResults[await window.api.exportHistory()]
    } catch {
      exportNote = 'No se ha podido guardar el archivo.'
    }
    exporting = false
  }

  // Account: changing the email needs a link from the new inbox; until then the old one
  // still works.
  let changing = $state(false)
  let newEmail = $state('')
  let emailNote = $state('')

  async function changeEmail(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    emailNote = ''
    try {
      email = await window.api.changeEmail(newEmail.trim())
      newEmail = ''
      changing = false
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
  async function toggleNewsletter(event: Event): Promise<void> {
    const box = event.currentTarget as HTMLInputElement
    note = ''
    try {
      email = await window.api.setNewsletter(box.checked)
    } catch {
      box.checked = !box.checked
      note = 'No se ha podido guardar. Inténtalo de nuevo.'
    }
  }

  const left = $derived(invites ? Math.max(0, invites.max - invites.used) : 0)
</script>

<svelte:head><title>Opciones</title></svelte:head>

<div class="options">
  <nav aria-label="Secciones">
    {#each sections as item (item.id)}
      <button
        aria-current={section === item.id ? 'page' : undefined}
        onclick={() => {
          section = item.id
          note = ''
        }}><span aria-hidden="true">{item.icon}</span>{item.label}</button
      >
    {/each}
  </nav>

  <main>
    {#if section === 'personal'}
      <h1>Personal</h1>
      <section>
        <h2>Mi nombre para mostrar</h2>
        <input value={me?.name ?? ''} onchange={rename} maxlength="64" aria-label="Tu nombre" />
        <p class="hint">Escribe (L), :) o (H) y tus contactos verán los emoticonos.</p>
      </section>
      <section>
        <h2>Mi mensaje personal</h2>
        <input
          value={me?.status ?? ''}
          onchange={setStatus}
          maxlength="140"
          placeholder="Escribe un mensaje personal"
          aria-label="Mensaje personal"
        />
      </section>
      <section>
        <h2>Mi imagen para mostrar</h2>
        <div class="row">
          {#if me}
            <Avatar
              jid={me.jid}
              name={me.name}
              url={me.avatar}
              show={me.show === 'invisible' ? 'offline' : me.show}
              size={56}
            />
          {/if}
          <button onclick={() => picker?.click()}>Cambiar imagen…</button>
          <input
            bind:this={picker}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onchange={choosePicture}
            hidden
          />
        </div>
      </section>
      <section>
        <h2>Mi estado</h2>
        <label>
          <input
            type="checkbox"
            checked={!!settings?.away}
            onchange={(e) => set({ away: e.currentTarget.checked ? 10 : 0 })}
          />
          <span>
            Mostrarme como Ausente si no uso el ordenador durante
            <select
              value={settings?.away || 10}
              disabled={!settings?.away}
              onchange={(e) => set({ away: Number(e.currentTarget.value) })}
              aria-label="Minutos"
            >
              {#each [5, 10, 15, 30] as minutes (minutes)}<option value={minutes}>{minutes}</option
                >{/each}
            </select>
            minutos
          </span>
        </label>
        <p class="hint">Al volver, te pone otra vez Conectado.</p>
      </section>
    {:else if section === 'general'}
      <h1>General</h1>
      <section>
        <h2>Iniciar sesión</h2>
        {#if startupAvailable}
          <label>
            <input
              type="checkbox"
              checked={settings?.startup}
              onchange={(e) => set({ startup: e.currentTarget.checked })}
            />
            Abrir Palique al encender el ordenador
          </label>
        {/if}
        <label>
          <input
            type="checkbox"
            checked={settings?.autoLogin}
            disabled={!remembered.available}
            onchange={(e) => set({ autoLogin: e.currentTarget.checked })}
          />
          Iniciar sesión automáticamente
        </label>
        {#if !remembered.available}
          <p class="hint">Este equipo no puede guardar la contraseña de forma segura.</p>
        {:else if settings?.autoLogin && !remembered.saved}
          <p class="hint">Se activará la próxima vez que inicies sesión.</p>
        {/if}
      </section>
      <section>
        <h2>Tema</h2>
        <div class="themes" role="radiogroup" aria-label="Tema">
          {#each themes as item (item.id)}
            <button
              class="theme"
              role="radio"
              aria-checked={settings?.theme === item.id}
              onclick={() => set({ theme: item.id })}
            >
              <span class="thumb {item.id}"><i></i><i></i></span>
              {item.label}
            </button>
          {/each}
        </div>
      </section>
    {:else if section === 'messages'}
      <h1>Mensajes</h1>
      <section>
        <h2>Al chatear</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.emoticons}
            onchange={(e) => set({ emoticons: e.currentTarget.checked })}
          />
          Mostrar emoticonos
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.winks}
            onchange={(e) => set({ winks: e.currentTarget.checked })}
          />
          Mostrar los guiños a pantalla completa
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.shake}
            onchange={(e) => set({ shake: e.currentTarget.checked })}
          />
          Dejar que los zumbidos hagan temblar la ventana
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.typing}
            onchange={(e) => set({ typing: e.currentTarget.checked })}
          />
          Mostrar cuando alguien está escribiendo
        </label>
      </section>
      <section>
        <h2>Historial de conversaciones</h2>
        <p>
          Tus conversaciones se guardan solo en este ordenador. Si lo cambias o lo formateas, se
          pierden.
        </p>
        <div class="row">
          <button onclick={exportHistory} disabled={exporting}>Guardar una copia…</button>
          {#if exportNote}<span class="hint" role="status">{exportNote}</span>{/if}
        </div>
      </section>
    {:else if section === 'alerts'}
      <h1>Alertas</h1>
      <section>
        <h2>Mostrar alertas cuando</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.alertOnline}
            onchange={(e) => set({ alertOnline: e.currentTarget.checked })}
          />
          Un contacto se conecte
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.alertMessages}
            onchange={(e) => set({ alertMessages: e.currentTarget.checked })}
          />
          Reciba un mensaje
        </label>
      </section>
      <section>
        <h2>Sonidos</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.sounds}
            onchange={(e) => set({ sounds: e.currentTarget.checked })}
          />
          Reproducir sonidos
        </label>
        <table class="sounds">
          <tbody>
            <tr
              ><td>Mensaje nuevo</td><td
                ><button onclick={() => play(messageSound)}>▶ Probar</button></td
              ></tr
            >
            <tr
              ><td>Un contacto se conecta</td><td
                ><button onclick={() => play(onlineSound)}>▶ Probar</button></td
              ></tr
            >
            <tr
              ><td>Zumbido</td><td><button onclick={() => play(buzzSound)}>▶ Probar</button></td
              ></tr
            >
          </tbody>
        </table>
        <p class="hint">Con el estado Ocupado no hay alertas ni sonidos.</p>
      </section>
    {:else}
      <h1>Cuenta</h1>
      <section>
        <h2>Mi correo</h2>
        <p>Entras en Palique con <strong>{email?.address}</strong>. Tus contactos no lo ven.</p>
        {#if email?.pending}
          <p class="hint" role="status">
            Te hemos enviado un enlace a {email.pending} para confirmarlo. Hasta entonces sigues entrando
            con el de siempre.
            <button class="link" onclick={resend}>Reenviar</button>
          </p>
        {/if}
        {#if changing}
          <form class="row" onsubmit={changeEmail}>
            <input
              type="email"
              spellcheck="false"
              bind:value={newEmail}
              required
              maxlength="254"
              placeholder="Nuevo correo"
              aria-label="Nuevo correo"
            />
            <button type="submit">Enviar enlace</button>
          </form>
        {:else}
          <div class="row"><button onclick={() => (changing = true)}>Cambiar correo…</button></div>
        {/if}
        {#if emailNote}<p class="hint" role="alert">{emailNote}</p>{/if}
      </section>
      <section>
        <h2>Invitaciones</h2>
        <p>
          {#if invites}Te quedan <strong>{left}</strong> de {invites.max}.{/if}
          Las que caducan sin usarse vuelven a contar. Para invitar a alguien, ve a
          <em>Contactos → Añadir o invitar a un contacto</em> en tu lista.
        </p>
      </section>
      <section>
        <h2>Novedades</h2>
        <label>
          <input
            type="checkbox"
            checked={email?.newsletter ?? false}
            disabled={!email}
            onchange={toggleNewsletter}
          />
          Recibir por correo las novedades de Palique
        </label>
      </section>
    {/if}
    {#if note}<p class="error" role="alert">{note}</p>{/if}
  </main>

  <footer>
    <small>Palique {version}</small>
    <button onclick={() => window.close()}>Cerrar</button>
  </footer>
</div>

<style>
  /* Windows Live Messenger's layout, in the current theme's colors. */
  .options {
    display: grid;
    grid-template-columns: 136px 1fr;
    grid-template-rows: 1fr auto;
    height: 100vh;
  }

  nav {
    display: grid;
    gap: 2px;
    align-content: start;
    padding: 10px 6px;
    background: var(--header-bg);
    border-right: 1px solid var(--line);
  }

  nav button {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-color: transparent;
    background: none;
    box-shadow: none;
    color: var(--text);
    text-align: left;
  }

  nav button:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  nav button[aria-current='page'] {
    border-color: var(--line);
    background: var(--list-bg);
    color: var(--text-strong);
    font-weight: bold;
  }

  nav span {
    width: 20px;
    font-size: 16px;
    text-align: center;
  }

  main {
    overflow: auto;
    padding: 14px 18px;
    background: var(--list-bg);
  }

  h1 {
    margin: 0 0 10px;
    color: var(--text-strong);
    font-size: 20px;
    font-weight: normal;
  }

  section {
    display: grid;
    gap: 6px;
    padding: 8px 0 12px;
    border-top: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: inherit;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
  }

  .error {
    margin-top: 8px;
    color: var(--text-error);
  }

  label {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .row input {
    flex: 1;
    min-width: 0;
  }

  .themes {
    display: flex;
    gap: 10px;
  }

  .theme {
    display: grid;
    gap: 4px;
    justify-items: center;
    padding: 4px;
    border: 2px solid transparent;
    border-radius: 6px;
    background: none;
    box-shadow: none;
    color: var(--text);
  }

  .theme:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  .theme[aria-checked='true'] {
    border-color: var(--text-strong);
    background: var(--row-hover-bg);
  }

  /* Small pictures of each theme, drawn with its own colors. */
  .thumb {
    display: grid;
    grid-template-rows: 14px 1fr;
    width: 76px;
    height: 56px;
    overflow: hidden;
    border: 1px solid #8a9ab5;
  }

  .thumb i {
    display: block;
  }

  .thumb.xp i:first-child {
    background: linear-gradient(#e3edfd, #9fbef0);
  }

  .thumb.xp i:last-child {
    background: #fff;
  }

  .thumb.win98 {
    border: 2px solid;
    border-color: #fff #404040 #404040 #fff;
  }

  .thumb.win98 i:first-child {
    background: linear-gradient(90deg, #000080, #1084d0);
  }

  .thumb.win98 i:last-child {
    background: #c0c0c0;
  }

  .thumb.aero {
    background: linear-gradient(160deg, #6fcff2, #b6ecdc 55%, #6cc286);
  }

  .thumb.aero i:first-child {
    background: rgb(255 255 255 / 50%);
  }

  .thumb.aero i:last-child {
    margin: 4px;
    background: rgb(255 255 255 / 70%);
  }

  .sounds {
    justify-self: start;
    border-collapse: collapse;
  }

  .sounds td {
    padding: 2px 12px 2px 0;
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

  footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-top: 1px solid var(--line);
    background: var(--bar-bg);
    color: var(--text-muted);
  }
</style>
