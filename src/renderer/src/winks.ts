// The wink catalog. Winks are drawn live (src/renderer/src/winks/), so they stay sharp
// at any size and weigh a few KB.
import { CATALOG } from './winks/catalog'
import type { Wink } from './winks/kit'
import { winkLabel } from './wink-labels'

export { winkLabel }

// In the picker, by name.
export const winks: Wink[] = [...CATALOG].sort((a, b) =>
  winkLabel(a.id).localeCompare(winkLabel(b.id), 'es')
)

export const findWink = (id: string): Wink | undefined => CATALOG.find((w) => w.id === id)
