import { mount } from 'svelte'

import App from './App.svelte'
import Wink from './Wink.svelte'

const target = document.getElementById('app')!
const wink = new URLSearchParams(location.hash.slice(1)).get('wink')

const app = wink ? mount(Wink, { target, props: { id: wink } }) : mount(App, { target })

export default app
