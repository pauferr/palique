<script lang="ts">
  import { parseEmoticons } from './emoticons'

  let { text }: { text: string } = $props()
  const parts = $derived(parseEmoticons(text))
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
