<script lang="ts">
  import { onMount } from 'svelte'
  import type { Settings } from '../../main/settings'
  import type { AuthLink } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import { helpItems, type MenuItem } from './menu'
  import MenuBar from './MenuBar.svelte'
  import { PASSWORD_RULE, strongPassword } from './password'
  import UpdateNotice from './UpdateNotice.svelte'
  import { _ } from './i18n'

  let { onlogin }: { onlogin: (jid: string) => void } = $props()

  const messages = {
    conflict: _('Esta invitación ya se usó para crear una cuenta. Inicia sesión.'),
    'not-acceptable': _('Esa contraseña no es segura. {rule}', { rule: _(PASSWORD_RULE) }),
    'not-authorized': _('Correo o contraseña incorrectos.'),
    'invalid-invite': _('La invitación no es válida, ya se usó o ha caducado.'),
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

  // register: with an invite from an email. forgot: ask for a recovery email.
  // reset: new password with the emailed code.
  let mode: 'login' | 'register' | 'forgot' | 'reset' = $state('login')
  let email = $state('')
  let password = $state('')
  let confirm = $state('')
  let invite = $state('')
  let invitedEmail = $state('') // the invite's address, once the code checks out
  let nick = $state('')
  let code = $state('')
  let newsletter = $state(false)
  let error = $state('')
  let info = $state('')
  let busy = $state(false)
  let version = $state('')
  // "Iniciar sesión automáticamente", like MSN. Only offered with system encryption.
  let remember = $state(false)
  let canRemember = $state(false)

  const address = (): string => email.trim().toLowerCase()
  // The invite code can be pasted bare or as the whole link (palique://signup?t=CODE).
  const inviteCode = (): string => invite.trim().match(/[?&]t=([^&\s]+)/)?.[1] ?? invite.trim()
  const submitLabel = $derived({
    login: _('Iniciar sesión'),
    register: invitedEmail ? _('Crear cuenta') : _('Continuar'),
    forgot: _('Enviar enlace'),
    reset: _('Cambiar contraseña')
  })

  function go(next: typeof mode): void {
    mode = next
    error = ''
    info = ''
    confirm = ''
    invitedEmail = ''
    if (next !== 'login') password = ''
  }

  // A link from an email fills the form in; the user still confirms.
  function useLink(link: AuthLink | null): void {
    if (!link) return
    if (link.kind === 'reset') {
      go('reset')
      email = link.email
      code = link.token
    } else {
      go('register')
      invite = link.token
      checkInvite()
    }
  }

  onMount(() => {
    window.api.lastEmail().then((value) => (email ||= value))
    window.api.version().then((value) => (version = value))
    window.api.getSettings().then((s) => {
      remember = s.autoLogin
      language = s.language
    })
    window.api.remembered().then((r) => (canRemember = r.available))
    // A link from an email comes first; otherwise sign in by itself if asked to.
    window.api.pendingLink().then(async (link) => {
      if (link) return useLink(link)
      busy = true
      const result = await window.api.autoLogin()
      busy = false
      if (!result) return
      if ('jid' in result) onlogin(result.jid)
      else error = messages[result.error]
    })
    return window.api.onLink(useLink)
  })

  async function checkInvite(): Promise<void> {
    busy = true
    const result = await window.api.inviteEmail(inviteCode())
    busy = false
    if ('email' in result) invitedEmail = result.email
    else error = messages[result.error]
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    error = ''
    if (mode === 'register' && !invitedEmail) return checkInvite()
    if ((mode === 'register' || mode === 'reset') && !strongPassword(password)) {
      error = messages['not-acceptable']
      return
    }
    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      error = _('Las contraseñas no coinciden.')
      return
    }
    busy = true
    if (mode === 'forgot') {
      try {
        await window.api.forgotPassword(address())
        info = _(
          'Si {email} tiene cuenta, te hemos enviado un enlace y un código. Caducan en una hora.',
          { email: address() }
        )
      } catch (e) {
        error = String(e).includes('outdated') ? messages.outdated : messages.unreachable
      }
      busy = false
      return
    }
    const result =
      mode === 'register'
        ? await window.api.register({ token: inviteCode(), nick, password, newsletter })
        : mode === 'reset'
          ? await window.api.resetPassword(address(), code.trim(), password)
          : await window.api.login(address(), password, remember && canRemember)
    busy = false
    if ('jid' in result) onlogin(result.jid)
    else if (mode === 'reset' && result.error === 'invalid-invite') {
      error = _('El código no es válido o ha caducado. Pide otro.')
    } else error = messages[result.error]
  }
</script>

