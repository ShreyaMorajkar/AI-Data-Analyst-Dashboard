const nodemailer = require('nodemailer')

function hasFrontendVerifyUrl() {
  return Boolean(process.env.FRONTEND_VERIFY_URL?.trim())
}

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function hasRealSmtp() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  )
}

/**
 * True when we can send (or simulate) a verification email:
 * - Production: real SMTP + FRONTEND_VERIFY_URL
 * - Non-production: FRONTEND_VERIFY_URL only (uses Ethereal test inbox)
 */
function isEmailVerificationConfigured() {
  if (!hasFrontendVerifyUrl()) {
    return false
  }
  if (hasRealSmtp()) {
    return true
  }
  if (!isProduction()) {
    return true
  }
  return false
}

function createProductionTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

let etherealBundlePromise = null

async function getEtherealBundle() {
  if (!etherealBundlePromise) {
    etherealBundlePromise = (async () => {
      const testAccount = await nodemailer.createTestAccount()
      const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      })
      return { transporter, testAccount }
    })()
  }
  return etherealBundlePromise
}

async function sendVerificationEmail({ toEmail, verificationToken }) {
  if (!hasFrontendVerifyUrl()) {
    throw new Error('FRONTEND_VERIFY_URL is required for email verification links.')
  }

  const verificationUrl = `${process.env.FRONTEND_VERIFY_URL.replace(/\/$/, '')}?verifyToken=${encodeURIComponent(verificationToken)}`

  let transporter
  let fromEmail

  if (hasRealSmtp()) {
    transporter = createProductionTransporter()
    fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER
  } else if (!isProduction()) {
    const { transporter: etherealTransport, testAccount } = await getEtherealBundle()
    transporter = etherealTransport
    fromEmail = `"AI Dashboard" <${testAccount.user}>`
    console.log('[mail] Dev mode: using Ethereal test SMTP. Mailbox user:', testAccount.user)
  } else {
    throw new Error(
      'Production requires SMTP. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and FRONTEND_VERIFY_URL.',
    )
  }

  const info = await transporter.sendMail({
    from: fromEmail,
    to: toEmail,
    subject: 'Verify your AI Dashboard account',
    text: `Welcome! Verify your account by opening this link: ${verificationUrl}`,
    html: `<p>Welcome!</p><p>Verify your account by clicking <a href="${verificationUrl}">this link</a>.</p><p>If you did not create this account, you can ignore this email.</p>`,
  })

  let previewUrl = null
  if (!hasRealSmtp() && !isProduction() && info) {
    previewUrl = nodemailer.getTestMessageUrl(info) || null
    if (previewUrl) console.log('[mail] Open this URL to read the verification email in Ethereal:', previewUrl)
  }

  return {
    verificationUrl,
    previewUrl,
    mode: hasRealSmtp() ? 'smtp' : isProduction() ? 'off' : 'ethereal',
  }
}

function getEmailVerificationStatus() {
  const ready = isEmailVerificationConfigured()
  let mode = 'off'
  if (ready) {
    mode = hasRealSmtp() ? 'smtp' : 'ethereal'
  }
  return { ready, mode }
}

module.exports = {
  isEmailVerificationConfigured,
  sendVerificationEmail,
  getEmailVerificationStatus,
}
