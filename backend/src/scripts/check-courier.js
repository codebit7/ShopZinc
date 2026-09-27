// Checks the admin Courier page logic: settings validation, admin values beating .env, and the
// "why can't this order ship" reasons. No DB (model methods stubbed), no network.
// Run from backend/: node src/scripts/check-courier.js
const assert = require('assert')
const CourierSettings = require('../models/courierSettingsModel.js')

let stored = null
CourierSettings.findOne = () => ({ lean: async () => stored })
CourierSettings.updateOne = async (q, update) => {
  stored = { ...(stored || {}), ...(update.$set || {}) }
  for (const k of Object.keys(update.$unset || {})) delete stored[k]
}

const { updateSettings, getSettings, blockedReason } = require('../controllers/courierController.js')
const { deliveryFee } = require('../config/shipping.js')
const { buildCreateBody } = require('../utils/postex.js')

const call = (fn, body) => new Promise((resolve) => {
  const res = { code: 200, status(c) { this.code = c; return this }, json(b) { resolve({ status: this.code, body: b }) } }
  fn({ body }, res)
})

;(async () => {
  delete process.env.SHIPPING_FEE
  delete process.env.FREE_SHIPPING_MIN
  delete process.env.POSTEX_PICKUP_ADDRESS_CODE

  // 1. No admin values -> .env defaults (200 / 3000).
  assert.strictEqual(deliveryFee(1000), 200)
  assert.strictEqual((await call(getSettings)).body.effective.shippingFee, 200)

  // 2. Bad input is refused and nothing is saved.
  for (const bad of [{ shippingFee: -1 }, { shippingFee: 'abc' }, { syncMinutes: 2 }, { syncMinutes: 5000 }, { pickupAddressCode: 'x'.repeat(51) }]) {
    const r = await call(updateSettings, bad)
    assert.strictEqual(r.status, 400, JSON.stringify(bad))
  }
  assert.strictEqual(stored, null)

  // 3. Admin values win over .env, at once (no restart).
  let r = await call(updateSettings, { shippingFee: '250', freeShippingMin: 5000, syncMinutes: 0, pickupAddressCode: ' PK-1 ' })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(deliveryFee(4000), 250)
  assert.strictEqual(deliveryFee(5000), 0)
  assert.strictEqual(r.body.effective.syncMinutes, 0)
  assert.strictEqual(buildCreateBody({ _id: 'x', items: [], shippingAddress: {} }, 0, 'A').pickupAddressCode, 'PK-1')

  // 4. Empty value clears it -> back to .env default.
  r = await call(updateSettings, { shippingFee: '' })
  assert.strictEqual(deliveryFee(1000), 200)
  assert.strictEqual(deliveryFee(5000), 0, 'free-from stays at the admin value')

  // 5. Response never carries the token.
  process.env.POSTEX_TOKEN = 'secret-token'
  const view = JSON.stringify((await call(getSettings)).body)
  assert.ok(!view.includes('secret-token'))
  assert.ok(view.includes('"postexConfigured":true'))

  // 6. Why an order can't be booked (same rules as booking).
  assert.strictEqual(blockedReason({ shippingAddress: { city: 'Lahore' } }), 'No phone number')
  assert.strictEqual(blockedReason({ shippingAddress: { phone: '03001234567' } }), 'No city')
  assert.strictEqual(blockedReason({ paymentMethod: 'jazzcash', paymentStatus: 'pending', shippingAddress: { phone: '03001234567', city: 'Lahore' } }), 'Waiting for online payment')
  assert.strictEqual(blockedReason({ paymentMethod: 'jazzcash', paymentStatus: 'paid', shippingAddress: { phone: '03001234567', city: 'Lahore' } }), null)
  assert.strictEqual(blockedReason({ shippingAddress: { phone: '03001234567', city: 'Lahore' } }), null, 'old order with no method = COD')

  console.log('check-courier: all passed')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
