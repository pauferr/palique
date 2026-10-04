<script lang="ts">
  import Login from './Login.svelte'

  let jid = $state('')

  async function logout(): Promise<void> {
    await window.api.logout()
    jid = ''
  }
</script>

<main>
  {#if jid}
    <h1>Palique</h1>
    <p>Conectado como <strong>{jid}</strong></p>
    <button onclick={() => window.api.playWink('demo')}>Probar guiño</button>
    <button onclick={logout}>Cerrar sesión</button>
  {:else}
    <Login onlogin={(value) => (jid = value)} />
  {/if}
</main>

<style>
  main {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    height: 100vh;
    font-family: system-ui, sans-serif;
  }
</style>
