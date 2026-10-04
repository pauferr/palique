<script lang="ts">
  import { onMount } from 'svelte'
  import Avatar from './Avatar.svelte'

  let { onlogin }: { onlogin: (jid: string) => void } = $props()

  const messages = {
    conflict: 'Ese nombre de usuario ya está cogido.',
    'not-acceptable': 'El servidor no acepta ese usuario o contraseña.',
    'not-authorized': 'Usuario o contraseña incorrectos.',
    'invalid-invite': 'El código de invitación no es válido o ha caducado.',
    unreachable: 'No se puede conectar con el servidor.',
    unknown: 'Algo ha fallado. Inténtalo de nuevo.'
  }

  // forgot: ask for a recovery email. reset: new password with the emailed code.
  let mode: 'login' | 'register' | 'forgot' | 'reset' = $state('login')
  let username = $state('')
  let password = $state('')
  let confirm = $state('')
  let invite = $state('')
  let code = $state('')
  let email = $state('')
  let newsletter = $state(false)
  let error = $state('')
  let info = $state('')
  let busy = $state(false)

  const user = (): string => username.trim().toLowerCase()
  const submitLabel = {
    login: 'Iniciar sesión',
    register: 'Crear cuenta',
    forgot: 'Enviar enlace',
    reset: 'Cambiar contraseña'
  }

  function go(next: typeof mode): void {
    mode = next
    error = ''
    info = ''
    confirm = ''
    if (next !== 'login') password = ''
  }

  // A recovery link from the email fills the form in; the user still confirms.
  function useLink(link: { username: string; token: string } | null): void {
    if (!link) return
    go('reset')
    username = link.username
    code = link.token
  }

  onMount(() => {
    window.api.pendingReset().then(useLink)
    return window.api.onResetLink(useLink)
  })

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    error = ''
    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      error = 'Las contraseñas no coinciden.'
      return
    }
    busy = true
    if (mode === 'forgot') {
      try {
        await window.api.forgotPassword(user())
        info = `Si «${user()}» tiene un correo confirmado, te hemos enviado un enlace y un código. Caducan en una hora.`
      } catch {
        error = messages.unreachable
      }
      busy = false
      return
    }
    const result =
      mode === 'register'
        ? await window.api.register(user(), password, { invite, email: email.trim(), newsletter })
        : mode === 'reset'
          ? await window.api.resetPassword(user(), code.trim(), password)
          : await window.api.login(user(), password)
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
    <Avatar jid={username.trim() || 'palique'} show="online" size={mode === 'login' ? 96 : 56} />
  </div>

  <form onsubmit={submit}>
    {#if mode === 'forgot'}
      <p class="intro">
        Escribe tu usuario y te enviaremos a tu correo un enlace para elegir otra contraseña.
      </p>
    {:else if mode === 'reset'}
      <p class="intro">Elige tu nueva contraseña. El código está en el correo que te enviamos.</p>
    {/if}

    {#if mode === 'register'}
      <label>
        Código de invitación
        <input
          bind:value={invite}
          required
          autocomplete="off"
          placeholder="Pega el código o el enlace que te enviaron"
        />
      </label>
    {/if}

    <label>
      Usuario
      <input
        bind:value={username}
        autocomplete="username"
        required
        minlength="3"
        maxlength="32"
        pattern="[A-Za-z0-9._\-]+"
        title="Letras, números, punto, guion y guion bajo"
      />
    </label>

    {#if mode === 'reset'}
      <label>
        Código del correo
        <input bind:value={code} required autocomplete="one-time-code" />
      </label>
    {/if}

    {#if mode !== 'forgot'}
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

    {#if mode === 'register' || mode === 'reset'}
      <label>
        Repite la contraseña
        <input type="password" bind:value={confirm} autocomplete="new-password" required />
      </label>
    {/if}

    {#if mode === 'register'}
      <label>
        Correo electrónico
        <input type="email" bind:value={email} autocomplete="email" required maxlength="254" />
        <small
          >Para recuperar tu contraseña si la olvidas. Te enviaremos un enlace para confirmarlo.</small
        >
      </label>
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
        ¿No tienes cuenta? Crea una
      </button>
    {:else}
      <button type="button" class="link" onclick={() => go('login')} disabled={busy}>
        Volver a iniciar sesión
      </button>
    {/if}
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
