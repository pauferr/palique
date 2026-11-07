<script lang="ts">
  import { onMount } from 'svelte'
  import { X } from '@lucide/svelte'
  import type { Snapshot } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import GroupAvatar from './GroupAvatar.svelte'
  import { face, plainName } from './group'
  import { _, _n, lang } from './i18n'
  import { stripPlus } from './plus'

  // Creating a group: a name and at least one friend. Its own small window (#newgroup).
  let roster: Snapshot | undefined = $state()
  let name = $state('')
  let picked: string[] = $state([])
  let busy = $state(false)
  let error = $state('')

  onMount(() => {
    window.api.getRoster().then((s) => (roster = s))
    return window.api.onRoster((s) => {
      roster = s
    })
  })

  // Mutual contacts only: they're the ones a group invite reaches.
  const friends = $derived(
    (roster?.contacts ?? [])
      .filter((c) => c.subscription === 'both')
      .sort((a, b) => stripPlus(a.name).localeCompare(stripPlus(b.name), lang))
  )
  const chosen = $derived(friends.filter((c) => picked.includes(c.jid)))
  // The group's mosaic forming as friends are picked; two blanks until then.
  const faces = $derived(
    roster && chosen.length
      ? chosen.map((c) => face(roster!, c.jid))
      : [1, 2].map((n) => ({ jid: `?${n}`, name: '?', url: '', show: 'offline' as const }))
  )
  const ready = $derived(Boolean(name.trim()) && chosen.length > 0 && !busy)

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!ready) return
    busy = true
    error = ''
    try {
      const room = await window.api.createGroup(name.trim(), [...picked])
      await window.api.openChat(room)
      window.close()
    } catch (e) {
      busy = false
      error =
        chosen.length > 49
          ? _('Un grupo puede tener hasta 50 personas.')
          : String(e).includes('offline')
            ? _('Sin conexión con el servidor. Inténtalo cuando vuelvas a estar conectado.')
            : _('No se ha podido crear el grupo.')
    }
  }
</script>

<svelte:head><title>{_('Nuevo grupo')}</title></svelte:head>

<form onsubmit={create}>
  <header>
    {#if roster}<GroupAvatar {roster} {faces} size={56} />{/if}
    <div>
      <h1>{name.trim() || _('Nuevo grupo')}</h1>
      <p>
        {#if chosen.length}{_n('Tú y {name}', 'Tú y {n} amigos', chosen.length, {
            name: plainName(chosen[0].name)
          })}{:else}{_('Elige a quién invitas')}{/if}
      </p>
    </div>
  </header>

  <label class="field">
    <span>{_('Nombre del grupo')}</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={name}
      maxlength="40"
      placeholder={_('Por ejemplo, Los del insti')}
      autofocus
    />
  </label>

  <div class="pick">
    <span class="title">{_('¿A quién invitas?')}</span>
    <div class="chips">
      {#each chosen as c (c.jid)}
        <span class="chip">
          <Avatar jid={c.jid} name={c.name} url={c.avatar} show={c.show} size={22} />
          <Emoticons text={c.name} plus />
          <button
            type="button"
            onclick={() => (picked = picked.filter((j) => j !== c.jid))}
            aria-label={_('Quitar a {name}', { name: plainName(c.name) })}
            ><X size={12} strokeWidth={3} /></button
          >
        </span>
      {:else}
        <span class="none">{_('Nadie todavía')}</span>
      {/each}
    </div>
    <ul class="friends">
      {#each friends as c (c.jid)}
        <li>
          <label>
            <input type="checkbox" bind:group={picked} value={c.jid} />
            <Avatar jid={c.jid} name={c.name} url={c.avatar} show={c.show} size={34} />
            <span class="who">
              <b><Emoticons text={c.name} plus /></b>
              {#if c.status}<small><Emoticons text={c.status} /></small>{/if}
            </span>
          </label>
        </li>
      {/each}
    </ul>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <footer>
    <small>{_('Cada uno podrá añadir a sus amigos.')}</small>
    <span class="actions">
      <button type="button" onclick={() => window.close()}>{_('Cancelar')}</button>
      <button class="primary" type="submit" disabled={!ready}>{_('Crear grupo')}</button>
    </span>
  </footer>
</form>

<style>
  form {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    height: 100vh;
  }

  header {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  header div {
    min-width: 0;
  }

  h1 {
    margin: 0;
    overflow: hidden;
    color: var(--text-strong);
    font-size: 19px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header p {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .field {
    display: grid;
    gap: 6px;
    padding: 14px 16px 6px;
  }

  .field span,
  .title {
    font-size: 13.5px;
    font-weight: 800;
  }

  .field input {
    border-radius: 999px;
    padding-inline: 14px;
  }

  .pick {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 6px;
    min-height: 0;
    padding: 8px 16px 0;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 30px;
  }

  .chip {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 2px 4px 2px 3px;
    border: 1px solid var(--bubble-mine-border);
    border-radius: 999px;
    background: var(--bubble-mine-bg);
    font-size: 13px;
    font-weight: 700;
  }

  .chip button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
  }

  .chip button:hover:not(:disabled) {
    background: var(--row-hover-bg);
    color: var(--text);
  }

  .none {
    color: var(--text-muted);
    font-size: 13px;
  }

  .friends {
    display: grid;
    align-content: start;
    gap: 2px;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
    border: var(--group-border);
    border-radius: var(--group-radius);
    background: var(--list-bg);
  }

  .friends label {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 5px 8px;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .friends label:hover {
    background: var(--row-hover-bg);
  }

  .friends input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--text-strong);
  }

  .who {
    display: grid;
    min-width: 0;
  }

  .who > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .who small {
    color: var(--text-muted);
    font-size: 12px;
  }

  .error {
    margin: 8px 16px 0;
    color: var(--text-error);
    font-size: 13px;
  }

  footer {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 16px;
  }

  footer small {
    max-width: 24ch;
    color: var(--text-muted);
    font-size: 12.5px;
  }

  .actions {
    display: flex;
    gap: 8px;
    white-space: nowrap;
  }
</style>
