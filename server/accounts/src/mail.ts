// Outgoing email over SMTP (Mailpit in development, any SMTP server in production).
import nodemailer from 'nodemailer'

export const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Every email has the same shape: a first line said by someone (like a chat message),
// more text, an optional code to paste into the app, an optional button, a smaller note
// under it and a footer.
export type Mail = {
  to: string
  subject: string
  // Who "says" the first paragraph, as in the app's "Tere dice:". Palique by default.
  sender?: string
  paragraphs: string[]
  code?: string
  link?: { href: string; label: string }
  note?: string
  footer?: string
  footerLink?: { href: string; label: string }
}

// Looks like a conversation window, with MSN's butterfly colors on top. Inline styles and
// tables, because that's what Gmail and Outlook render; the <style> only adds dark mode
// where supported.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace"
export const BUTTERFLY = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444']
const ACCENT = '#2563eb'
const TINT = '#eef3ff'
const TINT_BORDER = '#c9d8fd'
const BRAND = `<span style="color:#22c55e">&#9679;</span>&nbsp;<span class="acc" style="color:${ACCENT}">palique</span>`

function html(mail: Mail): string {
  const p = (text: string, style = 'color:#18181b', kind = 'fg'): string =>
    `<p class="${kind}" style="margin:0 0 16px;${style}">${escape(text)}</p>`
  const [first = '', ...rest] = mail.paragraphs
  const stripe = BUTTERFLY.map(
    (color, i) =>
      `<td height="5" style="background:${color};${i === 0 ? 'border-radius:10px 0 0 0' : i === 3 ? 'border-radius:0 10px 0 0' : ''}"></td>`
  ).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escape(mail.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#0c0c0d !important }
  .card { background:#18181b !important; border-color:#2a2a2e !important }
  .fg { color:#f4f4f5 !important }
  .muted { color:#a1a1aa !important }
  .acc { color:#6b9bff !important }
  .tint { background:#1b2540 !important; border-color:#2f3b5c !important; color:#f4f4f5 !important }
  .btn { background:#6b9bff !important; color:#0c0c0d !important }
  .line { border-color:#2a2a2e !important }
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:#f7f7f6">
<div style="display:none;max-height:0;overflow:hidden">${escape(first)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e7e5;border-radius:10px;font-family:${FONT};font-size:15px;line-height:1.6;color:#18181b">
<tr><td style="padding:0;font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stripe}</tr></table></td></tr>
<tr><td class="tint line" style="padding:10px 20px;background:${TINT};border-bottom:1px solid ${TINT_BORDER};font-size:13px;color:#71717a"><span class="muted" style="color:#71717a">Para:</span> <b class="fg" style="color:#18181b">tú</b> <span style="float:right;font-weight:700">${BRAND}</span></td></tr>
<tr><td class="fg" style="padding:12px 28px 8px;color:#18181b">
<p class="muted" style="margin:12px 0 6px;font-size:13px;color:#71717a"><b class="acc" style="color:${ACCENT}">${escape(mail.sender ?? 'Palique')}</b> dice:</p>
<div class="tint fg" style="margin:0 0 18px;padding:12px 16px;background:${TINT};border:1px solid ${TINT_BORDER};border-radius:14px 14px 14px 4px;color:#18181b;display:inline-block">${escape(first)}</div>
${rest.map((text) => p(text)).join('\n')}
${
  mail.code
    ? `<div class="tint" style="margin:0 0 6px;padding:16px 12px;background:${TINT};border:1px solid ${TINT_BORDER};border-radius:8px;text-align:center;font-family:${MONO};font-size:22px;font-weight:600;letter-spacing:0.12em;color:#18181b;word-break:break-all;-webkit-user-select:all;user-select:all">${escape(mail.code)}</div>
<p class="muted" style="margin:0 0 20px;text-align:center;font-size:12px;color:#71717a">Un clic y lo tienes seleccionado entero.</p>`
    : ''
}
${mail.link ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td class="btn" align="center" style="background:${ACCENT};border-radius:8px"><a class="btn" href="${escape(mail.link.href)}" style="display:block;padding:13px 22px;background:${ACCENT};color:#ffffff;border-radius:8px;font-weight:600;text-align:center;text-decoration:none">${escape(mail.link.label)}</a></td></tr></table>` : ''}
${mail.note ? p(mail.note, 'font-size:14px;color:#71717a', 'muted') : ''}
</td></tr>
${
  mail.footer
    ? `<tr><td class="muted line" style="padding:16px 28px 22px;border-top:1px solid #eeeeec;font-size:12px;line-height:1.5;color:#71717a">${escape(mail.footer)}${mail.footerLink ? ` <a class="acc" href="${escape(mail.footerLink.href)}" style="color:${ACCENT}">${escape(mail.footerLink.label)}</a>` : ''}</td></tr>`
    : ''
}
</table></td></tr></table></body></html>`
}

export function mailer(options: {
  host: string
  port: number
  from: string
  replyTo?: string
  user?: string
  pass?: string
}) {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    auth: options.user ? { user: options.user, pass: options.pass } : undefined
  })

  return (mail: Mail): Promise<unknown> => {
    // The code gets a paragraph of its own, so it's easy to copy from the plain text too.
    // With no bubble here, the sender is named in front of what they say.
    const text = [
      ...(mail.sender ? [`${mail.sender} dice:`] : []),
      ...mail.paragraphs,
      ...(mail.code ? [mail.code] : []),
      ...(mail.link ? [`${mail.link.label}: ${mail.link.href}`] : []),
      ...(mail.note ? [mail.note] : []),
      ...(mail.footer
        ? ['--', mail.footerLink ? `${mail.footer} ${mail.footerLink.href}` : mail.footer]
        : [])
    ].join('\n\n')
    return transport.sendMail({
      from: options.from,
      replyTo: options.replyTo,
      to: mail.to,
      subject: mail.subject,
      text,
      html: html(mail)
    })
  }
}

export type SendMail = ReturnType<typeof mailer>
