// Checks the cart controller fixes (BUG-11, 12, 13, 14, 15). No DB: model methods are stubbed.
const assert = require('assert')

const Cart = require('../models/cartModel.js')
const Product = require('../models/productModel.js')
const User = require('../models/userModel.js')
const { addCartItem, updateCartItem, deleteCartItem } = require('../controllers/CartController.js')

const A = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'A', price: 10, stock: 5 }
const B = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'B', price: 3, stock: 50 }
const products = { [A._id]: A, [B._id]: B }

let cart = null      // what Cart.findOne returns
let dbCalls = 0      // any stubbed DB call bumps this
let userUpdates = [] // args passed to User.findByIdAndUpdate

// A fake cart that behaves like a populated mongoose doc: pushed items hold raw ids until populate().
function fakeCart(items) {
    return {
        items,
        total: 0,
        async populate() { this.items.forEach((i) => { if (typeof i.product === 'string') i.product = products[i.product] }); return this },
        async save() { return this },
        // Why: the controller's finalizeCart now calls isNew / isModified() / toObject().
        isNew: false,
        isModified() { return true },
        toObject() { return { items: this.items, total: this.total } },
    }
}

// Cart.findOne = () => { dbCalls++; return { populate: async () => cart } }
// Why: the controller no longer chains .populate() on findOne (finalizeCart populates later).
Cart.findOne = async () => { dbCalls++; return cart }
// Why: the new-cart path is now an atomic upsert (findOneAndUpdate), not `new Cart()`.
Cart.findOneAndUpdate = async (filter, update) => { dbCalls++; return new Cart(update.$setOnInsert) }
Product.findById = async (id) => { dbCalls++; return products[id] || null }
User.findByIdAndUpdate = async (...args) => { dbCalls++; userUpdates.push(args); return {} }
// new-cart path uses a real `new Cart(...)` doc, so stub its instance methods too.
Cart.prototype.populate = async function () { this.items.forEach((i) => { i.product = new Product(products[i.product.toString()]) }); return this }
Cart.prototype.save = async function () { return this }

function call(fn, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this },
            json(body) { resolve({ status: this.statusCode, body }) },
        }
        fn({ user: { id: 'cccccccccccccccccccccccc' }, params: {}, body: {}, ...req }, res)
    })
}

;(async () => {
    // 1. same product twice -> one line, quantity summed
    cart = fakeCart([])
    await call(addCartItem, { body: { productId: A._id, quantity: 2 } })
    let r = await call(addCartItem, { body: { productId: A._id, quantity: 1 } })
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.body.items.length, 1, 'same product must merge into one line item')
    assert.strictEqual(r.body.items[0].quantity, 3, 'quantity must be summed, not replaced')
    console.log('OK same product twice -> one line, qty 3')

    // 2. total counts a freshly added product, and the response is populated
    r = await call(addCartItem, { body: { productId: B._id, quantity: 2 } })
    assert.strictEqual(r.body.total, 3 * 10 + 2 * 3, 'new item must count in the total')
    assert.strictEqual(r.body.items[1].product.price, 3, 'response items must be populated')
    console.log('OK total after adding a new product =', r.body.total)

    // 2b. new-cart path (real Cart doc) also gets a populated total
    cart = null
    userUpdates = []
    r = await call(addCartItem, { body: { productId: B._id, quantity: 4 } })
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.body.total, 12, 'new cart total must be computed after populate')
    assert.strictEqual(r.body.items[0].product.name, 'B', 'new cart response must be populated')
    assert.ok(userUpdates.some(([, u]) => u.$set && u.$set.cart), 'new cart must be linked to the user')
    console.log('OK new cart total =', r.body.total)

    // 3. bad quantity -> 400, before any DB call
    for (const q of [0, -1, 1.5, undefined]) {
        dbCalls = 0
        r = await call(addCartItem, { body: { productId: A._id, quantity: q } })
        assert.strictEqual(r.status, 400, `add with quantity ${q} must be 400`)
        r = await call(updateCartItem, { params: { itemId: A._id }, body: { quantity: q } })
        assert.strictEqual(r.status, 400, `update with quantity ${q} must be 400`)
        assert.strictEqual(dbCalls, 0, `quantity ${q} must be rejected before any DB call`)
    }
    console.log('OK quantity 0, -1, 1.5, missing -> 400 for add and update')

    // 4. stock check uses the merged quantity (A stock 5: 4 in cart + 2 more = 6 -> reject)
    cart = fakeCart([{ product: A, quantity: 4 }])
    r = await call(addCartItem, { body: { productId: A._id, quantity: 2 } })
    assert.strictEqual(r.status, 400, 'merged quantity over stock must be rejected')
    assert.strictEqual(cart.items[0].quantity, 4, 'cart must be unchanged after a stock reject')
    r = await call(addCartItem, { body: { productId: A._id, quantity: 1 } })
    assert.strictEqual(r.status, 200, 'merged quantity at stock must be allowed')
    console.log('OK stock check uses merged quantity')

    // 5. deleting one item does not unset the user -> cart link
    cart = fakeCart([{ product: A, quantity: 1 }, { product: B, quantity: 1 }])
    userUpdates = []
    r = await call(deleteCartItem, { params: { itemId: A._id } })
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.body.items.length, 1)
    assert.strictEqual(r.body.total, 3)
    assert.ok(!userUpdates.some(([, u]) => u.$unset), 'delete must not $unset the user cart link')
    console.log('OK delete one item keeps the user -> cart link')
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
