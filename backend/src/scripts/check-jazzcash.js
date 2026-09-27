// Checks the JazzCash signing helpers. No DB, no network.
// Run from backend/: node src/scripts/check-jazzcash.js
const assert = require('assert')
const jc = require('../utils/jazzcash.js')

// 1. The official worked example from JazzCash's guide v4.2 §14.2 (lowercase in the guide).
const official = jc.jazzcashHash({ pp_Amount: '2995', pp_MerchantID: 'MER123', pp_OrderInfo: 'A48cvE28' }, '0F5DD14AE2')
assert.strictEqual(official, 'c7689cda7474eb1adcd343fd0c0b676bad0ba66361cc46db589bdb0da4c1c867'.toUpperCase())

// 2. Empty fields are skipped, and field order in the object does not matter.
assert.strictEqual(
  jc.jazzcashHash({ pp_OrderInfo: 'A48cvE28', pp_BankID: '', pp_MerchantID: 'MER123', pp_Amount: '2995' }, '0F5DD14AE2'),
  official
)

// 3. A signed checkout verifies; tampering with the amount or hash does not.
process.env.JAZZCASH_MERCHANT_ID = 'Test00127801'
process.env.JAZZCASH_PASSWORD = 'pw'
process.env.JAZZCASH_INTEGRITY_SALT = 'salt123'
process.env.PUBLIC_BASE_URL = 'https://abc.ngrok.app/'
const now = new Date('2026-09-27T10:00:00Z')
const { action, fields } = jc.buildCheckout({ txnRef: 'T2026092715000012345', amount: 1499.5, orderId: '66f000000000000000000001', now })
assert.ok(action.startsWith('https://sandbox.jazzcash.com.pk/'), 'sandbox unless JAZZCASH_ENV=live')
assert.strictEqual(fields.pp_Amount, '149950', 'amount in paisa, no decimal point')
assert.strictEqual(fields.pp_TxnDateTime, '20260927150000', 'Pakistan time is UTC+5')
assert.strictEqual(fields.pp_TxnExpiryDateTime, '20260927160000', 'expires in one hour')
assert.strictEqual(fields.pp_ReturnURL, 'https://abc.ngrok.app/api/v1/payments/jazzcash/return')
assert.ok(fields.pp_BillReference.length <= 20)
assert.ok(jc.jazzcashVerify(fields, 'salt123'))
assert.ok(jc.jazzcashVerify({ ...fields, pp_SecureHash: fields.pp_SecureHash.toLowerCase() }, 'salt123'), 'hash case must not matter')
assert.ok(!jc.jazzcashVerify({ ...fields, pp_Amount: '100' }, 'salt123'), 'changed amount must fail')
assert.ok(!jc.jazzcashVerify(fields, 'other-salt'), 'wrong salt must fail')
assert.ok(!jc.jazzcashVerify({ ...fields, pp_SecureHash: 'abc' }, 'salt123'), 'short hash must fail, not throw')
assert.ok(!jc.jazzcashVerify({ pp_Amount: '1' }, 'salt123'), 'missing hash must fail')
assert.ok(!jc.jazzcashVerify(fields, undefined), 'no salt set must fail, not throw')

// 4. Refs are 20 chars and unique.
const a = jc.newTxnRef()
assert.ok(/^T\d{19}$/.test(a), a)
assert.notStrictEqual(a, jc.newTxnRef())

// 5. Response codes.
assert.strictEqual(jc.outcomeFor('000'), 'completed')
assert.strictEqual(jc.outcomeFor('121'), 'completed')
assert.strictEqual(jc.outcomeFor('157'), 'pending')
assert.strictEqual(jc.outcomeFor('112'), 'failed')
assert.strictEqual(jc.outcomeFor(undefined), 'failed')

console.log('check-jazzcash: all passed')
