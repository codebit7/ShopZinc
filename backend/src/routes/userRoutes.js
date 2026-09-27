const express = require('express')
const router = express.Router();
const validateEmail = require('../middlewares/validateEmail.js')
const { rateLimit } = require('../middlewares/rateLimit.js')


// const { registerUser, loginUser, getUsers, verifyEmail, resendVerification, refresh, logout, me, updateMe } = require('../controllers/userControllers.js');
// forgotPassword / resetPassword added for the password reset flow.
const { registerUser, loginUser, getUsers, verifyEmail, resendVerification, forgotPassword, resetPassword, refresh, logout, me, updateMe } = require('../controllers/userControllers.js');


const verifyToken = require('../middlewares/verifyToken.js');
const verifyRole = require('../middlewares/verifyRole.js');


// Why: without attempt limits, login and the reset flow could be brute-forced (BUG-35).
// All limits live here so they are easy to tune in one place.
const MIN = 60 * 1000
const LIMITS = {
    loginPerIp:     { windowMs: 15 * MIN, max: 20 },
    loginPerEmail:  { windowMs: 15 * MIN, max: 8 },
    registerPerIp:  { windowMs: 60 * MIN, max: 10 },
    resendPerIp:    { windowMs: 15 * MIN, max: 5 },
    forgotPerIp:    { windowMs: 15 * MIN, max: 5 },
    resetPerIp:     { windowMs: 15 * MIN, max: 10 },
    refreshPerIp:   { windowMs: 15 * MIN, max: 60 },
}

// Per-email login limit too: per-IP alone lets many IPs hammer one account.
// Normalised so "Foo@x.com" and " foo@x.com" share one bucket.
const byEmail = (req) => String(req.body?.email || '').trim().toLowerCase()

const loginIpLimit     = rateLimit(LIMITS.loginPerIp)
const loginEmailLimit  = rateLimit({ ...LIMITS.loginPerEmail, keyFn: byEmail })
const registerLimit    = rateLimit(LIMITS.registerPerIp)
const resendLimit      = rateLimit(LIMITS.resendPerIp)
const forgotLimit      = rateLimit(LIMITS.forgotPerIp)
const resetLimit       = rateLimit(LIMITS.resetPerIp)
const refreshLimit     = rateLimit(LIMITS.refreshPerIp)


// router.route("/register").post(validateEmail, registerUser)
router.route("/register").post(registerLimit, validateEmail, registerUser)
// router.route("/login").post(loginUser)
router.route("/login").post(loginIpLimit, loginEmailLimit, loginUser)
router.get("/verify/:token", verifyEmail)
// router.post("/resend-verification", resendVerification)
router.post("/resend-verification", resendLimit, resendVerification)
// Public on purpose: the user is logged out because they forgot the password.
// router.post("/forgot-password", forgotPassword)
// router.post("/reset-password", resetPassword)
router.post("/forgot-password", forgotLimit, forgotPassword)
router.post("/reset-password", resetLimit, resetPassword)
// router.post("/refresh", refresh)
router.post("/refresh", refreshLimit, refresh)
router.post("/logout", logout)
router.get("/me", verifyToken, me)
// Profile page edits (name, addresses). The controller whitelists fields.
router.put("/me", verifyToken, updateMe)
router.get("/", verifyToken, verifyRole(['admin']), getUsers)




module.exports = router
