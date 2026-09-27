const nodemailer = require('nodemailer')

const FROM = process.env.MAIL_FROM || 'ShopZinc <no-reply@shopzinc.local>'

// Built lazily so the module can be required with no SMTP config at all.
let transport
function getTransport() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null
    if (!transport) {
        transport = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
    }
    return transport
}

async function sendVerificationEmail(to, link) {
    const t = getTransport()

    // No SMTP configured: print the link so local dev can verify by hand.
    if (!t) {
        console.log(`\n[mailer] SMTP not configured. Verification link for ${to}:\n${link}\n`)
        return { sent: false }
    }

    try {
        await t.sendMail({
            from: FROM,
            to,
            subject: 'Verify your ShopZinc email',
            text: `Confirm your email to finish creating your account:\n\n${link}\n\nThis link expires in 24 hours.`,
            html: `<p>Confirm your email to finish creating your account:</p>
                   <p><a href="${link}">Verify my email</a></p>
                   <p>This link expires in 24 hours.</p>`,
        })
        return { sent: true }
    } catch (error) {
        // A failed send must not fail a signup whose account already exists.
        // The user can ask for a new link from the login screen.
        console.error('[mailer] send failed:', error.message)
        return { sent: false }
    }
}

// The name is user-typed, so escape it before it goes into the HTML body;
// otherwise a signup name could inject markup into our own email.
const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

async function sendPasswordResetEmail(to, name, link) {
    const t = getTransport()

    // No SMTP configured: print the link so local dev can reset by hand.
    if (!t) {
        console.log(`\n[mailer] SMTP not configured. Password reset link for ${to}:\n${link}\n`)
        return { sent: false }
    }

    const hello = name ? `Hi ${name},` : 'Hi,'
    try {
        await t.sendMail({
            from: FROM,
            to,
            subject: 'Reset your ShopZinc password',
            text: `${hello}\n\nSomeone asked to reset your ShopZinc password. Use this link to choose a new one:\n\n${link}\n\nThis link expires in 30 minutes. If you did not ask for this, you can ignore this email.`,
            html: `<p>${escapeHtml(hello)}</p>
                   <p>Someone asked to reset your ShopZinc password. Use this link to choose a new one:</p>
                   <p><a href="${link}">Reset my password</a></p>
                   <p>This link expires in 30 minutes. If you did not ask for this, you can ignore this email.</p>`,
        })
        return { sent: true }
    } catch (error) {
        // Same as verification: a failed send must not turn into a 500, or the
        // response would differ for real accounts (enumeration signal).
        console.error('[mailer] send failed:', error.message)
        return { sent: false }
    }
}

// Sent instead of a 409 when someone registers with an email that already has
// an account (BUG-83). The API reply stays the same as a real signup, so only
// the inbox owner learns the account exists.
async function sendAccountExistsEmail(to, name, loginUrl, resetUrl) {
    const t = getTransport()

    // No SMTP configured: print it so local dev can see what would be sent.
    if (!t) {
        console.log(`\n[mailer] SMTP not configured. Account-exists notice for ${to}:\nLog in: ${loginUrl}\nReset password: ${resetUrl}\n`)
        return { sent: false }
    }

    const hello = name ? `Hi ${name},` : 'Hi,'
    try {
        await t.sendMail({
            from: FROM,
            to,
            subject: 'Someone tried to create a ShopZinc account with your email',
            text: `${hello}\n\nSomeone tried to create an account with this email. If it was you, log in or reset your password.\n\nLog in: ${loginUrl}\nReset your password: ${resetUrl}\n\nIf it was not you, you can ignore this email. Your account has not been changed.`,
            html: `<p>${escapeHtml(hello)}</p>
                   <p>Someone tried to create an account with this email. If it was you, log in or reset your password.</p>
                   <p><a href="${loginUrl}">Log in</a> &middot; <a href="${resetUrl}">Reset my password</a></p>
                   <p>If it was not you, you can ignore this email. Your account has not been changed.</p>`,
        })
        return { sent: true }
    } catch (error) {
        // Must not throw: a 500 here would make a taken email look different
        // from a new signup, which is the enumeration signal we removed.
        console.error('[mailer] send failed:', error.message)
        return { sent: false }
    }
}

// module.exports = { sendVerificationEmail, sendPasswordResetEmail }
module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendAccountExistsEmail }
