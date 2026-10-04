<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, Show, Snapshot } from '../../main/xmpp'
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

  let roster: Snapshot = $state({ connected: true, contacts: [], requests: [], avatar: '' })
  let picker: HTMLInputElement
  let avatarError = $state('')
  let show: Show = $state('online')
  let status = $state('')
  let address = $state('')

  // Connected first, then alphabetical.
  let contacts = $derived(
    [...roster.contacts].sort(
      (a, b) =>
        Number(a.show === 'offline') - Number(b.show === 'offline') || a.jid.localeCompare(b.jid)
    )
  )

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

  function updatePresence(): void {
    window.api.setPresence(show, status)
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

<section>
  <header>
    <button class="me" onclick={() => picker.click()} title="Cambiar tu imagen">
      <Avatar {jid} url={roster.avatar} {show} size={56} />
    </button>
    <input
      bind:this={picker}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={chooseAvatar}
      hidden
    />
    <strong>{name(jid)}</strong>
    <select bind:value={show} onchange={updatePresence} aria-label="Estado">
      <option value="online">Conectado</option>
      <option value="away">Ausente</option>
      <option value="dnd">Ocupado</option>
    </select>
    <input
      bind:value={status}
      onchange={updatePresence}
      maxlength="140"
      placeholder="Escribe un mensaje personal"
      aria-label="Mensaje personal"
    />
  </header>
  {#if avatarError}<p class="error" role="alert">{avatarError}</p>{/if}

  {#if !roster.connected}
    <p class="banner" role="status">Reconectando…</p>
  {/if}

  {#each roster.requests as request (request)}
    <div class="request">
      <span><strong>{name(request)}</strong> quiere añadirte</span>
      <button onclick={() => window.api.acceptRequest(request)}>Aceptar</button>
      <button onclick={() => window.api.rejectRequest(request)}>Rechazar</button>
    </div>
  {/each}

  <ul>
    {#each contacts as contact (contact.jid)}
      <li>
        <span title={labels[contact.show]}>
          <Avatar jid={contact.jid} url={contact.avatar} show={contact.show} size={36} />
        </span>
        <span class="who">
          <button class="name" onclick={() => window.api.openChat(contact.jid)}>
            {name(contact.jid)}
          </button>
          {#if contact.pending}
            <small>Esperando a que te acepte</small>
          {:else if contact.status}
            <small><Emoticons text={contact.status} /></small>
          {/if}
        </span>
        <button class="remove" onclick={() => remove(contact)} aria-label="Eliminar contacto">
          ×
        </button>
      </li>
    {:else}
      <li class="empty">Aún no tienes contactos. Añade a alguien por su usuario.</li>
    {/each}
  </ul>

  <form onsubmit={add}>
    <input bind:value={address} required placeholder="Usuario del contacto" aria-label="Usuario" />
    <button type="submit">Añadir</button>
  </form>

  <footer>
    <button onclick={() => window.api.openOptions()}>Opciones</button>
    <button onclick={onlogout}>Cerrar sesión</button>
  </footer>
</section>

<style>
  section {
    display: grid;
    gap: 0.75rem;
    width: min(22rem, 100% - 2rem);
  }

  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.25rem 0.5rem;
    align-items: center;
  }

  .me {
    grid-row: span 2;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
  }

  header input {
    grid-column: 2 / -1;
  }

  .error {
    margin: 0;
    color: #c0392b;
  }

  .banner {
    margin: 0;
    padding: 0.25rem 0.5rem;
    background: #fdecc8;
  }

  .request {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .request span {
    flex: 1;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0;
  }

  .who {
    display: grid;
    flex: 1;
  }

  small {
    color: #666;
  }

  .empty {
    color: #666;
  }

  .name {
    padding: 0;
    background: none;
    border: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.1rem;
  }

  form,
  footer {
    display: flex;
    gap: 0.5rem;
  }

  form input {
    flex: 1;
  }
</style>
