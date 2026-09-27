// Asserts the refresh-token lifecycle: issue, rotate, replay-detection, revoke.
// Needs Mongo. Creates and removes rows for one throwaway user id only.
const assert = require('assert')
require('dotenv').config()

const mongoose = require('mongoose')
const connectDb = require('../DB/dbConnection.js')
const RefreshToken = require('../models/refreshTokenModel.js')
const t = require('../utils/tokens.js')

;(async () => {
  await connectDb()
  const userId = new mongoose.Types.ObjectId()

  try {
    // issue
    const first = await t.issueRefreshToken(userId)
    assert.ok(first.raw && first.raw.length === 96, 'raw token should be 48 bytes of hex')
    assert.ok(first.expiresAt > new Date(), 'expiry should be in the future')

    const stored = await RefreshToken.findOne({ user: userId })
    assert.ok(stored, 'a row should exist')
    assert.notStrictEqual(stored.tokenHash, first.raw, 'the RAW token must never be stored')

    // rotate
    const second = await t.rotateRefreshToken(first.raw)
    assert.notStrictEqual(second.raw, first.raw, 'rotation must return a different token')
    assert.strictEqual(String(second.userId), String(userId), 'rotation should carry the user id')
    assert.strictEqual(
      await RefreshToken.countDocuments({ user: userId, revokedAt: null }), 1,
      'rotation must leave exactly one live token'
    )

    // replaying the rotated token = theft -> revoke everything
    await assert.rejects(
      () => t.rotateRefreshToken(first.raw),
      (e) => e.code === 'REUSED',
      'replaying a rotated token must raise REUSED'
    )
    const live = await RefreshToken.countDocuments({ user: userId, revokedAt: null })
    assert.strictEqual(live, 0, 'reuse must revoke every token for that user')

    // unknown token
    await assert.rejects(
      () => t.rotateRefreshToken('deadbeef'),
      (e) => e.code === 'NOT_FOUND',
      'an unknown token must raise NOT_FOUND'
    )

    // concurrency: two callers racing the same raw token must not both win --
    // that would mint two live tokens from one and silently defeat replay
    // detection. Only assert the winner count; the loser's code can be
    // REUSED or NOT_FOUND depending on timing.
    const raceToken = await t.issueRefreshToken(userId)
    const results = await Promise.allSettled([
      t.rotateRefreshToken(raceToken.raw),
      t.rotateRefreshToken(raceToken.raw),
    ])
    const won = results.filter((r) => r.status === 'fulfilled')
    assert.strictEqual(won.length, 1, 'concurrent rotation of one token must succeed exactly once')

    // access token round trip
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(
      t.signAccessToken({ _id: userId, role: 'user' }),
      process.env.SECRET_KEY
    )
    assert.strictEqual(decoded.role, 'user')
    assert.strictEqual(decoded.id, String(userId))

    // cookie path parity: a clear with a different path than the set leaves
    // the browser holding the stale cookie forever.
    const calls = [], cleared = []
    const res = { cookie: (n, v, o) => calls.push({ n, o }), clearCookie: (n, o) => cleared.push({ n, o }) }
    t.setAuthCookies(res, 'jwt', 'raw', new Date(Date.now() + 1000))
    t.clearAuthCookies(res)
    for (const name of ['accessToken', 'refreshToken']) {
      const set = calls.find((c) => c.n === name).o
      const clr = cleared.find((c) => c.n === name).o
      assert.strictEqual(set.path, clr.path, `${name} cookie path must match between set and clear`)
      assert.strictEqual(set.httpOnly, true, `${name} cookie must be httpOnly`)
      assert.strictEqual(set.sameSite, 'lax', `${name} cookie must be sameSite lax`)
    }
    assert.strictEqual(calls.find((c) => c.n === 'accessToken').o.path, '/', 'accessToken cookie path must be /')
    assert.strictEqual(calls.find((c) => c.n === 'refreshToken').o.path, '/api/v1/users', 'refreshToken cookie path must be /api/v1/users')

    // JWT expiry and cookie maxAge must agree: both derive from ACCESS_TOKEN_MINUTES
    const accessMaxAge = calls.find((c) => c.n === 'accessToken').o.maxAge
    assert.strictEqual(accessMaxAge, (decoded.exp - decoded.iat) * 1000, 'accessToken cookie maxAge must equal (exp-iat)*1000')

    console.log('OK token lifecycle')
  } finally {
    await RefreshToken.deleteMany({ user: userId })
    await mongoose.connection.close()
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
