// Every wink, one file each. The id travels over the network and is saved in histories:
// never reuse or rename one.
import type { Wink } from './kit'
import { wink as angry } from './angry'
import { wink as bubble } from './bubble'
import { wink as cool } from './cool'
import { wink as crying } from './crying'
import { wink as inLove } from './in-love'
import { wink as kiss } from './kiss'
import { wink as laugh } from './laugh'
import { wink as pig } from './pig'
import { wink as tease } from './tease'
import { wink as ufo } from './ufo'
import { wink as waterBalloon } from './water-balloon'
import { wink as wave } from './wave'

export const CATALOG: Wink[] = [
  angry,
  bubble,
  cool,
  crying,
  inLove,
  kiss,
  laugh,
  pig,
  tease,
  ufo,
  waterBalloon,
  wave
]
