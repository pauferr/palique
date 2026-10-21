<script lang="ts">
  import { events, packs as all, playEffect, type Pack, type SoundEvent } from './sounds'
  import type { SoundPack } from '../../main/settings'

  // Development view (#sounds in the dev app's address): every sound collection side by
  // side, to tune them. Not linked from the app.
  // Recordings can be cut here to try lengths; the sliders change only this view.
  const packs = $state(all)
  let volume = $state(0.8)
  let mix = $state<Record<SoundEvent, SoundPack>>({
    message: 'classic',
    online: 'classic',
    buzz: 'classic'
  })

  const pack = (id: string): Pack => packs.find((p) => p.id === id)!
  const play = (p: Pack, e: SoundEvent): void => void playEffect(p[e], volume)

  function playMix(): void {
    events.forEach(({ id }, i) => setTimeout(() => play(pack(mix[id]), id), i * 1400))
  }
</script>

<svelte:head><title>Sonidos</title></svelte:head>

<main>
  <label>Volumen <input type="range" min="0" max="1" step="0.05" bind:value={volume} /></label>

  <ul>
    {#each packs as p (p.id)}
      <li>
        <h2>{p.name}</h2>
        <small>{p.note}</small>
        <div class="buttons">
          {#each events as e (e.id)}
            <button onclick={() => play(p, e.id)}>▶ {e.label}</button>
          {/each}
        </div>
        {#each events as e (e.id)}
          {@const clip = p[e.id]}
          {#if typeof clip === 'object' && p.id === 'classic'}
            <label class="cut">
              {e.label}
              <input type="range" min="0.1" max="0.8" step="0.05" bind:value={clip.length} />
              {clip.length.toFixed(2)} s
            </label>
          {/if}
        {/each}
      </li>
    {/each}
  </ul>

  <section>
    <h2>Tu combinación</h2>
    <small>Elige cada sonido de una colección distinta.</small>
    {#each events as e (e.id)}
      <label>
        {e.label}
        <select bind:value={mix[e.id]}>
          {#each packs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
        <button onclick={() => play(pack(mix[e.id]), e.id)}>▶</button>
      </label>
    {/each}
    <button onclick={playMix}>▶ Probar los tres</button>
  </section>
</main>

<style>
  main {
    display: grid;
    gap: 16px;
    padding: 16px;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li,
  section {
    display: grid;
    gap: 6px;
    align-content: start;
    padding: 12px;
    border: 1px solid var(--border, #9bb4d6);
    border-radius: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1.1em;
  }

  small {
    color: var(--text-muted);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cut {
    display: grid;
    grid-template-columns: 120px 1fr 48px;
    gap: 6px;
    align-items: center;
    font-size: 0.9em;
  }

  section label {
    display: grid;
    grid-template-columns: 140px 1fr auto;
    gap: 8px;
    align-items: center;
  }

  section > button {
    justify-self: start;
  }
</style>
