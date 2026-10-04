// Reads the development mailbox (Mailpit, http://localhost:8025) for checks.
const API = 'http://localhost:8025/api/v1'

export type Mail = { subject: string; text: string }

// Newest email to `address`, waiting a few seconds for it to arrive.
export async function lastMail(address: string, timeout = 5000): Promise<Mail> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const search = await fetch(`${API}/search?query=${encodeURIComponent(`to:"${address}"`)}`)
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages.length) {
      const mail = (await (await fetch(`${API}/message/${messages[0].ID}`)).json()) as {
        Subject: string
        Text: string
      }
      return { subject: mail.Subject, text: mail.Text }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no email to ${address}`)
}

export async function mailCount(address: string): Promise<number> {
  const search = await fetch(`${API}/search?query=${encodeURIComponent(`to:"${address}"`)}`)
  return ((await search.json()) as { messages_count: number }).messages_count
}
