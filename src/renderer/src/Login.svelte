<script lang="ts">
  import Avatar from './Avatar.svelte'

  let { onlogin }: { onlogin: (jid: string) => void } = $props()

  const messages = {
    conflict: 'Ese nombre de usuario ya está cogido.',
    'not-acceptable': 'El servidor no acepta ese usuario o contraseña.',
    'not-authorized': 'Usuario o contraseña incorrectos.',
    unreachable: 'No se puede conectar con el servidor.',
    unknown: 'Algo ha fallado. Inténtalo de nuevo.'
  }

  let mode: 'login' | 'register' = $state('login')
  let username = $state('')
  let password = $state('')
  let confirm = $state('')
  let error = $state('')
  let busy = $state(false)

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    error = ''
    if (mode === 'register' && password !== confirm) {
      error = 'Las contraseñas no coinciden.'
      return
    }
    busy = true
    const user = username.trim().toLowerCase()
    const result =
      mode === 'register'
        ? await window.api.register(user, password)
        : await window.api.login(user, password)
    busy = false
    if ('jid' in result) onlogin(result.jid)
    else error = messages[result.error]
  }

  function switchMode(): void {
    mode = mode === 'login' ? 'register' : 'login'
    error = ''
    confirm = ''
  }
</script>

<div class="login">
  <header>
    <h1>Palique</h1>
    <p>¿Echamos un palique?</p>
  </header>

  <!-- Placeholder frame until the cast illustrations exist; shows the initial as you type. -->
  <div class="frame">
    <Avatar jid={username.trim() || 'palique'} show="online" size={96} />
  </div>

  <form onsubmit={submit}>
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

    <label>
      Contraseña
      <input
        type="password"
        bind:value={password}
        autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
        required
        minlength={mode === 'register' ? 8 : undefined}
      />
    </label>

    {#if mode === 'register'}
      <label>
        Repite la contraseña
        <input type="password" bind:value={confirm} autocomplete="new-password" required />
      </label>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <button type="submit" class="submit" disabled={busy}>
      {#if busy}Conectando…{:else if mode === 'register'}Crear cuenta{:else}Iniciar sesión{/if}
    </button>
  </form>

  <footer>
    <button type="button" class="link" onclick={switchMode} disabled={busy}>
      {mode === 'login' ? '¿No tienes cuenta? Crea una' : '¿Ya tienes cuenta? Inicia sesión'}
    </button>
  </footer>
</div>

<style>
  .login {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
  }

  header {
    align-self: stretch;
    padding: 28px 16px 56px;
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
    margin-top: -48px;
    padding: 4px;
    border-radius: 12px;
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
    margin-top: auto;
    padding: 12px;
  }

  .link {
    padding: 0;
    background: none;
    border: none;
    color: var(--text-strong);
    text-decoration: underline;
  }

  .link:hover:not(:disabled) {
    background: none;
  }
</style>
