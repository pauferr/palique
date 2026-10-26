<script lang="ts">
  import { onMount } from 'svelte'
  import Login from './Login.svelte'
  import Roster from './Roster.svelte'

  let jid = $state('')
  // Unknown until main says who's signed in: a window reloaded (e.g. for a new language)
  // stays signed in, and the sign-in screen mustn't sign in again by itself meanwhile.
  let ready = $state(false)
  window.api.currentAccount().then((current) => {
    jid = current
    ready = true
  })

  async function logout(): Promise<void> {
    await window.api.logout()
    jid = ''
  }

  // An invite or password recovery link while signed in: sign out so its form shows (it
  // picks the link up itself).
  onMount(() =>
    window.api.onLink(() => {
      if (jid) logout()
    })
  )
</script>

{#if !ready}
  <!-- Waiting for main. -->
{:else if jid}
  <Roster {jid} onlogout={logout} />
{:else}
  <Login onlogin={(value) => (jid = value)} />
{/if}
