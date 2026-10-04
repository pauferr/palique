// Registration is invite-only: checks get account invites from the local Prosody's admin shell.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function adminInvite(): string {
  const out = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'prosody',
      'prosodyctl',
      'shell',
      'invite',
      'create_account',
      'localhost'
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' }
  )
  const token = out.match(/preauth=([^;\s]+)/)?.[1]
  if (!token) throw new Error(`no invite in: ${out}`)
  return token
}
