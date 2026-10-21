<script lang="ts">
  import { onMount } from 'svelte'
  import type { UpdateStatus } from '../../main/updates'

  // A new release (see main/updates.ts): macOS downloads it by hand, Windows and Linux
  // already have it and install it on quit.
  let update: UpdateStatus | null = $state(null)

  onMount(() => {
    window.api.update().then((status) => (update ??= status))
    return window.api.onUpdate((status) => (update = status))
  })
</script>

{#if update?.state === 'available'}
  <p class="update" role="status">
    Hay una versión nueva de Palique (v{update.version}).
    <a
      href="https://github.com/pauferr/palique/releases/tag/v{update.version}"
      target="_blank"
      rel="noreferrer">Descargar</a
    >
  </p>
{:else if update?.state === 'ready'}
  <p class="update" role="status">
    Palique se ha actualizado a la v{update.version}. Se aplicará al cerrarlo.
    <button onclick={() => window.api.installUpdate()}>Reiniciar ahora</button>
  </p>
{/if}

<style>
  .update {
    align-self: stretch;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: center;
    margin: 0;
    padding: 6px 10px;
    font-size: 12px;
    background: var(--warning-bg);
    border-bottom: 1px solid var(--line);
  }

  a {
    color: var(--text-strong);
    font-weight: bold;
  }

  button {
    padding: 2px 8px;
    font-size: 12px;
  }
</style>
