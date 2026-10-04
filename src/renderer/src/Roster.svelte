<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, OwnShow, Snapshot } from '../../main/xmpp'
  import onlineSound from './assets/sounds/online.ogg'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'

  let { jid, onlogout }: { jid: string; onlogout: () => void } = $props()

  const labels: Record<Contact['show'], string> = {
    online: 'Conectado',
    away: 'Ausente',
    dnd: 'Ocupado',
    offline: 'Desconectado'
  }

  let roster: Snapshot = $state({
    connected: true,
    contacts: [],
    requests: [],
    avatar: '',
    show: 'online'
  })
  let picker: HTMLInputElement
  let avatarError = $state('')
  let presenceError = $state('')
  let status = $state('')
  let address = $state('')

  // Two groups like MSN, alphabetical inside each.
  let sorted = $derived([...roster.contacts].sort((a, b) => a.jid.localeCompare(b.jid)))
  let groups = $derived([
    { label: 'Conectados', contacts: sorted.filter((c) => c.show !== 'offline') },
    { label: 'Desconectados', contacts: sorted.filter((c) => c.show === 'offline') }
  ])

  const name = (jid: string): string => jid.split('@')[0]

  onMount(() => {
    window.api.getRoster().then((value) => (roster = value))
    const offRoster = window.api.onRoster((value) => (roster = value))
    const offOnline = window.api.onContactOnline(() => {
      new Audio(onlineSound).play().catch(() => {})
    })
    return () => {
      offRoster()
      offOnline()
    }
  })

  let statusSelect: HTMLSelectElement

  // The select shows the real status from the snapshot; if the change fails, put it back.
  async function updatePresence(show: OwnShow): Promise<void> {
    presenceError = ''
    try {
      await window.api.setPresence(show, status)
    } catch {
      presenceError = 'No se ha podido cambiar el estado.'
      statusSelect.value = roster.show
    }
  }

  // Center-crop the chosen picture to a 96×96 PNG before publishing it.
  async function chooseAvatar(): Promise<void> {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    avatarError = ''
    try {
      const image = await createImageBitmap(file)
      const side = Math.min(image.width, image.height)
      const canvas = new OffscreenCanvas(96, 96)
      canvas
        .getContext('2d')!
        .drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          96,
          96
        )
      const png = await canvas.convertToBlob({ type: 'image/png' })
      await window.api.setAvatar(new Uint8Array(await png.arrayBuffer()))
    } catch {
      avatarError = 'No se ha podido usar esa imagen.'
    }
  }

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    await window.api.addContact(address)
    address = ''
  }

  function remove(contact: Contact): void {
    if (confirm(`¿Eliminar a ${name(contact.jid)} de tus contactos?`)) {
      window.api.removeContact(contact.jid)
    }
  }
</script>

