import { execFileSync } from 'node:child_process'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The version being worked on, shown in development.
// Empty without git or with no commits since the last release.
function nextVersion(): string {
  try {
    const script = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/next-version.ts']
    return execFileSync(process.execPath, script, { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  main: { define: { __DEV_VERSION__: JSON.stringify(nextVersion()) } },
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
