<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Lock, LockOpen, ShieldCheck, Smile, Star, Vibrate } from '@lucide/svelte'
  import type { ChatMessage, Contact, DeviceTrust, TrustNote } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import EmoticonCanvas from './EmoticonCanvas.svelte'
  import { EMOTICONS, emojify } from './emoticons'
  import { stripPlus } from './plus'
  import { popup } from './menu'
  import { prefs } from './prefs.svelte'
  import { playSound, type SoundEvent } from './sounds'
  import WinkPlayer from './WinkPlayer.svelte'
  import { findWink, winkLabel, winks } from './winks'
  import { _, lang } from './i18n'

  // `embedded`: inside the contact list window (the «together» option), not a window of its own.
  let { jid, embedded = false }: { jid: string; embedded?: boolean } = $props()

  const TYPING_IDLE = 5000 // stop "typing" after this long without keystrokes
  const TYPING_TIMEOUT = 30000 // hide their indicator if they never say they stopped
  const labels: Record<Contact['show'], string> = {
    online: _('Disponible'),
    away: _('Ausente'),
    dnd: _('No molestar'),
    offline: _('Sin conexión')
  }

  let messages: ChatMessage[] = $state([])
  let contact: Contact | undefined = $state()
  // Their display name can change while the window is open.
  const name = $derived(contact?.name ?? '')
  $effect(() => {
    if (name && !embedded)
      document.title = prefs.emoticons ? emojify(stripPlus(name)) : stripPlus(name)
  })
  let draft = $state('')
  // Encryption: trust notices (not messages), their devices, and a send error line.
  let notes: TrustNote[] = $state([])
  let devices: DeviceTrust[] = $state([])
  let sendError = $state('')
  const verified = $derived(devices.length > 0 && devices.every((d) => d.verified))
  const blocked = $derived(devices.filter((d) => d.blocked))
  const loadDevices = async (): Promise<void> => {
    devices = (await window.api.getVerify(jid)).devices
  }
  let shaking = $state(false)
  let canBuzz = $state(true)
  let canWink = $state(true)
  let pickerOpen = $state(false)
  let emoticonsOpen = $state(false)
  let hovered = $state('')
  let input: HTMLTextAreaElement
  let theyType = $state(false)
  // A wink playing inside this window (on Wayland, or with full-screen winks off),
  // and the ones that arrived meanwhile, played after it in order.
  let playing = $state('')
  const queued: string[] = []
  const nextWink = (): string => (playing = queued.shift() ?? '')
  let list: HTMLElement
  let composing = false
  let idle: ReturnType<typeof setTimeout> | undefined
  let theirTimeout: ReturnType<typeof setTimeout> | undefined

  // A burst of messages chimes once, not once per message.
  const CHIME_GAP = 1500
  let lastChime = 0

  function play(event: SoundEvent): void {
    if (!prefs.sounds) return
    if (event === 'message') {
      if (Date.now() - lastChime < CHIME_GAP) return
      lastChime = Date.now()
    }
    playSound(prefs.soundPack, event)
  }

  // The whole window shakes; where it can't move (Wayland), its contents do.
  async function shake(): Promise<void> {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (await window.api.shakeWindow()) return
    shaking = false
    requestAnimationFrame(() => (shaking = true))
  }

  // `alert` = it just happened: play the sound and shake for buzzes.
  async function add(message: ChatMessage, alert: boolean): Promise<void> {
    if (messages.some((m) => m.id === message.id)) return
    messages.push(message)
    if (!message.mine) theyType = false
    if (alert && !message.mine) {
      if (message.buzz && prefs.shake) shake()
      // The wink brings its own sound.
      if (!message.wink) play(message.buzz ? 'buzz' : 'message')
    }
    if (alert && message.mine && message.buzz) shake()
    await tick()
    list.scrollTop = list.scrollHeight
  }

  onMount(() => {
    // Quiet ones (over the contact's buzz limit) show up without shaking or sound.
    const offMessage = window.api.onChatMessage((m, quiet) => {
      if (m.with === jid) add(m, !quiet)
    })
    window.api.chatReady(jid)
    const offTrust = window.api.onTrust(async (note) => {
      if (note.jid !== jid) return
      notes.push(note)
      loadDevices()
      await tick()
      list.scrollTop = list.scrollHeight
    })
    window.api.getTrustNotes(jid).then((n) => {
      // A note pushed live meanwhile is already in `notes`.
      const key = (x: TrustNote): string => `${x.at}-${x.deviceId}-${x.kind}`
      const seen = new Set(notes.map(key))
      notes = [...n.filter((x) => !seen.has(key(x))), ...notes]
    })
    loadDevices()
    // Verifying or accepting a key happens in other places: look again when we're back.
    window.addEventListener('focus', loadDevices)
    const offTyping = window.api.onTyping((c, typing) => {
      if (c !== jid) return
      theyType = typing
      clearTimeout(theirTimeout)
      if (typing) theirTimeout = setTimeout(() => (theyType = false), TYPING_TIMEOUT)
    })
    window.addEventListener('beforeunload', stopTyping)
    const offRoster = window.api.onRoster((s) => {
      contact = s.contacts.find((c) => c.jid === jid)
    })
    const offWink = window.api.onWinkPlay((id) => {
      if (!findWink(id)) return
      if (playing) queued.push(id)
      else playing = id
    })
    window.api.getRoster().then((s) => (contact = s.contacts.find((c) => c.jid === jid)))
    // History never triggers effects; live messages (even the one that opened this window)
    // come through onChatMessage. Keep them after the history, without duplicates.
    window.api.getChatHistory(jid).then(async (history) => {
      const known = new Set(history.map((m) => m.id))
      messages = [...history, ...messages.filter((m) => !known.has(m.id))]
      await tick()
      list.scrollTop = list.scrollHeight
    })
    return () => {
      // Inside the contact list it goes away when another contact is chosen: stop "typing".
      stopTyping()
      window.removeEventListener('beforeunload', stopTyping)
      offMessage()
      offTyping()
      offRoster()
      offWink()
      offTrust()
      window.removeEventListener('focus', loadDevices)
    }
  })

  function stopTyping(): void {
    clearTimeout(idle)
    if (!composing) return
    composing = false
    window.api.setTyping(jid, false)
  }

  // Tell the contact once when we start; "paused" after a quiet spell or an empty box.
  function onInput(): void {
    clearTimeout(idle)
    if (!draft.trim()) return stopTyping()
    if (!composing) {
      composing = true
      window.api.setTyping(jid, true)
    }
    idle = setTimeout(stopTyping, TYPING_IDLE)
  }

  async function send(): Promise<void> {
    const text = draft
    if (!text.trim()) return
    sendError = ''
    draft = ''
    // The message itself tells them we stopped typing.
    clearTimeout(idle)
    composing = false
    try {
      await window.api.sendMessage(jid, text)
    } catch (error) {
      // The draft stays where it was, unless they've already started another one.
      if (!draft) draft = text
      sendError = String(error).includes('no-devices')
        ? 'no-devices'
        : _('No se ha podido enviar el mensaje')
    }
  }

  async function acceptKeys(): Promise<void> {
    await Promise.all(blocked.map((d) => window.api.acceptKey(jid, d.deviceId)))
    await loadDevices()
  }

  const menu = (event: MouseEvent): void => {
    event.preventDefault()
    popup(event, [{ label: _('Verificar cifrado…'), run: () => window.api.openVerify(jid) }])
  }

  function onKeydown(event: KeyboardEvent): void {
    // Enter sends, Shift+Enter adds a new line.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  // The main process enforces the limits and says how long until the next one.
  async function buzz(): Promise<void> {
    canBuzz = false
    setTimeout(() => (canBuzz = true), await window.api.sendBuzz(jid))
  }

  // Insert the shortcut where the cursor is, like typing it.
  async function insertEmoticon(code: string): Promise<void> {
    emoticonsOpen = false
    const { selectionStart: start, selectionEnd: end } = input
    draft = draft.slice(0, start) + code + draft.slice(end)
    await tick()
    input.focus()
    input.setSelectionRange(start + code.length, start + code.length)
    onInput()
  }

  // Wink thumbnails: a still at a telling moment, playing (muted) while hovered or focused.
  let previewing = $state('')

  async function wink(id: string): Promise<void> {
    pickerOpen = false
    canWink = false
    setTimeout(() => (canWink = true), await window.api.sendWink(jid, id))
  }

  const GROUP_GAP = 5 * 60 * 1000 // messages closer than this share one "X dice:"

  const time = (at: number): string =>
    new Date(at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })

  // "Hoy", "Ayer" or "3 de octubre" (with the year when it isn't this one).
  function day(at: number): string {
    const date = new Date(at)
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return _('Hoy')
    if (date.toDateString() === yesterday.toDateString()) return _('Ayer')
    return date.toLocaleDateString(lang, {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
    })
  }

  const newDay = (i: number): boolean =>
    i === 0 ||
    new Date(messages[i - 1].at).toDateString() !== new Date(messages[i].at).toDateString()

  // A text message right after another from the same person goes on without its header.
  function continues(i: number): boolean {
    const [before, message] = [messages[i - 1], messages[i]]
    return (
      !!before &&
      !newDay(i) &&
      !before.buzz &&
      !before.wink &&
      before.mine === message.mine &&
      message.at - before.at < GROUP_GAP
    )
  }
