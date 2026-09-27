// One place for money math, shared by the cart and orders, so the cart total the buyer sees
// and the order total they are charged can never drift apart.
// `discount` is a PERCENT (BUG-62): 15 means 15% off, not 15 currency units.

// Why: choices can add an extra price (e.g. 256GB = +Rs 20,000).
const { extraFor } = require('./options.js')

// Round to cents. Without this, float sums like 0.1 + 0.2 leak into stored totals.
const round2 = (n) => Math.round(Number(n) * 100) / 100

// Price of one unit after the percent discount.
// const unitPrice = (product) =>
//   round2(Number(product.price) * (1 - (Number(product.discount) || 0) / 100))
// Price before discount: base + extras for the picked choices. selected = [] means base price.
const listPrice = (product, selected = []) =>
  Number(product.price) + extraFor(product.options, selected)
// The percent discount applies to the full price, extra included.
const unitPrice = (product, selected = []) =>
  round2(listPrice(product, selected) * (1 - (Number(product.discount) || 0) / 100))

// items: [{ product: <populated product>, quantity }]
// Lines whose product was deleted (populate gives null) add nothing, instead of crashing.
const cartTotals = (items = []) => {
  let subtotal = 0
  let total = 0
  for (const item of items) {
    if (!item || !item.product) continue
    const qty = Number(item.quantity) || 0
    // subtotal += Number(item.product.price) * qty
    // total += unitPrice(item.product) * qty
    subtotal += listPrice(item.product, item.selected) * qty
    total += unitPrice(item.product, item.selected) * qty
  }
  subtotal = round2(subtotal)
  total = round2(total)
  return { subtotal, discount: round2(subtotal - total), total }
}

module.exports = { round2, listPrice, unitPrice, cartTotals }
