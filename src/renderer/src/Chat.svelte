<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ChatMessage, Contact } from '../../main/xmpp'
  import buzzSound from './assets/sounds/buzz.ogg'
  import messageSound from './assets/sounds/message.ogg'
  import Avatar from './Avatar.svelte'
  import Emoticons from './Emoticons.svelte'
  import { EMOTICONS } from './emoticons'
  import { winkLabel, winks } from './winks'

  let { jid }: { jid: string } = $props()

  const BUZZ_COOLDOWN = 5000
  const WINK_COOLDOWN = 20000 // matches the receiver's per-contact limit
  const TYPING_IDLE = 5000 // stop "typing" after this long without keystrokes
  const TYPING_TIMEOUT = 30000 // hide their indicator if they never say they stopped
  const labels: Record<Contact['show'], string> = {
    online: 'Conectado',
    away: 'Ausente',
    dnd: 'Ocupado',
    offline: 'Desconectado'
  }

  // svelte-ignore state_referenced_locally
  const name = jid.split('@')[0]
  let messages: ChatMessage[] = $state([])
  let contact: Contact | undefined = $state()
  let draft = $state('')
  let shaking = $state(false)
  let canBuzz = $state(true)
  let canWink = $state(true)
  let pickerOpen = $state(false)
  let emoticonsOpen = $state(false)
  let input: HTMLTextAreaElement
  let theyType = $state(false)
  let list: HTMLElement
  let composing = false
  let idle: ReturnType<typeof setTimeout> | undefined
  let theirTimeout: ReturnType<typeof setTimeout> | undefined

  function play(src: string): void {
    new Audio(src).play().catch(() => {})
  }

  function shake(): void {
    shaking = false
    requestAnimationFrame(() => (shaking = true))
  }

  // `alert` = it just happened: play the sound and shake for buzzes.
  async function add(message: ChatMessage, alert: boolean): Promise<void> {
    if (messages.some((m) => m.id === message.id)) return
    messages.push(message)
    if (!message.mine) theyType = false
    if (alert && !message.mine) {
      if (message.buzz) shake()
      if (message.wink) {
        // The full-screen wink brings its own sound; with winks off, a plain chime.
        window.api.getSettings().then((s) => s.winks || play(messageSound))
      } else {
        play(message.buzz ? buzzSound : messageSound)
      }
    }
    if (alert && message.mine && message.buzz) shake()
    await tick()
    list.scrollTop = list.scrollHeight
  }

  onMount(() => {
    document.title = name
    const offMessage = window.api.onChatMessage((m) => {
      if (m.with === jid) add(m, true)
    })
    const offTyping = window.api.onTyping((c, typing) => {
      if (c !== jid) return
      theyType = typing
      clearTimeout(theirTimeout)
      if (typing) theirTimeout = setTimeout(() => (theyType = false), TYPING_TIMEOUT)
    })
    window.addEventListener('beforeunload', stopTyping)
    const offRoster = window.api.onRoster((s) => (contact = s.contacts.find((c) => c.jid === jid)))
    window.api.getRoster().then((s) => (contact = s.contacts.find((c) => c.jid === jid)))
    // The message that opened this window arrived before we were listening:
    // treat it as live if it's only a few seconds old.
    window.api.getChatHistory(jid).then((history) => {
      history.forEach((m, i) => add(m, i === history.length - 1 && Date.now() - m.at < 5000))
    })
    return () => {
      offMessage()
      offTyping()
      offRoster()
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

  function buzz(): void {
    window.api.sendBuzz(jid)
    canBuzz = false
    setTimeout(() => (canBuzz = true), BUZZ_COOLDOWN)
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

  function wink(id: string): void {
    pickerOpen = false
    window.api.sendWink(jid, id)
    canWink = false
    setTimeout(() => (canWink = true), WINK_COOLDOWN)
  }

  // "13:32" today, "3 oct, 13:32" on other days.
  function time(at: number): string {
    const date = new Date(at)
    const clock = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    if (date.toDateString() === new Date().toDateString()) return clock
    return `${date.toLocaleDateString('es', { day: 'numeric', month: 'short' })}, ${clock}`
  }
</script>

<div class="chat" class:shaking onanimationend={() => (shaking = false)}>
  <header>
    <Avatar {jid} url={contact?.avatar} show={contact?.show ?? 'offline'} size={48} />
    <div>
      <strong>{name}</strong>
      <small
        >{#if contact?.status}<Emoticons text={contact.status} />{:else}{labels[
            contact?.show ?? 'offline'
          ]}{/if}</small
      >
    </div>
  </header>

  <ol bind:this={list} aria-live="polite">
    <li class="notice">Esta conversación solo se guarda en este equipo.</li>
    {#each messages as message (message.id)}
      <li class:mine={message.mine}>
        {#if message.buzz}
          <em>{message.mine ? '¡Has enviado un zumbido!' : `¡${name} te ha enviado un zumbido!`}</em
          >
        {:else if message.wink}
          <em
            >{message.mine ? 'Has enviado el guiño' : `${name} te ha enviado el guiño`} «{winkLabel(
              message.wink
            )}»</em
          >
        {:else}
          <span class="meta"
            >{message.mine ? 'Tú dices' : `${name} dice`} ({time(message.at)}):</span
          >
          <p><Emoticons text={message.body} /></p>
        {/if}
      </li>
    {/each}
  </ol>

  <p class="typing" aria-live="polite">{theyType ? `${name} está escribiendo…` : ''}</p>

  <div class="compose">
    <div class="actions">
      <button
        class="buzz"
        onclick={buzz}
        disabled={!canBuzz}
        title="Enviar un zumbido"
        aria-label="Enviar un zumbido">📳</button
      >
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
          aria-label="Enviar un guiño">😉</summary
        >
        <ul>
          {#each Object.keys(winks) as id (id)}
            <li><button onclick={() => wink(id)} disabled={!canWink}>{winkLabel(id)}</button></li>
          {/each}
        </ul>
      </details>
    </div>
    <textarea
      bind:this={input}
      bind:value={draft}
      onkeydown={onKeydown}
      oninput={onInput}
      maxlength="4000"
      rows="3"
      placeholder="Escribe un mensaje…"
      aria-label="Mensaje"
    ></textarea>
    <button onclick={send} disabled={!draft.trim()}>Enviar</button>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
  }

  .chat {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    height: 100vh;
    font-family: system-ui, sans-serif;
  }

  header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #ddd;
  }

  header div {
    display: grid;
  }

  small {
    color: #666;
  }

  ol {
    margin: 0;
    padding: 0.5rem 0.75rem;
    overflow-y: auto;
    list-style: none;
  }

  li {
    margin-bottom: 0.5rem;
  }

  .notice {
    color: #999;
    font-size: 0.8rem;
    text-align: center;
  }

  .meta {
    color: #666;
    font-size: 0.85rem;
  }

  .mine .meta {
    color: #2c6fbb;
  }

  p {
    margin: 0.1rem 0 0 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  em {
    color: #b03a2e;
  }

  .typing {
    min-height: 1.2em;
    margin: 0;
    padding: 0 0.75rem;
    color: #888;
    font-size: 0.85rem;
    font-style: italic;
  }

  .actions {
    display: grid;
    gap: 0.25rem;
    align-content: start;
  }

  .picker {
    position: relative;
  }

  summary {
    padding: 0.1rem 0.3rem;
    list-style: none;
    cursor: pointer;
    border: 1px solid #aaa;
    border-radius: 3px;
    text-align: center;
  }

  summary.disabled {
    opacity: 0.4;
  }

  .picker ul {
    position: absolute;
    bottom: 100%;
    left: 0;
    display: grid;
    gap: 0.25rem;
    margin: 0 0 0.25rem;
    padding: 0.4rem;
    list-style: none;
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  }

  .picker li {
    margin: 0;
  }

  .picker .emoticons {
    grid-template-columns: repeat(7, auto);
  }

  .emoticons button {
    padding: 0.1rem 0.2rem;
    background: none;
    border: none;
    font-size: 1.3rem;
    cursor: pointer;
  }

  .compose {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid #ddd;
  }

  textarea {
    resize: none;
    font: inherit;
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
