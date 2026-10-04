<script lang="ts">
  // The catalog is whatever ships in assets/winks: file name = wink id.
  const catalog = import.meta.glob<string>('./assets/winks/*.webm', {
    eager: true,
    import: 'default'
  })

  let { id }: { id: string } = $props()
  // svelte-ignore state_referenced_locally
  const src = catalog[`./assets/winks/${id}.webm`]
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
  :global(html, body) {
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
