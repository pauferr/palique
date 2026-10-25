<script lang="ts">
  import { onMount } from 'svelte'
  import type { Contact, InviteStatus, OwnShow, Snapshot } from '../../main/xmpp'
  import type { MenuLabel } from '../../preload'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import { emojify } from './emoticons'
  import { avatarPng } from './picture'
  import { stripPlus } from './plus'
  import { prefs } from './prefs.svelte'
  import { playSound } from './sounds'
  import UpdateNotice from './UpdateNotice.svelte'

  let { jid, onlogout }: { jid: string; onlogout: () => void } = $props()

  const labels: Record<Contact['show'], string> = {
    online: 'Disponible',
    away: 'Ausente',
    dnd: 'No molestar',
    offline: 'Sin conexión'
  }

  let roster: Snapshot = $state({
    connected: true,
    jid: '',
    contacts: [],
    requests: [],
    name: '',
    avatar: '',
    show: 'online',
    status: ''
  })
  let picker: HTMLInputElement
  let avatarError = $state('')
  let presenceError = $state('')
  let status = $state('')
  // Name and personal message show their emoticons until clicked, then become inputs.
  let editing = $state(false) // the personal message, edited in place
  const focus = (input: HTMLInputElement): void => input.focus()
  const commitOnEnter = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
  }

  // Two groups like MSN, alphabetical inside each (by the name as read, without its codes).
  let sorted = $derived(
    [...roster.contacts].sort(
      (a, b) => stripPlus(a.name).localeCompare(stripPlus(b.name)) || a.jid.localeCompare(b.jid)
    )
  )
  // The search box filters by name, ignoring case and accents.
  let query = $state('')
  const fold = (text: string): string =>
    emojify(stripPlus(text)).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  let found = $derived(sorted.filter((c) => fold(c.name).includes(fold(query.trim()))))
  let groups = $derived([
    { label: 'En línea', contacts: found.filter((c) => c.show !== 'offline') },
    { label: 'Sin conexión', contacts: found.filter((c) => c.show === 'offline') }
  ])

  // Messages waiting in conversations that aren't open (contact → count), like MSN.
  let unread: Record<string, number> = $state({})

  onMount(() => {
    window.api.getRoster().then((value) => (roster = value))
    window.api.getUnread().then((value) => (unread = value))
    const offRoster = window.api.onRoster((value) => {
      roster = value
    })
    const offUnread = window.api.onUnread((value) => {
      unread = value
    })
    const offIncoming = window.api.onIncoming((buzz) =>
      playSound(prefs.soundPack, buzz ? 'buzz' : 'message')
    )
    const offOnline = window.api.onContactOnline(() => playSound(prefs.soundPack, 'online'))
    return () => {
      offRoster()
      offUnread()
      offIncoming()
      offOnline()
    }
  })

  // The personal message follows the snapshot (Options can change it too), except while
  // it's being edited here.
  $effect(() => {
    if (!editing) status = roster.status
  })

  async function updatePresence(show: OwnShow): Promise<void> {
    presenceError = ''
    try {
      await window.api.setPresence(show, status)
    } catch {
      presenceError = 'No se ha podido cambiar el estado.'
    }
  }

  // Menus like MSN's, each action in one place: the bar on top (Archivo, Contactos,
  // Herramientas, Ayuda), your status under your name, and a right click on a contact.
  // Native, so they can go past the window.
  const ownLabels: Record<OwnShow, string> = { ...labels, invisible: 'Invisible' }
  type MenuItem = { label: string; checked?: boolean; run: () => void } | '-'

  // Under the button clicked, or where the right click was.
  async function popup(event: MouseEvent, items: MenuItem[]): Promise<void> {
    const at =
      event.type === 'contextmenu'
        ? { left: event.clientX, bottom: event.clientY }
        : (event.currentTarget as HTMLElement).getBoundingClientRect()
    const labels = items.map((item): MenuLabel =>
      item === '-' ? item : { label: item.label, checked: item.checked }
    )
    const item = items[await window.api.popupMenu(labels, at.left, at.bottom)]
    if (item && item !== '-') item.run()
  }

  const fileMenu = (e: MouseEvent): Promise<void> =>
    popup(e, [
      { label: 'Cambiar mi nombre…', run: window.api.openNick },
      { label: 'Cambiar mi mensaje personal…', run: () => (editing = true) },
      '-',
      { label: 'Cerrar sesión', run: onlogout },
      { label: 'Salir de Palique', run: window.api.quit }
    ])

  const contactsMenu = (e: MouseEvent): Promise<void> =>
    popup(e, [{ label: 'Añadir o invitar a un contacto…', run: openAdd }])

  const toolsMenu = (e: MouseEvent): Promise<void> =>
    popup(e, [{ label: 'Opciones…', run: window.api.openOptions }])

  const helpMenu = (e: MouseEvent): Promise<void> =>
    popup(e, [
      { label: 'Registro de errores…', run: window.api.openLogs },
      { label: 'Acerca de Palique', run: window.api.openAbout }
    ])

  const meMenu = (e: MouseEvent): Promise<void> =>
    popup(
      e,
      (['online', 'away', 'dnd', 'invisible'] as const).map((show) => ({
        label: ownLabels[show],
        checked: roster.show === show,
        run: () => updatePresence(show)
      }))
    )

  function contactMenu(e: MouseEvent, contact: Contact): Promise<void> {
    e.preventDefault()
    return popup(e, [
      { label: 'Enviar un mensaje', run: () => window.api.openChat(contact.jid) },
      ...(contact.email
        ? [{ label: 'Copiar correo', run: () => navigator.clipboard.writeText(contact.email) }]
        : []),
      '-',
      { label: 'Eliminar contacto…', run: () => remove(contact) }
    ])
  }

  async function chooseAvatar(): Promise<void> {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    avatarError = ''
    try {
      await window.api.setAvatar(await avatarPng(file))
    } catch {
      avatarError = 'No se ha podido usar esa imagen.'
    }
  }

  // Adding and inviting are one step: type their email; if they're not on Palique, the
  // panel offers to invite them (invites are limited, so that's an explicit click).
  let addOpen = $state(false)
  let address = $state('')
  let addNote = $state('')
  let notFound = $state('') // address with no account, offered an invite
  let invites: InviteStatus | undefined = $state()
  const left = $derived(invites ? Math.max(0, invites.max - invites.used) : 0)

  async function openAdd(): Promise<void> {
    addOpen = true
    addNote = ''
    notFound = ''
    invites = await window.api.inviteStatus().catch(() => undefined)
  }

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    addNote = ''
    notFound = ''
    const value = address.trim().toLowerCase()
    try {
      const result = await window.api.addContact(value)
      if (result === 'added') {
        addNote = `Le hemos pedido a ${value} que te acepte. Aparecerá en tu lista cuando lo haga.`
        address = ''
      } else if (result === 'self') addNote = 'Ese es tu propio correo.'
      else notFound = value
    } catch (e) {
      addNote = String(e).includes('offline')
        ? 'Sin conexión con el servidor. Inténtalo cuando vuelvas a estar conectado.'
        : String(e).includes('wait')
          ? 'Has buscado demasiados correos. Espera un rato.'
          : String(e).includes('invalid')
            ? 'Esa dirección no parece válida.'
            : 'No se ha podido añadir.'
    }
  }

  async function sendInvite(value: string): Promise<void> {
    try {
      invites = await window.api.inviteByEmail(value)
      addNote = `Invitación enviada a ${value}. Cuando cree su cuenta, aparecerá directamente en tu lista.`
      address = ''
    } catch (e) {
      const reason = String(e)
      addNote = reason.includes('limit')
        ? 'Ya no te quedan invitaciones.'
        : reason.includes('registered')
          ? 'Esa persona ya está en Palique: añádela con su correo.'
          : reason.includes('invalid')
            ? 'Esa dirección no parece válida.'
            : 'No se ha podido enviar la invitación.'
    }
    notFound = ''
  }

  function remove(contact: Contact): void {
    if (confirm(`¿Eliminar a ${emojify(stripPlus(contact.name))} de tus contactos?`)) {
      window.api.removeContact(contact.jid)
    }
  }
