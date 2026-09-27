// Checks the PostEx helper with a fake fetch. No DB, no network.
// Run from backend/: node src/scripts/check-postex.js
const assert = require('assert')
const px = require('../utils/postex.js')

;(async () => {
  // 1. Phone numbers.
  assert.strictEqual(px.normalizePhone('0300-1234567'), '03001234567')
  assert.strictEqual(px.normalizePhone('+92 300 1234567'), '03001234567')
  assert.strictEqual(px.normalizePhone('923001234567'), '03001234567')
  assert.strictEqual(px.normalizePhone('0421234567'), null, 'landline is not a mobile')
  assert.strictEqual(px.normalizePhone(''), null)
  assert.strictEqual(px.normalizePhone(undefined), null)

  // 2. Only an exact "Delivered" counts.
  assert.ok(px.isDeliveredStatus('Delivered'))
  assert.ok(px.isDeliveredStatus(' delivered '))
  assert.ok(!px.isDeliveredStatus('Out For Delivery'))
  assert.ok(!px.isDeliveredStatus('Delivery Under Review'))
  assert.ok(!px.isDeliveredStatus('Undelivered'))

  // 3. Create body.
  const order = {
    _id: '66f000000000000000000001',
    totalAmount: 2499.6,
    shippingAddress: { street: 'House 1, Street 2', city: 'Lahore', state: 'Punjab', phone: '03001234567' },
    items: [{ quantity: 2, product: { name: 'Shoe' } }, { quantity: 1, product: null }],
  }
  const body = px.buildCreateBody(order, order.totalAmount, 'Ali')
  assert.strictEqual(body.orderRefNumber, '66f000000000000000000001')
  assert.strictEqual(body.invoicePayment, 2500, 'COD amount rounded to whole rupees')
  assert.strictEqual(body.items, 3)
  assert.strictEqual(body.cityName, 'Lahore')
  assert.strictEqual(body.customerName, 'Ali')
  assert.strictEqual(body.customerPhone, '03001234567')
  assert.strictEqual(body.orderDetail, 'Shoe x2, Item x1')
  assert.strictEqual(px.buildCreateBody(order, 0, 'Ali').invoicePayment, 0, 'paid online: nothing to collect')

  // 4. Not configured -> clear error, no request.
  delete process.env.POSTEX_TOKEN
  let calls = []
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return reply }
  let reply
  await assert.rejects(px.createShipment(order, 0, 'Ali'), /not set up/)
  assert.strictEqual(calls.length, 0)

  // 5. Create: sends token header + JSON, reads dist.trackingNumber.
  process.env.POSTEX_TOKEN = 'tok'
  reply = { ok: true, status: 200, json: async () => ({ statusCode: '200', dist: { trackingNumber: 'CX123' } }) }
  const created = await px.createShipment(order, 100, 'Ali')
  assert.strictEqual(created.trackingNumber, 'CX123')
  assert.strictEqual(calls[0].url, 'https://api.postex.pk/services/integration/api/order/v3/create-order')
  assert.strictEqual(calls[0].opts.method, 'POST')
  assert.strictEqual(calls[0].opts.headers.token, 'tok')

  // 6. PostEx error in the body (HTTP 200 but statusCode 400) is an error with its message.
  reply = { ok: true, status: 200, json: async () => ({ statusCode: '400', statusMessage: 'Invalid City' }) }
  await assert.rejects(px.createShipment(order, 100, 'Ali'), /Invalid City/)

  // 7. Track.
  reply = { ok: true, status: 200, json: async () => ({ statusCode: '200', dist: { transactionStatus: 'Delivered' } }) }
  const t = await px.trackShipment('CX 1/2')
  assert.strictEqual(t.status, 'Delivered')
  assert.ok(calls[calls.length - 1].url.endsWith('/v1/track-order/CX%201%2F2'), 'tracking number is URL-encoded')

  // 8. Network failure -> readable error.
  global.fetch = async () => { throw new Error('ECONNRESET') }
  await assert.rejects(px.trackShipment('CX123'), /Could not reach PostEx/)

  console.log('check-postex: all passed')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
