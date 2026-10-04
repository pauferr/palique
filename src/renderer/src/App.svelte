<script lang="ts">
  import { onMount } from 'svelte'
  import Login from './Login.svelte'
  import Roster from './Roster.svelte'

  let jid = $state('')

  async function logout(): Promise<void> {
    await window.api.logout()
    jid = ''
  }

  // A password recovery link while signed in: sign out so the reset form shows (it picks
  // the link up itself).
  onMount(() =>
    window.api.onResetLink(() => {
      if (jid) logout()
    })
  )
</script>

{#if jid}
  <Roster {jid} onlogout={logout} />
{:else}
  <Login onlogin={(value) => (jid = value)} />
{/if}
