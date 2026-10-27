<script lang="ts">
  import { onMount } from 'svelte'
  import type { Font, Settings, SoundPack, Theme } from '../../main/settings'
  import type { EmailStatus, InviteStatus, Snapshot } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import { Bell, KeyRound, MessageCircle, Monitor, User } from '@lucide/svelte'
  import { avatarPng } from './picture'
  import { events, packs, playSound } from './sounds'
  import { _, _p } from './i18n'

  // Laid out like Windows Live Messenger's Options: sections on the left, one at a time on
  // the right. Every change applies at once; there's only "Cerrar". The name and personal
  // message are edited from the contact list.
  const sections = [
    { id: 'personal', icon: User, label: _('Personal') },
    { id: 'general', icon: Monitor, label: _('General') },
    { id: 'messages', icon: MessageCircle, label: _('Mensajes') },
    { id: 'alerts', icon: Bell, label: _('Alertas') },
    { id: 'account', icon: KeyRound, label: _('Cuenta') }
  ] as const
  // Kept for the session: changing the language reloads the window, and it should stay here.
  const saved = sessionStorage.getItem('options-section')
  let section: (typeof sections)[number]['id'] = $state(
    sections.find((s) => s.id === saved)?.id ?? 'personal'
  )
  $effect(() => sessionStorage.setItem('options-section', section))

  const themes: { id: Theme; label: string; font: string }[] = [
    { id: 'light', label: _p('tema', 'Claro'), font: 'Nunito' },
    { id: 'warm', label: _p('tema', 'Cálido'), font: 'Nunito' },
    { id: 'dark', label: _p('tema', 'Oscuro'), font: 'Nunito' }
  ]

  const fonts: { id: Font; label: string }[] = [
    // The theme's own font, named after it.
    { id: 'theme', label: '' },
    { id: 'comic', label: 'Comic Relief' },
    { id: 'noto', label: 'Noto Sans' },
    { id: 'fira', label: 'Fira Sans' },
    { id: 'hand', label: 'Patrick Hand' },
    { id: 'legible', label: 'Atkinson Hyperlegible' },
    { id: 'serif', label: 'Gelasio' },
    { id: 'typewriter', label: 'Courier Prime' }
  ]

  let settings: Settings | undefined = $state()
  let themeFont = $derived(themes.find((t) => t.id === settings?.theme)?.font ?? _('La del tema'))
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
    const offSettings = window.api.onSettings((value) => {
      settings = value
    })
    const offRoster = window.api.onRoster((value) => {
      me = value
    })
    const offEmail = window.api.onEmail((value) => {
      email = value
    })
    return () => {
      offSettings()
      offRoster()
      offEmail()
    }
  })

  function set(patch: Partial<Settings>): void {
    window.api.setSettings(patch).then((value) => (settings = value))
  }

  // Personal

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
      note = _('No se ha podido usar esa imagen.')
    }
  }

  // Messages: a copy of the history, format picked in the save dialog.
  const exportResults = {
    saved: _('Copia guardada.'),
    canceled: '',
    empty: _('Todavía no hay conversaciones que guardar.')
  }
  let exportNote = $state('')
  let exporting = $state(false)

  async function exportHistory(): Promise<void> {
    exporting = true
    exportNote = ''
    try {
      exportNote = exportResults[await window.api.exportHistory()]
    } catch {
      exportNote = _('No se ha podido guardar el archivo.')
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
      emailNote = _('Esa dirección no parece válida.')
    }
  }

  async function resend(): Promise<void> {
    try {
      await window.api.resendVerification()
      emailNote = _('Enlace reenviado.')
    } catch {
      emailNote = _('Espera un minuto antes de pedir otro enlace.')
    }
  }

  // Newsletter: the choice is stored with the account service.
  async function toggleNewsletter(event: Event): Promise<void> {
    const box = event.currentTarget as HTMLInputElement
    note = ''
    try {
      email = await window.api.setNewsletter(box.checked)
    } catch {
      box.checked = !box.checked
      note = _('No se ha podido guardar. Inténtalo de nuevo.')
    }
  }

  const left = $derived(invites ? Math.max(0, invites.max - invites.used) : 0)
