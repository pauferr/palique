// Emails an invite from the admin (no limit, no inviter). For the first accounts:
//   docker compose exec accounts node src/invite.ts alguien@correo.com
// Talks to the running service, which holds the connection to Prosody.
const email = process.argv[2]
if (!email) {
  console.error('Uso: node src/invite.ts correo@ejemplo.com')
  process.exit(1)
}
const res = await fetch(`http://127.0.0.1:${process.env['HTTP_PORT'] ?? '8080'}/admin/invite`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email })
})
const body = (await res.json()) as { error?: string }
const errors: Record<string, string> = {
  invalid: 'Esa dirección no es válida.',
  taken: 'Esa dirección ya tiene cuenta o una invitación pendiente.'
}
if (res.ok) console.log(`Invitación enviada a ${email}.`)
else console.error(errors[body.error ?? ''] ?? `Error: ${body.error}`)
process.exit(res.ok ? 0 : 1)
