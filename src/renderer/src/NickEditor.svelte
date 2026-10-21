<script lang="ts">
  import { onMount } from 'svelte'
  import Emoticons from './Emoticons.svelte'
  import { stripPlus, tag, tidyPlus } from './plus'

  // Changing our display name, with Messenger Plus! codes. The tools write the codes around
  // the selection (or the whole name); contacts see nothing until "Aplicar".
  const MAX = 128

  let name = $state('')
  let saved = ''
  let input: HTMLTextAreaElement
  let color = $state('#e8344e')
  let background = $state('#fff3a0')
  let from = $state('#ff4fa3')
  let to = $state('#7a5cff')
  let error = $state('')
  let busy = $state(false)
  let copied = $state(false)

  // Ready-made gradients, one click away.
  const presets = [
    { label: 'Chicle', from: '#ff4fa3', to: '#7a5cff' },
    { label: 'Fuego', from: '#ffb300', to: '#ff0040' },
    { label: 'Océano', from: '#00a2ff', to: '#00c060' },
    { label: 'Noche', from: '#1d2fb8', to: '#c02cc0' },
    { label: 'Lima', from: '#7ed400', to: '#00a8a8' }
  ]

  onMount(() => {
    window.api.getRoster().then((s) => {
      name = saved = s.name
      input.focus()
    })
  })

  // The selection, or the whole name when nothing is selected. An edge inside a code moves
  // out to take the whole code, so no half codes are left behind.
  function range(): [number, number] {
    let start = input.selectionStart ?? 0
    let end = input.selectionEnd ?? 0
    if (start === end) return [0, name.length]
    for (const m of name.matchAll(tag)) {
      const [a, b] = [m.index, m.index + m[0].length]
      if (start > a && start < b) start = a
      if (end > a && end < b) end = b
    }
    return [start, end]
  }

  function replace(a: number, b: number, text: string): void {
    const before = name.slice(0, a)
    const next = tidyPlus(before + text + name.slice(b))
    if (next.length > MAX) {
      error = 'No caben más códigos: el nombre puede tener hasta 128 caracteres.'
      return
    }
    error = ''
    name = next
    input.focus()
    // Select what changed; tidying only ever drops codes after it.
    const start = tidyPlus(before).length
    requestAnimationFrame(() => input.setSelectionRange(start, start + text.length))
  }

  const wrap = (open: string, close: string): void => {
    const [a, b] = range()
    replace(a, b, open + name.slice(a, b) + close)
  }

  // A quick style replaces whatever styles the selection had.
  const restyle = (open: string, close: string): void => {
    const [a, b] = range()
    replace(a, b, open + stripPlus(name.slice(a, b)) + close)
  }

  const clear = (): void => {
    const [a, b] = range()
    replace(a, b, stripPlus(name.slice(a, b)))
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(color)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  async function apply(): Promise<void> {
    if (!stripPlus(name).trim()) {
      error = 'Tu nombre no puede quedar vacío.'
      return
    }
    busy = true
    try {
      if (name !== saved) await window.api.setNick(name)
      window.close()
    } catch {
      error = 'No se ha podido cambiar tu nombre.'
      busy = false
    }
  }

  const examples = [
    ['[b]negrita[/b]', 'También [i]cursiva[/i], [u]subrayado[/u] y [s]tachado[/s].'],
    ['[c=#e8344e]rojo[/c]', 'Un color, en hexadecimal.'],
    ['[c=#ff4fa3]degradado[/c=#7a5cff]', 'El color de inicio va en [c=…] y el de final en [/c=…].'],
    ['[a=#fff3a0]fondo[/a]', 'Color de fondo.'],
    ['[b][c=#00a2ff]Tere[/c=#00c060][/b] (L)', 'Se pueden combinar, con emoticonos.']
  ]
</script>

<svelte:head><title>Cambiar tu nombre</title></svelte:head>

<main>
  <div class="preview-block">
    <h2>Así te verán</h2>
    <p class="preview" aria-label="Así te verán tus contactos">
      {#if name.trim()}<Emoticons text={name} plus />{:else}&nbsp;{/if}
    </p>
  </div>

  <div class="tools">
    <div class="bar" role="toolbar" aria-label="Formato">
      <span class="group">
        <button onclick={() => wrap('[b]', '[/b]')} title="Negrita"><b>N</b></button>
        <button onclick={() => wrap('[i]', '[/i]')} title="Cursiva"><i>K</i></button>
        <button onclick={() => wrap('[u]', '[/u]')} title="Subrayado"><u>S</u></button>
        <button onclick={() => wrap('[s]', '[/s]')} title="Tachado"><s>T</s></button>
      </span>
      <span class="group">
        <span class="pick">
          <input type="color" bind:value={color} aria-label="Elegir color del texto" />
          <button onclick={() => wrap(`[c=${color}]`, '[/c]')}>Color</button>
        </span>
        <span class="pick">
          <input type="color" bind:value={background} aria-label="Elegir color de fondo" />
          <button onclick={() => wrap(`[a=${background}]`, '[/a]')}>Fondo</button>
        </span>
        <span class="pick">
          <input type="color" bind:value={from} aria-label="Color de inicio del degradado" />
          <input type="color" bind:value={to} aria-label="Color de final del degradado" />
          <button onclick={() => wrap(`[c=${from}]`, `[/c=${to}]`)}>Degradado</button>
        </span>
      </span>
    </div>
    <p class="hex">
      Color elegido: <code>{color}</code>
      <button class="link" onclick={copy}>{copied ? '¡Copiado!' : 'Copiar'}</button>
    </p>
  </div>

  <div class="field">
    <label for="nick">Tu nombre</label>
    <!-- A name is one line, but codes make it long: a box that shows all of it. -->
    <textarea
      id="nick"
      bind:this={input}
      bind:value={name}
      onkeydown={(e) => {
        // Enter applies; a name has no line breaks.
        if (e.key === 'Enter') {
          e.preventDefault()
          apply()
        }
      }}
      maxlength={MAX}
      rows="3"
      spellcheck="false"
    ></textarea>
    <p class="hint">
      Selecciona una parte del nombre para darle estilo; sin selección, se aplica a todo.
      <span class="count"
        ><button class="link" onclick={clear} title="Quitar los colores y el formato"
          >Quitar formato</button
        >
        · {name.length}/{MAX}</span
      >
    </p>
  </div>

  <div class="presets">
    <h2>Estilos rápidos</h2>
    <div class="chips">
      {#each presets as p (p.label)}
        <button
          class="chip"
          onclick={() => restyle(`[c=${p.from}]`, `[/c=${p.to}]`)}
          title="Degradado {p.from} → {p.to}"
          ><span class="sample" style:background="linear-gradient(90deg, {p.from}, {p.to})"
          ></span>{p.label}</button
        >
      {/each}
    </div>
  </div>

  <details>
    <summary>Chuleta de códigos</summary>
    <table>
      <tbody>
        {#each examples as [code, note] (code)}
          <tr>
            <td><code>{code}</code></td>
            <td class="shown"><Emoticons text={code} plus /></td>
            <td class="note">{note}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <footer>
    <button onclick={() => window.close()}>Cancelar</button>
    <button class="apply" onclick={apply} disabled={busy}>Aplicar</button>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    min-height: 100vh;
    padding: 14px 16px;
  }

  h2 {
    margin: 0 0 4px;
    color: var(--text-strong);
    font-size: 1em;
  }

  label {
    display: block;
    margin-bottom: 4px;
    color: var(--text-strong);
    font-weight: bold;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .group {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .group + .group {
    padding-left: 8px;
    border-left: 1px solid var(--line);
  }

  .bar button {
    padding: 2px 8px;
  }

  .pick {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  input[type='color'] {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: none;
    cursor: pointer;
  }

  .hex {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  #nick {
    box-sizing: border-box;
    width: 100%;
    resize: none;
  }

  .hint {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .count {
    flex: none;
  }

  .preview {
    margin: 0;
    padding: 18px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--list-bg);
    font-size: 1.5em;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 2px 10px 2px 4px;
  }

  .sample {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }

  summary {
    color: var(--text-strong);
    font-weight: bold;
    cursor: pointer;
  }

  table {
    margin-top: 6px;
    border-collapse: collapse;
    font-size: 12px;
  }

  td {
    padding: 3px 8px 3px 0;
    vertical-align: top;
  }

  .shown {
    white-space: nowrap;
  }

  .note {
    color: var(--text-muted);
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-strong);
    font-size: inherit;
    text-decoration: underline;
  }

  .error {
    margin: 0;
    color: var(--text-error);
  }

  footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: auto;
  }

  .apply {
    font-weight: bold;
  }
</style>
