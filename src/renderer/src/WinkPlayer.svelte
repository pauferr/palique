<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { findWink } from './winks'
  import { H, W, makeSound } from './winks/kit'

  // Draws a wink on a canvas that fills its box, sharp at the screen's pixel density.
  // Not playing: a still at the wink's telling moment (the picker's thumbnails).
  let {
    id,
    playing = false,
    sound = false,
    loop = false,
    onended
  }: {
    id: string
    playing?: boolean
    sound?: boolean
    loop?: boolean
    onended?: () => void
  } = $props()

  const wink = $derived(findWink(id))
  let canvas: HTMLCanvasElement
  let frame = 0
  let audio: AudioContext | undefined
  let started = 0

  function draw(t: number): void {
    const c = canvas?.getContext('2d')
    if (!c) return
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, canvas.width, canvas.height)
    if (!wink) return
    // "Contain": the whole 480×360 scene, centered, as big as the box allows.
    const scale = Math.min(canvas.width / W, canvas.height / H)
    c.setTransform(
      scale,
      0,
      0,
      scale,
      (canvas.width - W * scale) / 2,
      (canvas.height - H * scale) / 2
    )
    c.save()
    wink.draw(c, t)
    c.restore()
  }

  function stopSound(): void {
    audio?.close().catch(() => {})
    audio = undefined
  }

  function startSound(): void {
    stopSound()
    if (!sound || !wink) return
    audio = new AudioContext()
    const master = audio.createGain()
    master.gain.value = 0.9
    master.connect(audio.destination)
    wink.sound(makeSound(audio, master))
  }

  function tick(now: number): void {
    if (!wink) return
    const t = (now - started) / 1000
    if (t >= wink.dur) {
      if (loop) {
        started = now
        startSound()
        frame = requestAnimationFrame(tick)
        return
      }
      draw(wink.dur)
      stopSound()
      onended?.()
      return
    }
    draw(t)
    frame = requestAnimationFrame(tick)
  }

  // (Re)start whenever it starts playing; show the still when it stops.
  $effect(() => {
    cancelAnimationFrame(frame)
    if (!wink) {
      if (playing) onended?.()
      return undefined
    }
    if (!playing) {
      stopSound()
      draw(wink.still)
      return undefined
    }
    // Played even with "reduce motion": a wink is an animation someone sent on purpose,
    // like a video (the full-screen one can be turned off in Options).
    started = performance.now()
    startSound()
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  })

  // Keep the backing store matched to the box and the pixel density (capped: 2× is
  // already Retina-sharp and a full-screen canvas costs more above that).
  onMount(() => {
    const resize = (): void => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (!playing && wink) draw(wink.still)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    return () => observer.disconnect()
  })

  onDestroy(() => {
    cancelAnimationFrame(frame)
    stopSound()
  })
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
