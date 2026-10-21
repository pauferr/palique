// The oldest app that may still sign in (MIN_APP_VERSION), raised only when a change
// breaks older apps. Compares major.minor.patch: the stage (-alpha…) doesn't count, so
// "0.9.0" lets every 0.9.0 build in. Empty: nobody is turned away. An app that sends no
// version predates the check, so it's too old as soon as there is a minimum.
const parts = (version: string): number[] | undefined => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match ? match.slice(1).map(Number) : undefined
}

export function outdated(min: string, version: string | undefined): boolean {
  const floor = parts(min)
  if (!floor) return false
  const have = parts(version ?? '')
  if (!have) return true
  for (let i = 0; i < 3; i++) if (have[i] !== floor[i]) return have[i] < floor[i]
  return false
}
