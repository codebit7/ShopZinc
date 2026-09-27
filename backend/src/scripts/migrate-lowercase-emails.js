// BUG-86: emails were stored case-sensitive and untrimmed, so "Foo@x.com" and
// "foo@x.com" could be two accounts. Once the app normalises emails on the way
// in, old mixed-case rows would no longer match at login — this lowercases them.
// Dry run by default. Pass --apply to actually write. Refuses in production.
// If two accounts collapse into the same email, --apply refuses: a person has to
// decide which account to keep, a script must not pick one.
require('dotenv').config()
const mongoose = require('mongoose')
const connectDb = require('../DB/dbConnection.js')
const User = require('../models/userModel.js')

const apply = process.argv.includes('--apply')

const normalise = (email) => String(email || '').trim().toLowerCase()

// Mask so the report can be pasted anywhere without leaking addresses.
const mask = (email) => {
    const [local, domain] = String(email).split('@')
    if (!domain) return '***'
    return `${local.slice(0, 1)}***@${domain}`
}

if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run with NODE_ENV=production. Run it against a copy first.')
    process.exit(1)
}

;(async () => {
    await connectDb()
    try {
        // lean(): plain objects, and no schema setters touch the raw stored value.
        const users = await User.find({}, { email: 1 }).lean()

        // Group every account by its normalised email to find collisions.
        const groups = new Map()
        for (const u of users) {
            const key = normalise(u.email)
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(u)
        }

        const toChange = users.filter((u) => u.email !== normalise(u.email))
        const collisions = [...groups.entries()].filter(([, list]) => list.length > 1)

        console.log(`users total:                    ${users.length}`)
        console.log(`emails that would change:       ${toChange.length}`)
        console.log(`collisions (same email after):  ${collisions.length}`)

        for (const [key, list] of collisions) {
            console.log(`  ${mask(key)} <- ${list.map((u) => `${mask(u.email)} (${u._id})`).join(', ')}`)
        }

        if (!apply) {
            console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
            return
        }

        if (collisions.length > 0) {
            console.error('\nREFUSED — the accounts listed above would end up with the same email.')
            console.error('Decide by hand which account to keep (merge or delete the other), then re-run.')
            process.exitCode = 1
            return
        }

        // Straight on the collection: bypasses mongoose hooks/validators so only
        // the email field changes.
        let modified = 0
        for (const u of toChange) {
            const r = await User.collection.updateOne({ _id: u._id }, { $set: { email: normalise(u.email) } })
            modified += r.modifiedCount
        }
        console.log(`\nAPPLIED — modified ${modified} document(s).`)
    } finally {
        await mongoose.connection.close()
    }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
