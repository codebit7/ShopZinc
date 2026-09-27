// One password rule for every place a NEW password is chosen (register and
// reset). Login does NOT use it: accounts made under the old 6-char rule must
// still be able to log in with the password they already have. See BUG-35.
const PASSWORD_MESSAGE = "Password must be at least 8 characters and include a letter and a number."
const MIN_LENGTH = 8
// Upper bound because bcrypt silently ignores bytes after 72, and a huge body
// would make hashing a cheap way to burn CPU.
const MAX_LENGTH = 128

// Returns null when the password is acceptable, otherwise the message to show.
// A non-string (e.g. {$gt:""}) must be rejected before bcrypt ever sees it.
function validatePassword(pw) {
    if (typeof pw !== 'string') return PASSWORD_MESSAGE
    if (pw.length < MIN_LENGTH || pw.length > MAX_LENGTH) return PASSWORD_MESSAGE
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return PASSWORD_MESSAGE
    return null
}

module.exports = { validatePassword, PASSWORD_MESSAGE, MIN_LENGTH, MAX_LENGTH }
