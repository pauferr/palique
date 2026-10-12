<script lang="ts">
  import type { Contact } from '../../main/xmpp'

  let {
    jid,
    name = '',
    url = '',
    show = 'online',
    size = 40
  }: { jid: string; name?: string; url?: string; show?: Contact['show']; size?: number } = $props()

  // Default avatar until the cast illustrations exist: initial on one of the theme's colors,
  // always the same for a given user.
  const color = $derived(
    `var(--avatar-${[...jid].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 8})`
  )
  const initial = $derived((name || jid).charAt(0).toUpperCase())
</script>

<span class="avatar {show}" style:--size="{size}px" style:--color={color} aria-hidden="true">
  <span class="face">
    {#if url}
      <img src={url} alt="" />
    {:else}
      {initial}
    {/if}
  </span>
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
    /* A white ring keeps the status frame visible whatever the picture's color. */
    padding: 2px;
    border: 3px solid;
    border-radius: var(--avatar-radius);
    background: #fff;
    color: #fff;
    font-weight: bold;
    text-shadow: 0 1px 1px rgb(0 0 0 / 25%);
    font-size: calc(var(--size) * 0.45);
    box-sizing: border-box;
  }

  .face {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: var(--avatar-face-radius);
    background: var(--color);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .online {
    border-color: var(--status-online);
  }

  .away {
    border-color: var(--status-away);
  }

  .dnd {
    border-color: var(--status-dnd);
  }

  .offline {
    border-color: var(--status-offline);
    filter: grayscale(0.6);
  }
</style>
