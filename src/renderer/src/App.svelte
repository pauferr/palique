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
  <Login onlogin={(value) => (jid = value)} />
{/if}
