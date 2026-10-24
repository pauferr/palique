// How a version reads in the app: "0.6.0-alpha" → "v0.6.0 (alpha)", "1.0.0" → "v1.0.0".
// Kept apart so the main process can use it too.
export function versionLabel(version: string): string {
  const [number, stage] = version.split(/-(.*)/)
  return stage ? `v${number} (${stage})` : `v${number}`
}
