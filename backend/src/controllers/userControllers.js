const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const User = require('../models/userModel.js')
// const { sendVerificationEmail } = require('../utils/mailer.js')
// Password reset needs its own email template.
// const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer.js')
// sendAccountExistsEmail replaces the 409 on a taken email (BUG-83).
const { sendVerificationEmail, sendPasswordResetEmail, sendAccountExistsEmail } = require('../utils/mailer.js')
// One password rule for register + reset (BUG-35). Not used by login.
const { validatePassword } = require('../utils/passwordPolicy.js')
const {
    signAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    // Needed by resetPassword: a new password must end every old session.
    revokeAllForUser,
    setAuthCookies,
    clearAuthCookies,
} = require('../utils/tokens.js')

const DAY_MS = 24 * 60 * 60 * 1000
const VERIFY_TTL_MS = DAY_MS
const RESEND_COOLDOWN_MS = 60 * 1000
// Short on purpose: a reset link is a full account takeover if it leaks.
const RESET_TTL_MS = 30 * 60 * 1000
const RESET_COOLDOWN_MS = 60 * 1000
// Same minimum as signup (registerUser + the SignUp form). Weak, see BUG-35.
// const MIN_PASSWORD = 6
// Replaced by utils/passwordPolicy.js (BUG-35 fixed): 8-128 chars, letter + number.
// At most one "account already exists" email per address per 10 minutes, so
// register can't be used to flood someone's inbox (BUG-83).
const EXISTS_NOTICE_COOLDOWN_MS = 10 * 60 * 1000

// The schema lowercases on save, but NOT inside query filters, so every
// findOne({ email }) must use this first or "Foo@x.com" misses "foo@x.com"
// (BUG-86). Returns null for a non-string, so callers keep their old
// "non-string email" handling (it would otherwise reach Mongo as an operator).
function normalizeEmail(email) {
    if (typeof email !== 'string') return null
    return email.trim().toLowerCase()
}

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

// The one shape the frontend ever sees for a user. Login and /me both use it,
// so the redux slice has a single code path.
// const safeUser = (u) => ({
//     id: u._id,
//     name: u.name,
//     email: u.email,
//     role: u.role,
//     isVerified: u.isVerified,
// })
// Extended for the profile page: it needs addresses, the order count and the
// join date. Still an explicit allowlist, so no hash or verify token can leak.
const safeUser = (u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    isVerified: u.isVerified,
    addresses: (u.addresses || []).map((a) => ({
        _id: a._id,
        street: a.street || '',
        city: a.city || '',
        state: a.state || '',
        postalCode: a.postalCode || '',
        country: a.country || '',
        isDefault: !!a.isDefault,
    })),
    orderHistory: u.orderHistory || [],
    createdAt: u.createdAt,
})

const MAX_NAME = 60
const MAX_ADDRESSES = 5
const ADDRESS_FIELDS = ['street', 'city', 'state', 'postalCode', 'country']
const REQUIRED_ADDRESS = { street: 'Street', city: 'City', country: 'Country' }

