// Outgoing email over SMTP (Mailpit in development, Brevo in production).
import nodemailer from 'nodemailer'

const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export type Mail = {
  to: string
  subject: string
  paragraphs: string[]
  link?: { href: string; label: string }
  footer?: string
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

  // Plain text plus a simple HTML version in Palique's colors.
  return (mail: Mail): Promise<unknown> => {
    const text = [
      ...mail.paragraphs,
      ...(mail.link ? [`${mail.link.label}: ${mail.link.href}`] : []),
      ...(mail.footer ? ['--', mail.footer] : [])
    ].join('\n\n')
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#eaf0fb;font-family:'Noto Sans',Verdana,sans-serif;color:#1b2a4a">
<div style="max-width:480px;margin:24px auto;background:#fff;border:1px solid #c6d5ee;border-radius:8px;overflow:hidden">
<div style="padding:14px 20px;background:linear-gradient(#e3edfd,#c3d7f7);color:#0b3c9e;font-size:22px;font-weight:bold;font-style:italic">Palique</div>
<div style="padding:16px 20px;font-size:14px;line-height:1.5">
${mail.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}
${mail.link ? `<p><a href="${escape(mail.link.href)}" style="display:inline-block;padding:6px 18px;border:1px solid #6d93d1;border-radius:12px;background:#dbe8fb;color:#0b3c9e;text-decoration:none;font-weight:bold">${escape(mail.link.label)}</a></p>` : ''}
</div>
${mail.footer ? `<div style="padding:10px 20px;font-size:12px;color:#5b6f94;border-top:1px solid #c6d5ee">${escape(mail.footer)}</div>` : ''}
</div></body></html>`
    return transport.sendMail({
      from: options.from,
      replyTo: options.replyTo,
      to: mail.to,
      subject: mail.subject,
      text,
      html
    })
  }
}

export type SendMail = ReturnType<typeof mailer>
