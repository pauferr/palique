<script lang="ts">
  import Login from './Login.svelte'
  import Roster from './Roster.svelte'

  let jid = $state('')

  async function logout(): Promise<void> {
    await window.api.logout()
    jid = ''
  }
</script>

<main>
  {#if jid}
    <Roster {jid} onlogout={logout} />
  {:else}
    <Login onlogin={(value) => (jid = value)} />
  {/if}
</main>

<style>
  main {
    display: grid;
    place-content: center;
    justify-items: center;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
</style>