</script>

<section class="roster">
  <div class="menubar" role="menubar">
    <button role="menuitem" aria-haspopup="menu" onclick={fileMenu}>Archivo</button>
    <button role="menuitem" aria-haspopup="menu" onclick={contactsMenu}>Contactos</button>
    <button role="menuitem" aria-haspopup="menu" onclick={toolsMenu}>Herramientas</button>
    <button role="menuitem" aria-haspopup="menu" onclick={helpMenu}>Ayuda</button>
  </div>

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
        <!-- The name opens its own window, with the Messenger Plus! formatting tools. -->
        <button class="nick" onclick={() => window.api.openNick()} title="Cambiar tu nombre"
          ><Emoticons text={roster.name} plus /></button
        >
        <button class="show" aria-haspopup="menu" onclick={meMenu}
          >({ownLabels[roster.show]}) ▾</button
        >
      </div>
      {#if editing}
        <input
          class="personal"
          bind:value={status}
          onchange={() => updatePresence(roster.show)}
          onblur={() => (editing = false)}
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
          onclick={() => (editing = true)}
          title="Cambiar tu mensaje personal"
          >{#if status}<Emoticons text={status} />{:else}Escribe un mensaje personal{/if}</button
        >
      {/if}
    </div>
  </header>

  <UpdateNotice />
  {#if avatarError}<p class="notice error" role="alert">{avatarError}</p>{/if}
  {#if presenceError}<p class="notice error" role="alert">{presenceError}</p>{/if}
  {#if roster.show === 'invisible'}
    <p class="notice">Estás invisible: tus contactos te ven sin conexión, pero puedes chatear.</p>
  {/if}
  {#if !roster.connected}
    <p class="notice warning" role="status">Reconectando…</p>
  {/if}

  <div class="list">
    {#each roster.requests as request (request.jid)}
      <div class="request">
        <span><strong><Emoticons text={request.name} plus /></strong> quiere añadirte</span>
        <button onclick={() => window.api.acceptRequest(request.jid)}>Aceptar</button>
        <button onclick={() => window.api.rejectRequest(request.jid)}>Rechazar</button>
      </div>
    {/each}

    {#if roster.contacts.length}
      <input
        class="search"
        type="search"
        bind:value={query}
        placeholder="Buscar contactos"
        aria-label="Buscar contactos"
      />
      {#if !found.length}<p class="no-match">Nadie se llama así.</p>{/if}
      <!-- While searching, only the groups with someone in them. -->
      {#each groups.filter((g) => g.contacts.length || !query.trim()) as group (group.label)}
        <details open>
          <summary>{group.label} ({group.contacts.length})</summary>
          <ul>
            {#each group.contacts as contact (contact.jid)}
              <!-- Recreated on each new message, so the row blinks again. -->
              {#key unread[contact.jid]}
                <li
                  class:unread={unread[contact.jid]}
                  title={contact.email || undefined}
                  oncontextmenu={(e) => contactMenu(e, contact)}
                >
                  <span title={labels[contact.show]}>
                    <Avatar
                      jid={contact.jid}
                      name={contact.name}
                      url={contact.avatar}
                      show={contact.show}
                      size={36}
                    />
                  </span>
                  <!-- Name, and the personal message under it. -->
                  <button class="name" onclick={() => window.api.openChat(contact.jid)}>
                    <span><Emoticons text={contact.name} plus /></span>
                    {#if contact.pending}
                      <small>Esperando a que te acepte</small>
                    {:else if contact.status}
                      <small><Emoticons text={contact.status} /></small>
                    {/if}
                  </button>
                  {#if unread[contact.jid]}
                    <span class="badge" title="Mensajes sin leer"
                      >{unread[contact.jid] > 9 ? '9+' : unread[contact.jid]}</span
                    >
                  {/if}
                </li>
              {/key}
            {/each}
          </ul>
        </details>
      {/each}
    {:else}
      <div class="no-contacts">
        <p>
          Aún no tienes contactos.<br />Añade a alguien con su correo; si no está en Palique, podrás
          invitarle.
        </p>
        <button class="add-link" onclick={openAdd}><b>+</b><span>Añadir un contacto</span></button>
      </div>
    {/if}
  </div>

  {#if addOpen}
    <div class="sheet" role="dialog" aria-label="Añadir un contacto">
      <h3>
        Añadir un contacto
        <button class="close" onclick={() => (addOpen = false)} aria-label="Cerrar">×</button>
      </h3>
      <p class="hint">Escribe su correo. Si aún no está en Palique, podrás invitarle.</p>
      <form onsubmit={add}>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="email"
          spellcheck="false"
          bind:value={address}
          required
          maxlength="254"
          placeholder="Su correo"
          aria-label="Correo del contacto"
          autofocus
        />
        <button type="submit">Añadir</button>
      </form>
      {#if notFound}
        <div class="result" role="status">
          <p><strong>{notFound}</strong> aún no está en Palique.</p>
          <div class="row">
            <button onclick={() => sendInvite(notFound)} disabled={!left}
              >Enviarle una invitación</button
            >
            <span class="hint">
              {left === 1 ? 'Te queda 1' : `Te quedan ${left}`}{invites
                ? ` de ${invites.max}`
                : ''}.
            </span>
          </div>
        </div>
      {:else if addNote}
        <p class="result" role="status">{addNote}</p>
      {/if}
    </div>
  {/if}
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
    position: relative;
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

  /* Status reads like text next to the name and opens your menu, MSN style. */
  .show {
    flex: none;
    padding: 0 2px;
    border-color: transparent;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
    font-weight: normal;
  }

  .show:hover:not(:disabled) {
    background: var(--row-hover-bg);
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
    gap: 8px;
    align-items: center;
    padding: 4px 10px 4px 18px;
  }

  .search {
    box-sizing: border-box;
    width: calc(100% - 16px);
    margin: 8px 8px 2px;
  }

  .no-match {
    margin: 12px;
    color: var(--text-muted);
    text-align: center;
  }

  li:hover {
    background: var(--row-hover-bg);
  }

  /* Someone wrote and the conversation isn't open: like a Windows XP taskbar button, the
     row blinks orange three times, then stays lit until the conversation is opened. Kept
     with "reduce motion" too: it's a plain color switch, once a second. */
  li.unread {
    --unread: linear-gradient(#ffd79a, #f8a73a 55%, #ef8a14);
    animation: unread 1s steps(1, end) 3 forwards;
  }

  @keyframes unread {
    0% {
      background: transparent;
    }
    50%,
    100% {
      background: var(--unread);
    }
  }

  .badge {
    flex: none;
    min-width: 1.5em;
    padding: 0 5px;
    border-radius: 999px;
    background: linear-gradient(#ffb24d, #e6700a);
    box-shadow: inset 0 1px rgb(255 255 255 / 45%);
    color: #fff;
    font-size: 0.85em;
    font-weight: bold;
    line-height: 1.5;
    text-align: center;
  }

  .name {
    display: grid;
    flex: 1;
    min-width: 0;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text);
    text-align: left;
  }

  .name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name small {
    font-size: 0.9em;
  }

  .name:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }

  small {
    color: var(--text-muted);
    font-size: inherit;
  }

  /* No contacts yet: with no bar at the bottom, say how to add someone, MSN's green link. */
  .no-contacts {
    display: grid;
    gap: 10px;
    justify-items: center;
    padding: 24px 16px;
    color: var(--text-muted);
    text-align: center;
  }

  .no-contacts p {
    margin: 0;
    line-height: 1.5;
  }

  .add-link {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-strong);
  }

  .add-link:hover:not(:disabled) {
    background: none;
  }

  .add-link b {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--status-online);
    color: #fff;
    line-height: 1;
  }

  .add-link span {
    text-decoration: underline;
  }

  /* The menu bar on top, like MSN Messenger's. */
  .menubar {
    position: relative;
    display: flex;
    gap: 2px;
    padding: 2px 4px;
    background: var(--bar-bg);
    border-bottom: 1px solid var(--line);
  }

  .menubar > button {
    padding: 2px 8px;
    border-color: transparent;
    background: none;
    box-shadow: none;
    color: var(--text);
  }

  .menubar > button:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  /* Panels that rise from the bottom of the list: adding someone, About. */
  .sheet {
    display: grid;
    gap: 8px;
    padding: 10px 12px 12px;
    background: var(--bar-bg);
    border-top: 1px solid var(--line);
    box-shadow: 0 -4px 12px rgb(0 0 0 / 10%);
  }

  .sheet h3 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0;
    color: var(--text-strong);
    font-size: inherit;
  }

  .sheet p {
    margin: 0;
  }

  .close {
    padding: 0 6px;
    border-color: transparent;
    background: none;
    box-shadow: none;
    font-size: 16px;
    line-height: 1;
  }

  .sheet form {
    display: flex;
    gap: 6px;
  }

  .sheet form input {
    flex: 1;
    min-width: 0;
  }

  .result {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 8px;
    background: var(--list-bg);
    border: 1px solid var(--line);
    border-radius: var(--group-radius);
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
