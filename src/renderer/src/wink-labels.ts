import { _p } from './i18n.ts'

// Names of the winks by id. Kept apart from winks.ts (which bundles the videos) so the
// main process can use it too, for history exports. A function: the language is set after
// this loads. In context, as some names are also emoticons (Carcajada) or sound packs.
const labels = (): Record<string, string> => ({
  bubble: _p('guiño', 'Burbuja'),
  wave: _p('guiño', 'Ola'),
  ufo: _p('guiño', 'Ovni'),
  'water-balloon': _p('guiño', 'Globo de agua'),
  pig: _p('guiño', 'Cerdo bailón'),
  tease: _p('guiño', 'Crío burlón'),
  kiss: _p('guiño', 'Beso'),
  laugh: _p('guiño', 'Carcajada'),
  'in-love': _p('guiño', 'Enamorado'),
  angry: _p('guiño', 'Enfadado'),
  crying: _p('guiño', 'Llorando'),
  cool: _p('guiño', 'Chulo')
})

export const winkLabel = (id: string): string => {
  const all = labels()
  return Object.hasOwn(all, id) ? all[id] : id
}
