<script lang="ts">
  import { onMount } from 'svelte'
  import { _ } from './i18n'

  let version = $state('')
  onMount(() => {
    window.api.version().then((value) => (version = value))
  })
</script>

<svelte:head><title>{_('Acerca de Palique')}</title></svelte:head>

<main>
  <header>
    <h1>Palique</h1>
    <p class="version">{version}</p>
  </header>
  <p>{_('¿Echamos un palique? Un mensajero como los de antes.')}</p>
  <footer>
    <button onclick={() => window.close()}>{_('Cerrar')}</button>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    text-align: center;
  }

  header {
    padding: 24px 16px 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: 32px;
    font-style: italic;
  }

  .version {
    margin: 4px 0 0;
    color: var(--text-muted);
  }

  main > p {
    flex: 1;
    margin: 0;
    padding: 20px 24px;
  }

  footer {
    padding: 0 16px 16px;
  }
</style>
