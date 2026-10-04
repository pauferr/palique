<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, Show, Snapshot } from '../../main/xmpp'

  let { jid, onlogout }: { jid: string; onlogout: () => void } = $props()

  const labels: Record<Contact['show'], string> = {
    online: 'Conectado',
    away: 'Ausente',
    dnd: 'Ocupado',
    offline: 'Desconectado'
  }

  let roster: Snapshot = $state({ connected: true, contacts: [], requests: [] })
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
    return window.api.onRoster((value) => (roster = value))
  })

  function updatePresence(): void {
    window.api.setPresence(show, status)
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
        <span class="dot {contact.show}" title={labels[contact.show]}></span>
        <span class="who">
          <button class="name" onclick={() => window.api.openChat(contact.jid)}>
            {name(contact.jid)}
          </button>
          {#if contact.pending}
            <small>Esperando a que te acepte</small>
          {:else if contact.status}
            <small>{contact.status}</small>
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
    <button onclick={() => window.api.playWink('demo')}>Probar guiño</button>
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
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: center;
  }

  header input {
    grid-column: 1 / -1;
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

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }

  .online {
    background: #2ecc71;
  }

  .away {
    background: #f1c40f;
  }

  .dnd {
    background: #e74c3c;
  }

  .offline {
    background: #bbb;
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
