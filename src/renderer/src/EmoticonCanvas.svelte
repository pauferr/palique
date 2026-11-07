<script module lang="ts">
  // One animation loop for every emoticon in the window, running only while some are on
  // screen. ponytail: each one redrawn every frame; pre-render sprites if long histories
  // full of emoticons ever feel slow.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain bookkeeping, nothing renders from it
  const playing = new Set<(t: number) => void>()
  let frame = 0
  const loop = (now: number): void => {
    playing.forEach((paint) => paint(now / 1000))
    frame = playing.size ? requestAnimationFrame(loop) : 0
  }
  const play = (paint: (t: number) => void): void => {
    playing.add(paint)
    frame ||= requestAnimationFrame(loop)
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
</script>

<script lang="ts">
  import { BOX, drawings } from './emoticons/draw'

  // `still`: drawn without moving (e.g. the picker until hovered).
  let { id, code, still = false }: { id: string; code: string; still?: boolean } = $props()

  let canvas: HTMLCanvasElement

  $effect(() => {
    const draw = drawings[id]
    const c = canvas.getContext('2d')
    if (!draw || !c) return undefined
    const paint = (t: number): void => {
      const scale = canvas.width / BOX
      c.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2)
      c.clearRect(-BOX / 2, -BOX / 2, BOX, BOX)
      c.save()
      draw(c, t)
      c.restore()
    }
    // Sharp at the screen's pixel density, whatever the font size.
    const resize = new ResizeObserver(() => {
      const side = Math.round(canvas.clientWidth * devicePixelRatio)
      if (!side) return
      canvas.width = canvas.height = side
      paint(0)
    })
    resize.observe(canvas)
    if (still || reduceMotion.matches) return () => resize.disconnect()
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) play(paint)
      else playing.delete(paint)
    })
    seen.observe(canvas)
    return () => {
      resize.disconnect()
      seen.disconnect()
      playing.delete(paint)
    }
  })
</script>

<span class="emoticon" role="img" aria-label={code} title={code}
  ><canvas bind:this={canvas}></canvas></span
>

<style>
  .emoticon {
    display: inline-block;
    width: 1.35em;
    height: 1.35em;
    vertical-align: -0.3em;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
