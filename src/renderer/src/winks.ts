// Bundled wink catalog: every assets/winks/<id>.webm is a wink, the file name is its id.
const files = import.meta.glob<string>('./assets/winks/*.webm', { eager: true, import: 'default' })

export const winks: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -5), url])
)

const labels: Record<string, string> = {
  burbuja: 'Burbuja',
  rebote: 'Rebote',
  ola: 'Ola'
}

export const winkLabel = (id: string): string => labels[id] ?? id
