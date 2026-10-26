<script lang="ts">
  import WinkPlayer from './WinkPlayer.svelte'
  import { winkLabel, winks } from './winks'
  import { _ } from './i18n'

  // Development view (#winks in the dev app's address): every wink, to polish them.
  // Not linked from the app.
  let playing = $state('')
  let sound = $state(true)
</script>

<svelte:head><title>{_('Guiños')}</title></svelte:head>

<main>
  <label><input type="checkbox" bind:checked={sound} /> {_('Sonido')}</label>
  <ul>
    {#each winks() as { id, dur } (id)}
      <li>
        <button onclick={() => (playing = playing === id ? '' : id)}>
          {playing === id ? '■' : '▶'}
          {winkLabel(id)} <small>{id} · {dur} s</small>
        </button>
        <div class="stage">
          <WinkPlayer {id} playing={playing === id} {sound} onended={() => (playing = '')} />
        </div>
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: 6px;
  }

  button {
    justify-self: start;
  }

  small {
    color: var(--text-muted);
  }

  /* A desktop-like background, since winks play over the screen. */
  .stage {
    aspect-ratio: 4 / 3;
    border-radius: 8px;
    background: radial-gradient(120% 90% at 30% 20%, #8fd3ff, #4f9be8 45%, #2c6bc4);
  }
</style>
