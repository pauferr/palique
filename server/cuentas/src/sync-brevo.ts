// Puts the Brevo list in line with everyone's choice (e.g. right after adding the API key,
// or after a Brevo outage). Safe to run any time:
//   docker compose exec cuentas node --disable-warning=ExperimentalWarning src/sync-brevo.ts
import { brevo } from './brevo.ts'
import { openDb } from './db.ts'

const newsletter = brevo({
  apiKey: process.env['BREVO_API_KEY'],
  listId: Number(process.env['BREVO_LIST_ID']) || undefined,
  baseUrl: process.env['BREVO_API_URL']
})
if (!newsletter) {
  console.error('Set BREVO_API_KEY and BREVO_LIST_ID first.')
  process.exit(1)
}

const db = openDb(`${process.env['DATA_DIR'] ?? '/data'}/cuentas.sqlite`)
let subscribed = 0
let removed = 0
let failed = 0
for (const account of db.allAccounts()) {
  try {
    if (account.newsletter) {
      await newsletter.subscribe(account.email)
      subscribed++
    } else {
      await newsletter.unsubscribe(account.email)
      removed++
    }
  } catch (e) {
    failed++
    console.error(account.email, (e as Error).message)
  }
  await new Promise((r) => setTimeout(r, 120)) // stay well under Brevo's rate limits
}
console.log(`subscribed ${subscribed}, removed ${removed}, failed ${failed}`)
process.exit(failed ? 1 : 0)
