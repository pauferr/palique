<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, InviteStatus, OwnShow, Snapshot } from '../../main/xmpp'
  import onlineSound from './assets/sounds/online.ogg'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import { emojify } from './emoticons'

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
    name: '',
    avatar: '',
    show: 'online'
  })
  let picker: HTMLInputElement
  let avatarError = $state('')
  let presenceError = $state('')
  let status = $state('')
  // Name and personal message show their emoticons until clicked, then become inputs.
  let editing: '' | 'nick' | 'personal' = $state('')
  const focus = (input: HTMLInputElement): void => input.focus()
  const commitOnEnter = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
  }

  // Two groups like MSN, alphabetical inside each.
  let sorted = $derived(
    [...roster.contacts].sort((a, b) => a.name.localeCompare(b.name) || a.jid.localeCompare(b.jid))
  )
  let groups = $derived([
    { label: 'Conectados', contacts: sorted.filter((c) => c.show !== 'offline') },
    { label: 'Desconectados', contacts: sorted.filter((c) => c.show === 'offline') }
  ])

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

  // Our display name, edited in place like the personal message. Empty puts it back.
  async function rename(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    if (!input.value.trim()) {
      input.value = roster.name
      return
    }
    try {
      await window.api.setNick(input.value)
    } catch {
      input.value = roster.name
      presenceError = 'No se ha podido cambiar tu nombre.'
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

  // Adding someone is by email. If they're not on Palique, inviting them is a separate,
  // explicit step (invites are limited).
  let address = $state('')
  let addNote = $state('')
  let notFound = $state('') // address with no account, offered an invite

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    addNote = ''
    notFound = ''
    const value = address.trim().toLowerCase()
    try {
      const result = await window.api.addContact(value)
      if (result === 'added') {
        addNote = 'Solicitud enviada. Aparecerá en tu lista cuando te acepte.'
        address = ''
      } else if (result === 'self') addNote = 'Ese es tu propio correo.'
      else notFound = value
    } catch (e) {
      addNote = String(e).includes('wait')
        ? 'Has buscado demasiados correos. Espera un rato.'
        : String(e).includes('invalid')
          ? 'Esa dirección no parece válida.'
          : 'No se ha podido añadir.'
    }
  }

  // Invites: email only, a few per person.
  let invitesOpen = $state(false)
  let invites: InviteStatus | undefined = $state()
  let inviteEmail = $state('')
  let inviteNote = $state('')
  const left = $derived(invites ? Math.max(0, invites.max - invites.used) : 0)

  async function toggleInvites(): Promise<void> {
    invitesOpen = !invitesOpen
    inviteNote = ''
    if (invitesOpen) invites = await window.api.inviteStatus()
  }

  async function sendInvite(value: string): Promise<void> {
    inviteNote = ''
    invites ??= await window.api.inviteStatus().catch(() => undefined)
    const count = left === 1 ? 'Te queda 1 invitación' : `Te quedan ${left} invitaciones`
    if (!confirm(`¿Enviar una invitación a Palique a ${value}? ${count}.`)) return
    try {
      invites = await window.api.inviteByEmail(value)
      inviteNote = `Invitación enviada a ${value}. Cuando cree su cuenta, estaréis en vuestras listas.`
      inviteEmail = ''
      if (notFound === value) notFound = ''
    } catch (e) {
      const reason = String(e)
      inviteNote = reason.includes('limit')
        ? 'Ya no te quedan invitaciones.'
        : reason.includes('registered')
          ? 'Esa persona ya está en Palique: añádela con su correo.'
          : reason.includes('invalid')
            ? 'Esa dirección no parece válida.'
            : 'No se ha podido enviar la invitación.'
    }
    if (notFound === value) {
      addNote = inviteNote
      notFound = ''
    }
  }

  function emailInvite(event: SubmitEvent): void {
    event.preventDefault()
    sendInvite(inviteEmail.trim().toLowerCase())
  }

  function remove(contact: Contact): void {
    if (confirm(`¿Eliminar a ${emojify(contact.name)} de tus contactos?`)) {
      window.api.removeContact(contact.jid)
    }
  }
</script>

<section class="roster">
  <header>
    <button class="me" onclick={() => picker.click()} title="Cambiar tu imagen">
      <Avatar
        {jid}
        name={roster.name}
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
        {#if editing === 'nick'}
          <input
            class="nick"
            value={roster.name}
            onchange={rename}
            onblur={() => (editing = '')}
            onkeydown={commitOnEnter}
            use:focus
            maxlength="64"
            aria-label="Tu nombre"
          />
        {:else}
          <button class="nick" onclick={() => (editing = 'nick')} title="Cambiar tu nombre"
            ><Emoticons text={roster.name} /></button
          >
        {/if}
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
      {#if editing === 'personal'}
        <input
          class="personal"
          bind:value={status}
          onchange={() => updatePresence(roster.show)}
          onblur={() => (editing = '')}
          onkeydown={commitOnEnter}
          use:focus
          maxlength="140"
          placeholder="Escribe un mensaje personal"
          aria-label="Mensaje personal"
        />
      {:else}
        <button
          class="personal"
          class:empty={!status}
          onclick={() => (editing = 'personal')}
          title="Cambiar tu mensaje personal"
          >{#if status}<Emoticons text={status} />{:else}Escribe un mensaje personal{/if}</button
        >
      {/if}
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
    {#each roster.requests as request (request.jid)}
      <div class="request">
        <span><strong><Emoticons text={request.name} /></strong> quiere añadirte</span>
        <button onclick={() => window.api.acceptRequest(request.jid)}>Aceptar</button>
        <button onclick={() => window.api.rejectRequest(request.jid)}>Rechazar</button>
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
                  <Avatar
                    jid={contact.jid}
                    name={contact.name}
                    url={contact.avatar}
                    show={contact.show}
                    size={28}
                  />
                </span>
                <button class="name" onclick={() => window.api.openChat(contact.jid)}>
                  <Emoticons text={contact.name} />
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
                  aria-label="Eliminar a {emojify(contact.name)}">×</button
                >
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    {:else}
      <p class="empty">Aún no tienes contactos. Añade a alguien con su correo o invítale.</p>
    {/if}
  </div>

  {#if addNote || notFound}
    <p class="notice" role="status">
      {#if notFound}
        No hay nadie en Palique con {notFound}.
        <button class="link" onclick={() => sendInvite(notFound)}>Enviar invitación</button>
      {:else}
        {addNote}
      {/if}
    </p>
  {/if}
  <form onsubmit={add}>
    <input
      type="email"
      spellcheck="false"
      bind:value={address}
      required
      maxlength="254"
      placeholder="Correo del contacto"
      aria-label="Correo del contacto"
    />
    <button type="submit">+ Añadir</button>
  </form>

  {#if invitesOpen}
    <div class="invites">
      <p>
        Para crear una cuenta en Palique hace falta una invitación. Quien entre con la tuya
        aparecerá directamente en tus contactos.
      </p>
      <form class="send" onsubmit={emailInvite}>
        <input
          type="email"
          spellcheck="false"
          bind:value={inviteEmail}
          required
          maxlength="254"
          placeholder="Su correo"
          aria-label="Correo de la persona invitada"
        />
        <button type="submit" disabled={!left}>Invitar</button>
      </form>
      {#if inviteNote}<p class="hint" role="status">{inviteNote}</p>{/if}
      {#if invites}
        <p class="hint">
          {left === 1 ? 'Te queda 1 invitación' : `Te quedan ${left} invitaciones`} de {invites.max}.
          Las que caducan sin usarse vuelven a contar.
        </p>
      {/if}
    </div>
  {/if}

  <footer>
    <button onclick={toggleInvites} aria-expanded={invitesOpen}>Invitar</button>
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
    box-shadow: none;
    border-radius: var(--avatar-radius);
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

  /* Our name reads as bold text until you click it. */
  .nick {
    flex: 1;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    padding: 0 2px;
    border-color: transparent;
    box-shadow: none;
    background: transparent;
    color: var(--text-strong);
    font-weight: bold;
  }

  /* Status reads like text next to the name, MSN style. */
  .line select {
    padding: 0;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  /* Reads as text until you click it, like MSN's personal message. */
  .personal {
    text-align: left;
    border-color: transparent;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Same box as the input they turn into, so nothing jumps on click. */
  button.nick,
  button.personal {
    border-width: var(--field-border-width);
    border-radius: var(--radius);
  }

  button.personal {
    padding: 3px 5px;
  }

  .personal.empty {
    opacity: 0.7;
  }

  .nick:hover,
  .nick:focus,
  .personal:hover,
  .personal:focus {
    border-color: var(--field-border-color);
    background: var(--list-bg);
    box-shadow: var(--field-shadow);
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
    background: var(--warning-bg);
  }

  .link {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-strong);
    text-decoration: underline;
  }

  .link:hover:not(:disabled) {
    background: none;
  }

  .list {
    flex: 1;
    margin: var(--panel-margin);
    overflow-y: auto;
    border: solid var(--panel-border-width);
    border-color: var(--panel-border-color);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    background: var(--list-bg);
  }

  .request {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 10px;
    background: var(--request-bg);
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
    background: var(--row-hover-bg);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
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
    box-shadow: none;
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

  .invites {
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bar-bg);
    border-top: 1px solid var(--line);
  }

  .invites p {
    margin: 0;
  }

  .send {
    display: flex;
    gap: 6px;
    padding: 0;
    background: none;
    border: none;
  }

  .send input {
    flex: 1;
    min-width: 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
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
