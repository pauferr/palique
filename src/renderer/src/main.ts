import { mount } from 'svelte'

import App from './App.svelte'
import Chat from './Chat.svelte'
import Options from './Options.svelte'
import Wink from './Wink.svelte'

const target = document.getElementById('app')!
const params = new URLSearchParams(location.hash.slice(1))
const wink = params.get('wink')
const chat = params.get('chat')

const app = wink
  ? mount(Wink, { target, props: { id: wink } })
  : chat
    ? mount(Chat, { target, props: { jid: chat } })
    : params.has('options')
      ? mount(Options, { target })
      : mount(App, { target })

export default app
