// Accounts for the checks, created the way people get them: an invite by email (here the
// admin's, from the local account service), then the website's sign-up form.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as A from '../src/main/xmpp.ts'
import { lastMail } from './mailpit.ts'

const SITE = 'http://localhost:8080'

// Emails an admin invite to `email` and returns its code (read from Mailpit).
export async function adminInvite(email: string): Promise<string> {
  execFileSync('docker', ['compose', 'exec', '-T', 'accounts', 'node', 'src/invite.ts', email], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8'
  })
  return inviteCode((await lastMail(email)).text)
}

// The code in an invite email (its "Create my account" link carries it).
export function inviteCode(text: string): string {
  const token = text.match(/\/join\?t=([\w-]+)/)?.[1]
  if (!token) throw new Error(`no invite in: ${text}`)
  return token
}

// A page of the website, like a browser: GET, or POST with `fields` when given.
export async function page(
  path: string,
  fields?: Record<string, string>
): Promise<{ status: number; text: string }> {
  const res = await fetch(
    `${SITE}${path}`,
    fields
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString()
        }
      : {}
  )
  return { status: res.status, text: await res.text() }
}

// Which account an invite creates, as old apps ask (POST /signup).
export async function inviteInfo(token: string): Promise<{ email: string; username: string }> {
  const res = await fetch(`${SITE}/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  })
  assert.equal(res.status, 200, 'the invite is valid')
  return res.json()
}

// Signs up on the website with an invite code, then signs in like the app. Returns the
// account's JID localpart (A.login takes it to sign in again).
export async function signUp(token: string, password: string, nick: string): Promise<string> {
  const { username } = await inviteInfo(token)
  const created = await page(`/join?t=${token}`, { nick, password, confirm: password })
  assert.equal(created.status, 200, `sign-up failed: ${created.text}`)
  const result = await A.login(username, password)
  assert.equal(result.ok, true, `sign-in failed: ${JSON.stringify(result)}`)
  return username
}

// A fresh account for `name@correo.test`, invited by the admin. Stays signed in.
export async function register(name: string, password: string): Promise<string> {
  const email = `${name}@correo.test`
  return signUp(await adminInvite(email), password, name)
}
