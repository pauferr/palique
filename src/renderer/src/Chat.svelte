<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ChatMessage, Contact } from '../../main/xmpp'
  import buzzSound from './assets/sounds/buzz.ogg'
  import messageSound from './assets/sounds/message.ogg'

  let { jid }: { jid: string } = $props()

  const BUZZ_COOLDOWN = 5000
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
  let list: HTMLElement

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
    if (alert) {
      if (message.buzz) shake()
      if (!message.mine) play(message.buzz ? buzzSound : messageSound)
    }
    await tick()
    list.scrollTop = list.scrollHeight
  }

  onMount(() => {
    document.title = name
    const offMessage = window.api.onChatMessage((m) => {
      if (m.with === jid) add(m, true)
    })
    const offRoster = window.api.onRoster((s) => (contact = s.contacts.find((c) => c.jid === jid)))
    window.api.getRoster().then((s) => (contact = s.contacts.find((c) => c.jid === jid)))
    // The message that opened this window arrived before we were listening:
    // treat it as live if it's only a few seconds old.
    window.api.getChatHistory(jid).then((history) => {
      history.forEach((m, i) => add(m, i === history.length - 1 && Date.now() - m.at < 5000))
    })
    return () => {
      offMessage()
      offRoster()
    }
  })

  function send(): void {
    if (!draft.trim()) return
    window.api.sendMessage(jid, draft)
    draft = ''
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
    <span class="dot {contact?.show ?? 'offline'}"></span>
    <div>
      <strong>{name}</strong>
      <small>{contact?.status || labels[contact?.show ?? 'offline']}</small>
    </div>
  </header>

  <ol bind:this={list} aria-live="polite">
    <li class="notice">Esta conversación solo se guarda en este equipo.</li>
    {#each messages as message (message.id)}
      <li class:mine={message.mine}>
        {#if message.buzz}
          <em>{message.mine ? '¡Has enviado un zumbido!' : `¡${name} te ha enviado un zumbido!`}</em
          >
        {:else}
          <span class="meta"
            >{message.mine ? 'Tú dices' : `${name} dice`} ({time(message.at)}):</span
          >
          <p>{message.body}</p>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="compose">
    <button
      class="buzz"
      onclick={buzz}
      disabled={!canBuzz}
      title="Enviar un zumbido"
      aria-label="Enviar un zumbido">📳</button
    >
    <textarea
      bind:value={draft}
      onkeydown={onKeydown}
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
    grid-template-rows: auto 1fr auto;
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
