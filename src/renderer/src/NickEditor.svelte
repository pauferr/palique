<script lang="ts">
  import { onMount } from 'svelte'
  import Emoticons from './Emoticons.svelte'
  import { stripPlus, tag, tidyPlus } from './plus'
  import { _, _p } from './i18n'

  // Changing our display name, with formatting codes. The tools write the codes around
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

  // Ready-made gradients, one click away.
  const presets = [
    { label: _('Chicle'), from: '#ff4fa3', to: '#7a5cff' },
    { label: _('Fuego'), from: '#ffb300', to: '#ff0040' },
    { label: _('Océano'), from: '#00a2ff', to: '#00c060' },
    { label: _('Noche'), from: '#1d2fb8', to: '#c02cc0' },
    { label: _('Lima'), from: '#7ed400', to: '#00a8a8' }
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
      error = _('No caben más códigos: el nombre puede tener hasta {max} caracteres.', { max: MAX })
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

  async function apply(): Promise<void> {
    if (!stripPlus(name).trim()) {
      error = _('Tu nombre no puede quedar vacío.')
      return
    }
    busy = true
    try {
      if (name !== saved) await window.api.setNick(name)
      window.close()
    } catch {
      error = _('No se ha podido cambiar tu nombre.')
      busy = false
    }
  }

  const examples = [
    [_('[b]negrita[/b]'), _('También [i]cursiva[/i], [u]subrayado[/u] y [s]tachado[/s].')],
    [_('[c=#e8344e]rojo[/c]'), _('Un color, en hexadecimal.')],
    [
      _('[c=#ff4fa3]degradado[/c=#7a5cff]'),
      _('El color de inicio va en [c=…] y el de final en [/c=…].')
    ],
    [_('[a=#fff3a0]fondo[/a]'), _('Color de fondo.')],
    ['[b][c=#00a2ff]Tere[/c=#00c060][/b] (L)', _('Se pueden combinar, con emoticonos.')]
  ]
</script>

<svelte:head><title>{_('Cambiar tu nombre')}</title></svelte:head>

<main>
  <div class="preview-block">
    <h2>{_('Así te verán')}</h2>
    <p class="preview" aria-label={_('Así te verán tus contactos')}>
      <!-- One inline run: as flex items the name's parts would lose the spaces between them. -->
      <span
        >{#if name.trim()}<Emoticons text={name} plus />{:else}&nbsp;{/if}</span
      >
    </p>
  </div>

  <div class="tools">
    <div class="bar" role="toolbar" aria-label={_('Formato')}>
      <span class="group">
        <button onclick={() => wrap('[b]', '[/b]')} title={_('Negrita')}
          ><b>{_p('botón de negrita', 'N')}</b></button
        >
        <button onclick={() => wrap('[i]', '[/i]')} title={_('Cursiva')}
          ><i>{_p('botón de cursiva', 'K')}</i></button
        >
        <button onclick={() => wrap('[u]', '[/u]')} title={_('Subrayado')}
          ><u>{_p('botón de subrayado', 'S')}</u></button
        >
        <button onclick={() => wrap('[s]', '[/s]')} title={_('Tachado')}
          ><s>{_p('botón de tachado', 'T')}</s></button
        >
      </span>
      <span class="group">
        <span class="pick">
          <input type="color" bind:value={color} aria-label={_('Elegir color del texto')} />
          <button onclick={() => wrap(`[c=${color}]`, '[/c]')}>{_('Color')}</button>
        </span>
        <span class="pick">
          <input type="color" bind:value={background} aria-label={_('Elegir color de fondo')} />
          <button onclick={() => wrap(`[a=${background}]`, '[/a]')}>{_('Fondo')}</button>
        </span>
        <span class="pick">
          <input type="color" bind:value={from} aria-label={_('Color de inicio del degradado')} />
          <input type="color" bind:value={to} aria-label={_('Color de final del degradado')} />
          <button onclick={() => wrap(`[c=${from}]`, `[/c=${to}]`)}>{_('Degradado')}</button>
        </span>
      </span>
    </div>
  </div>

  <div class="field">
    <label for="nick">{_('Tu nombre')}</label>
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
      {_('Selecciona una parte del nombre para darle estilo; sin selección, se aplica a todo.')}
      <span class="count"
        ><button class="link" onclick={clear} title={_('Quitar los colores y el formato')}
          >{_('Quitar formato')}</button
        >
        · {name.length}/{MAX}</span
      >
    </p>
  </div>

  <div class="presets">
    <h2>{_('Estilos rápidos')}</h2>
    <div class="chips">
      {#each presets as p (p.label)}
        <button
          class="chip"
          onclick={() => restyle(`[c=${p.from}]`, `[/c=${p.to}]`)}
          title={_('Degradado {from} → {to}', { from: p.from, to: p.to })}
          ><span class="sample" style:background="linear-gradient(135deg, {p.from}, {p.to})"
          ></span>{p.label}</button
        >
      {/each}
    </div>
  </div>

  <details>
    <summary>{_('Chuleta de códigos')}</summary>
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
    <button onclick={() => window.close()}>{_('Cancelar')}</button>
    <button class="primary" onclick={apply} disabled={busy}>{_('Aplicar')}</button>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-sizing: border-box;
    min-height: 100vh;
    padding: 20px 22px 18px;
    background: var(--list-bg);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 800;
  }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 15px;
    font-weight: 800;
  }

  .preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 72px;
    box-sizing: border-box;
    margin: 0;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-large);
    background: var(--header-bg);
    font-size: 1.5em;
    font-weight: 800;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .group + .group {
    padding-left: 8px;
    border-left: 1px solid var(--line);
  }

  /* Round format buttons. */
  .group > button {
    width: 36px;
    height: 34px;
    padding: 0;
  }

  /* Color, Fondo and Degradado: one pill holding the swatches and the button, since a
     color input can't go inside a button. */
  .pick {
    display: flex;
    gap: 2px;
    align-items: center;
    height: 34px;
    box-sizing: border-box;
    padding-left: 5px;
    border: var(--button-border-width) solid var(--button-border-color);
    border-radius: var(--button-radius);
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
  }

  .pick:has(button:hover) {
    background: var(--button-bg-hover);
  }

  .pick button,
  .pick button:hover:not(:disabled) {
    height: 100%;
    padding: 0 12px 0 4px;
    border: none;
    background: none;
    box-shadow: none;
  }

  input[type='color'] {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--button-border-color);
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  input[type='color']::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  input[type='color']::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  #nick {
    box-sizing: border-box;
    width: 100%;
    padding: 10px 12px;
    resize: none;
    font-size: 15px;
    font-weight: 600;
  }

  .hint {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .count {
    flex: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Quick styles: plain pills, so the gradient dot is what stands out. */
  .chip {
    display: flex;
    gap: 6px;
    align-items: center;
    height: 32px;
    padding: 0 12px 0 5px;
    border-color: var(--line);
    background: var(--list-bg);
    box-shadow: none;
    color: var(--text);
  }

  .chip:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }

  .sample {
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }

  summary {
    color: var(--text-strong);
    font-size: 15px;
    font-weight: 800;
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

  .link,
  .link:hover:not(:disabled) {
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

  footer button {
    padding: 8px 20px;
    font-size: 15px;
  }
</style>
