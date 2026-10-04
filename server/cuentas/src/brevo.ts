// Newsletter list on Brevo (https://developers.brevo.com/reference). Without an API key
// and list id the service runs as usual and just skips syncing (see sync-brevo.ts to catch
// up later). Brevo itself adds the unsubscribe link to every newsletter and tells us about
// unsubscribes through a webhook (main.ts).

export type Newsletter = {
  subscribe(email: string): Promise<void>
  unsubscribe(email: string): Promise<void>
}

export function brevo(options: {
  apiKey?: string
  listId?: number
  baseUrl?: string
}): Newsletter | undefined {
  const { apiKey, listId, baseUrl = 'https://api.brevo.com/v3' } = options
  if (!apiKey || !listId) return undefined

  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(body)
    })

  return {
    // Creates or updates the contact and adds it to the list. The user just opted in
    // explicitly, so an earlier Brevo unsubscribe (blacklist) is lifted.
    async subscribe(email) {
      const res = await post('/contacts', {
        email,
        listIds: [listId],
        updateEnabled: true,
        emailBlacklisted: false
      })
      if (!res.ok) throw new Error(`brevo subscribe ${res.status}: ${await res.text()}`)
    },
    // Removing someone who isn't on the list answers 400: that's fine, they're off it.
    async unsubscribe(email) {
      const res = await post(`/contacts/lists/${listId}/contacts/remove`, { emails: [email] })
      if (!res.ok && res.status !== 400) {
        throw new Error(`brevo unsubscribe ${res.status}: ${await res.text()}`)
      }
    }
  }
}
