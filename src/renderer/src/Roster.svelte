<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, EmailStatus, Invite, OwnShow, Snapshot } from '../../main/xmpp'
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
    window.api
      .getEmail()
      .then((value) => (email = value))
      .catch(() => {})
    const offEmail = window.api.onEmail((value) => {
      email = value
      emailNote = ''
    })
    const offRoster = window.api.onRoster((value) => {
      roster = value
      // Someone may have just joined with one of our invites.
      if (invitesOpen) loadInvites()
    })
    const offOnline = window.api.onContactOnline(() => {
      new Audio(onlineSound).play().catch(() => {})
    })
    return () => {
      offEmail()
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

  // Email for password recovery: a notice until it's verified.
  let email: EmailStatus | undefined = $state()
  let newEmail = $state('')
  let emailNote = $state('')

  async function saveEmail(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    emailNote = ''
    try {
      email = await window.api.setEmail(newEmail.trim(), email?.newsletter ?? false)
    } catch {
      emailNote = 'Esa dirección no parece válida.'
    }
  }

  async function resend(): Promise<void> {
    try {
      await window.api.resendVerification()
      emailNote = 'Enlace reenviado.'
    } catch {
      emailNote = 'Espera un minuto antes de pedir otro enlace.'
    }
  }

  // "Invite a friend": the server creates the code and enforces the per-user limit.
  let invitesOpen = $state(false)
  let invites: Invite[] = $state([])
  let maxInvites = $state(0)
  let newInvite = $state('')
  let inviteError = $state('')
  let copied = $state(false)

  async function loadInvites(): Promise<void> {
    const result = await window.api.listInvites()
    invites = result.invites
    maxInvites = result.max
  }

  async function toggleInvites(): Promise<void> {
    invitesOpen = !invitesOpen
    newInvite = ''
    inviteError = ''
    if (invitesOpen) await loadInvites()
  }

  async function invite(): Promise<void> {
    inviteError = ''
    copied = false
    try {
      newInvite = (await window.api.createInvite()).token
    } catch (e) {
      inviteError = String(e).includes('limit')
        ? `Ya tienes ${maxInvites} invitaciones sin usar. Espera a que se usen o caduquen.`
        : 'No se ha podido crear la invitación.'
    }
    await loadInvites()
  }

  let inviteEmail = $state('')
  let inviteSent = $state('')

  // The answer is the same whether or not the address already has an account.
  async function emailInvite(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    inviteError = ''
    inviteSent = ''
    try {
      await window.api.inviteByEmail(inviteEmail.trim())
      inviteSent = `Invitación enviada a ${inviteEmail.trim()}.`
      inviteEmail = ''
    } catch (e) {
      inviteError = String(e).includes('limit')
        ? `Ya tienes ${maxInvites} invitaciones sin usar. Espera a que se usen o caduquen.`
        : String(e).includes('invalid')
          ? 'Esa dirección no parece válida.'
          : 'No se ha podido enviar la invitación.'
    }
    await loadInvites()
  }

  async function copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(newInvite)
    copied = true
  }

  const until = (iso: string): string =>
    new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })

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
  {#if email && !email.address}
    <form class="notice warning email" onsubmit={saveEmail}>
      <span>Añade tu correo para poder recuperar la contraseña si la olvidas.</span>
      <input
        type="email"
        bind:value={newEmail}
        required
        maxlength="254"
        placeholder="tu@correo.com"
        aria-label="Correo electrónico"
      />
      <button type="submit">Guardar</button>
      {#if emailNote}<span>{emailNote}</span>{/if}
    </form>
  {:else if email && !email.verified}
    <p class="notice warning" role="status">
      Confirma tu correo: te enviamos un enlace a <strong>{email.address}</strong>.
      <button class="link" onclick={resend}>Reenviar</button>
      {#if emailNote}<span>{emailNote}</span>{/if}
    </p>
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
      <p class="empty">
        Aún no tienes contactos. Invita a tus amigos o añade a alguien por su usuario.
      </p>
    {/if}
  </div>

  <form onsubmit={add}>
    <input bind:value={address} required placeholder="Usuario del contacto" aria-label="Usuario" />
    <button type="submit">+ Añadir</button>
  </form>

  {#if invitesOpen}
    <div class="invites">
      <p>
        Para crear una cuenta en Palique hace falta una invitación. Quien entre con la tuya
        aparecerá directamente en tus contactos.
      </p>
      {#if newInvite}
        <div class="code">
          <code>{newInvite}</code>
          <button onclick={copyInvite}>{copied ? 'Copiado' : 'Copiar'}</button>
        </div>
      {/if}
      {#if inviteError}<p class="error" role="alert">{inviteError}</p>{/if}
      <button onclick={invite} disabled={invites.length >= maxInvites}>Crear código</button>
      <form class="send" onsubmit={emailInvite}>
        <input
          type="email"
          bind:value={inviteEmail}
          required
          maxlength="254"
          placeholder="o envíala a su correo"
          aria-label="Correo de la persona invitada"
        />
        <button type="submit" disabled={invites.length >= maxInvites}>Enviar</button>
      </form>
      {#if inviteSent}<p class="hint" role="status">{inviteSent}</p>{/if}
      <p class="hint">
        Invitaciones sin usar: {invites.length} de {maxInvites}{#if invites.length}{' '}· caducan el {invites
            .map((i) => until(i.expires))
            .join(', ')}{/if}
      </p>
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

  .line strong {
    color: var(--text-strong);
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
    border-color: transparent;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-style: italic;
  }

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

  .notice.email {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    align-items: center;
  }

  .notice.email span {
    flex-basis: 100%;
  }

  .notice.email input {
    flex: 1;
    min-width: 0;
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

  .invites > button {
    justify-self: start;
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

  .code {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  code {
    flex: 1;
    padding: 3px 6px;
    overflow: hidden;
    border: solid var(--field-border-width);
    border-color: var(--field-border-color);
    border-radius: var(--radius);
    background: var(--field-bg);
    font-size: 12px;
    text-overflow: ellipsis;
    user-select: all;
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
