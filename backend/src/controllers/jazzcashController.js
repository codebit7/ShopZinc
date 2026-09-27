// JazzCash hosted checkout: start a payment for an order, and handle JazzCash's reply.
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js')
const Payment = require('../models/payementModel.js')
const { availableMethods, STORE_CURRENCY } = require('../config/payments.js')
const jc = require('../utils/jazzcash.js')

const ORDER_PAYMENT_STATUS = { pending: 'pending', completed: 'paid', failed: 'failed' }

// Where the buyer lands after JazzCash. APP_URL is the frontend origin.
const orderPage = (orderId, result) =>
  `${String(process.env.APP_URL || '').replace(/\/+$/, '')}/orders/${orderId}?payment=${result}`

const isEnabled = () => {
  const m = availableMethods().find((x) => x.id === 'jazzcash')
  return !!(m && m.enabled)
}

// POST /payments/jazzcash/init  body {orderId}  (T, owner only)
// Creates a new pending payment attempt and returns the signed form for the browser to post.
const initJazzCash = async (req, res) => {
  try {
    if (!isEnabled()) return res.status(400).json({ message: 'JazzCash is not available right now' })
    const orderId = req.body && req.body.orderId
    if (!mongoose.isValidObjectId(orderId)) return res.status(404).json({ message: 'Order not found' })
    const order = await Order.findById(orderId)
    // Same answer for "missing" and "someone else's": do not confirm other people's order ids.
    if (!order || !order.user.equals(req.user.id)) return res.status(404).json({ message: 'Order not found' })
    if (order.paymentMethod !== 'jazzcash') return res.status(400).json({ message: 'This order is not paid with JazzCash' })
    if (order.orderStatus === 'cancelled') return res.status(400).json({ message: 'This order was cancelled' })
    if (order.paymentStatus === 'paid') return res.status(400).json({ message: 'This order is already paid' })

    // A new ref per attempt, so a failed or abandoned try can be retried.
    const txnRef = jc.newTxnRef()
    await Payment.create({
      user: order.user,
      order: order._id,
      paymentMethod: 'jazzcash',
      paymentStatus: 'pending',
      transactionId: txnRef,
      // Server's own total, never the client's: this is the amount the reply is checked against.
      amount: order.totalAmount,
      currency: STORE_CURRENCY,
    })
    res.status(200).json(jc.buildCheckout({ txnRef, amount: order.totalAmount, orderId: order._id }))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// POST /payments/jazzcash/return  (public, form-encoded, sent by the buyer's browser from JazzCash)
// No auth cookie here: it is a cross-site POST, so sameSite=lax cookies are not sent. Trust comes
// only from the signature, which needs our Integrity Salt.
const jazzcashReturn = async (req, res) => {
  const body = req.body || {}
  let orderId = null
  try {
    if (!jc.jazzcashVerify(body, process.env.JAZZCASH_INTEGRITY_SALT)) {
      console.error('JazzCash return: bad signature for ref', body.pp_TxnRefNo)
      return res.status(400).send('Invalid payment response')
    }
    const payment = await Payment.findOne({ transactionId: String(body.pp_TxnRefNo || ''), paymentMethod: 'jazzcash' })
    if (!payment) return res.status(404).send('Payment not found')
    orderId = payment.order

    // A signed reply for a different amount is still wrong: never mark it paid.
    const amountOk = String(body.pp_Amount) === jc.toPaisa(payment.amount)
    const outcome = amountOk ? jc.outcomeFor(body.pp_ResponseCode) : 'failed'
    if (!amountOk) console.error(`JazzCash return: amount ${body.pp_Amount} does not match payment ${payment._id}`)

    // Keep JazzCash's reply for disputes, minus the secret fields it echoes back.
    const { pp_Password, pp_SecureHash, ...kept } = body

    if (outcome !== 'pending') {
      const session = await mongoose.startSession()
      try {
        await session.withTransaction(async () => {
          // Only a pending payment changes: a refresh or double POST of the same reply does nothing.
          const changed = await Payment.findOneAndUpdate(
            { _id: payment._id, paymentStatus: 'pending' },
            { $set: { paymentStatus: outcome, gatewayRef: body.pp_RetreivalReferenceNo, gatewayResponse: kept, paymentDate: new Date() } },
            { new: true, session }
          )
          if (!changed) return
          // A failed attempt must not undo an order another attempt already paid.
          const filter = outcome === 'failed' ? { _id: payment.order, paymentStatus: { $ne: 'paid' } } : { _id: payment.order }
          await Order.updateOne(filter, { $set: { paymentStatus: ORDER_PAYMENT_STATUS[outcome] } }, { session })
        })
      } finally {
        await session.endSession()
      }
    } else {
      await Payment.updateOne({ _id: payment._id, paymentStatus: 'pending' }, { $set: { gatewayResponse: kept } })
    }

    // 303: turn the POST into a GET, so the order page loads with the buyer's cookies.
    const result = outcome === 'completed' ? 'success' : outcome
    return res.redirect(303, orderPage(orderId, result))
  } catch (error) {
    console.error('JazzCash return failed:', error)
    if (orderId) return res.redirect(303, orderPage(orderId, 'error'))
    res.status(500).send('Could not process the payment response')
  }
}

module.exports = { initJazzCash, jazzcashReturn }
