declare module '*?raw' {
  const content: string
  export default content
}

// The next release's version, set at build time (see electron.vite.config.ts).
declare const __DEV_VERSION__: string
