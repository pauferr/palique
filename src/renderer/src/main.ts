import { mount } from 'svelte'

import './themes/classic.css'
import './themes/retro.css'
import './themes/glass.css'
import './themes/base.css'

import App from './App.svelte'
import Chat from './Chat.svelte'
import Options from './Options.svelte'
import Wink from './Wink.svelte'
import WinkGallery from './WinkGallery.svelte'
import SoundGallery from './SoundGallery.svelte'

// Every window follows the theme chosen in Options, live.
const applyTheme = ({ theme }: { theme: string }): void => {
  document.documentElement.dataset.theme = theme
}
window.api.getSettings().then(applyTheme)
window.api.onSettings(applyTheme)

const target = document.getElementById('app')!
const params = new URLSearchParams(location.hash.slice(1))
const wink = params.get('wink')
const chat = params.get('chat')

if (wink) document.documentElement.classList.add('overlay')

const app = wink
  ? mount(Wink, { target, props: { id: wink } })
  : chat
    ? mount(Chat, { target, props: { jid: chat } })
    : params.has('options')
      ? mount(Options, { target })
      : params.has('winks')
        ? mount(WinkGallery, { target })
        : params.has('sounds')
          ? mount(SoundGallery, { target })
          : mount(App, { target })

export default app
