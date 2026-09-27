// PostEx courier API (book, track, cancel). Node's built-in fetch, no SDK.
//
// Source: PostEx Merchant API guide v4.1.9 as quoted in github.com/faizan45640/PostEx-MCP-Server.
// NOT checked against a live PostEx account yet. The response field names below
// (dist.trackingNumber, dist.transactionStatus) are the parts most likely to differ; the raw
// reply is stored on the order (shipment.lastResponse) so it can be checked in sandbox.
//
// Env: POSTEX_TOKEN (required), POSTEX_PICKUP_ADDRESS_CODE (optional),
//      POSTEX_BASE_URL (optional, defaults to the live API below).

// Pickup code can be set on the admin Courier page; .env is the fallback.
const { getCourierSettings } = require('../config/courierSettings.js')

const DEFAULT_BASE = 'https://api.postex.pk/services/integration/api/order'
const TIMEOUT_MS = 15000

const isConfigured = () => typeof process.env.POSTEX_TOKEN === 'string' && process.env.POSTEX_TOKEN.trim() !== ''
const baseUrl = () => (process.env.POSTEX_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')

// An error the admin can read ("city not served"...), with PostEx's raw reply kept for debugging.
class PostExError extends Error {
  constructor(message, raw) {
    super(message)
    this.raw = raw
  }
}

const call = async (path, { method = 'GET', body } = {}) => {
  if (!isConfigured()) throw new PostExError('PostEx is not set up (POSTEX_TOKEN is empty)')
  let res
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { token: process.env.POSTEX_TOKEN.trim(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Why: without a timeout a slow PostEx keeps the admin's request open forever.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new PostExError('Could not reach PostEx. Please try again.')
  }
  let data = null
  try { data = await res.json() } catch (e) { /* cancel may answer with no body */ }
  // PostEx sends statusCode as a string ("200") inside the body as well as the HTTP status.
  const bodyCode = data && data.statusCode !== undefined ? String(data.statusCode) : null
  if (!res.ok || (bodyCode && bodyCode !== '200')) {
    const msg = (data && (data.statusMessage || data.message)) || `PostEx error (HTTP ${res.status})`
    throw new PostExError(`PostEx: ${msg}`, data)
  }
  return data
}

// Pakistan numbers as PostEx wants them: 03xxxxxxxxx. Accepts +92 / 92 / spaces / dashes.
// Returns null when it is not a Pakistani mobile number.
const normalizePhone = (raw) => {
  if (typeof raw !== 'string') return null
  let d = raw.replace(/[\s-]/g, '')
  if (d.startsWith('+92')) d = '0' + d.slice(3)
  else if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2)
  return /^03\d{9}$/.test(d) ? d : null
}

// Pure: order doc -> create-order body. The order has no name field, so the account name is passed in.
// codAmount is what the rider collects (0 when paid online).
const buildCreateBody = (order, codAmount, customerName) => {
  const a = order.shippingAddress || {}
  const pieces = (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0)
  const body = {
    orderRefNumber: String(order._id),
    orderType: 'Normal',
    invoicePayment: Math.round(Number(codAmount) || 0),
    invoiceDivision: 1,
    items: Math.max(pieces, 1),
    customerName: customerName || 'Customer',
    customerPhone: a.phone,
    deliveryAddress: [a.street, a.state, a.postalCode].filter(Boolean).join(', '),
    cityName: a.city,
    orderDetail: (order.items || [])
      .map((i) => `${(i.product && i.product.name) || 'Item'} x${i.quantity}`)
      .join(', ')
      .slice(0, 250),
  }
  // const pickup = (process.env.POSTEX_PICKUP_ADDRESS_CODE || '').trim()
  const pickup = (getCourierSettings().pickupAddressCode || process.env.POSTEX_PICKUP_ADDRESS_CODE || '').trim()
  if (pickup) body.pickupAddressCode = pickup
  return body
}

// Returns { trackingNumber, raw }.
const createShipment = async (order, codAmount, customerName) => {
  const data = await call('/v3/create-order', { method: 'POST', body: buildCreateBody(order, codAmount, customerName) })
  const trackingNumber = data && data.dist && data.dist.trackingNumber
  if (!trackingNumber) throw new PostExError('PostEx did not return a tracking number', data)
  return { trackingNumber: String(trackingNumber), raw: data }
}

// Returns { status, raw }. status is PostEx's own words, e.g. "Delivered".
const trackShipment = async (trackingNumber) => {
  const data = await call(`/v1/track-order/${encodeURIComponent(trackingNumber)}`)
  const dist = (data && data.dist) || {}
  const status = dist.transactionStatus || dist.orderStatus
  if (!status) throw new PostExError('PostEx tracking reply had no status', data)
  return { status: String(status).trim(), raw: data }
}

const cancelShipment = async (trackingNumber) => {
  await call('/v1/cancel-order', { method: 'PUT', body: { trackingNumber } })
}

// Only an exact "Delivered" counts: "Out For Delivery" / "Delivery Under Review" must not
// mark an order delivered (and a COD order paid).
const isDeliveredStatus = (status) => typeof status === 'string' && status.trim().toLowerCase() === 'delivered'

module.exports = {
  isConfigured,
  normalizePhone,
  buildCreateBody,
  createShipment,
  trackShipment,
  cancelShipment,
  isDeliveredStatus,
  PostExError,
}