// Pure so it can be checked without a DB (see the scratch test). Only name and
// addresses are ever read: role, email, password, isVerified etc. in the body
// are ignored, otherwise a user could promote or re-verify themselves.
function normalizeProfileUpdate(body) {
    const update = {}
    if (!body || typeof body !== 'object') return { error: 'Nothing to update' }

    if (body.name !== undefined) {
        if (typeof body.name !== 'string') return { error: 'Name must be text' }
        const name = body.name.trim()
        if (name.length < 1 || name.length > MAX_NAME) {
            return { error: `Name must be 1-${MAX_NAME} characters` }
        }
        update.name = name
    }

    if (body.addresses !== undefined) {
        if (!Array.isArray(body.addresses)) return { error: 'Addresses must be a list' }
        if (body.addresses.length > MAX_ADDRESSES) {
            return { error: `You can save at most ${MAX_ADDRESSES} addresses` }
        }
        const addresses = []
        for (let i = 0; i < body.addresses.length; i++) {
            const raw = body.addresses[i]
            if (!raw || typeof raw !== 'object') return { error: `Address ${i + 1} is invalid` }
            const clean = {}
            for (const f of ADDRESS_FIELDS) {
                const v = raw[f]
                if (v !== undefined && v !== null && typeof v !== 'string') {
                    return { error: `Address ${i + 1}: ${f} must be text` }
                }
                clean[f] = (v || '').trim()
            }
            for (const [f, label] of Object.entries(REQUIRED_ADDRESS)) {
                if (!clean[f]) return { error: `Address ${i + 1}: ${label} is required` }
            }
            clean.isDefault = raw.isDefault === true
            addresses.push(clean)
        }
        const defaults = addresses.filter((a) => a.isDefault).length
        if (defaults > 1) return { error: 'Only one address can be the default' }
        // A list with no default would leave checkout guessing which one to use.
        if (defaults === 0 && addresses.length > 0) addresses[0].isDefault = true
        update.addresses = addresses
    }

    if (Object.keys(update).length === 0) return { error: 'Nothing to update' }
    return { update }
}

// ---- Password reset helpers (pure, exported for the check script) ----

// Only this hash is stored. Same scheme as the verify token.
const hashResetToken = (raw) => sha256(raw)

// Returns an error message, or null when the password is acceptable. A
// non-string (e.g. {$gt:""}) must be rejected before bcrypt ever sees it.
// function validateNewPassword(password) {
//     if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
//         return `Password must be at least ${MIN_PASSWORD} characters`
//     }
//     return null
// }
// Kept as a name (it is exported) but now just the shared policy, so reset
// and register can never drift apart again (BUG-35).
function validateNewPassword(password) {
    return validatePassword(password)
}

// A token is usable only while a hash is stored AND its expiry is in the future.
function isResetTokenUsable(user, now = new Date()) {
    return !!(user && user.resetTokenHash && user.resetTokenExpires
        && new Date(user.resetTokenExpires).getTime() > new Date(now).getTime())
}

// True while the last reset email is under 60s old.
function isResetInCooldown(user, now = new Date()) {
    if (!user || !user.resetRequestedAt) return false
    return new Date(now).getTime() - new Date(user.resetRequestedAt).getTime() < RESET_COOLDOWN_MS
}

// The link goes through the frontend origin so the Vite /api proxy keeps
// everything same-origin, which is what makes sameSite=lax cookies work.
const verifyLink = (raw) => `${process.env.APP_URL}/api/v1/users/verify/${raw}`
// Unlike verifyLink this is a FRONTEND page (a form), not an API redirect:
// the user must type a new password before anything is sent to the server.
const resetLink = (raw) => `${process.env.APP_URL}/auth/reset-password/${raw}`
// Frontend pages linked from the "account already exists" email.
const loginPageLink = () => `${process.env.APP_URL}/auth/login`
const forgotPageLink = () => `${process.env.APP_URL}/auth/forgot-password`

// Someone registered with an email that already has an account. Tell the
// owner instead of telling the caller (BUG-83). The only write is the throttle
// stamp, done as one atomic conditional update so two parallel requests can't
// both pass the 10-minute check. timestamps:false keeps updatedAt untouched.
async function notifyAccountExists(user) {
    const cutoff = new Date(Date.now() - EXISTS_NOTICE_COOLDOWN_MS)
    const claim = await User.updateOne(
        {
            _id: user._id,
            $or: [{ existsNoticeAt: { $exists: false } }, { existsNoticeAt: null }, { existsNoticeAt: { $lte: cutoff } }],
        },
        { $set: { existsNoticeAt: new Date() } },
        { timestamps: false }
    )
    // Inside the cooldown: skip silently, the caller still gets the normal 201.
    if (claim.modifiedCount !== 1) return
    await sendAccountExistsEmail(user.email, user.name, loginPageLink(), forgotPageLink())
}

