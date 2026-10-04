<script lang="ts">
  import { onMount } from 'svelte'
  import type { ExportFormat } from '../../main/export'

  const results = {
    saved: 'Historial exportado.',
    canceled: '',
    empty: 'Todavía no hay conversaciones que exportar.'
  }

  let format: ExportFormat = $state('html')
  let busy = $state(false)
  let message = $state('')
  let winks = $state(true)

  onMount(() => {
    window.api.getSettings().then((s) => (winks = s.winks))
  })

  async function exportHistory(): Promise<void> {
    busy = true
    message = ''
    try {
      message = results[await window.api.exportHistory(format)]
    } catch {
      message = 'No se ha podido guardar el archivo.'
    }
    busy = false
  }
</script>

<svelte:head><title>Opciones</title></svelte:head>

<main>
  <h1>Opciones</h1>

  <section>
    <h2>Guiños</h2>
    <label>
      <input
        type="checkbox"
        bind:checked={winks}
        onchange={() => window.api.setSettings({ winks })}
      />
      Mostrar los guiños a pantalla completa
    </label>
    <p class="hint">Desactivados, los guiños solo aparecen como texto en la conversación.</p>
  </section>

  <section>
    <h2>Historial</h2>
    <p>
      Tus conversaciones solo se guardan en este equipo: el servidor no las archiva. Si formateas o
      cambias de ordenador, se pierden. Expórtalas para guardar una copia.
    </p>

    <fieldset>
      <legend>Formato</legend>
      <label><input type="radio" bind:group={format} value="html" /> HTML (para leer)</label>
      <label><input type="radio" bind:group={format} value="txt" /> Texto plano</label>
      <label><input type="radio" bind:group={format} value="json" /> JSON (para importar)</label>
    </fieldset>

    <button onclick={exportHistory} disabled={busy}>Exportar historial…</button>
    {#if message}<p role="status">{message}</p>{/if}
  </section>
</main>

<style>
  main {
    padding: 0 1rem 1rem;
    font-family: system-ui, sans-serif;
  }

  h2 {
    font-size: 1rem;
  }

  p {
    color: #444;
  }

  .hint {
    margin-top: 0.25rem;
    font-size: 0.85rem;
    color: #777;
  }

  fieldset {
    display: grid;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }
</style>
