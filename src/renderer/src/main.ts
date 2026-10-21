import { mount } from 'svelte'

import './themes/classic.css'
import './themes/retro.css'
import './themes/glass.css'
import './themes/night.css'
import './themes/fonts.css'
import './themes/base.css'

import App from './App.svelte'
import Chat from './Chat.svelte'
import Options from './Options.svelte'
import Wink from './Wink.svelte'
import WinkGallery from './WinkGallery.svelte'
import SoundGallery from './SoundGallery.svelte'
import NickEditor from './NickEditor.svelte'
import About from './About.svelte'

// Every window follows the theme and font chosen in Options, live.
const applyTheme = ({ theme, font }: { theme: string; font: string }): void => {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.font = font
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
        : params.has('nick')
          ? mount(NickEditor, { target })
          : params.has('about')
            ? mount(About, { target })
            : params.has('sounds')
              ? mount(SoundGallery, { target })
              : mount(App, { target })

export default app
