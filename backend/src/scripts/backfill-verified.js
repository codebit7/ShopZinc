// Pre-existing users have no isVerified field, which reads falsy, which would
// lock every current account out — including the owner's admin account.
// Dry run by default. Pass --apply to actually write.
require('dotenv').config()
const mongoose = require('mongoose')
const connectDb = require('../DB/dbConnection.js')
const User = require('../models/userModel.js')

const apply = process.argv.includes('--apply')

;(async () => {
    await connectDb()
    try {
        const filter = { isVerified: { $exists: false } }
        const total = await User.countDocuments()
        const missing = await User.countDocuments(filter)

        console.log(`users total:                 ${total}`)
        console.log(`users missing isVerified:    ${missing}`)
        console.log(`would set isVerified = true on ${missing} document(s)`)

        if (!apply) {
            console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
            return
        }
        const result = await User.updateMany(filter, { $set: { isVerified: true } })
        console.log(`\nAPPLIED — modified ${result.modifiedCount} document(s).`)
    } finally {
        await mongoose.connection.close()
    }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
