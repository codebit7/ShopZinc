// Delivery charge rule. One place, so the cart, checkout and createOrder always show and charge
// the same fee. Computed on the server only: a fee sent by the browser would be editable.
//
// Env: SHIPPING_FEE        flat fee in PKR (default 200)
//      FREE_SHIPPING_MIN   order total (after discount) at or above which delivery is free
//                          (default 3000; 0 = never free)

const { round2 } = require('../utils/pricing.js')
// Admin Courier page values win over .env (cached, so this stays sync).
const { getCourierSettings } = require('./courierSettings.js')

const num = (name, fallback) => {
  const raw = process.env[name]
  const n = raw === undefined || raw.trim() === '' ? fallback : Number(raw)
  // A typo in .env must not make delivery negative or NaN.
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Read at call time, so .env changes and check scripts see the current values.
// const shippingRule = () => ({ fee: num('SHIPPING_FEE', 200), freeFrom: num('FREE_SHIPPING_MIN', 3000) })
const shippingRule = () => {
  const s = getCourierSettings()
  return {
    fee: typeof s.shippingFee === 'number' ? s.shippingFee : num('SHIPPING_FEE', 200),
    freeFrom: typeof s.freeShippingMin === 'number' ? s.freeShippingMin : num('FREE_SHIPPING_MIN', 3000),
  }
}

// itemsTotal: the discounted items total. An empty cart pays nothing.
const deliveryFee = (itemsTotal) => {
  const t = Number(itemsTotal) || 0
  if (t <= 0) return 0
  const { fee, freeFrom } = shippingRule()
  if (freeFrom > 0 && t >= freeFrom) return 0
  return round2(fee)
}

module.exports = { deliveryFee, shippingRule }