</script>

<!-- A sentence with the contact's name, which a component draws: split the translated
     text around {name}. -->
{#snippet named(text: string)}{@const [before, after] = text.split('{name}')}{before}<Emoticons
    text={name}
    plus
  />{after}{/snippet}

{#snippet noted(from: number, to: number)}
  {#each notes.filter((n) => n.at > from && n.at <= to) as note (`${note.at}-${note.deviceId}-${note.kind}`)}
    <li class="event notice">
      {@render named(
        note.kind === 'new-device'
          ? _('{name} ha empezado a usar Palique en otro dispositivo')
          : _('La clave de cifrado de {name} ha cambiado')
      )}
    </li>
  {/each}
{/snippet}

<div class="chat" class:embedded class:shaking onanimationend={() => (shaking = false)}>
  {#if playing}
    <!-- A click closes it. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="wink-layer" onclick={nextWink}>
      {#key playing}
        <WinkPlayer id={playing} playing sound={prefs.sounds} onended={nextWink} />
      {/key}
    </div>
  {/if}
  <!-- Only here: the rest keeps the native copy and paste menu. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header oncontextmenu={menu}>
    <Avatar {jid} {name} url={contact?.avatar} show={contact?.show ?? 'offline'} size={60} />
    <div class="to">
      <span class="name">{_('Para:')} <strong><Emoticons text={name} plus /></strong></span>
      <small
        >{#if contact?.status}<Emoticons text={contact.status} />{:else}{labels[
            contact?.show ?? 'offline'
          ]}{/if}</small
      >
      {#if contact?.email}<small class="email">{contact.email}</small>{/if}
    </div>
    <button
      class="lock"
      onclick={() => window.api.openVerify(jid)}
      title={verified
        ? _('Conversación cifrada y verificada')
        : _('Conversación cifrada. Pulsa para verificarla.')}
      aria-label={_('Verificar cifrado…')}
    >
      {#if verified}<ShieldCheck size={14} />{:else}<Lock size={14} />{/if}
    </button>
  </header>

  <ol bind:this={list} aria-live="polite">
    {#each messages as message, i (message.id)}
      {@render noted(i === 0 ? 0 : messages[i - 1].at, message.at)}
      {#if newDay(i)}<li class="day"><span>{day(message.at)}</span></li>{/if}
      {#if message.buzz}
        <li class="event buzz">
          🫨 {#if message.mine}{_('Has enviado un zumbido')}{:else}{@render named(
              _('{name} te ha enviado un zumbido')
            )}{/if}
          <time>{time(message.at)}</time>
        </li>
      {:else if message.wink}
        <li class="event wink-line">
          🎬 {#if message.mine}{_('Has enviado el guiño')}{:else}{@render named(
              _('{name} te ha enviado el guiño')
            )}{/if}
          <button
            class="replay"
            onclick={() => window.api.replayWink(message.wink!)}
            title={_('Volver a ver el guiño')}>«{winkLabel(message.wink)}» ▶</button
          >
          <time>{time(message.at)}</time>
        </li>
      {:else}
        <li class:mine={message.mine} class:continues={continues(i)}>
          {#if !continues(i)}
            <span class="meta"
              >{#if message.mine}{_('Tú dices:')}{:else}{@render named(_('{name} dice:'))}{/if}
              <time>{time(message.at)}</time></span
            >
          {/if}
          {#if message.undecryptable}
            <p class="event warn">{_('No se ha podido descifrar este mensaje')}</p>
          {:else}
            <p title={time(message.at)}><Emoticons text={message.body} /></p>
            {#if !message.encrypted}
              <small class="plain"><LockOpen size={11} /> {_('Este mensaje no está cifrado')}</small
              >
            {/if}
          {/if}
        </li>
      {/if}
    {/each}
    {@render noted(messages.at(-1)?.at ?? 0, Infinity)}
  </ol>

  <p class="typing" aria-live="polite">
    {#if theyType && prefs.typing}{@render named(_('{name} está escribiendo…'))}{/if}
  </p>

  {#if sendError}
    <p class="send-error event warn" role="alert">
      {#if sendError === 'no-devices'}{@render named(
          _('{name} tiene que actualizar Palique para recibir mensajes cifrados')
        )}{:else}{sendError}{/if}
    </p>
  {/if}

  {#if blocked.length}
    <div class="blocked" role="alert">
      <span>{@render named(_('La clave de cifrado de {name} ha cambiado'))}</span>
      <button onclick={acceptKeys}>{_('Aceptar la clave nueva')}</button>
    </div>
  {/if}

  <div class="compose">
    <div class="toolbar">
      <details class="picker" bind:open={emoticonsOpen}>
        <summary title={_('Emoticonos')} aria-label={_('Emoticonos')}><Smile size={18} /></summary>
        <ul class="emoticons">
          {#each EMOTICONS as { id, codes, name } (id)}
            <li>
              <!-- Still until pointed at, so the open picker isn't 21 things moving at once. -->
              <button
                onclick={() => insertEmoticon(codes[0])}
                onpointerenter={() => (hovered = id)}
                onpointerleave={() => (hovered = '')}
                title="{_(name)} {codes[0]}"
                aria-label="{_(name)} {codes[0]}"
                ><EmoticonCanvas {id} code={codes[0]} still={hovered !== id} /></button
              >
            </li>
          {/each}
        </ul>
      </details>
      <details class="picker" bind:open={pickerOpen}>
        <summary
          class:disabled={!canWink}
          title={canWink ? _('Enviar un guiño') : _('Espera un poco para enviar otro guiño')}
        >
          <Star size={16} />
          {_('Guiño')}</summary
        >
        <!-- Thumbnails: a still frame, the animation (muted) on hover or focus. -->
        <div class="popup">
          <h2>{_('Enviar un guiño')}</h2>
          <ul class="winks">
            {#each winks() as { id } (id)}
              <li>
                <button
                  class="wink"
                  onclick={() => wink(id)}
                  disabled={!canWink}
                  aria-label={_('Enviar el guiño {name}', { name: winkLabel(id) })}
                  onmouseenter={() => (previewing = id)}
                  onmouseleave={() => (previewing = '')}
                  onfocus={() => (previewing = id)}
                  onblur={() => (previewing = '')}
                >
                  <span class="thumb">
                    {#if pickerOpen}<WinkPlayer {id} playing={previewing === id} loop />{/if}
                  </span>
                  <span>{winkLabel(id)}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if !canWink}<p class="wait">{_('Espera un poco para enviar otro guiño.')}</p>{/if}
        </div>
      </details>
      <button
        onclick={buzz}
        disabled={!canBuzz}
        title={canBuzz ? _('Enviar un zumbido') : _('Espera un poco para enviar otro zumbido')}
      >
        <Vibrate size={16} />
        {_('Zumbido')}</button
      >
    </div>
    <div class="write">
      <textarea
        bind:this={input}
        bind:value={draft}
        onkeydown={onKeydown}
        oninput={onInput}
        maxlength="4000"
        rows="2"
        placeholder={_('Escribe un mensaje…')}
        aria-label={_('Mensaje')}
      ></textarea>
      <button class="send primary" onclick={send} disabled={!draft.trim()}>{_('Enviar')}</button>
    </div>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* Beside the contact list: its own column's height, and winks over it, not the list. */
  .chat.embedded {
    position: relative;
    height: 100%;
  }

  .embedded .wink-layer {
    position: absolute;
  }

  header {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 12px 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  /* «Para: Ana», then their personal message and their email. */
  .to {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .name {
    color: var(--text-muted);
    font-weight: 600;
  }

  .to strong {
    color: var(--text-strong);
    font-size: 18px;
    font-weight: 800;
  }

  small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .email {
    font-size: 12px;
  }

  ol {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    margin: var(--panel-margin);
    border: solid var(--panel-border-width);
    border-color: var(--panel-border-color);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    padding: 12px 16px;
    overflow-y: auto;
    list-style: none;
    background: var(--window-bg);
  }

  /* Theirs on the left, ours on the right: a small line, then the bubble. */
  li {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    max-width: 78%;
  }

  li.mine {
    align-self: flex-end;
    align-items: flex-end;
  }

  li.continues {
    margin-top: -6px;
  }

  .meta {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
  }

  time {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.8;
  }

  /* Message bubbles only: the typing line and notices are paragraphs too. */
  li p {
    margin: 0;
    padding: 7px 12px;
    border: 1px solid var(--bubble-border);
    border-radius: 4px var(--radius-large) var(--radius-large) var(--radius-large);
    background: var(--bubble-bg);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .mine p {
    border-color: var(--bubble-mine-border);
    border-radius: var(--radius-large) 4px var(--radius-large) var(--radius-large);
    background: var(--bubble-mine-bg);
  }

  /* Only a group's first bubble points at who's talking. */
  .continues p {
    border-radius: var(--radius-large);
  }

  /* Day separator and buzz/wink lines: centered pills, not messages. */
  .day,
  .event {
    align-self: center;
    max-width: none;
    text-align: center;
  }

  .day span {
    padding: 2px 12px;
    border-radius: 999px;
    background: var(--bar-bg);
    color: var(--text-strong);
    font-size: 12px;
    font-weight: 800;
  }

  .event {
    display: block;
    padding: 5px 14px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
  }

  .buzz {
    border-color: var(--buzz-border);
    background: var(--buzz-bg);
    color: var(--buzz-text);
  }

  .notice {
    border-color: var(--line);
    background: var(--bar-bg);
    color: var(--text-muted);
  }

  /* Problems: they look like the buzz lines, which are the app's warm alert colors. */
  .warn {
    border-color: var(--buzz-border);
    background: var(--buzz-bg);
    color: var(--buzz-text);
  }

  .send-error {
    align-self: center;
    margin: 0 16px 6px;
  }

  .plain {
    display: flex;
    gap: 4px;
    align-items: center;
    color: var(--text-muted);
    font-size: 11px;
  }

  .lock {
    margin-left: auto;
    padding: 4px 6px;
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-muted);
  }

  .blocked {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    border-top: 1px solid var(--buzz-border);
    background: var(--buzz-bg);
    color: var(--buzz-text);
    font-size: 13px;
    font-weight: 700;
  }

  .wink-line {
    padding-right: 6px;
    border-color: var(--wink-border);
    background: var(--wink-bg);
    color: var(--wink-text);
  }

  .event time {
    margin-left: 4px;
  }

  /* The wink's name in the conversation: a small pill that plays it again. */
  .replay {
    margin-left: 4px;
    padding: 2px 10px;
    border: none;
    background: var(--badge-bg);
    box-shadow: none;
    color: var(--badge-text);
    font-size: 12px;
    font-weight: 800;
  }

  .replay:hover:not(:disabled) {
    background: var(--badge-bg);
    filter: brightness(1.1);
  }

  /* Under the transcript, on its background, so the two read as one. */
  .typing {
    min-height: 1.4em;
    margin: 0;
    padding: 2px 16px 6px;
    background: var(--window-bg);
    color: var(--text-muted);
    font-size: 13px;
    font-style: italic;
  }

  .compose {
    display: grid;
    gap: 8px;
    padding: 10px 14px 14px;
    background: var(--bar-bg);
    border-top: 1px solid var(--line);
  }

  /* The pickers open above it, as wide as it. */
  .toolbar {
    position: relative;
    display: flex;
    gap: 6px;
  }

  /* Only the toolbar's own buttons: the pickers inside it have buttons of their own. */
  .toolbar > button,
  summary {
    display: flex;
    gap: 6px;
    align-items: center;
    height: 34px;
    box-sizing: border-box;
    padding: 0 14px;
    font-weight: 800;
  }

  /* <details> pickers styled like the toolbar buttons. */
  summary {
    border: solid var(--button-border-width);
    border-color: var(--button-border-color);
    border-radius: var(--button-radius);
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
    color: var(--button-text);
    list-style: none;
    cursor: pointer;
  }

  summary:hover {
    background: var(--button-bg-hover);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  /* An open picker's button stays pressed, in the accent. */
  .picker[open] > summary {
    border-color: var(--accent-border);
    background: var(--accent-bg);
    box-shadow: var(--accent-shadow);
    color: var(--accent-text);
  }

  summary.disabled {
    opacity: 0.5;
  }

  .picker > ul,
  .popup {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 1;
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 8px;
    list-style: none;
    background: var(--group-bg);
    border: var(--group-border);
    border-radius: var(--group-radius);
    box-shadow: var(--popup-shadow);
  }

  .popup {
    right: 0;
    gap: 10px;
    max-height: 70vh;
    padding: 14px;
    overflow-y: auto;
    border-radius: 20px;
  }

  h2 {
    margin: 0 4px;
    font-size: 16px;
    font-weight: 800;
  }

  .wink-layer {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 15%);
  }

  .wink-layer :global(canvas) {
    position: absolute;
    inset: 0;
  }

  .winks {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Just the thumbnail and its name: no button chrome, a soft highlight on hover/focus. */
  .wink {
    display: grid;
    gap: 4px;
    justify-items: center;
    width: 100%;
    padding: 4px;
    background: none;
    border: none;
    border-radius: var(--radius-large);
    box-shadow: none;
    color: var(--text);
    font-size: 13px;
    font-weight: 700;
  }

  .wink:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  .thumb {
    display: block;
    box-sizing: border-box;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    pointer-events: none;
    background: var(--field-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .wait {
    margin: 0 4px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .picker li {
    max-width: none;
    margin: 0;
  }

  .picker .emoticons {
    grid-template-columns: repeat(7, auto);
  }

  .emoticons button {
    padding: 1px 3px;
    background: none;
    border: 1px solid transparent;
    box-shadow: none;
    border-radius: var(--radius);
    font-size: 18px;
    line-height: 1;
  }

  .emoticons button:hover:not(:disabled) {
    background: var(--row-hover-bg);
    border-color: var(--line);
  }

  .write {
    display: flex;
    gap: 8px;
  }

  /* Grows with what's written, up to a point, then scrolls. */
  textarea {
    flex: 1;
    min-height: 2lh;
    max-height: 8lh;
    resize: none;
    field-sizing: content;
  }

  .send {
    align-self: stretch;
    min-width: 92px;
    border-radius: var(--radius);
  }

  .shaking {
    animation: shake 0.6s;
  }

  @keyframes shake {
    0%,
    100% {
      transform: translate(0, 0);
    }
    10%,
    50%,
    90% {
      transform: translate(-8px, 3px);
    }
    30%,
    70% {
      transform: translate(8px, -3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shaking {
      animation: none;
    }
  }
</style>
