// Checks the wishlist controller fixes (BUG-16, 17, 18, 19, 20) against the real DB.
// Needs Mongo + seed data. Mutates the seed user's wishlist: run `node src/scripts/seed-dummy.js` after.
const assert = require('assert')
require('dotenv').config()

const mongoose = require('mongoose')
const connectDb = require('../DB/dbConnection.js')
const User = require('../models/userModel.js')
const Product = require('../models/productModel.js')
const { addToWishlist, removeToWishlist, clearWishlist, getWishlist } = require('../controllers/wishlistController.js')

let userId

// Resolves on the first json() call; a controller that never responds (BUG-18) fails the timeout.
function call(fn, body = {}) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${fn.name} never responded`)), 5000)
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this },
            json(b) { clearTimeout(timer); resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(b)) }) },
        }
        fn({ user: { id: String(userId) }, params: {}, body }, res)
    })
}

const names = (arr) => arr.map((p) => p.name).sort()

;(async () => {
    await connectDb()
    try {
        const user = await User.findOne({ email: 'user@seed.test' })
        assert.ok(user, 'seed user missing: run node src/scripts/seed-dummy.js')
        userId = user._id
        const byName = async (n) => (await Product.findOne({ name: n }))._id.toString()
        const coffee = await byName('Coffee Maker')
        const laptop = await byName('Laptop Pro 16')

        // 1. get -> populated array of 2
        let r = await call(getWishlist)
        assert.strictEqual(r.status, 200)
        assert.ok(Array.isArray(r.body), 'get must return a plain array')
        assert.deepStrictEqual(names(r.body), ['Denim Jacket', 'Laptop Pro 16'])
        assert.ok(r.body.every((p) => p.name && typeof p.price === 'number'), 'items must be populated')
        console.log('OK get -> 200, 2 populated items')

        // 2. add the same product twice -> no duplicate
        await call(addToWishlist, { item: coffee })
        r = await call(addToWishlist, { item: coffee })
        assert.strictEqual(r.status, 200)
        assert.strictEqual(r.body.length, 3, 'adding twice must not duplicate')
        assert.ok(r.body.every((p) => p.name), 'add response must be populated')
        console.log('OK add Coffee Maker twice -> 200, length 3')

        // 3. remove the FIRST item: $pop would drop the last (Coffee Maker) instead
        r = await call(removeToWishlist, { item: laptop })
        assert.strictEqual(r.status, 200)
        assert.deepStrictEqual(names(r.body), ['Coffee Maker', 'Denim Jacket'], 'remove must drop the requested item')
        console.log('OK remove Laptop Pro 16 -> Denim Jacket + Coffee Maker remain')

        // 4. clear responds
        r = await call(clearWishlist)
        assert.strictEqual(r.status, 200)
        assert.deepStrictEqual(r.body, [])
        console.log('OK clear -> 200 []')

        // 5. empty get is 200 [], not 404
        r = await call(getWishlist)
        assert.strictEqual(r.status, 200)
        assert.deepStrictEqual(r.body, [])
        console.log('OK get after clear -> 200 []')

        console.log('Now restore seed state: node src/scripts/seed-dummy.js')
    } finally {
        await mongoose.connection.close()
    }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
