<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ChatMessage, Contact } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import { EMOTICONS, emojify } from './emoticons'
  import { stripPlus } from './plus'
  import { prefs } from './prefs.svelte'
  import { playSound, type SoundEvent } from './sounds'
  import WinkPlayer from './WinkPlayer.svelte'
  import { findWink, winkLabel, winks } from './winks'

  let { jid }: { jid: string } = $props()

  const TYPING_IDLE = 5000 // stop "typing" after this long without keystrokes
  const TYPING_TIMEOUT = 30000 // hide their indicator if they never say they stopped
  const labels: Record<Contact['show'], string> = {
    online: 'Disponible',
    away: 'Ausente',
    dnd: 'No molestar',
    offline: 'Sin conexión'
  }

  let messages: ChatMessage[] = $state([])
  let contact: Contact | undefined = $state()
  // Their display name can change while the window is open.
  const name = $derived(contact?.name ?? '')
  $effect(() => {
    if (name) document.title = prefs.emoticons ? emojify(stripPlus(name)) : stripPlus(name)
  })
  let draft = $state('')
  let shaking = $state(false)
  let canBuzz = $state(true)
  let canWink = $state(true)
  let pickerOpen = $state(false)
  let emoticonsOpen = $state(false)
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
      offMessage()
      offTyping()
      offRoster()
      offWink()
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

  function send(): void {
    if (!draft.trim()) return
    window.api.sendMessage(jid, draft)
    draft = ''
    // The message itself tells them we stopped typing.
    clearTimeout(idle)
    composing = false
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
    new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  // "Hoy", "Ayer" or "3 de octubre" (with the year when it isn't this one).
  function day(at: number): string {
    const date = new Date(at)
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return 'Hoy'
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
    return date.toLocaleDateString('es', {
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

<div class="chat" class:shaking onanimationend={() => (shaking = false)}>
  {#if playing}
    <!-- A click closes it. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="wink-layer" onclick={nextWink}>
      {#key playing}
        <WinkPlayer id={playing} playing sound={prefs.sounds} onended={nextWink} />
      {/key}
    </div>
  {/if}
  <header>
    <Avatar {jid} {name} url={contact?.avatar} show={contact?.show ?? 'offline'} size={48} />
    <div class="to">
      <span
        >Para: <strong><Emoticons text={name} plus /></strong>{#if contact?.email}&ensp;<span
            class="email">&lt;{contact.email}&gt;</span
          >{/if}</span
      >
      <small
        >{#if contact?.status}<Emoticons text={contact.status} />{:else}{labels[
            contact?.show ?? 'offline'
          ]}{/if}</small
      >
    </div>
  </header>

  <ol bind:this={list} aria-live="polite">
    <li class="notice">Esta conversación solo se guarda en este ordenador.</li>
    {#each messages as message, i (message.id)}
      {#if newDay(i)}<li class="day"><span>{day(message.at)}</span></li>{/if}
      {#if message.buzz}
        <li class="event">
          🫨 {#if message.mine}Has enviado un zumbido{:else}<Emoticons text={name} plus /> te ha enviado
            un zumbido{/if}
          <time>{time(message.at)}</time>
        </li>
      {:else if message.wink}
        <li class="event">
          🎬 {#if message.mine}Has enviado el guiño{:else}<Emoticons text={name} plus /> te ha enviado
            el guiño{/if}
          <button
            class="replay"
            onclick={() => window.api.replayWink(message.wink!)}
            title="Volver a ver el guiño">«{winkLabel(message.wink)}» ▶</button
          >
          <time>{time(message.at)}</time>
        </li>
      {:else}
        <li class:mine={message.mine} class:continues={continues(i)}>
          {#if !continues(i)}
            <span class="meta"
              >{#if message.mine}Tú dices{:else}<Emoticons text={name} plus /> dice{/if}:
              <time>{time(message.at)}</time></span
            >
          {/if}
          <p title={time(message.at)}><Emoticons text={message.body} /></p>
        </li>
      {/if}
    {/each}
  </ol>

  <p class="typing" aria-live="polite">
    {#if theyType && prefs.typing}<Emoticons text={name} plus /> está escribiendo…{/if}
  </p>

  <div class="compose">
    <div class="toolbar">
      <details class="picker" bind:open={emoticonsOpen}>
        <summary title="Emoticonos" aria-label="Emoticonos">🙂</summary>
        <ul class="emoticons">
          {#each EMOTICONS as { codes, emoji, name } (codes[0])}
            <li>
              <button
                onclick={() => insertEmoticon(codes[0])}
                title="{name} {codes[0]}"
                aria-label="{name} {codes[0]}">{emoji}</button
              >
            </li>
          {/each}
        </ul>
      </details>
      <details class="picker" bind:open={pickerOpen}>
        <summary
          class:disabled={!canWink}
          title={canWink ? 'Enviar un guiño' : 'Espera un poco para enviar otro guiño'}
          >🎬 Guiño</summary
        >
        <!-- Thumbnails like MSN: a still frame, the animation (muted) on hover or focus. -->
        <div class="popup">
          <ul class="winks">
            {#each winks as { id } (id)}
              <li>
                <button
                  class="wink"
                  onclick={() => wink(id)}
                  disabled={!canWink}
                  aria-label="Enviar el guiño {winkLabel(id)}"
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
          {#if !canWink}<p class="wait">Espera un poco para enviar otro guiño.</p>{/if}
        </div>
      </details>
      <button
        onclick={buzz}
        disabled={!canBuzz}
        title={canBuzz ? 'Enviar un zumbido' : 'Espera un poco para enviar otro zumbido'}
        >🫨 Zumbido</button
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
        placeholder="Escribe un mensaje…"
        aria-label="Mensaje"
      ></textarea>
      <button class="send" onclick={send} disabled={!draft.trim()}>Enviar</button>
    </div>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  header {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--line);
  }

  .to {
    display: grid;
    min-width: 0;
  }

  .to strong {
    color: var(--text-strong);
  }

  /* As in MSN: «Para: Ana <ana@…>». */
  .email {
    color: var(--text-muted);
  }

  small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  ol {
    flex: 1;
    margin: var(--panel-margin);
    border: solid var(--panel-border-width);
    border-color: var(--panel-border-color);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    padding: 8px 12px;
    overflow-y: auto;
    list-style: none;
    background: var(--list-bg);
  }

  li {
    margin-bottom: 8px;
  }

  li.continues {
    margin-top: -6px;
  }

  .notice {
    color: var(--text-muted);
    font-size: 11px;
    text-align: center;
  }

  .meta {
    color: var(--text-muted);
  }

  /* Ours on the right, theirs on the left. */
  li.mine {
    text-align: right;
  }

  .mine .meta {
    color: var(--text-strong);
  }

  time {
    font-size: 11px;
    opacity: 0.8;
  }

  p {
    margin: 2px 0 0 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .mine p {
    margin: 2px 12px 0 0;
  }

  /* Day separator and buzz/wink notices: small centered chips, not messages. */
  .day,
  .event {
    color: var(--text-muted);
    text-align: center;
  }

  .day {
    margin: 12px 0;
    font-size: 11px;
  }

  .day span,
  .event {
    width: fit-content;
    margin-inline: auto;
    padding: 2px 10px;
    border-radius: var(--button-radius);
    background: var(--bar-bg);
  }

  .event {
    font-size: 12px;
  }

  .event time {
    margin-left: 4px;
  }

  /* Under the transcript; a theme whose transcript fills the window (no card) gives it the
     same background, so the two read as one. */
  .typing {
    min-height: 1.4em;
    margin: 0;
    padding: 2px 12px;
    background: var(--typing-bg, transparent);
    color: var(--text-muted);
    font-size: 12px;
    font-style: italic;
  }

  .compose {
    display: grid;
    gap: 6px;
    padding: 6px 10px 10px;
    background: var(--bar-bg);
    border-top: 1px solid var(--line);
  }

  .toolbar {
    display: flex;
    gap: 4px;
  }

  .toolbar button,
  summary {
    padding: 1px 8px;
    font-size: 12px;
  }

  .picker {
    position: relative;
  }

  /* <details> pickers styled like the toolbar buttons. */
  summary {
    border: solid var(--button-border-width);
    border-color: var(--button-border-color);
    border-radius: var(--button-radius);
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
    color: var(--text-strong);
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary.disabled {
    opacity: 0.5;
  }

  .picker > ul,
  .popup {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    z-index: 1;
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--list-bg);
    border: 1px solid var(--line);
    box-shadow: var(--popup-shadow);
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

  /* The wink's name in the conversation: looks like text, plays it again. */
  .replay {
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    text-decoration: underline dotted;
  }

  .replay:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }

  .winks {
    display: grid;
    grid-template-columns: repeat(3, 96px);
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Just the thumbnail and its name: no button chrome, a soft highlight on hover/focus. */
  .wink {
    display: grid;
    gap: 2px;
    justify-items: center;
    width: 100%;
    padding: 4px;
    background: none;
    border: none;
    border-radius: var(--radius);
    box-shadow: none;
    color: var(--text);
    font-size: 11px;
  }

  .wink:hover:not(:disabled),
  .wink:focus-visible {
    background: var(--row-hover-bg);
    outline: none;
  }

  .thumb {
    display: block;
    box-sizing: border-box;
    width: 100%;
    aspect-ratio: 4 / 3;
    pointer-events: none;
    background: var(--field-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .wait {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
  }

  .picker li {
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
  }

  .emoticons button:hover:not(:disabled) {
    background: var(--bar-bg);
    border-color: var(--line);
  }

  .write {
    display: flex;
    gap: 6px;
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
    align-self: flex-end;
    min-height: calc(2lh + 10px);
    font-weight: bold;
  }

  .send:disabled {
    opacity: 0.5;
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
