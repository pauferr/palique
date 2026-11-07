<script lang="ts">
  import EmoticonCanvas from './EmoticonCanvas.svelte'
  import { EMOTICONS } from './emoticons'
  import { _ } from './i18n'

  // Development view (#emoticons in the dev app's address): every emoticon at chat size
  // and big, to draw them. Not linked from the app.
</script>

<main>
  {#each EMOTICONS as { id, codes, name } (id)}
    <figure>
      <span class="big"><EmoticonCanvas {id} code={codes[0]} /></span>
      <figcaption>
        <EmoticonCanvas {id} code={codes[0]} />
        {_(name)} <code>{codes[0]}</code>
      </figcaption>
    </figure>
  {/each}
</main>

<style>
  main {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
    padding: 16px;
  }

  figure {
    display: grid;
    justify-items: center;
    gap: 6px;
    margin: 0;
  }

  .big {
    font-size: 90px;
  }
</style>
