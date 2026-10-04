<script lang="ts">
  import Login from './Login.svelte'
  import Roster from './Roster.svelte'

  let jid = $state('')

  async function logout(): Promise<void> {
    await window.api.logout()
    jid = ''
  }
</script>

{#if jid}
  <Roster {jid} onlogout={logout} />
{:else}
  <main>
    <Login onlogin={(value) => (jid = value)} />
  </main>
{/if}

<style>
  main {
    display: grid;
    place-content: center;
    justify-items: center;
    min-height: 100vh;
  }
</style>
