<script lang="ts">
  import { onMount } from 'svelte'
  import type { AuthLink } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'

  let { onlogin }: { onlogin: (jid: string) => void } = $props()

  const messages = {
    conflict: 'Esta invitación ya se usó para crear una cuenta. Inicia sesión.',
    'not-acceptable': 'El servidor no acepta esa contraseña.',
    'not-authorized': 'Correo o contraseña incorrectos.',
    'invalid-invite': 'La invitación no es válida, ya se usó o ha caducado.',
    wait: 'Demasiados intentos. Espera un minuto.',
    unreachable: 'No se puede conectar con el servidor.',
    unknown: 'Algo ha fallado. Inténtalo de nuevo.'
  }

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

  const address = (): string => email.trim().toLowerCase()
  // The invite code can be pasted bare or as the whole link (palique://registro?t=CODE).
  const inviteCode = (): string => invite.trim().match(/[?&]t=([^&\s]+)/)?.[1] ?? invite.trim()
  const submitLabel = $derived({
    login: 'Iniciar sesión',
    register: invitedEmail ? 'Crear cuenta' : 'Continuar',
    forgot: 'Enviar enlace',
    reset: 'Cambiar contraseña'
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
    window.api.pendingLink().then(useLink)
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
    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      error = 'Las contraseñas no coinciden.'
      return
    }
    busy = true
    if (mode === 'forgot') {
      try {
        await window.api.forgotPassword(address())
        info = `Si ${address()} tiene cuenta, te hemos enviado un enlace y un código. Caducan en una hora.`
      } catch {
        error = messages.unreachable
      }
      busy = false
      return
    }
    const result =
      mode === 'register'
        ? await window.api.register({ token: inviteCode(), nick, password, newsletter })
        : mode === 'reset'
          ? await window.api.resetPassword(address(), code.trim(), password)
          : await window.api.login(address(), password)
    busy = false
    if ('jid' in result) onlogin(result.jid)
    else if (mode === 'reset' && result.error === 'invalid-invite') {
      error = 'El código no es válido o ha caducado. Pide otro.'
    } else error = messages[result.error]
  }
</script>

<div class="login" style:--overlap={mode === 'login' ? '56px' : '36px'}>
  <header>
    <h1>Palique</h1>
    <p>¿Echamos un palique?</p>
  </header>

  <!-- Placeholder frame until the cast illustrations exist; shows the initial as you type. -->
  <div class="frame">
    <Avatar
      jid={(mode === 'register' ? nick : email).trim() || 'palique'}
      show="online"
      size={mode === 'login' ? 96 : 56}
    />
  </div>

  <form onsubmit={submit}>
    {#if mode === 'forgot'}
      <p class="intro">Escribe tu correo y te enviaremos un enlace para elegir otra contraseña.</p>
    {:else if mode === 'reset'}
      <p class="intro">Elige tu nueva contraseña. El código está en el correo que te enviamos.</p>
    {:else if mode === 'register' && !invitedEmail}
      <p class="intro">
        Para crear una cuenta hace falta una invitación. Pulsa el botón del correo que te llegó o
        pega aquí su código.
      </p>
    {/if}

    {#if mode === 'register'}
      {#if invitedEmail}
        <p class="intro">Entrarás con <strong>{invitedEmail}</strong>.</p>
        <label>
          Tu nombre
          <input bind:value={nick} required maxlength="64" autocomplete="nickname" />
          <small>Es lo que verán tus contactos. Puedes cambiarlo cuando quieras.</small>
        </label>
      {:else}
        <label>
          Código de invitación
          <input spellcheck="false" bind:value={invite} required autocomplete="off" />
        </label>
      {/if}
    {:else}
      <label>
        Correo electrónico
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
        Código del correo
        <input spellcheck="false" bind:value={code} required autocomplete="one-time-code" />
      </label>
    {/if}

    {#if mode === 'login' || mode === 'reset' || invitedEmail}
      <label>
        {mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}
        <input
          type="password"
          bind:value={password}
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minlength={mode === 'login' ? undefined : 8}
        />
      </label>
    {/if}

    {#if mode === 'reset' || invitedEmail}
      <label>
        Repite la contraseña
        <input type="password" bind:value={confirm} autocomplete="new-password" required />
      </label>
    {/if}

    {#if invitedEmail}
      <label class="check">
        <input type="checkbox" bind:checked={newsletter} />
        Quiero recibir el boletín con las novedades de Palique (puedes darte de baja cuando quieras)
      </label>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if info}<p class="info" role="status">{info}</p>{/if}

    <button type="submit" class="submit" disabled={busy}>
      {busy ? 'Un momento…' : submitLabel[mode]}
    </button>

    {#if mode === 'forgot'}
      <button type="button" class="link" onclick={() => go('reset')}>Ya tengo un código</button>
    {/if}
  </form>

  <footer>
    {#if mode === 'login'}
      <button type="button" class="link" onclick={() => go('forgot')} disabled={busy}>
        ¿Olvidaste tu contraseña?
      </button>
      <button type="button" class="link" onclick={() => go('register')} disabled={busy}>
        ¿Tienes una invitación? Crea tu cuenta
      </button>
    {:else}
      <button type="button" class="link" onclick={() => go('login')} disabled={busy}>
        Volver a iniciar sesión
      </button>
    {/if}
    <small class="version">{version}</small>
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
    align-self: stretch;
    padding: 28px 16px var(--overlap, 56px);
    text-align: center;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: 34px;
    font-style: italic;
    letter-spacing: -0.5px;
  }

  header p {
    margin: 2px 0 0;
    color: var(--text-muted);
  }

  /* The picture frame overlaps the header, like the old sign-in screens. */
  .frame {
    margin-top: calc(8px - var(--overlap, 56px));
    padding: 4px;
    border-radius: var(--radius-large);
    background: var(--window-bg);
  }

  form {
    display: grid;
    gap: 10px;
    width: min(16rem, 100% - 2rem);
    margin-top: 16px;
  }

  label {
    display: grid;
    gap: 2px;
    color: var(--text-strong);
  }

  label small {
    color: var(--text-muted);
    font-size: 11px;
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    color: var(--text);
    font-size: 12px;
  }

  .error {
    margin: 0;
    color: var(--text-error);
  }

  .submit {
    justify-self: center;
    margin-top: 4px;
    padding: 4px 20px;
    font-weight: bold;
  }

  footer {
    display: grid;
    gap: 6px;
    justify-items: center;
    margin-top: auto;
    padding: 12px;
  }

  .version {
    color: var(--text-muted);
    font-size: 11px;
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
    text-decoration: underline;
  }

  .link:hover:not(:disabled) {
    background: none;
  }
</style>
