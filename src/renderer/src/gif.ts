// A GIF is a message whose whole body is a link to Klipy's images (see GifPicker). Shared by
// main (notifications, the palique-gif: protocol) and the renderer (the GIF bubble).
// Exactly a Klipy link and nothing else: no other host, query, fragment, escapes or `..`.
export const isGifUrl = (text: string): boolean =>
  text.length <= 300 &&
  !text.includes('..') &&
  /^https:\/\/static\.klipy\.com\/[A-Za-z0-9/_.-]+$/.test(text)

// The renderer may only load images through our protocol, which fetches them from Klipy.
export const gifSrc = (url: string): string => url.replace(/^https:/, 'palique-gif:')
