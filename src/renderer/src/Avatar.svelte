<script lang="ts">
  import type { Contact } from '../../main/xmpp'

  let {
    jid,
    url = '',
    show = 'online',
    size = 40
  }: { jid: string; url?: string; show?: Contact['show']; size?: number } = $props()

  // Default avatar until the cast illustrations exist: initial on a color picked from the name.
  const hue = $derived([...jid].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360)
  const initial = $derived(jid.charAt(0).toUpperCase())
</script>

<span class="avatar {show}" style:--size="{size}px" style:--hue={hue} aria-hidden="true">
  {#if url}
    <img src={url} alt="" />
  {:else}
    {initial}
  {/if}
</span>

<style>
  /* The frame shows the status, like MSN. */
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    border: 3px solid;
    border-radius: 8px;
    background: hsl(var(--hue) 55% 55%);
    color: #fff;
    font-weight: bold;
    font-size: calc(var(--size) * 0.45);
    box-sizing: border-box;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .online {
    border-color: #2ecc71;
  }

  .away {
    border-color: #f1c40f;
  }

  .dnd {
    border-color: #e74c3c;
  }

  .offline {
    border-color: #bbb;
    filter: grayscale(0.6);
  }
</style>
