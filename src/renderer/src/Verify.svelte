<script lang="ts">
  import { onMount } from 'svelte'
  import { ShieldCheck } from '@lucide/svelte'
  import type { DeviceTrust } from '../../main/xmpp'
  import Emoticons from './Emoticons.svelte'
  import { _ } from './i18n'

  // Comparing encryption codes with a contact, in person or by phone.
  let { jid }: { jid: string } = $props()

  let mine = $state('')
  let devices: DeviceTrust[] = $state([])
  let name = $state('')

  const load = async (): Promise<void> => {
    ;({ mine, devices } = await window.api.getVerify(jid))
  }

  onMount(() => {
    load()
    window.api.getRoster().then((s) => (name = s.contacts.find((c) => c.jid === jid)?.name ?? ''))
    // Another window may have verified or accepted something.
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  })

  async function toggle(device: DeviceTrust): Promise<void> {
    await window.api.setVerified(jid, device.deviceId, !device.verified)
    await load()
  }
</script>

<!-- A sentence with the contact's name, drawn with its emoticons and formatting: split the
     translated text around {name}. -->
{#snippet named(text: string)}{@const [before, after] = text.split('{name}')}{before}<Emoticons
    text={name || _('Sin nombre')}
    plus
  />{after}{/snippet}

<svelte:head><title>{_('Verificar cifrado…')}</title></svelte:head>

<main>
  <p class="how">
    {@render named(
      _(
        'Compara estos códigos con {name}, en persona o por teléfono. Si coinciden, sabes que hablas con esa persona y no con otra. Si un día cambian, Palique te avisará.'
      )
    )}
  </p>

  <section>
    <h2>{_('Tu código')}</h2>
    <code>{mine}</code>
  </section>

  {#each devices as device (device.deviceId)}
    <section>
      <h2>
        <span>{@render named(_('Código de {name}'))}</span>
        {#if device.verified}<ShieldCheck size={16} aria-label={_('Verificado')} />{/if}
      </h2>
      <code>{device.fingerprint}</code>
      <button onclick={() => toggle(device)}>
        {device.verified ? _('Quitar la verificación') : _('Marcar como verificado')}
      </button>
    </section>
  {:else}
    <p class="how">
      {@render named(_('{name} todavía no tiene ningún dispositivo con cifrado.'))}
    </p>
  {/each}

  <footer><button class="primary" onclick={() => window.close()}>{_('Cerrar')}</button></footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100vh;
    box-sizing: border-box;
    padding: 18px;
  }

  .how {
    margin: 0;
    color: var(--text-muted);
  }

  section {
    display: grid;
    gap: 6px;
    padding: 12px;
    border: var(--group-border);
    border-radius: var(--group-radius);
    background: var(--group-bg);
  }

  h2 {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }

  /* 8 groups of 8, two lines of four. */
  code {
    display: block;
    max-width: 36ch;
    font-family: ui-monospace, monospace;
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;
    user-select: all;
  }

  section button {
    justify-self: start;
  }

  footer {
    margin-top: auto;
    text-align: right;
  }
</style>