async function issueVerifyToken(user) {
    const raw = crypto.randomBytes(32).toString('hex')
    user.verifyTokenHash = sha256(raw)
    user.verifyTokenExpires = new Date(Date.now() + VERIFY_TTL_MS)
    await user.save()
    return raw
}

async function issueResetToken(user) {
    const raw = crypto.randomBytes(32).toString('hex')
    user.resetTokenHash = hashResetToken(raw)
    user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS)
    user.resetRequestedAt = new Date()
    await user.save()
    return raw
}

// One constant so a taken email and a new signup can never reply differently.
const REGISTER_OK = { message: "Account created. Check your email to verify it." }

const registerUser = async (req, res) => {
    try {
        // role is deliberately NOT read from the body. It used to be, which
        // let anyone self-register as an admin.
        // const { name, email, password } = req.body
        const { name, password } = req.body
        // Trimmed + lowercased before the lookup and the save (BUG-86).
        const email = normalizeEmail(req.body.email)

        // if (!name?.trim() || !email?.trim() || !password) {
        if (!name?.trim() || !email || !password) {
            return res.status(400).json({ message: "Please fill in all fields" })
        }
        // if (password.length < 6) {
        //     return res.status(400).json({ message: "Password must be at least 6 characters" })
        // }
        // Shared policy (BUG-35): 8-128 chars, at least one letter and one number.
        const pwError = validatePassword(password)
        if (pwError) return res.status(400).json({ message: pwError })

        const existingUser = await User.findOne({ email })
        // if (existingUser) {
        //     return res.status(409).json({ message: 'User already exists' })
        // }
        // A 409 told anyone which emails are registered (BUG-83). Now a taken
        // email gets the exact same 201 as a new signup; only the inbox owner
        // hears about it. The existing account is not changed.
        if (existingUser) {
            await notifyAccountExists(existingUser)
            return res.status(201).json(REGISTER_OK)
        }

        const user = await User.create({
            // Why: lowercasing turned "John Smith" into "john smith" everywhere the name shows.
            // name: name.toLowerCase(),
            name: name.trim(),
            email,
            password: await bcrypt.hash(password, 10),
            role: 'user',
            isVerified: false,
        })

        await sendVerificationEmail(email, verifyLink(await issueVerifyToken(user)))

        // No user object and no password hash in the response.
        // res.status(201).json({ message: "Account created. Check your email to verify it." })
        res.status(201).json(REGISTER_OK)
    } catch (error) {
        // Two signups for the same email racing each other: the loser hits the
        // unique index. A 500 here would leak that the email exists (BUG-83).
        if (error && error.code === 11000) return res.status(201).json(REGISTER_OK)
        res.status(500).json({ message: error.message })
    }
}

async function loginUser(req, res) {
    try {
        const { email, password } = req.body
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ message: "Please fill in all fields" })
        }

        // const user = await User.findOne({ email })
        // Normalised so "Foo@X.com " finds "foo@x.com" (BUG-86). Type was
        // already checked above, so this never returns null here.
        const user = await User.findOne({ email: normalizeEmail(email) })
        // Same 401 for an unknown email and a wrong password, so this endpoint
        // cannot be used to discover which emails are registered.
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" })
        }

        // Strict true: pre-backfill users have no field at all, not false.
        if (user.isVerified !== true) {
            return res.status(403).json({
                message: "Please verify your email before logging in",
                code: "EMAIL_NOT_VERIFIED",
            })
        }

        const { raw, expiresAt } = await issueRefreshToken(user._id)
        setAuthCookies(res, signAccessToken(user), raw, expiresAt)

        // No token in the body any more — it lives in httpOnly cookies.
        res.status(200).json({ user: safeUser(user) })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