<section class="roster">
  <header>
    <button class="me" onclick={() => picker.click()} title="Cambiar tu imagen">
      <Avatar
        {jid}
        url={roster.avatar}
        show={roster.show === 'invisible' ? 'offline' : roster.show}
        size={56}
      />
    </button>
    <input
      bind:this={picker}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={chooseAvatar}
      hidden
    />
    <div class="identity">
      <div class="line">
        <strong>{name(jid)}</strong>
        <select
          bind:this={statusSelect}
          value={roster.show}
          onchange={(e) => updatePresence(e.currentTarget.value as OwnShow)}
          aria-label="Estado"
        >
          <option value="online">(Conectado)</option>
          <option value="away">(Ausente)</option>
          <option value="dnd">(Ocupado)</option>
          <option value="invisible">(Invisible)</option>
        </select>
      </div>
      <input
        class="personal"
        bind:value={status}
        onchange={() => updatePresence(roster.show)}
        maxlength="140"
        placeholder="Escribe un mensaje personal"
        aria-label="Mensaje personal"
      />
    </div>
  </header>

  {#if avatarError}<p class="notice error" role="alert">{avatarError}</p>{/if}
  {#if presenceError}<p class="notice error" role="alert">{presenceError}</p>{/if}
  {#if roster.show === 'invisible'}
    <p class="notice">Estás invisible: tus contactos te ven desconectado, pero puedes chatear.</p>
  {/if}
  {#if !roster.connected}
    <p class="notice warning" role="status">Reconectando…</p>
  {/if}

  <div class="list">
    {#each roster.requests as request (request)}
      <div class="request">
        <span><strong>{name(request)}</strong> quiere añadirte</span>
        <button onclick={() => window.api.acceptRequest(request)}>Aceptar</button>
        <button onclick={() => window.api.rejectRequest(request)}>Rechazar</button>
      </div>
    {/each}

    {#if roster.contacts.length}
      {#each groups as group (group.label)}
        <details open>
          <summary>{group.label} ({group.contacts.length})</summary>
          <ul>
            {#each group.contacts as contact (contact.jid)}
              <li>
                <span title={labels[contact.show]}>
                  <Avatar jid={contact.jid} url={contact.avatar} show={contact.show} size={28} />
                </span>
                <button class="name" onclick={() => window.api.openChat(contact.jid)}>
                  {name(contact.jid)}
                  {#if contact.pending}
                    <small>- Esperando a que te acepte</small>
                  {:else if contact.status}
                    <small>- <Emoticons text={contact.status} /></small>
                  {/if}
                </button>
                <button
                  class="remove"
                  onclick={() => remove(contact)}
                  title="Eliminar contacto"
                  aria-label="Eliminar a {name(contact.jid)}">×</button
                >
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    {:else}
      <p class="empty">Aún no tienes contactos. Añade a alguien por su usuario.</p>
    {/if}
  </div>

  <form onsubmit={add}>
    <input bind:value={address} required placeholder="Usuario del contacto" aria-label="Usuario" />
    <button type="submit">+ Añadir</button>
  </form>

  <footer>
    <button onclick={() => window.api.openOptions()}>Opciones</button>
    <button onclick={onlogout}>Cerrar sesión</button>
  </footer>
</section>

<style>
  .roster {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  header {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  .me {
    padding: 0;
    background: none;
    border: none;
    border-radius: 8px;
  }

  .identity {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
  }

  .line {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .line strong {
    color: var(--text-strong);
  }

  /* Status reads like text next to the name, MSN style. */
  .line select {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  /* Reads as text until you click it, like MSN's personal message. */
  .personal {
    border-color: transparent;
    background: transparent;
    color: var(--text-muted);
    font-style: italic;
  }

  .personal:hover,
  .personal:focus {
    border-color: var(--field-border);
    background: var(--list-bg);
  }

  .notice {
    margin: 0;
    padding: 4px 10px;
    color: var(--text-muted);
    font-size: 12px;
    background: var(--bar-bg);
    border-bottom: 1px solid var(--line);
  }

  .notice.error {
    color: var(--text-error);
  }

  .notice.warning {
    background: #fdecc8;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    background: var(--list-bg);
  }

  .request {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 10px;
    background: #fff8dc;
    border-bottom: 1px solid var(--line);
  }

  .request span {
    flex: 1;
  }

  summary {
    padding: 6px 10px 2px;
    color: var(--text-strong);
    font-weight: bold;
    cursor: pointer;
  }

  ul {
    margin: 0;
    padding: 0 0 4px;
    list-style: none;
  }

  li {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 2px 10px 2px 18px;
  }

  li:hover {
    background: #e8f0fd;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    background: none;
    border: none;
    color: var(--text);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }

  small {
    color: var(--text-muted);
    font-size: inherit;
  }

  .remove {
    padding: 0 4px;
    background: none;
    border: none;
    color: var(--text-muted);
    visibility: hidden;
  }

  li:hover .remove,
  .remove:focus-visible {
    visibility: visible;
  }

  .empty {
    margin: 0;
    padding: 16px 10px;
    color: var(--text-muted);
  }

  form,
  footer {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bar-bg);
    border-top: 1px solid var(--line);
  }

  form input {
    flex: 1;
    min-width: 0;
  }
</style>
