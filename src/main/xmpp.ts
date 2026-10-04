// The only module that knows about the XMPP library. One connection for the whole app.
import { randomUUID } from 'node:crypto'
import { client, xml, type Client } from '@xmpp/client'

export const DOMAIN = process.env['PALIQUE_XMPP_DOMAIN'] ?? 'localhost'
const SERVICE = process.env['PALIQUE_XMPP_SERVICE'] ?? `xmpp://${DOMAIN}:5222`

export type AuthError =
  | 'conflict' // username taken
  | 'not-acceptable' // username or password rejected by the server
  | 'not-authorized' // wrong username or password
  | 'unreachable'
  | 'unknown'

export type AuthResult = { ok: true; jid: string } | { ok: false; error: AuthError }

let xmpp: Client | null = null

// In-band registration (XEP-0077) on the already-encrypted stream, before SASL.
async function registerAccount(entity: Client, username: string, password: string): Promise<void> {
  const res = await entity.sendReceive(
    xml(
      'iq',
      { type: 'set', id: randomUUID() },
      xml(
        'query',
        { xmlns: 'jabber:iq:register' },
        xml('username', {}, username),
        xml('password', {}, password)
      )
    )
  )
  if (res.attrs.type !== 'result') {
    const condition = res
      .getChild('error')
      ?.getChildElements()
      .find((el) => el.name !== 'text')?.name
    throw Object.assign(new Error('registration failed'), { condition })
  }
}

function toAuthError(e: unknown): AuthError {
  const { condition, code } = (e ?? {}) as { condition?: string; code?: string }
  if (
    condition === 'conflict' ||
    condition === 'not-acceptable' ||
    condition === 'not-authorized'
  ) {
    return condition
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return 'unreachable'
  return 'unknown'
}

export async function login(
  username: string,
  password: string,
  register = false
): Promise<AuthResult> {
  await logout()
  const entity = client({
    service: SERVICE,
    domain: DOMAIN,
    credentials: async (authenticate, mechanisms, _fast, conn) => {
      if (register) await registerAccount(conn, username, password)
      // The server requires TLS, so its preferred mechanism is safe to use as-is.
      await authenticate(
        { username, password },
        mechanisms[0],
        xml('user-agent', { id: randomUUID() })
      )
    }
  })
  // Without a listener, connection errors would crash the main process.
  entity.on('error', () => {})
  try {
    const jid = await entity.start()
    xmpp = entity
    return { ok: true, jid: jid.bare().toString() }
  } catch (e) {
    entity.reconnect.stop()
    await entity.stop().catch(() => {})
    return { ok: false, error: toAuthError(e) }
  }
}

export async function logout(): Promise<void> {
  const entity = xmpp
  xmpp = null
  if (!entity) return
  entity.reconnect.stop()
  await entity.stop().catch(() => {})
}
