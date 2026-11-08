<script lang="ts">
  import { gifSrc } from './gif'

  // A Klipy GIF that moves on its own. With the system's «reduce motion», its first frame
  // (drawn on a canvas when it loads) until the pointer is on it.
  let {
    url,
    width,
    height,
    alt = '',
    onload,
    onerror
  }: {
    url: string
    width?: number
    height?: number
    alt?: string
    onload?: () => void
    onerror?: () => void
  } = $props()

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let hovered = $state(false)
  let canvas: HTMLCanvasElement | undefined = $state()

  function loaded(event: Event): void {
    const img = event.currentTarget as HTMLImageElement
    if (still && canvas) {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
    }
    onload?.()
  }
</script>

<span
  class="gif-image"
  role="presentation"
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
>
  <img
    src={gifSrc(url)}
    {width}
    {height}
    {alt}
    hidden={still && !hovered}
    onload={loaded}
    onerror={() => onerror?.()}
  />
  {#if still}<canvas bind:this={canvas} {width} {height} hidden={hovered} aria-hidden="true"
    ></canvas>{/if}
</span>

<style>
  .gif-image {
    display: block;
  }

  img,
  canvas {
    display: block;
    max-width: 100%;
    height: auto;
  }

  [hidden] {
    display: none;
  }
</style>
