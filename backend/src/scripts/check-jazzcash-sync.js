// Checks JazzCash Status Inquiry parsing and the sync/expiry job. No DB, no network:
// fetch, model methods, the mongoose session and restoreStock are all stubbed.
// Run from backend/: node src/scripts/check-jazzcash-sync.js
const assert = require('assert')
const mongoose = require('mongoose')

Object.assign(process.env, {
  PAYMENTS_GATEWAYS_READY: 'true',
  JAZZCASH_MERCHANT_ID: 'Test00127801',
  JAZZCASH_PASSWORD: 'pw',
  JAZZCASH_INTEGRITY_SALT: 'salt123',
  JAZZCASH_ENV: 'sandbox',
  PUBLIC_BASE_URL: 'https://abc.ngrok.app',
})
delete process.env.JAZZCASH_UNPAID_EXPIRE_MINUTES

const jc = require('../utils/jazzcash.js')
const Order = require('../models/orderModel.js')
const Payment = require('../models/payementModel.js')
const orderControllers = require('../controllers/orderControllers.js')
const { syncJazzCashPayments } = require('../jobs/jazzcashSync.js')

// --- fake fetch: answers per txnRef, records what was sent ---
let replies = {}
let sent = []
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body)
  sent.push({ url, body })
  const r = replies[body.pp_TxnRefNo]
  if (r === 'throw') throw new Error('network down pw=secret')
  if (r === 'timeout') { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e }
  return { ok: r && r.status ? r.status < 300 : true, json: async () => (r && r.body !== undefined ? r.body : r) }
}

