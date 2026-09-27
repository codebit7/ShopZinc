const assert = require('assert')
require('dotenv').config()
process.env.SECRET_KEY = process.env.SECRET_KEY || 'check-only'

const jwt = require('jsonwebtoken')
const verifyToken = require('../middlewares/verifyToken.js')

function run(req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: null,
            status(c) { this.statusCode = c; return this },
            json(body) { resolve({ status: this.statusCode, body, nexted: false }) },
        }
        verifyToken(req, res, () => resolve({ status: null, body: null, nexted: true }))
    })
}

;(async () => {
    const good = jwt.sign({ id: 'abc', role: 'admin' }, process.env.SECRET_KEY)

    let r = await run({ cookies: { accessToken: good }, header: () => undefined })
    assert.ok(r.nexted, 'a valid cookie token must call next()')

    r = await run({ cookies: {}, header: () => `Bearer ${good}` })
    assert.ok(r.nexted, 'the Bearer header must still work as a fallback')

    r = await run({ cookies: {}, header: () => undefined })
    assert.strictEqual(r.status, 401, 'a missing token must be 401, not 400')

    r = await run({ cookies: { accessToken: 'garbage' }, header: () => undefined })
    assert.strictEqual(r.status, 401, 'an invalid token must be 401, not 400')

    console.log('OK verifyToken cookie + bearer + 401')
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
