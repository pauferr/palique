<script lang="ts">
  import { onMount } from 'svelte'
  import type { UpdateStatus } from '../../main/updates'
  import { _ } from './i18n'
  import { versionLabel } from './version'

  // A new release (see main/updates.ts): macOS downloads it by hand, Windows and Linux
  // already have it and install it on quit.
  let update: UpdateStatus | null = $state(null)

  onMount(() => {
    window.api.update().then((status) => (update ??= status))
    return window.api.onUpdate((status) => {
      update = status
    })
  })
</script>

{#if update?.state === 'available'}
  <p class="update" role="status">
    {_('Hay una versión nueva de Palique: {version}.', { version: versionLabel(update.version) })}
    <a
      href="https://github.com/pauferr/palique/releases/tag/v{update.version}"
      target="_blank"
      rel="noreferrer">{_('Descargar')}</a
    >
  </p>
{:else if update?.state === 'ready'}
  <p class="update" role="status">
    {_('Palique se ha actualizado a la {version}. Se aplicará al cerrarlo.', {
      version: versionLabel(update.version)
    })}
    <button class="primary" onclick={() => window.api.installUpdate()}
      >{_('Reiniciar ahora')}</button
    >
  </p>
{/if}

<style>
  /* A soft note across the top of the window. */
  .update {
    align-self: stretch;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    margin: 0;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    background: var(--warning-bg);
    border-bottom: 1px solid var(--line);
  }

  a {
    color: var(--text-strong);
    font-weight: 800;
  }

  button {
    padding: 3px 12px;
    font-size: 12px;
  }
</style>
