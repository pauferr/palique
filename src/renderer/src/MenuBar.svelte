<script lang="ts">
  import { popup, type MenuItem } from './menu'

  // The bar on top of the main window, signed in or not. Items are made when the menu
  // opens, so their ✓ marks are current.
  let { menus }: { menus: { label: string; items: () => MenuItem[] }[] } = $props()
</script>

<div class="menubar" role="menubar">
  {#each menus as menu (menu.label)}
    <button role="menuitem" aria-haspopup="menu" onclick={(e) => popup(e, menu.items())}
      >{menu.label}</button
    >
  {/each}
</div>

<style>
  .menubar {
    position: relative;
    display: flex;
    gap: 2px;
    align-self: stretch;
    padding: 4px 8px;
    background: var(--bar-bg);
    border-bottom: 1px solid var(--line);
  }
  .menubar > button {
    padding: 6px 8px;
    border-color: transparent;
    border-radius: 6px;
    background: none;
    box-shadow: none;
    color: var(--text);
    font-weight: 600;
  }
  .menubar > button:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }
</style>
