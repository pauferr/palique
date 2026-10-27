<script lang="ts">
  import { ChevronDown, Search } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import type { Contact, InviteStatus, OwnShow, Snapshot } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import { _, _n, lang } from './i18n'
  import { emojify } from './emoticons'
  import { helpItems, popup, type MenuItem } from './menu'
  import MenuBar from './MenuBar.svelte'
  import { avatarPng } from './picture'
  import { stripPlus } from './plus'
  import { prefs } from './prefs.svelte'
  import { playSound } from './sounds'
  import UpdateNotice from './UpdateNotice.svelte'

  let { jid, onlogout }: { jid: string; onlogout: () => void } = $props()

  const labels: Record<Contact['show'], string> = {
    online: _('Disponible'),
    away: _('Ausente'),
    dnd: _('No molestar'),
    offline: _('Sin conexión')
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

  // Two groups, alphabetical inside each (by the name as read, without its codes).
  let sorted = $derived(
    [...roster.contacts].sort(
      (a, b) =>
        stripPlus(a.name).localeCompare(stripPlus(b.name), lang) || a.jid.localeCompare(b.jid)
    )
  )
  // The search box filters by name, ignoring case and accents.
  let query = $state('')
  const fold = (text: string): string =>
    emojify(stripPlus(text)).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  let found = $derived(sorted.filter((c) => fold(c.name).includes(fold(query.trim()))))
  let groups = $derived([
    { label: _('En línea'), contacts: found.filter((c) => c.show !== 'offline') },
    { label: _('Sin conexión'), contacts: found.filter((c) => c.show === 'offline') }
  ])

  // Messages waiting in conversations that aren't open (contact → count).
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
      presenceError = _('No se ha podido cambiar el estado.')
    }
  }

  const ownLabels: Record<OwnShow, string> = { ...labels, invisible: _('Invisible') }

  // The bar on top. The app's own menu is named after it, as on a Mac.
  const menus = [
    {
      label: 'Palique',
      items: (): MenuItem[] => [
        { label: _('Cambiar mi nombre…'), run: window.api.openNick },
        { label: _('Cambiar mi mensaje personal…'), run: () => (editing = true) },
        '-',
        { label: _('Cerrar sesión'), run: onlogout },
        { label: _('Salir de Palique'), run: window.api.quit }
      ]
    },
    {
      label: _('Contactos'),
      items: (): MenuItem[] => [{ label: _('Añadir o invitar a un contacto…'), run: openAdd }]
    },
    {
      label: _('Herramientas'),
      items: (): MenuItem[] => [{ label: _('Opciones…'), run: window.api.openOptions }]
    },
    { label: _('Ayuda'), items: helpItems }
  ]

  // Your picture: your status (its frame shows it) or another picture.
  const meMenu = (e: MouseEvent): Promise<void> =>
    popup(e, [
      ...(['online', 'away', 'dnd', 'invisible'] as const).map((show) => ({
        label: ownLabels[show],
        checked: roster.show === show,
        run: () => updatePresence(show)
      })),
      '-',
      { label: _('Cambiar imagen…'), run: () => picker.click() }
    ])

  function contactMenu(e: MouseEvent, contact: Contact): Promise<void> {
    e.preventDefault()
    return popup(e, [
      { label: _('Enviar un mensaje'), run: () => window.api.openChat(contact.jid) },
      ...(contact.email
        ? [{ label: _('Copiar correo'), run: () => navigator.clipboard.writeText(contact.email) }]
        : []),
      '-',
      { label: _('Eliminar contacto…'), run: () => remove(contact) }
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
      avatarError = _('No se ha podido usar esa imagen.')
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
        addNote = _(
          'Le hemos pedido a {email} que te acepte. Aparecerá en tu lista cuando lo haga.',
          {
            email: value
          }
        )
        address = ''
      } else if (result === 'self') addNote = _('Ese es tu propio correo.')
      else notFound = value
    } catch (e) {
      addNote = String(e).includes('offline')
        ? _('Sin conexión con el servidor. Inténtalo cuando vuelvas a estar conectado.')
        : String(e).includes('wait')
          ? _('Has buscado demasiados correos. Espera un rato.')
          : String(e).includes('invalid')
            ? _('Esa dirección no parece válida.')
            : _('No se ha podido añadir.')
    }
  }

  async function sendInvite(value: string): Promise<void> {
    try {
      invites = await window.api.inviteByEmail(value)
      addNote = _(
        'Invitación enviada a {email}. Cuando cree su cuenta, aparecerá directamente en tu lista.',
        { email: value }
      )
      address = ''
    } catch (e) {
      const reason = String(e)
      addNote = reason.includes('limit')
        ? _('Ya no te quedan invitaciones.')
        : reason.includes('registered')
          ? _('Esa persona ya está en Palique: añádela con su correo.')
          : reason.includes('invalid')
            ? _('Esa dirección no parece válida.')
            : _('No se ha podido enviar la invitación.')
    }
    notFound = ''
  }

  // A sentence with markup inside (a bold name): translated whole, then split around its
  // placeholder, so each language keeps its own word order.
  const around = (text: string, key = '{name}'): string[] => {
    const [before, after = ''] = text.split(key)
    return [before, after]
  }

  function remove(contact: Contact): void {
    if (
      confirm(_('¿Eliminar a {name} de tus contactos?', { name: emojify(stripPlus(contact.name)) }))
    ) {
      window.api.removeContact(contact.jid)
    }
  }