</script>

<svelte:head><title>{_('Opciones')}</title></svelte:head>

<div class="options">
  <nav aria-label={_('Secciones')}>
    {#each sections as item (item.id)}
      <button
        aria-current={section === item.id ? 'page' : undefined}
        onclick={() => {
          section = item.id
          note = ''
        }}><item.icon size={18} aria-hidden="true" />{item.label}</button
      >
    {/each}
  </nav>

  <main>
    {#if section === 'personal'}
      <h1>{_('Personal')}</h1>
      <p class="hint">
        {_(
          'Tu nombre y tu mensaje personal se cambian haciendo clic sobre ellos en la lista de contactos.'
        )}
      </p>
      <section>
        <h2>{_('Tu imagen para mostrar')}</h2>
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
          <button onclick={() => picker?.click()}>{_('Cambiar imagen…')}</button>
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
        <h2>{_('Tu estado')}</h2>
        <label>
          <input
            type="checkbox"
            checked={!!settings?.away}
            onchange={(e) => set({ away: e.currentTarget.checked ? 10 : 0 })}
          />
          <span>
            {_('Mostrarme como Ausente si no uso el ordenador durante')}
            <select
              value={settings?.away || 10}
              disabled={!settings?.away}
              onchange={(e) => set({ away: Number(e.currentTarget.value) })}
              aria-label={_('Minutos')}
            >
              {#each [5, 10, 15, 30] as minutes (minutes)}<option value={minutes}>{minutes}</option
                >{/each}
            </select>
            {_('minutos')}
          </span>
        </label>
        <p class="hint">{_('Cuando vuelvas, pasarás a Disponible otra vez.')}</p>
      </section>
    {:else if section === 'general'}
      <h1>{_('General')}</h1>
      <section>
        <h2>{_('Inicio')}</h2>
        {#if startupAvailable}
          <label>
            <input
              type="checkbox"
              checked={settings?.startup}
              onchange={(e) => set({ startup: e.currentTarget.checked })}
            />
            {_('Abrir Palique al encender el ordenador')}
          </label>
        {/if}
        <label>
          <input
            type="checkbox"
            checked={settings?.autoLogin}
            disabled={!remembered.available}
            onchange={(e) => set({ autoLogin: e.currentTarget.checked })}
          />
          {_('Iniciar sesión automáticamente')}
        </label>
        {#if !remembered.available}
          <p class="hint">{_('Este ordenador no puede guardar la contraseña de forma segura.')}</p>
        {:else if settings?.autoLogin && !remembered.saved}
          <p class="hint">{_('Se activará la próxima vez que inicies sesión.')}</p>
        {/if}
      </section>
      <section>
        <h2>{_('Tema')}</h2>
        <div class="themes" role="radiogroup" aria-label={_('Tema')}>
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
      <div class="pair">
        <section>
          <h2>{_('Fuente')}</h2>
          <label>
            <select
              value={settings?.font}
              onchange={(e) => set({ font: e.currentTarget.value as Font })}
              aria-label={_('Fuente')}
            >
              {#each fonts as item (item.id)}<option value={item.id}
                  >{item.label || _('{font} (predeterminada)', { font: themeFont })}</option
                >{/each}
            </select>
          </label>
        </section>
        <section>
          <h2>{_('Idioma')}</h2>
          <label>
            <select
              value={settings?.language}
              onchange={(e) => set({ language: e.currentTarget.value as Settings['language'] })}
              aria-label={_('Idioma')}
            >
              <option value="auto">{_('Automático')}</option>
              <!-- Each language named in itself. -->
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>
      </div>
    {:else if section === 'messages'}
      <h1>{_('Mensajes')}</h1>
      <section>
        <h2>{_('Al chatear')}</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.emoticons}
            onchange={(e) => set({ emoticons: e.currentTarget.checked })}
          />
          {_('Mostrar emoticonos')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.winks}
            onchange={(e) => set({ winks: e.currentTarget.checked })}
          />
          {_('Mostrar los guiños a pantalla completa')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.shake}
            onchange={(e) => set({ shake: e.currentTarget.checked })}
          />
          {_('Dejar que los zumbidos hagan temblar la ventana')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.typing}
            onchange={(e) => set({ typing: e.currentTarget.checked })}
          />
          {_('Mostrar cuando alguien está escribiendo')}
        </label>
      </section>
      <section>
        <h2>{_('Historial de conversaciones')}</h2>
        <p>
          {_(
            'Tus conversaciones se guardan solo en este ordenador. Si lo cambias o lo formateas, se pierden.'
          )}
        </p>
        <div class="row">
          <button onclick={exportHistory} disabled={exporting}>{_('Guardar una copia…')}</button>
          {#if exportNote}<span class="hint" role="status">{exportNote}</span>{/if}
        </div>
      </section>
    {:else if section === 'alerts'}
      <h1>{_('Alertas')}</h1>
      <section>
        <h2>{_('Mostrar alertas cuando')}</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.alertOnline}
            onchange={(e) => set({ alertOnline: e.currentTarget.checked })}
          />
          {_('Un contacto se conecte')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.alertMessages}
            onchange={(e) => set({ alertMessages: e.currentTarget.checked })}
          />
          {_('Me llegue un mensaje')}
        </label>
      </section>
      <section>
        <h2>{_('Sonidos')}</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.sounds}
            onchange={(e) => set({ sounds: e.currentTarget.checked })}
          />
          {_('Reproducir sonidos')}
        </label>
        <label>
          {_('Colección')}
          <select
            value={settings?.soundPack}
            onchange={(e) => set({ soundPack: e.currentTarget.value as SoundPack })}
          >
            {#each packs as p (p.id)}<option value={p.id}>{_(p.name)}</option>{/each}
          </select>
        </label>
        <table class="sounds">
          <tbody>
            {#each events as e (e.id)}
              <tr
                ><td>{_(e.label)}</td><td
                  ><button onclick={() => settings && playSound(settings.soundPack, e.id)}
                    >▶ {_('Probar')}</button
                  ></td
                ></tr
              >
            {/each}
          </tbody>
        </table>
        <p class="hint">{_('Con el estado No molestar no hay alertas ni sonidos.')}</p>
      </section>
    {:else}
      <h1>{_('Cuenta')}</h1>
      <section>
        <h2>{_('Tu correo')}</h2>
        <p>
          {_('Entras en Palique con')} <strong>{email?.address}</strong>. {_(
            'Tus contactos no lo ven.'
          )}
        </p>
        {#if email?.pending}
          <p class="hint" role="status">
            {_(
              'Te hemos enviado un enlace a {address} para confirmarlo. Hasta entonces sigues entrando con el de siempre.',
              { address: email.pending }
            )}
            <button class="link" onclick={resend}>{_('Reenviar')}</button>
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
              placeholder={_('Nuevo correo')}
              aria-label={_('Nuevo correo')}
            />
            <button type="submit">{_('Enviar enlace')}</button>
          </form>
        {:else}
          <div class="row">
            <button onclick={() => (changing = true)}>{_('Cambiar correo…')}</button>
          </div>
        {/if}
        {#if emailNote}<p class="hint" role="alert">{emailNote}</p>{/if}
      </section>
      <section>
        <h2>{_('Invitaciones')}</h2>
        <p>
          <!-- Whole sentences to translate; the bold and italic parts go where {left} and
          {menu} are. -->
          {#if invites}{#each _( 'Te quedan {left} de {max}.', { max: invites.max } ).split('{left}') as part, i (i)}{#if i}<strong
                  >{left}</strong
                >{/if}{part}{/each}{/if}
          {_('Las que caducan sin usarse se te devuelven.')}
          {#each _('Para invitar a alguien, ve a {menu} en tu lista.').split('{menu}') as part, i (i)}{#if i}<em
                >{_('Contactos')} → {_('Añadir o invitar a un contacto')}</em
              >{/if}{part}{/each}
        </p>
      </section>
      <section>
        <h2>{_('Novedades')}</h2>
        <label>
          <input
            type="checkbox"
            checked={email?.newsletter ?? false}
            disabled={!email}
            onchange={toggleNewsletter}
          />
          {_('Quiero recibir novedades de Palique por correo')}
        </label>
      </section>
    {/if}
    {#if note}<p class="error" role="alert">{note}</p>{/if}
  </main>

  <footer>
    <small>Palique {version}</small>
    <button onclick={() => window.close()}>{_('Cerrar')}</button>
  </footer>
</div>

<style>
  /* Windows Live Messenger's layout, in the current theme's colors. */
  .options {
    display: grid;
    grid-template-columns: 168px 1fr;
    grid-template-rows: 1fr auto;
    height: 100vh;
  }

  nav {
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 14px 10px;
    background: var(--header-bg);
    border-right: 1px solid var(--line);
  }

  nav :global(svg) {
    flex: none;
  }

  nav button {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    border-color: transparent;
    border-radius: var(--radius);
    background: none;
    box-shadow: none;
    color: var(--text);
    font-size: 15px;
    text-align: left;
  }

  nav button:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  /* The current section looks like the window's main action. */
  nav button[aria-current='page'],
  nav button[aria-current='page']:hover:not(:disabled) {
    border-color: var(--accent-border);
    background: var(--accent-bg);
    box-shadow: var(--accent-shadow);
    color: var(--accent-text);
    font-weight: 800;
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: auto;
    padding: 18px 24px;
    background: var(--list-bg);
  }

  h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: 26px;
    font-weight: 800;
  }

  section {
    display: grid;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 13px;
  }

  .error {
    color: var(--text-error);
  }

  label {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  input[type='checkbox'] {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--status-online);
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

  /* Fuente and Idioma side by side, each select as wide as its column. */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .pair select {
    flex: 1;
    min-width: 0;
  }

  .themes {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .theme,
  .theme:hover:not(:disabled) {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text);
  }

  .theme[aria-checked='true'] {
    font-weight: 800;
  }

  .theme[aria-checked='true'] .thumb {
    outline: 3px solid var(--text-strong);
    outline-offset: 2px;
  }

  .theme:hover .thumb {
    border-color: var(--text-strong);
  }

  /* Small pictures of each theme, drawn with its own colors. */
  .thumb {
    display: grid;
    grid-template-rows: 34px 1fr;
    box-sizing: border-box;
    width: 96px;
    height: 64px;
    overflow: hidden;
    border: 1px solid #8a9ab5;
  }

  .thumb i {
    display: block;
  }

  /* Each theme: its sky over its window. */
  .thumb.light {
    border-color: #9fcdf5;
    border-radius: 10px;
  }

  .thumb.light i:first-child {
    background: linear-gradient(#7cc4ff, #bfe3ff);
  }

  .thumb.light i:last-child {
    background: #fff;
  }

  .thumb.warm {
    border-color: #f5b98f;
    border-radius: 10px;
  }

  .thumb.warm i:first-child {
    background: linear-gradient(#ffb37c, #ffd9b8);
  }

  .thumb.warm i:last-child {
    background: #fff8f2;
  }

  .thumb.dark {
    border-color: #3d5690;
    border-radius: 10px;
  }

  .thumb.dark i:first-child {
    background: linear-gradient(#0b1633, #24407a);
  }

  .thumb.dark i:last-child {
    background: #16213c;
  }

  .sounds {
    justify-self: start;
    border-collapse: collapse;
  }

  .sounds td {
    padding: 2px 12px 2px 0;
  }

  .sounds button {
    padding: 3px 12px;
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
    padding: 10px 16px;
    border-top: 1px solid var(--line);
    background: var(--bar-bg);
    color: var(--text-muted);
  }

  footer small {
    font-size: 13px;
  }

  footer button {
    padding: 7px 20px;
    font-size: 15px;
  }
</style>
