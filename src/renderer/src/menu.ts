import type { MenuLabel } from '../../preload'
import { _ } from './i18n'

// Menus like MSN's, each action in one place: the bar on top, your picture, and a right
// click on a contact. Native, so they can go past the window.
export type MenuItem = { label: string; checked?: boolean; run: () => void } | '-'

// Under the button clicked, or where the right click was.
export async function popup(event: MouseEvent, items: MenuItem[]): Promise<void> {
  const at =
    event.type === 'contextmenu'
      ? { left: event.clientX, bottom: event.clientY }
      : (event.currentTarget as HTMLElement).getBoundingClientRect()
  const labels = items.map((item): MenuLabel =>
    item === '-' ? item : { label: item.label, checked: item.checked }
  )
  const item = items[await window.api.popupMenu(labels, at.left, at.bottom)]
  if (item && item !== '-') item.run()
}

// Ayuda, the same signed in or not.
export const helpItems = (): MenuItem[] => [
  { label: _('Registro de errores…'), run: window.api.openLogs },
  { label: _('Acerca de Palique'), run: window.api.openAbout }
]
