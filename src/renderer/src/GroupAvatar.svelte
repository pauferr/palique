<script lang="ts">
  import type { Group } from '../../main/groups'
  import type { Snapshot } from '../../main/xmpp'
  import Avatar from './Avatar.svelte'
  import { others, type Face } from './group'

  // A group's picture: its photo, or a mosaic of up to four members' faces (not ours), in a
  // sky frame with no status color. `faces` replaces the members (the new group window).
  let {
    group,
    roster,
    size = 40,
    faces
  }: { group?: Group; roster: Snapshot; size?: number; faces?: Face[] } = $props()

  const cells = $derived((faces ?? (group ? others(roster, group) : [])).slice(0, 4))
  // What the frame and the borders leave for the faces (the size sets an initial's letter).
  const inner = $derived(size - 2 * Math.max(3, size * 0.08) - 4)
</script>

<span class="group" style:--size="{size}px" aria-hidden="true">
  {#if group?.photo}
    <span class="mosaic"><img src={group.photo} alt="" /></span>
  {:else}
    <span class="mosaic n{cells.length}">
      {#each cells as f (f.jid)}
        <Avatar
          jid={f.jid}
          name={f.name}
          url={f.url}
          size={cells.length > 1 ? inner * 0.7 : inner}
          bare
        />
      {/each}
    </span>
  {/if}
</span>

<style>
  .group {
    display: inline-grid;
    flex: none;
    width: var(--size);
    height: var(--size);
    padding: max(3px, calc(var(--size) * 0.08));
    border-radius: var(--avatar-radius);
    background: var(--button-bg);
    box-shadow:
      inset 0 0 0 1px var(--button-border-color),
      0 2px 6px rgb(0 0 0 / 15%);
    box-sizing: border-box;
  }

  .mosaic {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    overflow: hidden;
    border: 2px solid var(--list-bg);
    border-radius: var(--avatar-face-radius);
    background: var(--list-bg);
  }

  .group .mosaic > :global(.avatar) {
    width: 100%;
    height: 100%;
  }

  .n1,
  .n0 {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }

  .n2 {
    grid-template-rows: 1fr;
  }

  .group .n3 > :global(.avatar:first-child) {
    grid-row: span 2;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    grid-area: 1 / 1 / -1 / -1;
  }
</style>
