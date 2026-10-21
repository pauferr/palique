<script lang="ts">
  import { onMount } from 'svelte'
  import WinkPlayer from './WinkPlayer.svelte'
  import { findWink } from './winks'

  let { id }: { id: string } = $props()
  const done = (): void => window.api.winkDone()

  // Sound follows Options, so wait for the settings before playing.
  let sounds: boolean | undefined = $state()
  onMount(() => {
    // Unknown id (e.g. sent by a newer Palique): close without showing anything.
    if (!findWink(id)) return done()
    window.api.getSettings().then((s) => (sounds = s.sounds))
  })
</script>

{#if sounds !== undefined}
  <WinkPlayer {id} playing sound={sounds} onended={done} />
{/if}

<style>
  /* All component CSS ships in one bundle loaded by every window, so scope this to the
     overlay (html.overlay is set in main.ts) or every window would turn see-through. */
  :global(html.overlay),
  :global(html.overlay body) {
    height: 100%;
    margin: 0;
    background: transparent;
    overflow: hidden;
  }

  :global(html.overlay #app) {
    height: 100%;
  }
</style>