// Clicked from an email client, so this redirects rather than returning JSON.
const verifyEmail = async (req, res) => {
    const back = (qs) => res.redirect(`${process.env.APP_URL}/auth/login?${qs}`)
    try {
        const user = await User.findOne({ verifyTokenHash: sha256(req.params.token) })
        if (!user) return back('verified=0&reason=invalid')
        if (!user.verifyTokenExpires || user.verifyTokenExpires <= new Date()) {
            return back('verified=0&reason=expired')
        }

        user.isVerified = true
        user.verifyTokenHash = undefined
        user.verifyTokenExpires = undefined
        await user.save()

        back('verified=1')
    } catch (error) {
        back('verified=0&reason=error')
    }
}

const resendVerification = async (req, res) => {
    // Identical reply whether or not the account exists, so this endpoint
    // cannot be used to discover which emails are registered.
    const generic = { message: "If that account needs verification, a new link has been sent." }
    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ message: "Email is required" })

        // A non-string email would reach Mongo as an operator object (e.g.
        // {$regex:"^victim@"}) and match a real user, letting an anonymous caller
        // rotate that person's verify token and invalidate the link in their inbox.
        // Same generic reply, so this adds no enumeration signal.
        if (typeof email !== 'string') return res.status(200).json(generic)

        // const user = await User.findOne({ email })
        // Normalised before the lookup (BUG-86).
        const user = await User.findOne({ email: normalizeEmail(email) })
        if (!user || user.isVerified) return res.status(200).json(generic)

        // Cooldown derived from the existing expiry instead of a new field or
        // a rate-limit dependency: a token issued under 60s ago still has
        // more than (24h - 60s) left to run.
        const remaining = user.verifyTokenExpires
            ? user.verifyTokenExpires.getTime() - Date.now()
            : 0
        // if (remaining > VERIFY_TTL_MS - RESEND_COOLDOWN_MS) {
        //     return res.status(429).json({ message: "Please wait before requesting another email" })
        // }
        // A 429 only ever happened for a real unverified account, so it told the
        // caller the account exists (BUG-83). Same generic 200, no new email.
        // Flooding is handled by the per-IP rate limiter on this route.
        if (remaining > VERIFY_TTL_MS - RESEND_COOLDOWN_MS) {
            return res.status(200).json(generic)
        }

        // await sendVerificationEmail(email, verifyLink(await issueVerifyToken(user)))
        // Stored (already normalised) address, not the raw body value.
        await sendVerificationEmail(user.email, verifyLink(await issueVerifyToken(user)))
        res.status(200).json(generic)
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

