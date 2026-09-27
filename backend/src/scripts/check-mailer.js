const assert = require('assert')
delete process.env.SMTP_USER
delete process.env.SMTP_PASS

const { sendVerificationEmail } = require('../utils/mailer.js')

;(async () => {
    const res = await sendVerificationEmail('nobody@example.com', 'http://x/verify/abc')
    assert.strictEqual(res.sent, false, 'with no SMTP config it must not claim to have sent')
    console.log('OK mailer degrades to console when SMTP is unset')
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
