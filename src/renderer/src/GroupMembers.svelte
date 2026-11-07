<script lang="ts">
  import { Ellipsis } from '@lucide/svelte'
  import { untrack } from 'svelte'
  import type { Group, Member } from '../../main/groups'
  import type { Snapshot } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import GroupAvatar from './GroupAvatar.svelte'
  import { face, list, plainName } from './group'
  import { _, lang } from './i18n'
  import { popup } from './menu'
  import { avatarPng } from './picture'
  import { stripPlus } from './plus'

  // Who's in a group, beside its conversation, and the sheets to add friends and to change
  // its name and photo (those, over the whole window). Palique's "admin" is the XMPP owner.
  let {
    group,
    roster,
    open,
    editing = $bindable(false)
  }: { group: Group; roster: Snapshot; open: boolean; editing?: boolean } = $props()

  let error = $state('')
  const fail = (e: unknown): void => {
    error = String(e).includes('full')
      ? _('Un grupo puede tener hasta 50 personas.')
      : String(e).includes('offline')
        ? _('Sin conexión con el servidor. Inténtalo cuando vuelvas a estar conectado.')
        : _('No se ha podido cambiar el grupo.')
  }
  const run = (action: Promise<unknown>): void => {
    error = ''
    action.catch(fail)
  }

  // Us first, then everyone by how long they've been in it.
  const members = $derived(
    [...group.members].sort(
      (a, b) => Number(b.jid === roster.jid) - Number(a.jid === roster.jid) || a.since - b.since
    )
  )
  const contactOf = (jid: string): Snapshot['contacts'][number] | undefined =>
    roster.contacts.find((c) => c.jid === jid)
  // Asked here, until the contact list says so too.
  let asked: string[] = $state([])
  const admins = $derived(
    list(members.filter((m) => m.owner).map((m) => (m.jid === roster.jid ? _('tú') : name(m))))
  )
  const name = (m: Member): string => plainName(face(roster, m.jid, m.name).name)

  function memberMenu(e: MouseEvent, m: Member): Promise<void> {
    return popup(e, [
      m.owner
        ? {
            label: _('Quitar como administrador'),
            run: () => run(window.api.setGroupOwner(group.jid, m.jid, false))
          }
        : {
            label: _('Hacer administrador'),
            run: () => run(window.api.setGroupOwner(group.jid, m.jid, true))
          },
      { label: _('Quitar del grupo'), run: () => run(window.api.removeFromGroup(group.jid, m.jid)) }
    ])
  }

  function askToAdd(m: Member): void {
    asked.push(m.jid)
    run(window.api.addMemberAsContact(group.jid, m.jid))
  }

  function leave(): void {
    if (confirm(_('¿Salir de «{name}»?', { name: group.name })))
      run(window.api.leaveGroup(group.jid))
  }

  // «Añadir amigos»: mutual contacts not in it yet.
  let adding: string[] | null = $state(null)
  const addable = $derived(
    roster.contacts
      .filter((c) => c.subscription === 'both' && !group.members.some((m) => m.jid === c.jid))
      .sort((a, b) => stripPlus(a.name).localeCompare(stripPlus(b.name), lang))
  )
  async function confirmAdd(): Promise<void> {
    const chosen = adding ?? []
    adding = null
    if (chosen.length) run(window.api.addToGroup(group.jid, chosen))
  }

  // «Nombre y foto del grupo». `photo`: undefined = unchanged, null = the members' faces.
  let newName = $state('')
  let photo: { png: Uint8Array; url: string } | null | undefined = $state()
  let picker: HTMLInputElement | undefined = $state()
  $effect(() => {
    // Only when it opens: a new snapshot meanwhile mustn't wipe what's being typed.
    if (editing) {
      untrack(() => {
        newName = group.name
        photo = undefined
        error = ''
      })
    }
  })
  const preview = $derived(photo === undefined ? group.photo : (photo?.url ?? ''))

  async function choosePhoto(): Promise<void> {
    const file = picker?.files?.[0]
    if (picker) picker.value = ''
    if (!file) return
    try {
      const png = await avatarPng(file)
      // A data: URL: the page's CSP allows no blob: images.
      const base64 = btoa(Array.from(png, (b) => String.fromCharCode(b)).join(''))
      photo = { png, url: `data:image/png;base64,${base64}` }
    } catch {
      error = _('No se ha podido usar esa imagen.')
    }
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const title = newName.trim()
    if (!title) return
    error = ''
    try {
      if (title !== group.name) await window.api.setGroupName(group.jid, title)
      if (photo !== undefined) await window.api.setGroupPhoto(group.jid, photo?.png ?? null)
      editing = false
    } catch (e) {
      fail(e)
    }
  }