;(async () => {
  // 1. Inquiry parsing
  const o = jc.inquiryOutcome
  assert.strictEqual(o({ pp_ResponseCode: '000', pp_PaymentResponseCode: '000' }), 'completed')
  assert.strictEqual(o({ pp_ResponseCode: '000', pp_PaymentResponseCode: '157' }), 'pending')
  assert.strictEqual(o({ pp_ResponseCode: '000', pp_PaymentResponseCode: '112' }), 'failed')
  assert.strictEqual(o({ pp_ResponseCode: '000', pp_Status: 'Completed' }), 'unknown', "newer shape: '000' may only mean the inquiry worked")
  assert.strictEqual(o({ pp_ResponseCode: '121' }), 'completed', 'old shape: pp_ResponseCode is the payment code')
  assert.strictEqual(o({ pp_ResponseCode: '115' }), 'unknown', 'bad-hash on the inquiry is not a failed payment')
  assert.strictEqual(o({ pp_ResponseCode: '999' }), 'unknown')
  assert.strictEqual(o({ status: 'Completed', rrn: '1' }), 'unknown', 'PDF shape without a code')
  assert.strictEqual(o(null), 'unknown')
  assert.strictEqual(o([]), 'unknown')
  assert.strictEqual(o('000'), 'unknown')
  console.log('OK inquiry code parsing')

  replies = {
    A: { pp_ResponseCode: '000', pp_PaymentResponseCode: '000', pp_Password: 'pw', pp_SecureHash: 'X' },
    B: 'throw', C: 'timeout',
    D: { status: 500, body: { pp_ResponseCode: '000', pp_PaymentResponseCode: '000' } },
    E: { pp_TxnRefNo: 'OTHER', pp_ResponseCode: '000', pp_PaymentResponseCode: '000' },
    F: { status: 200, body: undefined },
  }
  sent = []
  let r = await jc.inquire('A')
  assert.strictEqual(r.outcome, 'completed')
  assert.ok(!('pp_Password' in r.raw) && !('pp_SecureHash' in r.raw), 'secrets stripped from raw')
  assert.ok(sent[0].url.startsWith('https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire'))
  assert.strictEqual(sent[0].body.pp_Version, '1.1')
  assert.strictEqual(sent[0].body.pp_SecureHash, jc.jazzcashHash(sent[0].body, 'salt123'), 'request is signed')
  r = await jc.inquire('B')
  assert.strictEqual(r.outcome, 'unknown')
  assert.ok(!JSON.stringify(r).includes('secret'), 'raw fetch error not leaked')
  assert.strictEqual((await jc.inquire('C')).outcome, 'unknown')
  assert.strictEqual((await jc.inquire('D')).outcome, 'unknown', 'HTTP error -> unknown')
  assert.strictEqual((await jc.inquire('E')).outcome, 'unknown', 'reply about another ref -> unknown')
  assert.strictEqual((await jc.inquire('F')).outcome, 'unknown', 'no JSON -> unknown')
  console.log('OK inquire(): signed request, unknown on any doubt, no secrets')

  // --- fake DB ---
  const OLD = new Date(Date.now() - 3 * 60 * 60 * 1000)
  let payments, orders, restored
  const matches = (doc, q) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$ne' in v) return doc[k] !== v.$ne
    if (v && typeof v === 'object' && '$lt' in v) return doc[k] < v.$lt
    return String(doc[k]) === String(v)
  })
  const setFields = (doc, u) => Object.assign(doc, u.$set)
  Payment.find = async (q) => payments.filter((p) => matches(p, q))
  Payment.countDocuments = async (q) => payments.filter((p) => matches(p, q)).length
  Payment.findOneAndUpdate = async (q, u) => { const d = payments.find((p) => matches(p, q)); return d ? setFields(d, u) : null }
  Payment.updateMany = async (q, u) => { payments.filter((p) => matches(p, q)).forEach((p) => setFields(p, u)) }
  Order.find = async (q) => orders.filter((x) => matches(x, q))
  Order.updateOne = async (q, u) => { const d = orders.find((x) => matches(x, q)); if (d) setFields(d, u) }
  Order.findOneAndUpdate = async (q, u) => { const d = orders.find((x) => matches(x, q)); return d ? setFields(d, u) : null }
  mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} })
  orderControllers.restoreStock = async (order) => { restored.push(String(order._id)) }

  const order = (id, extra = {}) => ({ _id: id, paymentMethod: 'jazzcash', paymentStatus: 'pending', orderStatus: 'processing', createdAt: OLD, items: [], ...extra })
  const pay = (id, orderId, ref) => ({ _id: id, order: orderId, paymentMethod: 'jazzcash', paymentStatus: 'pending', transactionId: ref, amount: 100 })

  // 2. Old order whose only attempt inquires as unknown -> NOT cancelled.
  replies = { U1: { pp_ResponseCode: '000', pp_Status: 'x' } }
  orders = [order('o1')]; payments = [pay('p1', 'o1', 'U1')]; restored = []
  r = await syncJazzCashPayments()
  assert.strictEqual(orders[0].orderStatus, 'processing', 'unknown inquiry must never cancel')
  assert.strictEqual(payments[0].paymentStatus, 'pending')
  assert.deepStrictEqual(restored, [])
  assert.strictEqual(r.skipped, 1)
  console.log('OK unknown inquiry -> order kept, stock kept')

  // 2b. Network failure on inquiry -> also kept.
  replies = { U2: 'throw' }
  orders = [order('o1')]; payments = [pay('p1', 'o1', 'U2')]; restored = []
  await syncJazzCashPayments()
  assert.strictEqual(orders[0].orderStatus, 'processing')
  console.log('OK failed inquiry -> order kept')

  // 3. Old order, attempt confirmed failed -> cancelled, stock restored.
  replies = { F1: { pp_ResponseCode: '000', pp_PaymentResponseCode: '129' } }
  orders = [order('o2'), order('o3', { createdAt: new Date() })]; payments = [pay('p2', 'o2', 'F1')]; restored = []
  r = await syncJazzCashPayments()
  assert.strictEqual(payments[0].paymentStatus, 'failed')
  assert.strictEqual(orders[0].orderStatus, 'cancelled')
  assert.strictEqual(orders[0].paymentStatus, 'failed')
  assert.deepStrictEqual(restored, ['o2'], 'restoreStock called for the expired order only')
  assert.strictEqual(orders[1].orderStatus, 'processing', 'a fresh order is not expired')
  assert.strictEqual(r.expired, 1)
  console.log('OK confirmed-failed old order -> cancelled, stock restored')

  // 4. Paid via inquiry -> order paid, not cancelled even though old.
  replies = { S1: { pp_ResponseCode: '000', pp_PaymentResponseCode: '000', pp_Amount: '10000', pp_RetreivalReferenceNo: 'RRN1' } }
  orders = [order('o4')]; payments = [pay('p4', 'o4', 'S1')]; restored = []
  r = await syncJazzCashPayments()
  assert.strictEqual(payments[0].paymentStatus, 'completed')
  assert.strictEqual(payments[0].gatewayRef, 'RRN1')
  assert.strictEqual(orders[0].paymentStatus, 'paid')
  assert.strictEqual(orders[0].orderStatus, 'processing', 'a paid order is never expired')
  assert.deepStrictEqual(restored, [])
  console.log('OK paid via inquiry -> order paid')

  // 5. Paid but wrong amount -> left alone for a human.
  replies = { S2: { pp_PaymentResponseCode: '000', pp_Amount: '1' } }
  orders = [order('o5')]; payments = [pay('p5', 'o5', 'S2')]; restored = []
  await syncJazzCashPayments()
  assert.strictEqual(payments[0].paymentStatus, 'pending')
  assert.strictEqual(orders[0].orderStatus, 'processing')
  console.log('OK amount mismatch -> nothing changed')

  // 6. A failed attempt never un-pays an order another attempt paid.
  replies = { F2: { pp_PaymentResponseCode: '112' } }
  orders = [order('o6', { paymentStatus: 'paid' })]; payments = [pay('p6', 'o6', 'F2')]; restored = []
  await syncJazzCashPayments()
  assert.strictEqual(payments[0].paymentStatus, 'failed')
  assert.strictEqual(orders[0].paymentStatus, 'paid')
  assert.strictEqual(orders[0].orderStatus, 'processing')
  console.log('OK failed attempt does not un-pay a paid order')

  // 7. JazzCash disabled -> nothing at all.
  process.env.PAYMENTS_GATEWAYS_READY = 'false'
  sent = []
  r = await syncJazzCashPayments()
  assert.strictEqual(r.checked, 0)
  assert.strictEqual(sent.length, 0)
  console.log('OK disabled -> job does nothing')

  console.log('all jazzcash sync checks passed')
})().catch((e) => { console.error(e); process.exit(1) })