</script>

<section class="roster">
  <MenuBar {menus} />

  <header>
    <button
      class="me"
      aria-haspopup="menu"
      onclick={meMenu}
      title={_('{status}. Cambiar tu estado o tu imagen', { status: ownLabels[roster.show] })}
    >
      <Avatar
        {jid}
        name={roster.name}
        url={roster.avatar}
        show={roster.show === 'invisible' ? 'offline' : roster.show}
        size={72}
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
        <!-- The name opens its own window, with the formatting tools. -->
        <button class="nick" onclick={() => window.api.openNick()} title={_('Cambiar tu nombre')}
          ><Emoticons text={roster.name} plus /></button
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
          placeholder={_('Escribe un mensaje personal')}
          aria-label={_('Mensaje personal')}
        />
      {:else}
        <button
          class="personal"
          class:empty={!status}
          onclick={() => (editing = true)}
          title={_('Cambiar tu mensaje personal')}
          >{#if status}<Emoticons text={status} />{:else}{_(
              'Escribe un mensaje personal'
            )}{/if}</button
        >
      {/if}
    </div>
  </header>

  <UpdateNotice />
  {#if avatarError}<p class="notice error" role="alert">{avatarError}</p>{/if}
  {#if presenceError}<p class="notice error" role="alert">{presenceError}</p>{/if}
  {#if roster.show === 'invisible'}
    <p class="notice">
      {_('Estás invisible: tus contactos te ven sin conexión, pero puedes chatear.')}
    </p>
  {/if}
  {#if !roster.connected}
    <p class="notice warning" role="status">{_('Reconectando…')}</p>
  {/if}

  <div class="list">
    {#each roster.requests as request (request.jid)}
      <div class="request">
        <span
          >{around(_('{name} quiere añadirte'))[0]}<strong
            ><Emoticons text={request.name} plus /></strong
          >{around(_('{name} quiere añadirte'))[1]}</span
        >
        <button onclick={() => window.api.acceptRequest(request.jid)}>{_('Aceptar')}</button>
        <button onclick={() => window.api.rejectRequest(request.jid)}>{_('Rechazar')}</button>
      </div>
    {/each}

    {#if roster.contacts.length}
      <label class="search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          bind:value={query}
          placeholder={_('Buscar contactos')}
          aria-label={_('Buscar contactos')}
        />
      </label>
      {#if !found.length}<p class="no-match">{_('Nadie se llama así.')}</p>{/if}
      <!-- While searching, only the groups with someone in them. -->
      {#each groups.filter((g) => g.contacts.length || !query.trim()) as group (group.label)}
        <details open>
          <summary
            ><ChevronDown size={14} strokeWidth={3} aria-hidden="true" />{group.label} ({group
              .contacts.length})</summary
          >
          <ul>
            {#each group.contacts as contact (contact.jid)}
              <!-- Recreated on each new message, so the row blinks again. -->
              {#key unread[contact.jid]}
                <li
                  class:unread={unread[contact.jid]}
                  class:offline={contact.show === 'offline'}
                  title={contact.email || undefined}
                  oncontextmenu={(e) => contactMenu(e, contact)}
                >
                  <span title={labels[contact.show]}>
                    <Avatar
                      jid={contact.jid}
                      name={contact.name}
                      url={contact.avatar}
                      show={contact.show}
                      size={46}
                    />
                  </span>
                  <!-- Name, and the personal message under it. -->
                  <button class="name" onclick={() => window.api.openChat(contact.jid)}>
                    <span><Emoticons text={contact.name} plus /></span>
                    {#if contact.pending}
                      <small>{_('Esperando a que te acepte')}</small>
                    {:else if contact.status}
                      <small><Emoticons text={contact.status} /></small>
                    {/if}
                  </button>
                  {#if unread[contact.jid]}
                    <span class="badge" title={_('Mensajes sin leer')}
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
          {_('Aún no tienes contactos.')}<br />{_(
            'Añade a alguien con su correo; si no está en Palique, podrás invitarle.'
          )}
        </p>
        <button class="add-link" onclick={openAdd}
          ><b>+</b><span>{_('Añadir un contacto')}</span></button
        >
      </div>
    {/if}
  </div>

  {#if addOpen}
    <div class="sheet" role="dialog" aria-label={_('Añadir un contacto')}>
      <h3>
        {_('Añadir un contacto')}
        <button class="close" onclick={() => (addOpen = false)} aria-label={_('Cerrar')}>×</button>
      </h3>
      <p class="hint">{_('Escribe su correo. Si aún no está en Palique, podrás invitarle.')}</p>
      <form onsubmit={add}>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="email"
          spellcheck="false"
          bind:value={address}
          required
          maxlength="254"
          placeholder={_('Su correo')}
          aria-label={_('Correo del contacto')}
          autofocus
        />
        <button class="primary" type="submit">{_('Añadir')}</button>
      </form>
      {#if notFound}
        <div class="result" role="status">
          <p>
            {around(_('{email} aún no está en Palique.'), '{email}')[0]}<strong>{notFound}</strong
            >{around(_('{email} aún no está en Palique.'), '{email}')[1]}
          </p>
          <div class="row">
            <button onclick={() => sendInvite(notFound)} disabled={!left}
              >{_('Enviarle una invitación')}</button
            >
            <span class="hint">
              {invites
                ? _n('Te queda 1 de {max}.', 'Te quedan {n} de {max}.', left, { max: invites.max })
                : _n('Te queda 1.', 'Te quedan {n}.', left)}
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
    gap: 14px;
    align-items: center;
    padding: 16px 16px 18px;
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

  /* Name, and the personal message under it. */
  .line {
    display: grid;
    gap: 4px;
    justify-items: start;
  }

  /* Our name reads as bold text until you click it. */
  .nick {
    max-width: 100%;
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
    font-size: 19px;
    font-weight: 800;
  }

  /* Reads as text until you click it. */
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
    padding: 0 8px;
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
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 10px 8px 6px;
    color: var(--text-strong);
    font-weight: 800;
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  /* The chevron points right while the group is folded. */
  details:not([open]) summary :global(svg) {
    transform: rotate(-90deg);
  }

  ul {
    margin: 0;
    padding: 0 0 4px;
    list-style: none;
  }

  /* Transparent border, so the unread one doesn't shift the row. */
  li {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
  }

  li.offline .name {
    color: var(--text-muted);
  }

  li.offline .name > span {
    font-weight: 600;
  }

  /* A pill with a magnifier; the ring goes around the whole pill. */
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 6px 6px;
    padding: 8px 12px;
    border: var(--field-border-width) solid var(--line);
    border-radius: 999px;
    background: var(--window-bg);
    color: var(--text-muted);
  }

  .search:focus-within {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .search input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: none;
    color: var(--text);
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
    animation: unread 1s steps(1, end) 3 forwards;
  }

  li.unread .name > span {
    font-weight: 800;
  }

  li.unread small {
    color: var(--unread-text);
  }

  @keyframes unread {
    0% {
      background: transparent;
    }
    50%,
    100% {
      background: var(--unread);
      border-color: var(--unread-border);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 70%);
    }
  }

  .badge {
    flex: none;
    box-sizing: border-box;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--badge-bg);
    color: var(--badge-text);
    font-size: 13px;
    font-weight: 800;
    line-height: 24px;
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

  .name > span {
    font-size: 16px;
    font-weight: 700;
  }

  .name small {
    font-size: 13px;
    font-weight: 400;
  }

  .name:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }

  small {
    color: var(--text-muted);
    font-size: inherit;
  }

  /* No contacts yet: with no bar at the bottom, say how to add someone, a green link. */
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

  /* The menu bar on top. */
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
