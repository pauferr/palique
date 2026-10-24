import { execFileSync } from 'node:child_process'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The version being worked on, shown in development: the next release, or the release
// itself when nothing has changed since. Empty without git.
function nextVersion(): string {
  // The release workflow tags versions on GitHub: bring them in first (offline: as they are).
  try {
    execFileSync('git', ['fetch', '--tags', '--quiet'], { stdio: 'ignore', timeout: 5000 })
  } catch {
    // Keep the tags we have.
  }
  const run = (file: string, args: string[]): string =>
    execFileSync(file, args, { encoding: 'utf8', stdio: 'pipe' }).trim()
  try {
    const script = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/next-version.ts']
    return run(process.execPath, script)
  } catch {
    try {
      return run('git', ['describe', '--tags', '--exact-match', '--match', 'v*']).slice(1)
    } catch {
      return ''
    }
  }
}

export default defineConfig({
  main: { define: { __DEV_VERSION__: JSON.stringify(nextVersion()) } },
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
