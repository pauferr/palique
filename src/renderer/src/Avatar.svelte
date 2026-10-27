<script lang="ts">
  import type { Contact } from '../../main/xmpp'
  import { stripPlus } from './plus'

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
  const initial = $derived([...(stripPlus(name).trim() || jid)][0].toUpperCase())
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
  /* The frame shows the status: a glossy rounded square in the status color,
     the picture inset with a gap in the list's color so the frame reads on any picture. */
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    padding: max(3px, calc(var(--size) * 0.08));
    border-radius: var(--avatar-radius);
    background: linear-gradient(rgb(255 255 255 / 35%), transparent 60%) var(--ring);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 50%),
      0 2px 6px rgb(0 0 0 / 15%);
    color: #fff;
    font-weight: 800;
    text-shadow: 0 1px 1px rgb(0 0 0 / 25%);
    font-size: calc(var(--size) * 0.4);
    box-sizing: border-box;
  }

  .face {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: max(2px, calc(var(--size) * 0.045)) solid var(--list-bg);
    border-radius: var(--avatar-face-radius);
    background: var(--color);
    box-sizing: border-box;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .online {
    --ring: var(--status-online);
  }

  .away {
    --ring: var(--status-away);
  }

  .dnd {
    --ring: var(--status-dnd);
  }

  .offline {
    --ring: var(--status-offline);
    filter: grayscale(0.6);
  }
</style>
