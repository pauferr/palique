import type { Theme } from '../../../main/settings'

// The themes, as Options and the contact list's Herramientas menu name them.
export const themes: { id: Theme; label: string; font: string }[] = [
  { id: 'classic', label: 'Clásico', font: 'Noto Sans' },
  { id: 'retro', label: 'Retro', font: 'IBM Plex Sans' },
  { id: 'glass', label: 'Cristal', font: 'Hind' },
  { id: 'night', label: 'Noche', font: 'Noto Sans' }
]
