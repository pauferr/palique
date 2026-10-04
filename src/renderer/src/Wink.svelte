<script lang="ts">
  import { winks } from './winks'

  let { id }: { id: string } = $props()
  // svelte-ignore state_referenced_locally
  const src = Object.hasOwn(winks, id) ? winks[id] : undefined
  const done = (): void => window.api.winkDone()

  // Unknown id (e.g. a pack the user doesn't have): close without showing anything.
  if (!src) done()
</script>

{#if src}
  <!-- Decorative animation with no dialogue: nothing to caption. -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video {src} aria-hidden="true" autoplay onended={done} onerror={done}></video>
{/if}

<style>
  /* All component CSS ships in one bundle loaded by every window, so scope this to the
     overlay (html.overlay is set in main.ts) or every window would turn see-through. */
  :global(html.overlay),
  :global(html.overlay body) {
    margin: 0;
    background: transparent;
    overflow: hidden;
  }

  video {
    width: 100vw;
    height: 100vh;
    object-fit: contain;
  }
</style>
