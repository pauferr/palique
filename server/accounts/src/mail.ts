// Outgoing email over SMTP (Mailpit in development, any SMTP server in production).
import nodemailer from 'nodemailer'
import { translator, type Language } from './i18n.ts'

export const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export type Link = { href: string; label: string }

// Every email has the same shape, top to bottom: someone says something (like a chat
// message), a heading and a line on what it's about, then what to do: numbered steps with
// a button each, or one button. Buttons go to the website, never straight into the app. A
// small note and a footer close it.
export type Mail = {
  to: string
  lang: Language // the texts come translated; this is for the parts every email shares
  subject: string
  preheader: string // shown after the subject in the inbox
  window: string // the window's title, as in the app
  // Who says `bubble`, as in the app's "Tere dice:". Palique by default.
  sender?: string
  bubble: string
  heading: string
  intro: string
  features?: string[]
  steps?: { title: string; text: string; link: Link }[]
  link?: Link
  note?: string
  footer: string
  footerLink?: Link
}

// A Palique conversation window, in the app's "Cielo" colors. Inline styles and tables,
// because that's what Gmail and Outlook render; the <style> only adds dark mode where
// supported. No images: most inboxes hide them until asked.
const FONT =
  "Nunito,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const TEXT = '#13294b'
const MUTED = '#4d6584'
const STRONG = '#1f6fc4'
const LINE = '#cfe3f7'
const SOFT = '#eef6ff'
const SOFT_LINE = '#bfe3ff'
const BUTTON = `background:#1f6fc4;background-image:linear-gradient(180deg,#5db2ff 0%,#1f6fc4 52%,#1a63b3 100%);border:1px solid #1a5fa8;border-radius:999px;color:#ffffff;font-weight:800;text-decoration:none`

const button = (link: Link, block: boolean): string =>
  `<a class="btn" href="${escape(link.href)}" style="display:${block ? 'block' : 'inline-block'};padding:${block ? '13px 20px' : '10px 20px'};text-align:center;${BUTTON}">${escape(link.label)}</a>`

function html(mail: Mail): string {
  const _ = translator(mail.lang)
  const sender = mail.sender ?? 'Palique'
  // People get a pink picture, Palique its sky blue; the green frame is "online".
  const picture = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:3px;border-radius:12px;background:#2f9a3c"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="ring" width="34" height="34" align="center" style="width:34px;height:34px;border:2px solid #ffffff;border-radius:9px;background:${mail.sender ? '#e8569a' : '#2f86e0'};color:#ffffff;font-weight:800;font-size:17px">${escape(sender.slice(0, 1).toUpperCase())}</td></tr></table></td></tr></table>`
  const check = `<span style="color:#2f9a3c;font-weight:900">&#10003;</span>`
  const features = (mail.features ?? [])
    .map(
      (text) =>
        `<tr><td width="24" valign="top" style="padding:2px 0">${check}</td><td class="fg" style="padding:2px 0;color:${TEXT}">${escape(text)}</td></tr>`
    )
    .join('')
  const steps = (mail.steps ?? [])
    .map(
      (
        step,
        i
      ) => `<tr><td style="padding:0 0 12px"><table role="presentation" class="soft" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};border:1px solid ${SOFT_LINE};border-radius:14px"><tr>
<td width="44" valign="top" style="padding:14px 0 14px 16px"><div class="num" style="width:28px;height:28px;line-height:28px;border-radius:999px;background:${STRONG};color:#ffffff;text-align:center;font-weight:900;font-size:14px">${i + 1}</div></td>
<td style="padding:14px 16px 14px 0"><p class="fg" style="margin:0 0 2px;font-weight:800;font-size:16px;color:${TEXT}">${escape(step.title)}</p><p class="muted" style="margin:0 0 10px;font-size:14px;color:${MUTED}">${escape(step.text)}</p>${button(step.link, false)}</td>
</tr></table></td></tr>`
    )
    .join('')
  return `<!doctype html><html lang="${mail.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escape(mail.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#0b1633 !important }
  .card { background:#111a30 !important; border-color:#25365e !important }
  .bar { background:#172a52 !important; border-color:#25365e !important }
  .fg { color:#e6eeff !important }
  .muted { color:#a3b4d3 !important }
  .acc { color:#8cc2ff !important }
  .soft { background:#1b2a4f !important; border-color:#2f4677 !important; color:#e6eeff !important }
  .num { background:#8cc2ff !important; color:#111a30 !important }
  .ring { border-color:#111a30 !important }
  .line { border-color:#25365e !important }
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:#eaf4ff">
<div style="display:none;max-height:0;overflow:hidden">${escape(mail.preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4ff"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${TEXT}">
<tr><td class="bar" style="padding:12px 18px;background:#e6f4ff;border-bottom:1px solid ${LINE};border-radius:16px 16px 0 0;font-size:13px"><b class="fg" style="font-size:16px;color:${TEXT}"><span style="color:#2f9a3c">&#9679;</span>&nbsp;Palique</b><span class="muted" style="float:right;padding-top:2px;color:${MUTED}">${escape(mail.window)}</span></td></tr>
<tr><td style="padding:24px 30px 6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr><td>${picture}</td><td class="muted" style="padding-left:12px;font-size:14px;color:${MUTED}">${_('{name} dice:', { name: `<b class="acc" style="color:${STRONG}">${escape(sender)}</b>` })}</td></tr></table>
<div class="soft fg" style="display:inline-block;margin:0 0 22px;padding:12px 16px;background:${SOFT};border:1px solid ${SOFT_LINE};border-radius:18px 18px 18px 6px;font-size:16px;font-weight:700;color:${TEXT}">${escape(mail.bubble)}</div>
<h1 class="fg" style="margin:0 0 6px;font-size:21px;font-weight:900;line-height:1.25;color:${TEXT}">${escape(mail.heading)}</h1>
<p class="muted" style="margin:0 0 14px;color:${MUTED}">${escape(mail.intro)}</p>
${features ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px">${features}</table>` : ''}
${steps ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px">${steps}</table>` : ''}
${mail.link ? `<div style="margin:4px 0 18px">${button(mail.link, true)}</div>` : ''}
${mail.note ? `<p class="muted" style="margin:0 0 18px;font-size:13px;color:${MUTED}">${escape(mail.note)}</p>` : ''}
</td></tr>
<tr><td class="muted line" style="padding:14px 30px 20px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED}">${escape(mail.footer)}${mail.footerLink ? ` <a class="acc" href="${escape(mail.footerLink.href)}" style="color:${STRONG}">${escape(mail.footerLink.label)}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`
}

// The same email as plain text, for clients that don't show HTML.
function text(mail: Mail): string {
  const _ = translator(mail.lang)
  return [
    `${_('{name} dice:', { name: mail.sender ?? 'Palique' })} ${mail.bubble}`,
    mail.heading,
    mail.intro,
    ...(mail.features?.length ? [mail.features.map((f) => `- ${f}`).join('\n')] : []),
    ...(mail.steps ?? []).map(
      (step, i) => `${i + 1}. ${step.title}: ${step.text}\n${step.link.label}: ${step.link.href}`
    ),
    ...(mail.link ? [`${mail.link.label}: ${mail.link.href}`] : []),
    ...(mail.note ? [mail.note] : []),
    '--',
    mail.footerLink ? `${mail.footer} ${mail.footerLink.href}` : mail.footer
  ].join('\n\n')
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

  return (mail: Mail): Promise<unknown> =>
    transport.sendMail({
      from: options.from,
      replyTo: options.replyTo,
      to: mail.to,
      subject: mail.subject,
      text: text(mail),
      html: html(mail)
    })
}
