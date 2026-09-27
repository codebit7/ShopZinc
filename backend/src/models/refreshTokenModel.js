const mongoose = require('mongoose')

const refreshTokenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Only the SHA-256 hash is stored, so a database dump yields no usable tokens.
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    // Rotated rows are kept (not deleted) so a replay can be detected.
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
}, { timestamps: true })

// Mongo removes rows once expiresAt passes: no cron, no unbounded growth.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema)
module.exports = RefreshToken
