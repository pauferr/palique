<script lang="ts">
  import { onMount } from 'svelte'
  import type { Settings } from '../../main/settings'
  import Avatar from './Avatar.svelte'
  import { helpItems, type MenuItem } from './menu'
  import MenuBar from './MenuBar.svelte'
  import UpdateNotice from './UpdateNotice.svelte'
  import { _ } from './i18n'

  let { onlogin }: { onlogin: (jid: string) => void } = $props()

  const messages = {
    'not-authorized': _('Correo o contraseña incorrectos.'),
    wait: _('Demasiados intentos. Espera un minuto.'),
    outdated: _('Esta versión de Palique ya no funciona. Descarga la nueva para entrar.'),
    unreachable: _('No se puede conectar con el servidor.'),
    unknown: _('Algo ha fallado. Inténtalo de nuevo.')
  }

  // Signed out there's no Options window: the language is picked here, and the account's
  // own language takes over on sign-in.
  let language: Settings['language'] = $state('auto')
  const languages: { id: Settings['language']; label: string }[] = [
    { id: 'auto', label: _('Automático') },
    // Each language named in itself.
    { id: 'es', label: 'Español' },
    { id: 'en', label: 'English' }
  ]
  const menus = [
    {
      label: 'Palique',
      items: (): MenuItem[] => [{ label: _('Salir de Palique'), run: window.api.quit }]
    },
    {
      label: _('Idioma'),
      items: (): MenuItem[] =>
        languages.map((l) => ({
          label: l.label,
          checked: l.id === language,
          run: () => window.api.setSettings({ language: l.id })
        }))
    },
    { label: _('Ayuda'), items: helpItems }
  ]

  // Only signing in happens here: accounts are made, and forgotten passwords replaced, on
  // the website (the email buttons and «¿Olvidaste tu contraseña?» go there).
  let email = $state('')
  let password = $state('')
  let error = $state('')
  let busy = $state(false)
  let version = $state('')
  // "Iniciar sesión automáticamente". Only offered with system encryption.
  let remember = $state(false)
  let canRemember = $state(false)

  onMount(async () => {
    window.api.lastEmail().then((value) => (email ||= value))
    window.api.version().then((value) => (version = value))
    window.api.getSettings().then((s) => {
      remember = s.autoLogin
      language = s.language
    })
    window.api.remembered().then((r) => (canRemember = r.available))
    busy = true
    const result = await window.api.autoLogin()
    busy = false
    if (!result) return
    if ('jid' in result) onlogin(result.jid)
    else error = messages[result.error]
  })

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    error = ''
    busy = true
    const result = await window.api.login(
      email.trim().toLowerCase(),
      password,
      remember && canRemember
    )
    busy = false
    if ('jid' in result) onlogin(result.jid)
    else error = messages[result.error]
  }
</script>

<div class="login">
  <MenuBar {menus} />
  <UpdateNotice />
  <header>
    <span class="cloud c1" aria-hidden="true"></span>
    <span class="cloud c2" aria-hidden="true"></span>
    <span class="cloud c3" aria-hidden="true"></span>
    <span class="cloud c4" aria-hidden="true"></span>
    <!-- Placeholder until the cast illustrations exist; shows the initial as you type. -->
    <div class="picture">
      <Avatar jid={email.trim() || 'palique'} show="online" size={96} />
    </div>
  </header>
  <h1>{_('¿Echamos un palique?')}</h1>

  <form onsubmit={submit}>
    <label>
      {_('Correo electrónico')}
      <input
        type="email"
        spellcheck="false"
        bind:value={email}
        autocomplete="email"
        required
        maxlength="254"
      />
    </label>
    <label>
      {_('Contraseña')}
      <input type="password" bind:value={password} autocomplete="current-password" required />
    </label>

    {#if canRemember}
      <label class="check">
        <input type="checkbox" bind:checked={remember} />
        {_('Iniciar sesión automáticamente')}
      </label>
    {/if}

    {#if error}<p class="error" role="alert">
        {error}
        {#if error === messages.outdated}<a
            href="https://github.com/pauferr/palique/releases"
            target="_blank"
            rel="noreferrer">{_('Descargar')}</a
          >{/if}
      </p>{/if}

    <button type="submit" class="primary" disabled={busy}>
      {busy ? _('Un momento…') : _('Iniciar sesión')}
    </button>
  </form>

  <footer>
    <button type="button" class="link" onclick={window.api.recoverPassword}>
      {_('¿Olvidaste tu contraseña?')}
    </button>
    <p class="invite">
      {_('¿Aún no tienes cuenta? Palique va con invitación: pídesela a un amigo.')}
    </p>
    <small class="version">Palique {version}</small>
  </footer>
</div>

<style>
  .login {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
  }

  header {
    position: relative;
    display: flex;
    align-self: stretch;
    justify-content: center;
    align-items: flex-end;
    /* Short enough, with the menu bar above it, for the form to fit without scrolling. */
    min-height: 190px;
    padding-bottom: 18px;
    overflow: hidden;
    background: var(--sky);
    box-sizing: border-box;
  }

  .cloud {
    position: absolute;
    border-radius: 40px;
    background: var(--cloud);
  }

  .c1 {
    left: -30px;
    top: 40px;
    width: 150px;
    height: 46px;
  }

  .c2 {
    left: 30px;
    top: 22px;
    width: 70px;
    height: 56px;
  }

  .c3 {
    right: -20px;
    top: 92px;
    width: 120px;
    height: 36px;
    opacity: 0.8;
  }

  .c4 {
    right: 30px;
    top: 78px;
    width: 54px;
    height: 44px;
    opacity: 0.8;
  }

  /* The avatar's own green ring is the frame (you, online); this only lifts it off the sky. */
  .picture {
    position: relative;
    display: grid;
    filter: drop-shadow(0 6px 12px rgb(19 41 75 / 25%));
  }

  h1 {
    margin: 4px 16px 0;
    color: var(--text);
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.01em;
    text-align: center;
  }

  form {
    display: grid;
    gap: 12px;
    width: min(19rem, 100% - 3.5rem);
    margin-top: 14px;
  }

  label {
    display: grid;
    gap: 4px;
    color: var(--text);
    font-weight: 700;
  }

  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 600;
  }

  .check input {
    width: 18px;
    height: 18px;
    margin: 0;
    flex: none;
    accent-color: var(--status-online);
  }

  .error {
    margin: 0;
    color: var(--text-error);
  }

  .primary {
    margin-top: 4px;
    padding: 12px;
    font-size: 16px;
  }

  footer {
    display: grid;
    gap: 6px;
    justify-items: center;
    margin-top: auto;
    padding: 14px 16px 20px;
  }

  .version {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .invite {
    max-width: 30em;
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }

  .link {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-strong);
    font-weight: 700;
  }

  .link:hover:not(:disabled) {
    background: none;
    color: var(--text);
    text-decoration: underline;
  }

  .error a {
    color: inherit;
    font-weight: 700;
  }
</style>
