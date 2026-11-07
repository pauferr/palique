<script lang="ts">
  import EmoticonCanvas from './EmoticonCanvas.svelte'
  import { parseEmoticons, type Part } from './emoticons'
  import { parsePlus, type Run } from './plus'
  import { prefs } from './prefs.svelte'

  // `plus`: also draw formatting codes (display names).
  let { text, plus = false }: { text: string; plus?: boolean } = $props()

  // With emoticons off in Options, the codes stay as typed.
  const emoticons = (t: string): Part[] => (prefs.emoticons ? parseEmoticons(t) : [{ text: t }])
  const runs = $derived<Run[]>(plus ? parsePlus(text) : [{ text }])

  const style = (run: Run): string =>
    [
      run.bold && 'font-weight:bold',
      run.italic && 'font-style:italic',
      (run.underline || run.strike) &&
        `text-decoration:${[run.underline && 'underline', run.strike && 'line-through'].filter(Boolean).join(' ')}`,
      run.color && !run.gradient && `color:${run.color}`,
      run.background && `background-color:${run.background}`,
      run.gradient && `--from:${run.gradient[0]};--to:${run.gradient[1]}`
    ]
      .filter(Boolean)
      .join(';')
</script>

{#snippet parts(
  list: (Part & { color?: string })[]
)}{#each list as part, i (i)}{#if 'id' in part}<EmoticonCanvas
        id={part.id}
        code={part.code}
      />{:else}{part.text}{/if}{/each}{/snippet}

{#each runs as run, i (i)}{#if !plus}{@render parts(emoticons(run.text))}{:else}<span
      class:gradient={run.gradient}
      style={style(run)}>{@render parts(emoticons(run.text))}</span
    >{/if}{/each}

<style>
  /* A gradient fills the letters themselves; emoticons keep their own colors. */
  .gradient {
    background-image: linear-gradient(90deg in oklab, var(--from), var(--to));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
</style>
