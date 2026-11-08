<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Search } from '@lucide/svelte'
  import type { Gif } from '../../main/xmpp'
  import GifImage from './GifImage.svelte'
  import { _, _p } from './i18n'

  // KLIPY's GIFs, above the compose bar like the wink picker: trending at first, a search
  // as you type, category shortcuts. A click sends one. `toggle` is the button that opens
  // it, so clicking it doesn't count as a click outside.
  let {
    onpick,
    onclose,
    toggle
  }: { onpick: (url: string) => void; onclose: (refocus: boolean) => void; toggle?: HTMLElement } =
    $props()

  // Each one searches its own text in lower case, in the app's language.
  const categories = [
    _p('GIF', 'Jaja'),
    _p('GIF', 'Hola'),
    _p('GIF', 'Te quiero'),
    _p('GIF', 'Felicidades'),
    _p('GIF', 'Gracias'),
    _p('GIF', 'Sí'),
    _p('GIF', 'No'),
    _p('GIF', 'Fiesta')
  ]
  const WAIT = 300 // after the last key
  const LAST_PAGE = 50 // main refuses more
  const EMPTY_PAGES = 3 // pages emptied by the filters in a row before giving up

  let typed = $state('')
  let shown = $state('') // what the grid shows ('' = trending)
  let gifs: Gif[] = $state([])
  let loading = $state(false)
  let failed = $state(false)
  let more = $state(true)
  let page = 0
  let empties = 0
  let search = 0 // only the latest search may fill the grid
  let timer: ReturnType<typeof setTimeout> | undefined
  let box: HTMLElement
  let grid: HTMLElement
  let field: HTMLInputElement

  async function load(q: string, fresh: boolean): Promise<void> {
    if (fresh) {
      search++
      shown = q
      gifs = []
      failed = false
      more = true
      page = 0
      empties = 0
      grid.scrollTop = 0
    } else if (loading) return
    if (!more || page >= LAST_PAGE) return
    const mine = search
    loading = true
    try {
      const res = await window.api.searchGifs(q, page + 1)
      if (mine !== search) return
      page++
      // A page can repeat some of the last one's: each GIF once.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local, not state
      const seen = new Set(gifs.map((g) => g.id))
      gifs.push(...res.gifs.filter((g) => !seen.has(g.id) && seen.add(g.id)))
      empties = res.gifs.length ? 0 : empties + 1
      more = res.more && empties < EMPTY_PAGES
    } catch {
      if (mine !== search) return
      failed = true
      more = false
    } finally {
      if (mine === search) loading = false
    }
    await tick()
    next()
  }

  // The next page when the end is near, or when this one doesn't fill the grid.
  function next(): void {
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) load(shown, false)
  }

  function onInput(): void {
    clearTimeout(timer)
    timer = setTimeout(() => load(typed.trim(), true), WAIT)
  }

  function choose(q: string): void {
    clearTimeout(timer)
    typed = ''
    load(q, true)
    field.focus()
  }

  function outside(event: PointerEvent): void {
    const target = event.target as Node
    if (!box.contains(target) && !toggle?.contains(target)) onclose(false)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onclose(true)
  }

  onMount(() => {
    load('', true)
    field.focus()
    return () => clearTimeout(timer)
  })
</script>

<svelte:window onpointerdown={outside} onkeydown={onKeydown} />

<div class="gifs" bind:this={box} role="dialog" aria-label={_('GIF')}>
  <label class="search">
    <Search size={16} aria-hidden="true" />
    <input
      bind:this={field}
      type="search"
      bind:value={typed}
      oninput={onInput}
      maxlength="100"
      placeholder={_('Buscar en KLIPY')}
      aria-label={_('Buscar GIFs en KLIPY')}
      autocomplete="off"
    />
  </label>
  <div class="chips">
    <button aria-pressed={shown === ''} onclick={() => choose('')}>{_('Tendencias')}</button>
    {#each categories as label (label)}
      {@const q = label.toLocaleLowerCase()}
      <button aria-pressed={shown === q} onclick={() => choose(q)}>{label}</button>
    {/each}
  </div>
  <div class="grid" bind:this={grid} onscroll={next}>
    {#if failed}
      <p class="empty">
        {_('No se han podido cargar los GIFs. Vuelve a intentarlo en un momento.')}
      </p>
    {:else if !gifs.length && !loading && !more}
      <p class="empty">{_('No hay GIFs para esa búsqueda. Prueba con otra palabra.')}</p>
    {/if}
    <div class="columns">
      {#each gifs as gif (gif.id)}
        <button
          class="tile"
          onclick={() => onpick(gif.url)}
          title={gif.title}
          aria-label={_('Enviar GIF: {title}', { title: gif.title || _('GIF') })}
        >
          <GifImage url={gif.preview} width={gif.width} height={gif.height} />
        </button>
      {/each}
    </div>
  </div>
  <footer>
    <span>{shown ? _('Resultados para «{q}»', { q: shown }) : _('Tendencias')}</span>
    <span>Powered by <b>KLIPY</b></span>
  </footer>
</div>

<style>
  /* Above the compose bar, as wide as it. */
  .gifs {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 1;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: min(420px, 70vh);
    overflow: hidden;
    background: var(--group-bg);
    border: var(--group-border);
    border-radius: var(--group-radius);
    box-shadow: var(--popup-shadow);
  }

  /* A pill with a magnifier, like the contact list's search. */
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 12px 8px;
    padding: 6px 12px;
    border: var(--field-border-width) solid var(--field-border-color);
    border-radius: 999px;
    background: var(--field-bg);
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
    font-weight: 600;
  }

  .search input::placeholder {
    color: var(--text-muted);
  }

  .chips {
    display: flex;
    gap: 6px;
    padding: 0 12px 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chips button {
    flex: none;
    padding: 3px 11px;
    font-size: 12.5px;
    font-weight: 800;
  }

  .chips button[aria-pressed='true'] {
    border-color: var(--accent-border);
    background: var(--accent-bg);
    box-shadow: var(--accent-shadow);
    color: var(--accent-text);
  }

  /* Three columns, each GIF in its own shape. */
  .grid {
    padding: 0 12px 8px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* Not on .grid itself: a multi-column box of fixed height adds columns to the side. */
  .columns {
    columns: 3;
    column-gap: 6px;
  }

  .tile {
    display: block;
    width: 100%;
    margin-bottom: 6px;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 10px;
    background: var(--bar-bg);
    box-shadow: none;
    break-inside: avoid;
  }

  .tile:hover:not(:disabled) {
    background: var(--bar-bg);
    filter: brightness(1.08);
  }

  .tile:focus-visible {
    outline-offset: -3px;
  }

  .tile :global(img),
  .tile :global(canvas) {
    width: 100%;
  }

  .empty {
    margin: 0;
    padding: 30px 12px;
    color: var(--text-muted);
    text-align: center;
  }

  footer {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    padding: 6px 12px;
    border-top: 1px solid var(--line);
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 700;
  }

  footer span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer b {
    color: var(--text);
    letter-spacing: 0.02em;
  }
</style>
