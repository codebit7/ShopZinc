// Timer job for JazzCash. Two problems it fixes:
//  1. A "pending" reply (or a buyer who never came back) was never re-checked. Status Inquiry
//     asks JazzCash directly and settles the attempt exactly like the browser return does.
//  2. Stock is taken when the order is created, so an unpaid JazzCash order held it forever.
//     After JAZZCASH_UNPAID_EXPIRE_MINUTES it is cancelled and its stock goes back.
//
// No IPN endpoint on purpose: we only use MWALLET (paid at once on JazzCash's page). IPN is
// mainly for OTC vouchers paid later, which checkout does not offer. Inquiry covers the rest.
//
// Env: JAZZCASH_UNPAID_EXPIRE_MINUTES (default 120; must be more than the 60-minute JazzCash
// expiry, or we could cancel while the buyer is still allowed to pay).
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const Payment = require('../models/payementModel.js')
const { availableMethods } = require('../config/payments.js')
const jc = require('../utils/jazzcash.js')
// Whole module, read at call time: restoreStock is shared with cancel/delete so stock comes back
// the same way everywhere (and the check script can stub it).
const orderControllers = require('../controllers/orderControllers.js')

const ORDER_PAYMENT_STATUS = { pending: 'pending', completed: 'paid', failed: 'failed' }
const BATCH = 100
const JAZZCASH_TXN_MINUTES = 60

const isEnabled = () => {
  const m = availableMethods().find((x) => x.id === 'jazzcash')
  return !!(m && m.enabled)
}

const expireMinutes = () => {
  const raw = process.env.JAZZCASH_UNPAID_EXPIRE_MINUTES
  const n = raw === undefined || raw.trim() === '' ? 120 : Number(raw)
  if (!(n > JAZZCASH_TXN_MINUTES)) {
    console.error(`JAZZCASH_UNPAID_EXPIRE_MINUTES must be more than ${JAZZCASH_TXN_MINUTES}; using 120`)
    return 120
  }
  return n
}

// Same rules as jazzcashReturn: only a still-pending payment changes (so a race with the browser
// return does nothing twice), and a failed attempt never un-pays an order.
const applyOutcome = async (payment, outcome, raw) => {
  const session = await mongoose.startSession()
  try {
    let changed = null
    await session.withTransaction(async () => {
      changed = await Payment.findOneAndUpdate(
        { _id: payment._id, paymentStatus: 'pending' },
        { $set: { paymentStatus: outcome, gatewayRef: raw && (raw.pp_RetreivalReferenceNo || raw.rrn), gatewayResponse: raw, paymentDate: new Date() } },
        { new: true, session }
      )
      if (!changed) return
      const filter = outcome === 'failed' ? { _id: payment.order, paymentStatus: { $ne: 'paid' } } : { _id: payment.order }
      await Order.updateOne(filter, { $set: { paymentStatus: ORDER_PAYMENT_STATUS[outcome] } }, { session })
    })
    return !!changed
  } finally {
    await session.endSession()
  }
}

const syncJazzCashPayments = async ({ now = new Date() } = {}) => {
  const counts = { checked: 0, completed: 0, failed: 0, unsettled: 0, expired: 0, skipped: 0, errors: 0 }
  if (!isEnabled()) return counts

  // Pass 1: ask JazzCash about every pending attempt. Oldest first, so none starves.
  let pending
  try {
    pending = await Payment.find({ paymentMethod: 'jazzcash', paymentStatus: 'pending' }, null, { sort: { createdAt: 1 }, limit: BATCH })
  } catch (err) {
    // Without this pass we cannot know what is paid, so expiry must not run either.
    console.error('JazzCash sync: could not load pending payments:', err.message)
    counts.errors++
    return counts
  }
  for (const p of pending) {
    counts.checked++
    try {
      const r = await jc.inquire(p.transactionId)
      let outcome = r.outcome
      // Paid, but for another amount: do not guess. Leave it for a human (logged).
      if (outcome === 'completed' && r.raw && r.raw.pp_Amount !== undefined && String(r.raw.pp_Amount) !== jc.toPaisa(p.amount)) {
        console.error(`JazzCash sync: amount ${r.raw.pp_Amount} does not match payment ${p._id}`)
        outcome = 'unknown'
      }
      if (outcome === 'completed' || outcome === 'failed') {
        await applyOutcome(p, outcome, r.raw)
        counts[outcome]++
      } else {
        counts.unsettled++
      }
    } catch (err) {
      console.error(`JazzCash sync: payment ${p._id} failed:`, err.message)
      counts.errors++
    }
  }

  // Pass 2: cancel old unpaid orders and give their stock back.
  if (typeof orderControllers.restoreStock !== 'function') {
    // Cancelling without restoring stock would lose it for good, so skip expiry entirely.
    console.error('JazzCash sync: restoreStock is not available; expiry skipped')
    return counts
  }
  let stale
  try {
    const cutoff = new Date(now.getTime() - expireMinutes() * 60 * 1000)
    stale = await Order.find(
      { paymentMethod: 'jazzcash', paymentStatus: { $ne: 'paid' }, orderStatus: 'processing', createdAt: { $lt: cutoff } },
      null,
      { limit: BATCH }
    )
  } catch (err) {
    console.error('JazzCash sync: could not load unpaid orders:', err.message)
    counts.errors++
    return counts
  }
  for (const order of stale) {
    try {
      // Pass 1 already settled every attempt JazzCash gave a clear answer for. Anything still
      // pending is unknown, pending, or was not reached: it might be paid, so never cancel yet.
      const open = await Payment.countDocuments({ order: order._id, paymentMethod: 'jazzcash', paymentStatus: 'pending' })
      if (open > 0) { counts.skipped++; continue }

      const session = await mongoose.startSession()
      try {
        let cancelled = false
        await session.withTransaction(async () => {
          cancelled = false
          // Conditional: if an admin or a payment changed it meanwhile, this matches nothing.
          const doc = await Order.findOneAndUpdate(
            { _id: order._id, orderStatus: 'processing', paymentStatus: { $ne: 'paid' } },
            { $set: { orderStatus: 'cancelled' } },
            { new: true, session }
          )
          if (!doc) return
          await orderControllers.restoreStock(doc, session)
          // Only an attempt started after the check above can be here; it must not stay payable.
          await Payment.updateMany(
            { order: order._id, paymentMethod: 'jazzcash', paymentStatus: 'pending' },
            { $set: { paymentStatus: 'failed' } },
            { session }
          )
          cancelled = true
        })
        if (cancelled) counts.expired++
      } finally {
        await session.endSession()
      }
    } catch (err) {
      console.error(`JazzCash sync: expiring order ${order._id} failed:`, err.message)
      counts.errors++
    }
  }
  return counts
}

module.exports = { syncJazzCashPayments }
