const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const RefreshToken = require('../models/refreshTokenModel.js')

const ACCESS_MINUTES = Number(process.env.ACCESS_TOKEN_MINUTES || 15)
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7)
const DAY_MS = 24 * 60 * 60 * 1000

// One constant per cookie for both set and clear. Clearing a cookie with a
// different path silently leaves the old cookie in the browser.
const ACCESS_PATH = '/'
const REFRESH_PATH = '/api/v1/users'

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

class TokenError extends Error {
    constructor(code) { super(code); this.code = code }
}

function signAccessToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role },
        process.env.SECRET_KEY,
        { expiresIn: `${ACCESS_MINUTES}m` }
    )
}

async function issueRefreshToken(userId) {
    const raw = crypto.randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * DAY_MS)
    await RefreshToken.create({ user: userId, tokenHash: sha256(raw), expiresAt })
    return { raw, expiresAt }
}

async function rotateRefreshToken(raw) {
    const tokenHash = sha256(raw)

    // Claim the row by revoking it ATOMICALLY. Whoever wins this update owns the
    // rotation; a concurrent caller gets null and is treated as a replay. A
    // findOne-then-save sequence would let two callers both mint live tokens and
    // would silently lose replay detection.
    const claimed = await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { revokedAt: new Date() } },
        { new: false }
    )

    if (!claimed) {
        // Disambiguate why the claim failed with one follow-up read.
        const row = await RefreshToken.findOne({ tokenHash })
        if (!row) throw new TokenError('NOT_FOUND')
        if (row.revokedAt) {
            // Already rotated away: someone is replaying an old token. Assume
            // theft and end every session for this user.
            await revokeAllForUser(row.user)
            throw new TokenError('REUSED')
        }
        throw new TokenError('EXPIRED')
    }

    const next = await issueRefreshToken(claimed.user)
    await RefreshToken.updateOne(
        { _id: claimed._id },
        { $set: { replacedByHash: sha256(next.raw) } }
    )

    return { raw: next.raw, expiresAt: next.expiresAt, userId: claimed.user }
}

async function revokeRefreshToken(raw) {
    await RefreshToken.updateOne(
        { tokenHash: sha256(raw), revokedAt: null },
        { $set: { revokedAt: new Date() } }
    )
}

async function revokeAllForUser(userId) {
    await RefreshToken.updateMany(
        { user: userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    )
}

const cookieBase = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
})

function setAuthCookies(res, accessJwt, refreshRaw, refreshExpiresAt) {
    res.cookie('accessToken', accessJwt, {
        ...cookieBase(), path: ACCESS_PATH, maxAge: ACCESS_MINUTES * 60 * 1000,
    })
    res.cookie('refreshToken', refreshRaw, {
        ...cookieBase(), path: REFRESH_PATH, expires: refreshExpiresAt,
    })
}

function clearAuthCookies(res) {
    res.clearCookie('accessToken', { ...cookieBase(), path: ACCESS_PATH })
    res.clearCookie('refreshToken', { ...cookieBase(), path: REFRESH_PATH })
}

module.exports = {
    TokenError,
    signAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
    setAuthCookies,
    clearAuthCookies,
    REFRESH_PATH,
}
