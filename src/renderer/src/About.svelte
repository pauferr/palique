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
    <span class="cloud c1" aria-hidden="true"></span>
    <span class="cloud c2" aria-hidden="true"></span>
    <h1>Palique</h1>
    <p class="version">{version}</p>
  </header>
  <p>{_('¿Echamos un palique? Un mensajero como los de antes.')}</p>
  <footer>
    <button class="close" onclick={() => window.close()}>{_('Cerrar')}</button>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    text-align: center;
  }

  /* The sky with two clouds, as on the sign-in screen. */
  header {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    justify-content: flex-end;
    height: 128px;
    padding-bottom: 6px;
    overflow: hidden;
    background: var(--sky);
    box-sizing: border-box;
  }

  .cloud {
    position: absolute;
    border-radius: 40px;
    background: var(--cloud);
  }

  .c1 {
    left: -20px;
    top: 22px;
    width: 110px;
    height: 34px;
  }

  .c2 {
    right: -16px;
    top: 50px;
    width: 96px;
    height: 28px;
    opacity: 0.8;
  }

  h1,
  .version {
    position: relative;
    margin: 0;
  }

  h1 {
    color: var(--text);
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .version {
    color: var(--text-muted);
    font-weight: 700;
  }

  main > p {
    flex: 1;
    margin: 0;
    padding: 14px 28px;
    font-size: 15px;
  }

  footer {
    padding: 0 16px 16px;
  }

  .close {
    padding: 8px 26px;
    font-size: 15px;
    font-weight: 800;
  }
</style>
