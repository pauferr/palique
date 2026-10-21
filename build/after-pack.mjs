// Ad-hoc signs the macOS app before the dmg and zip are made. Without a Developer ID,
// electron-builder leaves Electron's signature broken by its own changes, and a downloaded
// app with a broken signature is "damaged" to macOS. Ad-hoc signed, it's only "unverified".
import { execFileSync } from 'node:child_process'

// Plain JavaScript: no place for a return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function afterPack({ electronPlatformName, appOutDir, packager }) {
  if (electronPlatformName !== 'darwin') return
  const app = `${appOutDir}/${packager.appInfo.productFilename}.app`
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
