// Accounts for the checks, created the way people get them: an invite by email (here the
// admin's, from the local account service), then signing up with its code.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as A from '../src/main/xmpp.ts'
import { lastMail } from './mailpit.ts'

// Emails an admin invite to `email` and returns its code (read from Mailpit).
export async function adminInvite(email: string): Promise<string> {
  execFileSync('docker', ['compose', 'exec', '-T', 'cuentas', 'node', 'src/invitar.ts', email], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8'
  })
  return inviteCode((await lastMail(email)).text)
}

// The code in an invite email.
export function inviteCode(text: string): string {
  const token = text.match(/palique:\/\/registro\?t=([\w-]+)/)?.[1]
  if (!token) throw new Error(`no invite in: ${text}`)
  return token
}

// Signs up with an invite code, like the app's sign-up screen. Returns the account's
// JID localpart (A.login takes it to sign in again).
export async function signUp(token: string, password: string, nick: string): Promise<string> {
  const { username } = await A.inviteInfo(token)
  const result = await A.login(username, password, { invite: token, nick })
  assert.equal(result.ok, true, `sign-up failed: ${JSON.stringify(result)}`)
  return username
}

// A fresh account for `name@correo.test`, invited by the admin. Stays signed in.
export async function register(name: string, password: string): Promise<string> {
  const email = `${name}@correo.test`
  return signUp(await adminInvite(email), password, name)
}
