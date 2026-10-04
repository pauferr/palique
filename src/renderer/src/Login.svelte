<script lang="ts">
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

<form onsubmit={submit}>
  <h1>Palique</h1>

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

  <button type="submit" disabled={busy}>
    {#if busy}Conectando…{:else if mode === 'register'}Crear cuenta{:else}Iniciar sesión{/if}
  </button>

  <button type="button" class="link" onclick={switchMode} disabled={busy}>
    {mode === 'login' ? '¿No tienes cuenta? Crea una' : '¿Ya tienes cuenta? Inicia sesión'}
  </button>
</form>

<style>
  form {
    display: grid;
    gap: 0.75rem;
    width: min(18rem, 100% - 2rem);
  }

  h1 {
    text-align: center;
  }

  label {
    display: grid;
    gap: 0.25rem;
  }

  .error {
    margin: 0;
    color: #c0392b;
  }

  .link {
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