<div class="login">
  <MenuBar {menus} />
  <UpdateNotice />
  <!-- The sky: tall when signing in, shorter for the longer forms. -->
  <header class:tall={mode === 'login'}>
    <span class="cloud c1" aria-hidden="true"></span>
    <span class="cloud c2" aria-hidden="true"></span>
    <span class="cloud c3" aria-hidden="true"></span>
    <span class="cloud c4" aria-hidden="true"></span>
    <!-- Placeholder until the cast illustrations exist; shows the initial as you type. -->
    <div class="picture">
      <Avatar
        jid={(mode === 'register' ? nick : email).trim() || 'palique'}
        show="online"
        size={mode === 'login' ? 96 : 56}
      />
    </div>
  </header>
  <h1>{_('¿Echamos un palique?')}</h1>

  <form onsubmit={submit}>
    {#if mode === 'forgot'}
      <p class="intro">
        {_('Escribe tu correo y te enviaremos un enlace para elegir otra contraseña.')}
      </p>
    {:else if mode === 'reset'}
      <p class="intro">
        {_('Elige tu nueva contraseña. El código está en el correo que te enviamos.')}
      </p>
    {:else if mode === 'register' && !invitedEmail}
      <p class="intro">
        {_(
          'Para crear una cuenta hace falta una invitación. Pulsa el botón del correo que te llegó o pega aquí su código.'
        )}
      </p>
    {/if}

    {#if mode === 'register'}
      {#if invitedEmail}
        <p class="intro">
          {#each _('Entrarás con {email}.').split('{email}') as part, i (i)}{#if i}<strong
                >{invitedEmail}</strong
              >{/if}{part}{/each}
        </p>
        <label>
          {_('Tu nombre')}
          <input bind:value={nick} required maxlength="128" autocomplete="nickname" />
          <small>{_('Es lo que verán tus contactos. Puedes cambiarlo cuando quieras.')}</small>
        </label>
      {:else}
        <label>
          {_('Código de invitación')}
          <input spellcheck="false" bind:value={invite} required autocomplete="off" />
        </label>
      {/if}
    {:else}
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
    {/if}

    {#if mode === 'reset'}
      <label>
        {_('Código del correo')}
        <input spellcheck="false" bind:value={code} required autocomplete="one-time-code" />
      </label>
    {/if}

    {#if mode === 'login' || mode === 'reset' || invitedEmail}
      <label>
        {mode === 'reset' ? _('Nueva contraseña') : _('Contraseña')}
        <input
          type="password"
          bind:value={password}
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minlength={mode === 'login' ? undefined : 8}
        />
        {#if mode !== 'login'}<small>{_(PASSWORD_RULE)}</small>{/if}
      </label>
    {/if}

    {#if mode === 'reset' || invitedEmail}
      <label>
        {_('Repite la contraseña')}
        <input type="password" bind:value={confirm} autocomplete="new-password" required />
      </label>
    {/if}

    {#if mode === 'login' && canRemember}
      <label class="check">
        <input type="checkbox" bind:checked={remember} />
        {_('Iniciar sesión automáticamente')}
      </label>
    {/if}

    {#if invitedEmail}
      <label class="check">
        <input type="checkbox" bind:checked={newsletter} />
        {_('Quiero recibir novedades de Palique por correo')}
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
    {#if info}<p class="info" role="status">{info}</p>{/if}

    <button type="submit" class="primary" disabled={busy}>
      {busy ? _('Un momento…') : submitLabel[mode]}
    </button>

    {#if mode === 'forgot'}
      <button type="button" class="link" onclick={() => go('reset')}
        >{_('Ya tengo un código')}</button
      >
    {/if}
  </form>

  <footer>
    {#if mode === 'login'}
      <button type="button" class="link" onclick={() => go('forgot')} disabled={busy}>
        {_('¿Olvidaste tu contraseña?')}
      </button>
      <button type="button" class="link" onclick={() => go('register')} disabled={busy}>
        {_('¿Tienes una invitación? Crea tu cuenta')}
      </button>
    {:else}
      <button type="button" class="link" onclick={() => go('login')} disabled={busy}>
        ← {_('Volver')}
      </button>
    {/if}
    <small class="version">Palique {version}</small>
  </footer>
</div>

<style>
  /* Grows (and scrolls) when the sign-up form is taller than the window. */
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
    min-height: 120px;
    padding-bottom: 14px;
    overflow: hidden;
    background: var(--sky);
    box-sizing: border-box;
  }

  /* Shorter by the menu bar above it, so the form still fits without scrolling. */
  header.tall {
    min-height: 210px;
    padding-bottom: 18px;
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

  label small {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
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

  .intro {
    margin: 0;
    color: var(--text-muted);
  }

  .info {
    margin: 0;
    color: var(--text-strong);
  }

  .link {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-strong);
    font-weight: 700;
  }

  form .link {
    justify-self: center;
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
