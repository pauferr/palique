<script lang="ts">
  import { parseEmoticons } from './emoticons'
  import { prefs } from './prefs.svelte'

  let { text }: { text: string } = $props()
  // With emoticons off in Options, the codes stay as typed.
  const parts = $derived(prefs.emoticons ? parseEmoticons(text) : [{ text }])
</script>

{#each parts as part, i (i)}{#if 'emoji' in part}<span
      class="emoticon"
      role="img"
      aria-label={part.code}
      title={part.code}>{part.emoji}</span
    >{:else}{part.text}{/if}{/each}

<style>
  .emoticon {
    font-size: 1.25em;
    line-height: 1;
    vertical-align: -0.1em;
  }
</style>