// Mirrors resendVerification: the same generic 200 for every case, including a
// real account inside the 60s cooldown (that used to be a 429, BUG-83).
const forgotPassword = async (req, res) => {
    const generic = { message: "If an account exists for that email, we've sent a password reset link." }
    try {
        const { email } = req.body || {}
        if (!email) return res.status(400).json({ message: "Email is required" })

        // A non-string email would reach Mongo as an operator object and could
        // match (and email a reset link for) someone else's account.
        if (typeof email !== 'string') return res.status(200).json(generic)

        // const user = await User.findOne({ email })
        // Normalised before the lookup (BUG-86).
        const user = await User.findOne({ email: normalizeEmail(email) })
        // Unknown email: no write, no email, same reply as a real account.
        if (!user) return res.status(200).json(generic)

        // if (isResetInCooldown(user)) {
        //     return res.status(429).json({ message: "Please wait a minute before requesting another link." })
        // }
        // The 429 only happened for real accounts, so it leaked which emails
        // exist (BUG-83). Same generic 200, no new email; the per-IP rate
        // limiter on this route handles flooding.
        if (isResetInCooldown(user)) return res.status(200).json(generic)

        await sendPasswordResetEmail(user.email, user.name, resetLink(await issueResetToken(user)))
        res.status(200).json(generic)
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

const resetPassword = async (req, res) => {
    const invalid = { message: "This reset link is invalid or has expired.", code: "RESET_INVALID" }
    try {
        const { token, password } = req.body || {}

        const pwError = validateNewPassword(password)
        if (pwError) return res.status(400).json({ message: pwError })

        // A non-string token would reach Mongo as an operator object.
        if (typeof token !== 'string' || !token) return res.status(400).json(invalid)

        const hash = await bcrypt.hash(password, 10)

        // One atomic find-and-update, so the same link cannot be used twice by
        // two requests racing each other (findOne-then-save could allow that).
        const user = await User.findOneAndUpdate(
            { resetTokenHash: hashResetToken(token), resetTokenExpires: { $gt: new Date() } },
            {
                $set: {
                    password: hash,
                    // The user just proved they own this inbox by opening the
                    // emailed link, which is exactly what email verification proves.
                    isVerified: true,
                },
                // Clearing the verify token too: it is pointless once verified.
                $unset: {
                    resetTokenHash: 1,
                    resetTokenExpires: 1,
                    resetRequestedAt: 1,
                    verifyTokenHash: 1,
                    verifyTokenExpires: 1,
                },
            },
            { new: true }
        )
        if (!user) return res.status(400).json(invalid)

        // Whoever had the old password may have a live session. Kill all of them.
        await revokeAllForUser(user._id)
        clearAuthCookies(res)

        res.status(200).json({ message: "Your password has been reset. You can now log in." })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

const refresh = async (req, res) => {
    const raw = req.cookies?.refreshToken
    if (!raw) {
        clearAuthCookies(res)
        return res.status(401).json({ message: "Unauthorized" })
    }
    try {
        const next = await rotateRefreshToken(raw)
        const user = await User.findById(next.userId)
        if (!user) {
            clearAuthCookies(res)
            return res.status(401).json({ message: "Unauthorized" })
        }
        setAuthCookies(res, signAccessToken(user), next.raw, next.expiresAt)
        res.status(200).json({ user: safeUser(user) })
    } catch (error) {
        clearAuthCookies(res)
        res.status(401).json({ message: "Unauthorized", code: error.code || 'INVALID_REFRESH' })
    }
}

// Revokes only this device's refresh token. revokeAllForUser is reserved for
// replay detection, not for an ordinary logout.
const logout = async (req, res) => {
    try {
        if (req.cookies?.refreshToken) await revokeRefreshToken(req.cookies.refreshToken)
    } catch (error) {
        console.error('[logout] revoke failed:', error.message)
    }
    clearAuthCookies(res)
    res.status(200).json({ message: "Logged out" })
}

// With httpOnly cookies the frontend cannot read who it is, so it asks here
// once on boot. This is what replaced the client-editable localStorage gate.
const me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password')
        if (!user) return res.status(401).json({ message: "Unauthorized" })
        res.status(200).json({ user: safeUser(user) })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

// Profile edits. Returns the same safeUser shape as /me so redux can just
// replace state.user with it.
const updateMe = async (req, res) => {
    try {
        const { error, update } = normalizeProfileUpdate(req.body)
        if (error) return res.status(400).json({ message: error })

        const user = await User.findById(req.user.id)
        if (!user) return res.status(404).json({ message: "User not found" })

        if (update.name !== undefined) user.name = update.name
        if (update.addresses !== undefined) user.addresses = update.addresses
        await user.save()

        res.status(200).json({ user: safeUser(user) })
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: error.message })
    }
}

// Admin-only at the route level now, and never returns password hashes.
async function getUsers(req, res) {
    try {
        // const users = await User.find().select('-password -verifyTokenHash -verifyTokenExpires')
        // Reset fields added: a reset hash in an admin list is one step from a takeover.
        const users = await User.find().select(
            // existsNoticeAt added: internal throttle state, not admin data.
            '-password -verifyTokenHash -verifyTokenExpires -resetTokenHash -resetTokenExpires -resetRequestedAt -existsNoticeAt'
        )
        res.status(200).json({ users })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

module.exports = {
    registerUser,
    loginUser,
    getUsers,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refresh,
    logout,
    me,
    updateMe,
    normalizeProfileUpdate,
    safeUser,
    hashResetToken,
    validateNewPassword,
    isResetTokenUsable,
    isResetInCooldown,
    normalizeEmail,
}