</script>

{#if open}
  <aside aria-label={_('Miembros')}>
    <h2>{_('Miembros')} ({group.members.length})</h2>
    <ul>
      {#each members as m (m.jid)}
        {@const f = face(roster, m.jid, m.name)}
        {@const contact = contactOf(m.jid)}
        <li>
          <Avatar jid={m.jid} name={f.name} url={f.url} show={f.show} size={36} />
          <span class="who">
            <b
              >{#if m.jid === roster.jid}{_('Tú')}{:else}<Emoticons
                  text={f.name}
                  plus
                />{/if}{#if m.owner}<span class="admin">{_('Admin')}</span>{/if}</b
            >
            {#if m.jid === roster.jid}
              <!-- nothing to say about ourselves -->
            {:else if contact && !contact.pending}
              <small>{_('Tu contacto')}</small>
            {:else}
              <small>{_('No es tu contacto')}</small>
              <button
                class="small"
                disabled={contact?.pending || asked.includes(m.jid)}
                onclick={() => askToAdd(m)}
                >{contact?.pending || asked.includes(m.jid)
                  ? _('Petición enviada')
                  : _('Añadir como contacto')}</button
              >
            {/if}
          </span>
          {#if group.owner && m.jid !== roster.jid}
            <button
              class="more"
              aria-haspopup="menu"
              onclick={(e) => memberMenu(e, m)}
              aria-label={_('Opciones de {name}', { name: name(m) })}><Ellipsis size={16} /></button
            >
          {/if}
        </li>
      {/each}
    </ul>
    <footer>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if group.owner}
        <button onclick={() => (editing = true)}>{_('Cambiar nombre y foto')}</button>
      {/if}
      <button class="primary" onclick={() => (adding = [])}>{_('Añadir amigos')}</button>
      <button class="leave" onclick={leave}>{_('Salir del grupo')}</button>
      {#if !group.owner}
        <p class="hint">
          {_('El nombre y la foto los cambian los administradores: {names}.', { names: admins })}
        </p>
      {/if}
    </footer>
  </aside>
{/if}

{#if adding}
  <div class="layer">
    <div class="sheet" role="dialog" aria-label={_('Añadir a {group}', { group: group.name })}>
      <h2>{_('Añadir a {group}', { group: group.name })}</h2>
      {#if addable.length}
        <ul class="friends">
          {#each addable as c (c.jid)}
            <li>
              <label>
                <input type="checkbox" bind:group={adding} value={c.jid} />
                <Avatar jid={c.jid} name={c.name} url={c.avatar} show={c.show} size={34} />
                <span class="who">
                  <b><Emoticons text={c.name} plus /></b>
                  {#if c.status}<small><Emoticons text={c.status} /></small>{/if}
                </span>
              </label>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">{_('Todos tus contactos ya están en el grupo.')}</p>
      {/if}
      <footer>
        <button onclick={() => (adding = null)}>{_('Cancelar')}</button>
        <button class="primary" onclick={confirmAdd} disabled={!adding.length}
          >{_('Añadir')}{adding.length ? ` (${adding.length})` : ''}</button
        >
      </footer>
    </div>
  </div>
{/if}

{#if editing}
  <div class="layer" role="dialog" aria-label={_('Nombre y foto del grupo')}>
    <form class="sheet" onsubmit={save}>
      <h2>{_('Nombre y foto del grupo')}</h2>
      <div class="edit">
        <div class="photo">
          <GroupAvatar group={{ ...group, photo: preview }} {roster} size={72} />
          <div class="choices">
            <button type="button" class="small" onclick={() => picker?.click()}
              >{_('Subir una imagen…')}</button
            >
            <input
              bind:this={picker}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onchange={choosePhoto}
              hidden
            />
            {#if preview}
              <button type="button" class="small" onclick={() => (photo = null)}
                >{_('Usar las caras de los miembros')}</button
              >
            {:else}
              <span class="hint">{_('Ahora: las caras de los miembros')}</span>
            {/if}
          </div>
        </div>
        <label class="field">
          <span>{_('Nombre del grupo')}</span>
          <input bind:value={newName} maxlength="40" />
        </label>
        <p class="hint">{_('Todos los miembros verán el cambio y un aviso en la conversación.')}</p>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
      <footer>
        <button type="button" onclick={() => (editing = false)}>{_('Cancelar')}</button>
        <button class="primary" type="submit" disabled={!newName.trim()}>{_('Guardar')}</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  aside {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    flex: none;
    width: 250px;
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--list-bg);
  }

  h2 {
    margin: 0;
    padding: 14px 14px 6px;
    font-size: 15px;
    font-weight: 900;
  }

  ul {
    display: grid;
    align-content: start;
    gap: 2px;
    margin: 0;
    padding: 0 8px;
    overflow-y: auto;
    list-style: none;
  }

  aside li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 5px 6px;
    border-radius: var(--radius);
  }

  .who {
    display: grid;
    justify-items: start;
    gap: 1px;
    min-width: 0;
  }

  .who b {
    max-width: 100%;
    overflow: hidden;
    font-size: 14px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .who small {
    max-width: 100%;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin {
    margin-left: 6px;
    padding: 0 7px;
    border: 1px solid var(--bubble-mine-border);
    border-radius: 999px;
    background: var(--bubble-mine-bg);
    color: var(--text-strong);
    font-size: 11px;
    font-weight: 800;
    vertical-align: 1px;
  }

  .small {
    margin-top: 2px;
    padding: 2px 9px;
    font-size: 12px;
    white-space: nowrap;
  }

  .more {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
  }

  .more:hover:not(:disabled) {
    background: var(--row-hover-bg);
    color: var(--text);
  }

  footer {
    display: grid;
    gap: 8px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--line);
  }

  .leave {
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-error);
    font-size: 13px;
    font-weight: 800;
  }

  .leave:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  .hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 12.5px;
  }

  .error {
    margin: 0;
    color: var(--text-error);
    font-size: 13px;
  }

  /* The sheets: over the whole window, dimming it. */
  .layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 25%);
  }

  .sheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(340px, calc(100% - 32px));
    max-height: min(480px, calc(100% - 32px));
    overflow: hidden;
    border: var(--group-border);
    border-radius: var(--group-radius);
    background: var(--window-bg);
    box-shadow: var(--popup-shadow);
  }

  .sheet h2 {
    padding: 14px 16px;
    background: var(--header-bg);
    color: var(--text-strong);
    font-size: 16px;
  }

  .sheet footer {
    display: flex;
    justify-content: flex-end;
    border-top: none;
    padding: 12px;
  }

  .friends {
    margin: 10px 12px 0;
    padding: 4px;
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

  .empty {
    margin: 0;
    padding: 14px 16px 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .edit {
    display: grid;
    gap: 14px;
    padding: 14px 16px 0;
  }

  .photo {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .choices {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    font-size: 13.5px;
    font-weight: 800;
  }

  .field input {
    border-radius: 999px;
    padding-inline: 14px;
  }
</style>
