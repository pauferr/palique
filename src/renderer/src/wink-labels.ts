// Spanish names of the winks by id. Kept apart from winks.ts (which bundles the videos)
// so the main process can use it too, for history exports.
const labels: Record<string, string> = {
  bubble: 'Burbuja',
  wave: 'Ola',
  ufo: 'Ovni',
  bounce: 'Rebote', // retired; kept so old conversations still name it
  'water-balloon': 'Globo de agua',
  pig: 'Cerdo bailón',
  tease: 'Crío burlón',
  kiss: 'Beso',
  laugh: 'Carcajada',
  'in-love': 'Enamorado',
  angry: 'Enfadado',
  crying: 'Llorando',
  cool: 'Chulo'
}

export const winkLabel = (id: string): string => labels[id] ?? id
